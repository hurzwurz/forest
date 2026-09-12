/**
 * Geo-Helfer: Umrechnungen zwischen GPS-Koordinaten und dem Weltraster.
 *
 * Die Welt ist in ein Raster aus quadratischen Zellen (~CELL_M Meter) unterteilt.
 * Jede Zelle hat eine eindeutige, stabile ID ("cell key") wie "c:8234:41221".
 * Aus dieser ID wird deterministisch erzeugt, ob dort ein Pflanzplatz liegt --
 * Server und Client kommen dabei immer zum selben Ergebnis, ohne dass die
 * Plaetze irgendwo gespeichert werden muessen.
 */

export const EARTH_R = 6371008.8; // mittlerer Erdradius in Metern
export const CELL_M = 22;         // Kantenlaenge einer Rasterzelle in Metern

const DEG = Math.PI / 180;

/** Meter pro Breitengrad (konstant) und pro Laengengrad (breitenabhaengig). */
export function metersPerDegree(lat) {
  return {
    lat: (Math.PI * EARTH_R) / 180,
    lng: (Math.PI * EARTH_R * Math.cos(lat * DEG)) / 180,
  };
}

/** Entfernung zwischen zwei Punkten in Metern (Haversine). */
export function distance(lat1, lng1, lat2, lng2) {
  const dLat = (lat2 - lat1) * DEG;
  const dLng = (lng2 - lng1) * DEG;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * DEG) * Math.cos(lat2 * DEG) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_R * Math.asin(Math.min(1, Math.sqrt(a)));
}

/** Kompasspeilung von Punkt 1 nach Punkt 2, 0..360 Grad (0 = Norden). */
export function bearing(lat1, lng1, lat2, lng2) {
  const y = Math.sin((lng2 - lng1) * DEG) * Math.cos(lat2 * DEG);
  const x =
    Math.cos(lat1 * DEG) * Math.sin(lat2 * DEG) -
    Math.sin(lat1 * DEG) * Math.cos(lat2 * DEG) * Math.cos((lng2 - lng1) * DEG);
  return (Math.atan2(y, x) / DEG + 360) % 360;
}

/**
 * Rasterindex einer Koordinate.
 *
 * Die Laengengrad-Schrittweite haengt von der Breite ab, damit die Zellen
 * ueberall ungefaehr quadratisch bleiben. Als Bezugsbreite dient das
 * Zentrum des jeweiligen Breitenbandes, sonst waeren die Zellen an ihren
 * eigenen Raendern nicht mehr deckungsgleich.
 */
export function cellIndex(lat, lng) {
  const latStep = CELL_M / metersPerDegree(0).lat;
  const iy = Math.floor(lat / latStep);
  const bandLat = (iy + 0.5) * latStep;
  const lngStep = CELL_M / Math.max(1, metersPerDegree(bandLat).lng);
  const ix = Math.floor(lng / lngStep);
  return { ix, iy, latStep, lngStep };
}

/** Stabile Zellen-ID fuer eine Koordinate. */
export function cellKey(lat, lng) {
  const { ix, iy } = cellIndex(lat, lng);
  return `c:${ix}:${iy}`;
}

/** Mittelpunkt einer Zelle anhand ihrer Indizes. */
export function cellCenter(ix, iy) {
  const latStep = CELL_M / metersPerDegree(0).lat;
  const bandLat = (iy + 0.5) * latStep;
  const lngStep = CELL_M / Math.max(1, metersPerDegree(bandLat).lng);
  return { lat: bandLat, lng: (ix + 0.5) * lngStep };
}

/** Zellen-ID zurueck in Indizes zerlegen. Gibt null bei ungueltigem Format. */
export function parseCellKey(key) {
  const m = /^c:(-?\d+):(-?\d+)$/.exec(String(key ?? ''));
  if (!m) return null;
  const ix = Number(m[1]);
  const iy = Number(m[2]);
  if (!Number.isSafeInteger(ix) || !Number.isSafeInteger(iy)) return null;
  return { ix, iy };
}

/** Alle Zellen-Indizes, die einen Kreis um lat/lng abdecken. */
export function cellsInRadius(lat, lng, radiusM) {
  const { ix, iy } = cellIndex(lat, lng);
  const span = Math.ceil(radiusM / CELL_M) + 1;
  const out = [];
  for (let dy = -span; dy <= span; dy++) {
    for (let dx = -span; dx <= span; dx++) {
      out.push({ ix: ix + dx, iy: iy + dy });
    }
  }
  return out;
}

/**
 * 32-Bit-Hash: FNV-1a plus Avalanche-Finalizer (murmur3 fmix32).
 *
 * FNV-1a allein streut aehnliche Strings zu schwach -- benachbarte Zellen-IDs
 * unterscheiden sich nur in wenigen Zeichen und erzeugten dadurch regional
 * messbar zu viele oder zu wenige Pflanzplaetze. Der Finalizer verteilt die
 * Bits gleichmaessig und behebt das.
 */
export function hash32(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b) >>> 0;
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35) >>> 0;
  h ^= h >>> 16;
  return h >>> 0;
}

/** Aus einem Hash abgeleitete Pseudozufallszahl in [0,1). */
export function rand01(str) {
  return hash32(str) / 0x100000000;
}
