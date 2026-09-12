/** Spielerzustand: Gießkanne, Inventar, XP. */

import { db } from './db.js';
import { BUILDINGS, levelFromXp, xpForLevel } from './game.js';
import { distance } from './geo.js';

/** Zeit, in der sich eine Einheit Wasser nachfuellt. */
export const WATER_REFILL_MS = 10 * 60_000;

/**
 * Rechnet die seit water_at vergangene Zeit in Wasser um und schreibt sie fest.
 * Steht der Spieler an einem Brunnen, ist die Kanne sofort voll.
 */
export function refillWater(user, lat = null, lng = null) {
  const now = Date.now();
  let water = user.water;
  const max = user.water_max;

  if (water < max) {
    const gained = Math.floor((now - user.water_at) / WATER_REFILL_MS);
    if (gained > 0) water = Math.min(max, water + gained);
  }

  if (lat != null && lng != null && water < max && nearWell(lat, lng)) water = max;

  if (water !== user.water || now - user.water_at >= WATER_REFILL_MS) {
    // Nur den verbrauchten Teil des Zeitguthabens abziehen, damit angefangene
    // Intervalle nicht verloren gehen.
    const used = Math.floor((now - user.water_at) / WATER_REFILL_MS) * WATER_REFILL_MS;
    const water_at = water >= max ? now : user.water_at + used;
    db.prepare('UPDATE users SET water = ?, water_at = ? WHERE id = ?').run(water, water_at, user.id);
    user.water = water;
    user.water_at = water_at;
  }
  return user;
}

/** Liegt ein Brunnen (egal von wem) in Wirkreichweite? */
export function nearWell(lat, lng) {
  const r = BUILDINGS.brunnen.effectRadiusM;
  const rows = nearbyBuildings(lat, lng, r, 'brunnen');
  return rows.length > 0;
}

/** Gebaeude im Umkreis -- grob ueber ein Koordinatenfenster vorgefiltert. */
export function nearbyBuildings(lat, lng, radiusM, kind = null) {
  const dLat = radiusM / 111_320;
  const dLng = radiusM / Math.max(1, 111_320 * Math.cos((lat * Math.PI) / 180));
  const sql =
    'SELECT b.*, u.name AS owner_name FROM buildings b JOIN users u ON u.id = b.owner_id ' +
    'WHERE b.lat BETWEEN ? AND ? AND b.lng BETWEEN ? AND ?' +
    (kind ? ' AND b.kind = ?' : '');
  const args = [lat - dLat, lat + dLat, lng - dLng, lng + dLng];
  if (kind) args.push(kind);
  return db
    .prepare(sql)
    .all(...args)
    .map((b) => ({ ...b, distance: distance(lat, lng, b.lat, b.lng) }))
    .filter((b) => b.distance <= radiusM);
}

/** Wachstumsbonus an einem Ort durch Bienenstoecke (nicht kumulativ). */
export function growthBonusAt(lat, lng) {
  const hives = nearbyBuildings(lat, lng, BUILDINGS.bienenstock.effectRadiusM, 'bienenstock');
  return hives.length ? BUILDINGS.bienenstock.growthBonus : 0;
}

/* ------------------------------------------------------------- Inventar */

export function getInventory(userId) {
  const rows = db.prepare('SELECT item, qty FROM inventory WHERE user_id = ? AND qty > 0').all(userId);
  return Object.fromEntries(rows.map((r) => [r.item, r.qty]));
}

export function addItem(userId, item, delta) {
  db.prepare(
    `INSERT INTO inventory (user_id, item, qty) VALUES (?, ?, ?)
     ON CONFLICT(user_id, item) DO UPDATE SET qty = qty + excluded.qty`,
  ).run(userId, item, delta);
}

/** Zieht Gegenstaende ab; gibt false zurueck, wenn der Bestand nicht reicht. */
export function takeItem(userId, item, qty) {
  const info = db
    .prepare('UPDATE inventory SET qty = qty - ? WHERE user_id = ? AND item = ? AND qty >= ?')
    .run(qty, userId, item, qty);
  return info.changes > 0;
}

/* ------------------------------------------------------------ Fortschritt */

export function grantXp(userId, xp) {
  db.prepare('UPDATE users SET xp = xp + ? WHERE id = ?').run(xp, userId);
}

export function grantCoins(userId, coins) {
  db.prepare('UPDATE users SET coins = coins + ? WHERE id = ?').run(coins, userId);
}

/** Oeffentliche Spielerdarstellung fuer die API. */
export function publicUser(user) {
  const level = levelFromXp(user.xp);
  // Der Client braucht das auch dann, wenn das Gewaechshaus gerade ausser
  // Sichtweite liegt -- sonst bietet er faelschlich "Gewaechshaus bauen" an.
  const hasHome = !!db
    .prepare("SELECT 1 FROM buildings WHERE owner_id = ? AND kind = 'gewaechshaus'")
    .get(user.id);
  return {
    id: user.id,
    name: user.name,
    coins: user.coins,
    xp: user.xp,
    level,
    xpForNext: xpForLevel(level),
    xpForCurrent: level > 1 ? xpForLevel(level - 1) : 0,
    water: user.water,
    waterMax: user.water_max,
    nextWaterInMs:
      user.water >= user.water_max
        ? null
        : Math.max(0, WATER_REFILL_MS - (Date.now() - user.water_at)),
    inventory: getInventory(user.id),
    hasHome,
  };
}
