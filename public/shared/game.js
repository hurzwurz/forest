/**
 * Spielregeln: Arten, Wachstum, Weltgenerierung, Gebaeude.
 *
 * Alles hier ist reine Logik ohne Datenbankzugriff, damit die Regeln
 * testbar bleiben und der Client dieselben Werte nur anzeigen, aber nicht
 * beeinflussen kann.
 */

import { cellCenter, cellsInRadius, distance, rand01 } from './geo.js';

/**
 * Wird in die Zellen-Hashes gemischt -- aendert die gesamte Weltform.
 *
 * Diese Datei laeuft auch im Browser, wo es kein `process` gibt. Ohne die
 * Abfrage wuerde schon das Laden des Moduls scheitern und mit ihm die ganze
 * Oberflaeche.
 */
export const WORLD_SEED =
  (typeof process !== 'undefined' && process.env?.WORLD_SEED) || 'forest-v1';

/** Reichweite, in der ein Spieler mit der Welt interagieren darf (Meter). */
export const REACH_M = 40;

/** Radius, den der Client maximal auf einmal abfragen darf (Meter). */
export const MAX_VIEW_M = 300;

const HOUR = 3600_000;

/* ------------------------------------------------------------------ Arten */

export const SPECIES = {
  gaensebluemchen: {
    name: 'Gänseblümchen',
    emoji: '🌼',
    growthH: 1,        // Stunden bis zur Bluete (bei guter Pflege)
    seedCost: 1,
    yieldSeeds: 2,
    yieldCoins: 5,
    xp: 10,
    soil: ['karg', 'normal', 'fruchtbar'],
  },
  tulpe: {
    name: 'Tulpe',
    emoji: '🌷',
    growthH: 3,
    seedCost: 1,
    yieldSeeds: 2,
    yieldCoins: 14,
    xp: 25,
    soil: ['normal', 'fruchtbar'],
  },
  sonnenblume: {
    name: 'Sonnenblume',
    emoji: '🌻',
    growthH: 8,
    seedCost: 2,
    yieldSeeds: 3,
    yieldCoins: 45,
    xp: 70,
    soil: ['fruchtbar'],
  },
  rose: {
    name: 'Rose',
    emoji: '🌹',
    growthH: 14,
    seedCost: 3,
    yieldSeeds: 3,
    yieldCoins: 90,
    xp: 140,
    soil: ['fruchtbar'],
  },
};

/** Wachstumsstufen als Anteil des Fortschritts. */
export const STAGES = [
  { key: 'samen', name: 'Samen', at: 0, emoji: '🌰' },
  { key: 'keimling', name: 'Keimling', at: 0.25, emoji: '🌱' },
  { key: 'knospe', name: 'Knospe', at: 0.6, emoji: '🌿' },
  { key: 'bluete', name: 'Blüte', at: 1, emoji: null }, // nutzt Arten-Emoji
];

/* --------------------------------------------------------------- Gebaeude */

export const BUILDINGS = {
  gewaechshaus: {
    name: 'Gewächshaus',
    emoji: '🏡',
    coinCost: 0,
    unique: true,            // genau eines pro Spieler -- das Hauptheim
    desc: 'Dein Hauptheim. Alle weiteren Gebäude entstehen in seiner Umgebung.',
  },
  brunnen: {
    name: 'Brunnen',
    emoji: '⛲',
    coinCost: 60,
    effectRadiusM: 80,
    desc: 'Füllt deine Gießkanne automatisch auf, wenn du in der Nähe bist.',
  },
  bienenstock: {
    name: 'Bienenstock',
    emoji: '🐝',
    coinCost: 150,
    effectRadiusM: 60,
    growthBonus: 0.25,       // 25 % schnelleres Wachstum im Umkreis
    desc: 'Beschleunigt das Wachstum aller Pflanzen im Umkreis um 25 %.',
  },
  schuppen: {
    name: 'Schuppen',
    emoji: '🛖',
    coinCost: 100,
    waterBonus: 5,           // erhoeht die Kapazitaet der Giesskanne
    desc: 'Erweitert deine Gießkanne um 5 Einheiten.',
  },
};

/** Hoechstabstand eines Nebengebaeudes zum eigenen Gewaechshaus (Meter). */
export const HOMESTEAD_M = 120;

/** Mindestabstand zwischen zwei Gebaeuden, damit sie sich nicht stapeln. */
export const BUILDING_SPACING_M = 15;

/* ------------------------------------------------------- Weltgenerierung */

const SOILS = [
  // `acc` ist die Akkusativform ("braucht kargen Boden") -- sonst stimmt die
  // Deklination in den Meldungen nicht.
  { key: 'karg', name: 'karger Boden', acc: 'kargen Boden', weight: 0.5 },
  { key: 'normal', name: 'normaler Boden', acc: 'normalen Boden', weight: 0.35 },
  { key: 'fruchtbar', name: 'fruchtbarer Boden', acc: 'fruchtbaren Boden', weight: 0.15 },
];

/** Akkusativform eines Bodentyps, z. B. fuer "braucht fruchtbaren Boden". */
export function soilAccusative(key) {
  return SOILS.find((s) => s.key === key)?.acc ?? key;
}

/**
 * Gibt es in dieser Rasterzelle einen Pflanzplatz? Rein deterministisch aus
 * den Zellindizes -- dieselbe Zelle liefert weltweit immer dasselbe Ergebnis.
 */
export function spotForCell(ix, iy) {
  const key = `c:${ix}:${iy}`;
  if (rand01(`${WORLD_SEED}|spot|${key}`) > 0.34) return null; // ~1/3 der Zellen

  const r = rand01(`${WORLD_SEED}|soil|${key}`);
  let acc = 0;
  let soil = SOILS[0];
  for (const s of SOILS) {
    acc += s.weight;
    if (r < acc) { soil = s; break; }
  }

  const center = cellCenter(ix, iy);
  return {
    id: key,
    lat: center.lat,
    lng: center.lng,
    soil: soil.key,
    soilName: soil.name,
  };
}

/** Alle Pflanzplaetze im Umkreis, nach Entfernung sortiert. */
export function spotsInRadius(lat, lng, radiusM) {
  const out = [];
  for (const { ix, iy } of cellsInRadius(lat, lng, radiusM)) {
    const spot = spotForCell(ix, iy);
    if (!spot) continue;
    const d = distance(lat, lng, spot.lat, spot.lng);
    if (d <= radiusM) out.push({ ...spot, distance: d });
  }
  out.sort((a, b) => a.distance - b.distance);
  return out;
}

/* ---------------------------------------------------------- Wachstumslogik */

/**
 * Nach so vielen Stunden ohne Wasser stoppt das Wachstum.
 *
 * Bewusst kürzer als die Reifezeit jeder Sorte ab der Tulpe: Beim Pflanzen
 * zählt die Blume als frisch gegossen, und wäre dieses Fenster länger als die
 * Reifezeit, blühte sie ohne einen einzigen Gießvorgang auf -- das Gießen wäre
 * im frühen Spiel wirkungslos.
 */
export const THIRSTY_AFTER_H = 2;
/** Nach so vielen Stunden ohne Wasser verwelkt die Pflanze. */
export const WITHER_AFTER_H = 48;

/**
 * Berechnet den aktuellen Zustand einer Pflanze aus ihren Zeitstempeln.
 *
 * `growthMs` zaehlt nur, solange die Pflanze getraenkt war: nach jedem Giessen
 * laeuft die Uhr THIRSTY_AFTER_H Stunden lang weiter. Wer nie giesst, kommt
 * ueber die erste Stufe nicht hinaus.
 */
export function plantState(plant, now = Date.now(), growthBonus = 0) {
  const species = SPECIES[plant.species];
  if (!species) return null;

  const wateredAt = plant.last_watered_at ?? plant.planted_at;
  const dryMs = now - wateredAt;

  // Bereits angerechnete Wachstumszeit + der seit dem letzten Giessen
  // verstrichene Teil, gedeckelt auf das Durst-Fenster.
  const activeMs = Math.min(dryMs, THIRSTY_AFTER_H * HOUR);
  const grownMs = (plant.growth_ms ?? 0) + activeMs;

  const needMs = (species.growthH * HOUR) / (1 + growthBonus);
  const progress = Math.min(1, grownMs / needMs);

  let stage = STAGES[0];
  for (const s of STAGES) if (progress >= s.at) stage = s;

  const withered = dryMs > WITHER_AFTER_H * HOUR && progress < 1;
  const thirsty = dryMs > THIRSTY_AFTER_H * HOUR && progress < 1;

  return {
    progress,
    stage: stage.key,
    stageName: stage.name,
    emoji: withered ? '🥀' : (stage.emoji ?? species.emoji),
    ready: progress >= 1 && !withered,
    thirsty,
    withered,
    /** Millisekunden, die bei sofortigem Giessen noch fehlen. */
    remainingMs: Math.max(0, needMs - grownMs),
  };
}

/**
 * Wachstumszeit festschreiben (z. B. beim Giessen). Verhindert, dass beim
 * Verschieben des Zeitfensters bereits erarbeiteter Fortschritt verloren geht.
 */
export function accumulatedGrowthMs(plant, now = Date.now()) {
  const wateredAt = plant.last_watered_at ?? plant.planted_at;
  const activeMs = Math.min(now - wateredAt, THIRSTY_AFTER_H * HOUR);
  return (plant.growth_ms ?? 0) + Math.max(0, activeMs);
}

/* ------------------------------------------------------------ Fortschritt */

/** Benoetigte XP fuer das naechste Level. */
export function xpForLevel(level) {
  return Math.round(100 * level ** 1.6);
}

export function levelFromXp(xp) {
  let level = 1;
  while (xp >= xpForLevel(level)) level++;
  return level;
}
