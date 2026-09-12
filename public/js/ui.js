/** Oberfläche: Hinweise, ausziehbares Blatt und dessen Inhalte. */

const $ = (sel) => document.querySelector(sel);

/* ------------------------------------------------------------- Hinweise */

export function toast(text, art = '') {
  const el = document.createElement('div');
  el.className = `toast${art ? ` toast--${art}` : ''}`;
  el.textContent = text;
  $('#toasts').append(el);
  setTimeout(() => {
    el.style.opacity = '0';
    el.style.transition = 'opacity .3s';
    setTimeout(() => el.remove(), 320);
  }, art === 'win' ? 4200 : 3000);
}

/* ----------------------------------------------------------------- Blatt */

let beimSchliessen = null;

export function openSheet(titel, inhalt, onClose = null) {
  $('#sheet-title').textContent = titel;
  const body = $('#sheet-body');
  body.replaceChildren(inhalt);
  $('#sheet').hidden = false;
  $('#sheet-backdrop').hidden = false;
  beimSchliessen = onClose;
}

export function closeSheet() {
  $('#sheet').hidden = true;
  $('#sheet-backdrop').hidden = true;
  beimSchliessen?.();
  beimSchliessen = null;
}

export function sheetIsOpen() {
  return !$('#sheet').hidden;
}

/* -------------------------------------------------------------- Bausteine */

/** Dativform der Bodentypen: "waechst auf fruchtbarem Boden". */
const BODEN_DATIV = { karg: 'kargem', normal: 'normalem', fruchtbar: 'fruchtbarem' };

export function bodenListe(keys) {
  const worte = keys.map((k) => BODEN_DATIV[k] ?? k);
  if (worte.length <= 1) return worte.join('');
  return `${worte.slice(0, -1).join(', ')} oder ${worte.at(-1)}`;
}

function el(tag, klasse, text) {
  const node = document.createElement(tag);
  if (klasse) node.className = klasse;
  if (text != null) node.textContent = text;
  return node;
}

function statLine(links, rechts) {
  const row = el('div', 'stat-line');
  row.append(el('span', null, links), el('b', null, rechts));
  return row;
}

function karte({ emoji, titel, unter, rechts, disabled, onClick }) {
  const btn = el('button', 'card');
  btn.type = 'button';
  if (disabled) btn.disabled = true;
  btn.append(el('span', 'card__emoji', emoji));
  const text = el('span', 'card__text');
  text.append(el('span', 'card__title', titel));
  if (unter) text.append(el('span', 'card__sub', unter));
  btn.append(text);
  if (rechts) btn.append(el('span', 'card__right', rechts));
  if (onClick) btn.addEventListener('click', onClick);
  return btn;
}

/** "3 Std. 20 Min." aus Millisekunden. */
export function dauer(ms) {
  if (ms <= 0) return 'jetzt';
  const min = Math.round(ms / 60000);
  if (min < 60) return `${min} Min.`;
  const std = Math.floor(min / 60);
  const rest = min % 60;
  if (std < 24) return rest ? `${std} Std. ${rest} Min.` : `${std} Std.`;
  return `${Math.floor(std / 24)} Tg. ${std % 24} Std.`;
}

/* ------------------------------------------------------- Detailansichten */

/** Ein freier Pflanzplatz: Sortenauswahl. */
export function spotDetail(spot, { katalog, me, spiel }) {
  const box = el('div');
  box.append(el('p', 'meta',
    `${spot.soilName} · ${Math.round(spot.distance)} m entfernt${spot.inReach ? '' : ' — noch zu weit weg'}`));

  const liste = el('div', 'list');
  const samen = Object.entries(katalog.species);

  for (const [key, art] of samen) {
    const habe = me.inventory[`seed:${key}`] ?? 0;
    const passt = art.soil.includes(spot.soil);
    const genug = habe >= art.seedCost;
    const grund = !passt ? 'Falscher Boden für diese Sorte'
      : !genug ? `Du brauchst ${art.seedCost} Samen (du hast ${habe})`
      : `${art.growthH} Std. bis zur Blüte · ${art.yieldCoins} Münzen`;

    liste.append(karte({
      emoji: art.emoji,
      titel: art.name,
      unter: grund,
      rechts: `${habe}×`,
      disabled: !passt || !genug || !spot.inReach,
      onClick: () => spiel.pflanzen(spot, key),
    }));
  }

  box.append(liste);
  if (!spot.inReach) {
    box.append(el('p', 'meta', `Geh noch ${Math.round(spot.distance - katalog.reach)} m näher heran, dann kannst du hier pflanzen.`));
  }
  return box;
}

/** Eine wachsende Pflanze. */
export function plantDetail(plant, { me, spiel }) {
  const box = el('div');
  box.append(el('p', 'meta',
    `${plant.mine ? 'Deine Pflanze' : `Gepflanzt von ${plant.owner}`} · ${Math.round(plant.distance)} m entfernt`));

  const bar = el('div', 'progress');
  const fill = el('i');
  fill.style.width = `${Math.round(plant.progress * 100)}%`;
  bar.append(fill);
  box.append(bar);
  box.append(el('p', 'meta', plant.withered
    ? 'Verwelkt — sie wurde zu lange nicht gegossen.'
    : plant.ready
      ? 'Ausgewachsen und bereit zur Ernte.'
      : `Stadium: ${plant.stageName} · noch ${dauer(plant.remainingMs)} bei regelmäßigem Gießen`));

  box.append(statLine('Sorte', plant.speciesName));
  box.append(statLine('Fortschritt', `${Math.round(plant.progress * 100)} %`));
  if (plant.thirsty && !plant.ready) box.append(statLine('Zustand', 'Durstig 💧'));

  const actions = el('div', 'actions');

  if (!plant.withered && !plant.ready) {
    const giessen = el('button', 'btn btn--water', me.water > 0 ? `💧 Gießen (${me.water})` : 'Gießkanne leer');
    giessen.type = 'button';
    giessen.disabled = !plant.inReach || me.water < 1;
    giessen.addEventListener('click', () => spiel.giessen(plant));
    actions.append(giessen);
  }

  // Verwelktes darf jeder wegräumen, ernten nur der Besitzer.
  if (plant.withered || (plant.mine && plant.ready)) {
    const ernten = el('button', 'btn btn--harvest', plant.withered ? '🧹 Aufräumen' : '🌼 Ernten');
    ernten.type = 'button';
    ernten.disabled = !plant.inReach;
    ernten.addEventListener('click', () => spiel.ernten(plant));
    actions.append(ernten);
  }

  if (actions.children.length) box.append(actions);
  if (!plant.inReach) box.append(el('p', 'meta', 'Zu weit weg — geh näher heran.'));
  return box;
}

/** Ein Gebäude. */
export function buildingDetail(b, { katalog }) {
  const def = katalog.buildings[b.type] ?? {};
  const box = el('div');
  box.append(el('p', 'meta', `${b.mine ? 'Dein Gebäude' : `Gehört ${b.owner}`} · ${Math.round(b.distance)} m entfernt`));
  if (def.desc) box.append(el('p', null, def.desc));
  if (def.effectRadiusM) box.append(statLine('Wirkt im Umkreis von', `${def.effectRadiusM} m`));
  return box;
}

/* ------------------------------------------------------------- Übersichten */

export function bagView(me, katalog) {
  const box = el('div');
  box.append(el('p', 'meta', `Stufe ${me.level} · ${me.xp} XP · ${me.coins} Münzen`));

  const bar = el('div', 'progress');
  const spanne = Math.max(1, me.xpForNext - me.xpForCurrent);
  const fill = el('i');
  fill.style.width = `${Math.round(((me.xp - me.xpForCurrent) / spanne) * 100)}%`;
  bar.append(fill);
  box.append(bar);
  box.append(el('p', 'meta', `Noch ${me.xpForNext - me.xp} XP bis Stufe ${me.level + 1}`));

  box.append(statLine('Gießkanne', `${me.water} / ${me.waterMax}`));
  if (me.nextWaterInMs != null) box.append(statLine('Nächstes Wasser in', dauer(me.nextWaterInMs)));

  const liste = el('div', 'list');
  liste.style.marginTop = '14px';
  let leer = true;
  for (const [key, art] of Object.entries(katalog.species)) {
    const anzahl = me.inventory[`seed:${key}`] ?? 0;
    if (!anzahl) continue;
    leer = false;
    liste.append(karte({
      emoji: art.emoji,
      titel: `${art.name}-Samen`,
      unter: `Wächst auf ${bodenListe(art.soil)} Boden · ${art.growthH} Std.`,
      rechts: `${anzahl}×`,
    }));
  }
  box.append(leer ? el('p', 'empty', 'Keine Samen mehr. Ernte eine Blume — jede gibt neue Samen zurück.') : liste);
  return box;
}

export function buildView(katalog, me, { spiel, hatHeim }) {
  const box = el('div');
  box.append(el('p', 'meta', hatHeim
    ? 'Weitere Gebäude entstehen im Umkreis deines Gewächshauses.'
    : 'Setz zuerst dein Gewächshaus. Es wird die Mitte deines Gartens.'));

  const liste = el('div', 'list');
  for (const [key, def] of Object.entries(katalog.buildings)) {
    const istHeim = key === 'gewaechshaus';
    const gesperrt = istHeim ? hatHeim : !hatHeim || me.coins < def.coinCost;
    const unter = istHeim && hatHeim ? 'Schon gebaut — es gibt nur eines'
      : !hatHeim && !istHeim ? 'Erst das Gewächshaus setzen'
      : def.desc;

    liste.append(karte({
      emoji: def.emoji,
      titel: def.name,
      unter,
      rechts: def.coinCost ? `🪙 ${def.coinCost}` : 'gratis',
      disabled: gesperrt,
      onClick: () => spiel.bauen(key),
    }));
  }
  box.append(liste);
  box.append(el('p', 'meta', 'Gebaut wird immer genau dort, wo du gerade stehst.'));
  return box;
}

export function nearbyView(objects, { spiel, katalog }) {
  const box = el('div');
  const sortiert = [...objects].sort((a, b) => a.distance - b.distance).slice(0, 30);
  if (!sortiert.length) return el('p', 'empty', 'Hier ist gerade nichts. Geh ein Stück weiter.');

  const liste = el('div', 'list');
  for (const obj of sortiert) {
    const info = beschreibung(obj, katalog);
    liste.append(karte({
      emoji: info.emoji,
      titel: info.titel,
      unter: info.unter,
      rechts: `${Math.round(obj.distance)} m`,
      onClick: () => spiel.auswaehlen(obj),
    }));
  }
  box.append(liste);
  return box;
}

function beschreibung(obj, katalog) {
  if (obj.kind === 'spot') {
    return { emoji: obj.soil === 'fruchtbar' ? '🟢' : obj.soil === 'normal' ? '🟤' : '⚪',
      titel: 'Freier Pflanzplatz', unter: `${obj.soilName}${obj.inReach ? ' · in Reichweite' : ''}` };
  }
  if (obj.kind === 'building') {
    return { emoji: obj.emoji, titel: obj.name, unter: obj.mine ? 'Dein Gebäude' : `von ${obj.owner}` };
  }
  const zustand = obj.withered ? 'verwelkt' : obj.ready ? 'reif zur Ernte' : obj.stageName;
  return { emoji: obj.emoji, titel: obj.speciesName, unter: `${zustand} · ${obj.mine ? 'deine' : obj.owner}` };
}

export function profileView(me, { onLogout }) {
  const box = el('div');
  box.append(el('p', 'meta', `Angemeldet als ${me.name}`));
  box.append(statLine('Stufe', me.level));
  box.append(statLine('Erfahrung', `${me.xp} XP`));
  box.append(statLine('Münzen', me.coins));
  box.append(statLine('Gießkanne', `${me.water} / ${me.waterMax}`));

  const hinweis = el('p', 'meta');
  hinweis.style.marginTop = '16px';
  hinweis.textContent = 'Tipp: Fremde Pflanzen zu gießen bringt Erfahrung — einmal je Pflanze.';
  box.append(hinweis);

  const abmelden = el('button', 'btn btn--block');
  abmelden.type = 'button';
  abmelden.textContent = 'Abmelden';
  abmelden.style.marginTop = '12px';
  abmelden.addEventListener('click', onLogout);
  box.append(abmelden);
  return box;
}
