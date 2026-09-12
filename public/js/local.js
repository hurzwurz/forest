/**
 * Offline-Betrieb: dasselbe Spiel ohne Server.
 *
 * Wenn keine API erreichbar ist — etwa auf GitHub Pages — übernimmt dieses
 * Modul deren Rolle. Es bietet dieselben Aufrufe wie `api.js` an, rechnet aber
 * im Browser und legt alles im Speicher des Geräts ab.
 *
 * Die Spielregeln kommen aus `shared/game.js`, also aus derselben Datei, die
 * auch der Server benutzt. Zwei Fassungen wären die sichere Quelle dafür, dass
 * eine Blume je nach Betriebsart unterschiedlich schnell wächst.
 */

import { ApiError } from './api.js';
import {
  BUILDINGS,
  BUILDING_SPACING_M,
  HOMESTEAD_M,
  MAX_VIEW_M,
  REACH_M,
  SPECIES,
  accumulatedGrowthMs,
  levelFromXp,
  plantState,
  soilAccusative,
  spotForCell,
  spotsInRadius,
  xpForLevel,
} from '../shared/game.js';
import { bearing, distance, parseCellKey } from '../shared/geo.js';

const SPEICHER = 'forest.local';
const WATER_REFILL_MS = 10 * 60_000;
const STARTER = { 'seed:gaensebluemchen': 5, 'seed:tulpe': 2 };

const fail = (status, msg) => { throw new ApiError(msg, status); };

/* ------------------------------------------------------------- Speicher */

function leererStand(name = 'Gärtner') {
  const now = Date.now();
  return {
    version: 1,
    me: {
      id: 1,
      name,
      coins: 20,
      xp: 0,
      water: 10,
      water_max: 10,
      water_at: now,
      inventory: { ...STARTER },
    },
    plants: [],
    buildings: [],
    nextId: 1,
  };
}

function lade() {
  try {
    const roh = localStorage.getItem(SPEICHER);
    if (!roh) return null;
    const stand = JSON.parse(roh);
    return stand?.me ? stand : null;
  } catch {
    // Beschädigter oder gesperrter Speicher: lieber neu anfangen als abstürzen.
    return null;
  }
}

function sichere(stand) {
  try {
    localStorage.setItem(SPEICHER, JSON.stringify(stand));
  } catch {
    // Voller oder gesperrter Speicher -- die laufende Sitzung funktioniert
    // weiter, nur das Fortschreiben schlägt fehl.
  }
}

/* -------------------------------------------------------------- Spieler */

function nachfuellen(stand, lat = null, lng = null) {
  const me = stand.me;
  const now = Date.now();

  if (me.water < me.water_max) {
    const dazu = Math.floor((now - me.water_at) / WATER_REFILL_MS);
    if (dazu > 0) {
      me.water = Math.min(me.water_max, me.water + dazu);
      const verbraucht = dazu * WATER_REFILL_MS;
      me.water_at = me.water >= me.water_max ? now : me.water_at + verbraucht;
    }
  }

  // Am Brunnen ist die Kanne sofort voll.
  if (lat != null && me.water < me.water_max) {
    const brunnen = stand.buildings.some((b) => b.kind === 'brunnen'
      && distance(lat, lng, b.lat, b.lng) <= BUILDINGS.brunnen.effectRadiusM);
    if (brunnen) {
      me.water = me.water_max;
      me.water_at = now;
    }
  }
  return me;
}

function oeffentlich(stand) {
  const me = stand.me;
  const level = levelFromXp(me.xp);
  return {
    id: me.id,
    name: me.name,
    coins: me.coins,
    xp: me.xp,
    level,
    xpForNext: xpForLevel(level),
    xpForCurrent: level > 1 ? xpForLevel(level - 1) : 0,
    water: me.water,
    waterMax: me.water_max,
    nextWaterInMs: me.water >= me.water_max
      ? null
      : Math.max(0, WATER_REFILL_MS - (Date.now() - me.water_at)),
    inventory: { ...me.inventory },
    hasHome: stand.buildings.some((b) => b.kind === 'gewaechshaus'),
  };
}

/** Wachstumsbonus durch Bienenstöcke an einem Ort. */
function bonusAn(stand, lat, lng) {
  const nah = stand.buildings.some((b) => b.kind === 'bienenstock'
    && distance(lat, lng, b.lat, b.lng) <= BUILDINGS.bienenstock.effectRadiusM);
  return nah ? BUILDINGS.bienenstock.growthBonus : 0;
}

function sichtPflanze(stand, p, from) {
  const zustand = plantState(p, Date.now(), bonusAn(stand, p.lat, p.lng));
  const dist = distance(from.lat, from.lng, p.lat, p.lng);
  return {
    kind: 'plant',
    id: p.id,
    cell: p.cell,
    species: p.species,
    speciesName: SPECIES[p.species]?.name ?? p.species,
    lat: p.lat,
    lng: p.lng,
    owner: stand.me.name,
    mine: true,
    plantedAt: p.planted_at,
    lastWateredAt: p.last_watered_at,
    distance: dist,
    bearing: bearing(from.lat, from.lng, p.lat, p.lng),
    inReach: dist <= REACH_M,
    ...zustand,
  };
}

/** Prüft die Reichweite — dieselbe Grenze wie auf dem Server. */
function pruefeReichweite(lat, lng, ziel) {
  const dist = distance(lat, lng, ziel.lat, ziel.lng);
  if (dist > REACH_M) {
    fail(403, `Zu weit weg — geh näher ran (noch ${Math.round(dist - REACH_M)} m).`);
  }
}

/* ------------------------------------------------------------ Schnittstelle */

export function createLocalApi() {
  let stand = lade();

  const sichern = () => sichere(stand);
  const gestartet = () => (stand ?? fail(401, 'Noch kein Garten angelegt.'));

  return {
    async register(name) {
      stand = leererStand(String(name ?? '').trim() || 'Gärtner');
      sichern();
      return { token: 'lokal', me: oeffentlich(stand) };
    },

    async login(name) {
      if (!stand) return this.register(name);
      return { token: 'lokal', me: oeffentlich(stand) };
    },

    async me() {
      const s = gestartet();
      nachfuellen(s);
      sichern();
      return { me: oeffentlich(s) };
    },

    async catalog() {
      return { species: SPECIES, buildings: BUILDINGS, reach: REACH_M };
    },

    async world(lat, lng, radius = 150) {
      const s = gestartet();
      const r = Math.min(MAX_VIEW_M, Math.max(50, radius));
      nachfuellen(s, lat, lng);
      sichern();

      const lebend = s.plants.filter((p) => !p.harvested_at);
      const belegt = new Set(lebend.map((p) => p.cell));

      const spots = spotsInRadius(lat, lng, r).map((spot) => ({
        kind: 'spot',
        id: spot.id,
        lat: spot.lat,
        lng: spot.lng,
        soil: spot.soil,
        soilName: spot.soilName,
        distance: spot.distance,
        bearing: bearing(lat, lng, spot.lat, spot.lng),
        inReach: spot.distance <= REACH_M,
        occupied: belegt.has(spot.id),
        plantId: lebend.find((p) => p.cell === spot.id)?.id ?? null,
      }));

      const plants = lebend
        .map((p) => sichtPflanze(s, p, { lat, lng }))
        .filter((p) => p.distance <= r);

      const buildings = s.buildings
        .map((b) => {
          const dist = distance(lat, lng, b.lat, b.lng);
          const def = BUILDINGS[b.kind] ?? {};
          return {
            kind: 'building',
            id: b.id,
            type: b.kind,
            name: def.name ?? b.kind,
            emoji: def.emoji ?? '🏠',
            lat: b.lat,
            lng: b.lng,
            owner: s.me.name,
            mine: true,
            distance: dist,
            bearing: bearing(lat, lng, b.lat, b.lng),
            inReach: dist <= REACH_M,
          };
        })
        .filter((b) => b.distance <= r);

      return { me: oeffentlich(s), origin: { lat, lng, radius: r }, spots, plants, buildings, reach: REACH_M };
    },

    async plant(cell, speciesKey, lat, lng) {
      const s = gestartet();
      nachfuellen(s, lat, lng);

      const idx = parseCellKey(cell);
      if (!idx) fail(400, 'Unbekannter Pflanzplatz.');
      const spot = spotForCell(idx.ix, idx.iy);
      if (!spot) fail(404, 'Auf dieser Stelle lässt sich nichts pflanzen.');
      pruefeReichweite(lat, lng, spot);

      const art = SPECIES[speciesKey];
      if (!art) fail(400, 'Diese Sorte gibt es nicht.');
      if (!art.soil.includes(spot.soil)) {
        const noetig = art.soil.map(soilAccusative).join(' oder ');
        fail(400, `Hier ist ${spot.soilName}. ${art.name} braucht ${noetig}.`);
      }
      if (s.plants.some((p) => p.cell === spot.id && !p.harvested_at)) {
        fail(409, 'Hier wächst schon etwas.');
      }
      if ((s.me.inventory[`seed:${speciesKey}`] ?? 0) < art.seedCost) {
        fail(400, `Du brauchst ${art.seedCost}× ${art.name}-Samen.`);
      }

      s.me.inventory[`seed:${speciesKey}`] -= art.seedCost;
      const now = Date.now();
      const pflanze = {
        id: ++s.nextId,
        cell: spot.id,
        species: speciesKey,
        lat: spot.lat,
        lng: spot.lng,
        planted_at: now,
        last_watered_at: now,
        growth_ms: 0,
        harvested_at: null,
      };
      s.plants.push(pflanze);
      s.me.xp += 5;
      sichern();

      return {
        ok: true,
        message: `${art.name} gepflanzt. Nicht vergessen zu gießen!`,
        plant: sichtPflanze(s, pflanze, { lat, lng }),
        me: oeffentlich(s),
      };
    },

    async water(plantId, lat, lng) {
      const s = gestartet();
      nachfuellen(s, lat, lng);

      const p = s.plants.find((x) => x.id === plantId && !x.harvested_at);
      if (!p) fail(404, 'Diese Pflanze gibt es nicht mehr.');
      pruefeReichweite(lat, lng, p);

      const now = Date.now();
      const zustand = plantState(p, now, bonusAn(s, p.lat, p.lng));
      if (zustand.withered) fail(409, 'Diese Pflanze ist leider verwelkt.');
      if (zustand.ready) fail(409, 'Die Pflanze blüht schon — sie kann geerntet werden.');
      if (s.me.water < 1) fail(400, 'Deine Gießkanne ist leer. Sie füllt sich mit der Zeit wieder.');

      p.growth_ms = accumulatedGrowthMs(p, now);
      p.last_watered_at = now;
      if (s.me.water >= s.me.water_max) s.me.water_at = now;
      s.me.water -= 1;
      s.me.xp += 2;
      sichern();

      return {
        ok: true,
        message: 'Gegossen. 💧',
        xp: 2,
        plant: sichtPflanze(s, p, { lat, lng }),
        me: oeffentlich(s),
      };
    },

    async harvest(plantId, lat, lng) {
      const s = gestartet();
      nachfuellen(s, lat, lng);

      const p = s.plants.find((x) => x.id === plantId && !x.harvested_at);
      if (!p) fail(404, 'Diese Pflanze gibt es nicht mehr.');
      pruefeReichweite(lat, lng, p);

      const now = Date.now();
      const bonus = bonusAn(s, p.lat, p.lng);
      const zustand = plantState(p, now, bonus);
      const art = SPECIES[p.species];

      if (!zustand.ready && !zustand.withered) {
        fail(409, `Noch nicht so weit — Stadium: ${zustand.stageName}.`);
      }
      p.harvested_at = now;

      if (zustand.withered) {
        sichern();
        return {
          ok: true,
          withered: true,
          message: 'Die verwelkte Pflanze wurde entfernt. Der Platz ist wieder frei.',
          me: oeffentlich(s),
        };
      }

      const samen = art.yieldSeeds + (bonus > 0 ? 1 : 0);
      const schluessel = `seed:${p.species}`;
      s.me.inventory[schluessel] = (s.me.inventory[schluessel] ?? 0) + samen;
      s.me.coins += art.yieldCoins;
      s.me.xp += art.xp;
      sichern();

      return {
        ok: true,
        message: `${art.emoji} ${art.name} geerntet: +${samen} Samen, +${art.yieldCoins} Münzen, +${art.xp} XP`,
        reward: { seeds: samen, coins: art.yieldCoins, xp: art.xp, species: p.species },
        me: oeffentlich(s),
      };
    },

    async build(kind, lat, lng) {
      const s = gestartet();
      nachfuellen(s, lat, lng);

      const def = BUILDINGS[kind];
      if (!def) fail(400, 'Dieses Gebäude gibt es nicht.');

      const heim = s.buildings.find((b) => b.kind === 'gewaechshaus');
      if (def.unique) {
        if (heim) fail(409, 'Du hast bereits ein Gewächshaus. Es gibt nur eines pro Spieler.');
      } else {
        if (!heim) fail(409, 'Setz zuerst dein Gewächshaus — es ist die Mitte deines Gartens.');
        const d = distance(lat, lng, heim.lat, heim.lng);
        if (d > HOMESTEAD_M) {
          fail(403, `Zu weit von deinem Gewächshaus (${Math.round(d)} m, erlaubt sind ${HOMESTEAD_M} m).`);
        }
      }

      const eng = s.buildings.find((b) => distance(lat, lng, b.lat, b.lng) <= BUILDING_SPACING_M);
      if (eng) {
        fail(409, `Hier steht schon dein ${BUILDINGS[eng.kind]?.name ?? 'Gebäude'}. `
          + `Mindestens ${BUILDING_SPACING_M} m Abstand.`);
      }
      if (def.coinCost > 0 && s.me.coins < def.coinCost) {
        fail(400, `Dafür brauchst du ${def.coinCost} Münzen.`);
      }

      s.me.coins -= def.coinCost ?? 0;
      const gebaeude = { id: ++s.nextId, kind, lat, lng, placed_at: Date.now() };
      s.buildings.push(gebaeude);
      if (def.waterBonus) s.me.water_max += def.waterBonus;
      s.me.xp += 30;
      sichern();

      return {
        ok: true,
        message: `${def.emoji} ${def.name} gebaut!`,
        building: {
          kind: 'building',
          id: gebaeude.id,
          type: kind,
          name: def.name,
          emoji: def.emoji,
          lat,
          lng,
          owner: s.me.name,
          mine: true,
          distance: 0,
          bearing: 0,
          inReach: true,
        },
        me: oeffentlich(s),
      };
    },

    /** Gibt es schon einen Garten auf diesem Gerät? */
    hatGarten() {
      return stand !== null;
    },

    /** Alles löschen und von vorn anfangen. */
    zuruecksetzen() {
      stand = null;
      try {
        localStorage.removeItem(SPEICHER);
      } catch { /* nicht schlimm */ }
    },
  };
}
