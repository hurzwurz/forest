/** Weltausschnitt: Pflanzplaetze, Pflanzen und Gebaeude im Umkreis. */

import { Router } from 'express';
import { requireAuth } from '../auth.js';
import { db } from '../db.js';
import { BUILDINGS, MAX_VIEW_M, REACH_M, SPECIES, plantState, spotsInRadius } from '../game.js';
import { bearing, distance } from '../geo.js';
import { growthBonusAt, nearbyBuildings, publicUser, refillWater } from '../player.js';

export const router = Router();

/** Liest lat/lng/radius aus der Anfrage und weist Unsinn zurueck. */
export function readPosition(req) {
  const lat = Number(req.query.lat ?? req.body?.lat);
  const lng = Number(req.query.lng ?? req.body?.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
    throw Object.assign(new Error('Ungültige Position.'), { status: 400 });
  }
  return { lat, lng };
}

/** Pflanzen im Umkreis, vorgefiltert ueber ein Koordinatenfenster. */
function nearbyPlants(lat, lng, radiusM) {
  const dLat = radiusM / 111_320;
  const dLng = radiusM / Math.max(1, 111_320 * Math.cos((lat * Math.PI) / 180));
  return db
    .prepare(
      `SELECT p.*, u.name AS owner_name FROM plants p
       JOIN users u ON u.id = p.owner_id
       WHERE p.harvested_at IS NULL
         AND p.lat BETWEEN ? AND ? AND p.lng BETWEEN ? AND ?`,
    )
    .all(lat - dLat, lat + dLat, lng - dLng, lng + dLng)
    .map((p) => ({ ...p, distance: distance(lat, lng, p.lat, p.lng) }))
    .filter((p) => p.distance <= radiusM);
}

/** Pflanze in die Form bringen, die der Client anzeigt. */
export function viewPlant(plant, me, from) {
  const state = plantState(plant, Date.now(), growthBonusAt(plant.lat, plant.lng));
  const dist = from ? distance(from.lat, from.lng, plant.lat, plant.lng) : plant.distance;
  return {
    kind: 'plant',
    id: plant.id,
    cell: plant.cell,
    species: plant.species,
    speciesName: SPECIES[plant.species]?.name ?? plant.species,
    lat: plant.lat,
    lng: plant.lng,
    owner: plant.owner_name,
    mine: plant.owner_id === me.id,
    plantedAt: plant.planted_at,
    lastWateredAt: plant.last_watered_at,
    distance: dist,
    bearing: from ? bearing(from.lat, from.lng, plant.lat, plant.lng) : null,
    inReach: dist <= REACH_M,
    ...state,
  };
}

router.get('/', requireAuth, (req, res, next) => {
  try {
    const { lat, lng } = readPosition(req);
    const radius = Math.min(MAX_VIEW_M, Math.max(50, Number(req.query.radius) || 150));
    const me = refillWater(req.user, lat, lng);

    const plants = nearbyPlants(lat, lng, radius);
    const byCell = new Map(plants.map((p) => [p.cell, p]));

    const spots = spotsInRadius(lat, lng, radius).map((spot) => ({
      kind: 'spot',
      id: spot.id,
      lat: spot.lat,
      lng: spot.lng,
      soil: spot.soil,
      soilName: spot.soilName,
      distance: spot.distance,
      bearing: bearing(lat, lng, spot.lat, spot.lng),
      inReach: spot.distance <= REACH_M,
      occupied: byCell.has(spot.id),
      plantId: byCell.get(spot.id)?.id ?? null,
    }));

    const buildings = nearbyBuildings(lat, lng, radius).map((b) => ({
      kind: 'building',
      id: b.id,
      type: b.kind,
      name: BUILDINGS[b.kind]?.name ?? b.kind,
      emoji: BUILDINGS[b.kind]?.emoji ?? '🏠',
      lat: b.lat,
      lng: b.lng,
      owner: b.owner_name,
      mine: b.owner_id === me.id,
      distance: b.distance,
      bearing: bearing(lat, lng, b.lat, b.lng),
      inReach: b.distance <= REACH_M,
    }));

    res.json({
      me: publicUser(me),
      origin: { lat, lng, radius },
      spots,
      plants: plants.map((p) => viewPlant(p, me, { lat, lng })),
      buildings,
      reach: REACH_M,
    });
  } catch (err) {
    next(err);
  }
});

/** Statische Nachschlagewerte -- Arten und Gebaeude fuer die Oberflaeche. */
router.get('/catalog', (req, res) => {
  res.json({ species: SPECIES, buildings: BUILDINGS, reach: REACH_M });
});
