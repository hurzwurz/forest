/**
 * Steuerung der App: verbindet Sensoren, Server und Oberfläche.
 */

import { api, ApiError, getToken, setToken } from './js/api.js';
import { LocationSource, OrientationSource } from './js/sensors.js';
import { ArView } from './js/ar.js';
import { MiniMap } from './js/map.js';
import * as ui from './js/ui.js';

const $ = (sel) => document.querySelector(sel);

/** So weit muss man sich bewegen, bevor die Welt neu geladen wird. */
const NACHLADE_M = 12;
/** Spätestens nach dieser Zeit wird ohnehin neu geladen. */
const NACHLADE_MS = 20_000;

const state = {
  me: null,
  katalog: null,
  welt: null,          // letzte Serverantwort
  objekte: [],         // Plätze + Pflanzen + Gebäude, für AR und Karte
  position: null,
  letzteAbfrage: null, // { lat, lng, at }
  laedt: false,
  ausgewaehlt: null,   // gerade im Blatt geöffnetes Objekt
};

const ort = new LocationSource();
const lage = new OrientationSource();
const karte = new MiniMap($('#map'));

const ar = new ArView({
  video: $('#camera'),
  layer: $('#ar-layer'),
  fallback: $('#camera-fallback'),
  fallbackText: $('#camera-fallback-text'),
  onSelect: (obj) => spiel.auswaehlen(obj),
});

/* ------------------------------------------------------------- Anmeldung */

let authModus = 'login';

$('#screen-auth').addEventListener('click', (e) => {
  const tab = e.target.closest('[data-auth-tab]');
  if (!tab) return;
  authModus = tab.dataset.authTab;
  for (const t of document.querySelectorAll('[data-auth-tab]')) {
    const aktiv = t === tab;
    t.classList.toggle('is-active', aktiv);
    t.setAttribute('aria-selected', String(aktiv));
  }
  $('#auth-submit').textContent = authModus === 'login' ? 'Anmelden' : 'Konto anlegen';
  $('#auth-form').querySelector('[name=password]')
    .setAttribute('autocomplete', authModus === 'login' ? 'current-password' : 'new-password');
  $('#auth-error').hidden = true;
});

$('#auth-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const daten = new FormData(e.currentTarget);
  const name = String(daten.get('name') ?? '').trim();
  const passwort = String(daten.get('password') ?? '');
  const knopf = $('#auth-submit');
  const fehler = $('#auth-error');

  fehler.hidden = true;
  knopf.disabled = true;
  knopf.textContent = 'Einen Moment …';

  try {
    const res = authModus === 'login'
      ? await api.login(name, passwort)
      : await api.register(name, passwort);
    setToken(res.token);
    state.me = res.me;
    await spielStarten();
  } catch (err) {
    fehler.textContent = err.message;
    fehler.hidden = false;
  } finally {
    knopf.disabled = false;
    knopf.textContent = authModus === 'login' ? 'Anmelden' : 'Konto anlegen';
  }
});

/* ------------------------------------------------------------ Spielstart */

async function spielStarten() {
  $('#screen-auth').hidden = true;
  $('#screen-game').hidden = false;

  if (!state.katalog) state.katalog = await api.catalog();
  hudAktualisieren();

  await sensorenFreigeben();
  await ar.startCamera();
  ort.start();
}

/**
 * Bewegungssensoren freischalten.
 *
 * iOS verlangt dafür eine echte Nutzergeste. Beim Anmelden ist die gegeben,
 * nach einem Neuladen mit gespeichertem Konto aber nicht -- dann wird die
 * Abfrage beim ersten Tippen nachgeholt.
 */
async function sensorenFreigeben() {
  if (!OrientationSource.needsPermission) {
    lage.start();
    return;
  }

  const antwort = await OrientationSource.requestPermission();
  if (antwort === 'granted') {
    lage.start();
    return;
  }

  ui.toast('Tippe einmal auf den Bildschirm, um die Blickrichtung freizugeben.');
  const nachholen = async () => {
    const zweiterVersuch = await OrientationSource.requestPermission();
    if (zweiterVersuch === 'granted') {
      lage.start();
    } else {
      ui.toast('Ohne Bewegungssensor bleibt die Karte nach Norden ausgerichtet.');
    }
  };
  $('#screen-game').addEventListener('pointerdown', nachholen, { once: true });
}

/* --------------------------------------------------------------- Sensoren */

ort.addEventListener('change', (e) => {
  state.position = e.detail;
  const genau = Math.round(state.position.accuracy);
  const gps = $('#hud-gps');
  gps.textContent = `📍 ±${genau} m`;
  gps.classList.toggle('is-poor', genau > 20 && genau <= 50);
  gps.classList.toggle('is-bad', genau > 50);
  weltNachladen();
});

ort.addEventListener('error', (e) => {
  $('#hud-gps').textContent = '📍 kein Standort';
  $('#hud-gps').classList.add('is-bad');
  ui.toast(e.detail, 'error');
});

lage.addEventListener('change', (e) => {
  const { heading, absolute } = e.detail;
  const anzeige = $('#hud-compass');
  anzeige.hidden = false;
  anzeige.querySelector('b').textContent =
    `${Math.round(heading)}° ${himmelsrichtung(heading)}${absolute ? '' : ' (ungenau)'}`;

  ar.update({ heading, pitch: e.detail.pitch });
  karte.update({ heading });
});

function himmelsrichtung(grad) {
  const namen = ['N', 'NO', 'O', 'SO', 'S', 'SW', 'W', 'NW'];
  return namen[Math.round(grad / 45) % 8];
}

/* --------------------------------------------------------- Welt nachladen */

async function weltNachladen(erzwingen = false) {
  const pos = state.position;
  if (!pos || state.laedt) return;

  const letzte = state.letzteAbfrage;
  if (!erzwingen && letzte) {
    const gewandert = abstand(pos.lat, pos.lng, letzte.lat, letzte.lng);
    const alt = Date.now() - letzte.at;
    if (gewandert < NACHLADE_M && alt < NACHLADE_MS) return;
  }

  state.laedt = true;
  try {
    const welt = await api.world(pos.lat, pos.lng, 150);
    state.welt = welt;
    state.me = welt.me;
    state.letzteAbfrage = { lat: pos.lat, lng: pos.lng, at: Date.now() };

    // Belegte Plätze fallen weg -- dort steht schon die Pflanze.
    const freie = welt.spots.filter((s) => !s.occupied);
    state.objekte = [...freie, ...welt.plants, ...welt.buildings];

    hudAktualisieren();
    ar.update({ objects: state.objekte, origin: welt.origin });
    karte.update({ objects: state.objekte, reach: welt.reach });

    const erreichbar = state.objekte.filter((o) => o.inReach).length;
    const badge = $('#badge-nearby');
    badge.hidden = erreichbar === 0;
    badge.textContent = String(erreichbar);

    blattAktualisieren();
  } catch (err) {
    if (err instanceof ApiError && err.status === 401) return abmelden();
    if (err.status !== 0) ui.toast(err.message, 'error');
  } finally {
    state.laedt = false;
  }
}

// Auch im Stehen regelmäßig nachschauen -- Pflanzen wachsen ja weiter.
setInterval(() => weltNachladen(), NACHLADE_MS);

function abstand(lat1, lng1, lat2, lng2) {
  const R = 6371008.8;
  const d = Math.PI / 180;
  const dLat = (lat2 - lat1) * d;
  const dLng = (lng2 - lng1) * d;
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos(lat1 * d) * Math.cos(lat2 * d) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(a)));
}

/* ------------------------------------------------------------------- HUD */

function hudAktualisieren() {
  const me = state.me;
  if (!me) return;
  $('#hud-level').textContent = me.level;
  $('#hud-coins').textContent = me.coins;
  $('#hud-water').textContent = `${me.water}/${me.waterMax}`;
  const spanne = Math.max(1, me.xpForNext - me.xpForCurrent);
  $('#hud-xp').style.width = `${Math.round(((me.xp - me.xpForCurrent) / spanne) * 100)}%`;
}

/* -------------------------------------------------------------- Aktionen */

const spiel = {
  auswaehlen(obj) {
    state.ausgewaehlt = obj;
    blattOeffnen(obj);
  },

  async pflanzen(spot, art) {
    await mitPosition(async (lat, lng) => {
      const res = await api.plant(spot.cell ?? spot.id, art, lat, lng);
      state.me = res.me;
      ui.toast(res.message, 'win');
      ui.closeSheet();
      await weltNachladen(true);
    });
  },

  async giessen(plant) {
    await mitPosition(async (lat, lng) => {
      const res = await api.water(plant.id, lat, lng);
      state.me = res.me;
      state.ausgewaehlt = res.plant;
      ui.toast(res.message, res.xp ? 'win' : '');
      await weltNachladen(true);
    });
  },

  async ernten(plant) {
    await mitPosition(async (lat, lng) => {
      const res = await api.harvest(plant.id, lat, lng);
      state.me = res.me;
      ui.toast(res.message, res.withered ? '' : 'win');
      ui.closeSheet();
      await weltNachladen(true);
    });
  },

  async bauen(kind) {
    await mitPosition(async (lat, lng) => {
      const res = await api.build(kind, lat, lng);
      state.me = res.me;
      ui.toast(res.message, 'win');
      ui.closeSheet();
      await weltNachladen(true);
    });
  },
};

/** Führt eine Aktion mit der aktuellen Position aus und meldet Fehler. */
async function mitPosition(fn) {
  const pos = state.position;
  if (!pos) return ui.toast('Dein Standort ist noch nicht bekannt.', 'error');
  try {
    await fn(pos.lat, pos.lng);
    hudAktualisieren();
  } catch (err) {
    if (err instanceof ApiError && err.status === 401) return abmelden();
    ui.toast(err.message, 'error');
    await weltNachladen(true);
  }
}

/* ------------------------------------------------------------------ Blatt */

function blattOeffnen(obj) {
  const ctx = { katalog: state.katalog, me: state.me, spiel };
  if (obj.kind === 'spot') {
    ui.openSheet('Freier Pflanzplatz', ui.spotDetail(obj, ctx), () => { state.ausgewaehlt = null; });
  } else if (obj.kind === 'plant') {
    ui.openSheet(obj.speciesName, ui.plantDetail(obj, ctx), () => { state.ausgewaehlt = null; });
  } else {
    ui.openSheet(obj.name, ui.buildingDetail(obj, ctx), () => { state.ausgewaehlt = null; });
  }
}

/** Offenes Detailblatt mit frischen Daten nachziehen. */
function blattAktualisieren() {
  const alt = state.ausgewaehlt;
  if (!alt || !ui.sheetIsOpen()) return;
  const neu = state.objekte.find((o) => o.kind === alt.kind && o.id === alt.id);
  if (!neu) return;
  state.ausgewaehlt = neu;
  blattOeffnen(neu);
}

/* --------------------------------------------------------------- Bedienung */

$('#sheet-close').addEventListener('click', ui.closeSheet);
$('#sheet-backdrop').addEventListener('click', ui.closeSheet);
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') ui.closeSheet(); });

$('#btn-nearby').addEventListener('click', () => {
  state.ausgewaehlt = null;
  ui.openSheet('In der Nähe', ui.nearbyView(state.objekte, { spiel, katalog: state.katalog }));
});

$('#btn-bag').addEventListener('click', () => {
  state.ausgewaehlt = null;
  ui.openSheet('Beutel', ui.bagView(state.me, state.katalog));
});

$('#btn-build').addEventListener('click', () => {
  state.ausgewaehlt = null;
  const hatHeim = state.me?.hasHome === true;
  ui.openSheet('Bauen', ui.buildView(state.katalog, state.me, { spiel, hatHeim }));
});

$('#btn-profile').addEventListener('click', () => {
  state.ausgewaehlt = null;
  ui.openSheet('Profil', ui.profileView(state.me, { onLogout: abmelden }));
});

$('#retry-camera').addEventListener('click', () => ar.startCamera());

$('#btn-map-size').addEventListener('click', () => {
  $('#map-wrap').classList.toggle('is-big');
  requestAnimationFrame(() => karte.draw());
});

window.addEventListener('resize', () => {
  ar.update({});
  karte.draw();
});

document.addEventListener('visibilitychange', () => {
  if (!document.hidden) weltNachladen(true);
});

function abmelden() {
  setToken(null);
  ort.stop();
  lage.stop();
  ar.stopCamera();
  state.me = null;
  state.welt = null;
  state.objekte = [];
  ui.closeSheet();
  $('#screen-game').hidden = true;
  $('#screen-auth').hidden = false;
}

/* ------------------------------------------------------------------ Start */

async function init() {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  }

  if (!getToken()) return;
  try {
    const res = await api.me();
    state.me = res.me;
    await spielStarten();
  } catch {
    setToken(null);
  }
}

init();
