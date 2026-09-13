/** Spielerzustand: Gießkanne, Inventar, XP. */

import { many, one, run } from './db.js';
import { BUILDINGS, levelFromXp, xpForLevel } from './game.js';
import { distance } from './geo.js';

/** Zeit, in der sich eine Einheit Wasser nachfüllt. */
export const WATER_REFILL_MS = 10 * 60_000;

/**
 * Rechnet die seit water_at vergangene Zeit in Wasser um und schreibt sie fest.
 * Steht der Spieler an einem Brunnen, ist die Kanne sofort voll.
 */
export async function refillWater(user, lat = null, lng = null) {
  const now = Date.now();
  let water = user.water;
  const max = user.water_max;

  if (water < max) {
    const gained = Math.floor((now - user.water_at) / WATER_REFILL_MS);
    if (gained > 0) water = Math.min(max, water + gained);
  }

  if (lat != null && lng != null && water < max && await nearWell(lat, lng)) water = max;

  if (water !== user.water || now - user.water_at >= WATER_REFILL_MS) {
    // Nur den verbrauchten Teil des Zeitguthabens abziehen, damit angefangene
    // Intervalle nicht verloren gehen.
    const used = Math.floor((now - user.water_at) / WATER_REFILL_MS) * WATER_REFILL_MS;
    const water_at = water >= max ? now : user.water_at + used;
    await run('UPDATE users SET water = $1, water_at = $2 WHERE id = $3', [water, water_at, user.id]);
    user.water = water;
    user.water_at = water_at;
  }
  return user;
}

/** Liegt ein Brunnen (egal von wem) in Wirkreichweite? */
export async function nearWell(lat, lng) {
  const rows = await nearbyBuildings(lat, lng, BUILDINGS.brunnen.effectRadiusM, 'brunnen');
  return rows.length > 0;
}

/** Gebäude im Umkreis -- grob über ein Koordinatenfenster vorgefiltert. */
export async function nearbyBuildings(lat, lng, radiusM, kind = null) {
  const dLat = radiusM / 111_320;
  const dLng = radiusM / Math.max(1, 111_320 * Math.cos((lat * Math.PI) / 180));
  const sql =
    'SELECT b.*, u.name AS owner_name FROM buildings b JOIN users u ON u.id = b.owner_id '
    + 'WHERE b.lat BETWEEN $1 AND $2 AND b.lng BETWEEN $3 AND $4'
    + (kind ? ' AND b.kind = $5' : '');
  const args = [lat - dLat, lat + dLat, lng - dLng, lng + dLng];
  if (kind) args.push(kind);

  const rows = await many(sql, args);
  return rows
    .map((b) => ({ ...b, distance: distance(lat, lng, b.lat, b.lng) }))
    .filter((b) => b.distance <= radiusM);
}

/** Wachstumsbonus an einem Ort durch Komposter (nicht kumulativ). */
export async function growthBonusAt(lat, lng) {
  const komposter = await nearbyBuildings(lat, lng, BUILDINGS.komposter.effectRadiusM, 'komposter');
  return komposter.length ? BUILDINGS.komposter.growthBonus : 0;
}

/* ------------------------------------------------------------- Inventar */

export async function getInventory(userId) {
  const rows = await many('SELECT item, qty FROM inventory WHERE user_id = $1 AND qty > 0', [userId]);
  return Object.fromEntries(rows.map((r) => [r.item, r.qty]));
}

export async function addItem(userId, item, delta, client = null) {
  const sql = `INSERT INTO inventory (user_id, item, qty) VALUES ($1, $2, $3)
               ON CONFLICT (user_id, item) DO UPDATE SET qty = inventory.qty + EXCLUDED.qty`;
  const args = [userId, item, delta];
  if (client) await client.query(sql, args);
  else await run(sql, args);
}

/**
 * Zieht Gegenstände ab; gibt false zurück, wenn der Bestand nicht reicht.
 * Die Mengenprüfung steckt in der WHERE-Klausel, damit zwei gleichzeitige
 * Anfragen nicht denselben Samen zweimal ausgeben.
 */
export async function takeItem(userId, item, qty, client = null) {
  const sql = 'UPDATE inventory SET qty = qty - $1 WHERE user_id = $2 AND item = $3 AND qty >= $1';
  const args = [qty, userId, item];
  const res = client ? await client.query(sql, args) : await run(sql, args);
  return res.rowCount > 0;
}

/* ------------------------------------------------------------ Fortschritt */

export async function grantXp(userId, xp, client = null) {
  const sql = 'UPDATE users SET xp = xp + $1 WHERE id = $2';
  if (client) await client.query(sql, [xp, userId]);
  else await run(sql, [xp, userId]);
}

export async function grantCoins(userId, coins, client = null) {
  const sql = 'UPDATE users SET coins = coins + $1 WHERE id = $2';
  if (client) await client.query(sql, [coins, userId]);
  else await run(sql, [coins, userId]);
}

/** Öffentliche Spielerdarstellung für die API. */
export async function publicUser(user) {
  const level = levelFromXp(user.xp);
  // Der Client braucht das auch dann, wenn das Gewächshaus gerade außer
  // Sichtweite liegt -- sonst bietet er fälschlich "Gewächshaus bauen" an.
  const heim = await one(
    "SELECT 1 FROM buildings WHERE owner_id = $1 AND kind = 'gewaechshaus'",
    [user.id],
  );

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
    inventory: await getInventory(user.id),
    hasHome: !!heim,
  };
}

/** Frischer Datensatz nach schreibenden Aktionen. */
export function reloadUser(id) {
  return one('SELECT * FROM users WHERE id = $1', [id]);
}
