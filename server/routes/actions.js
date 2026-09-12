/**
 * Spielaktionen. Jede Aktion prueft serverseitig Position, Besitz und Kosten --
 * der Client schickt nur seine Koordinaten, entscheidet aber nichts selbst.
 */

import { Router } from 'express';
import { requireAuth } from '../auth.js';
import { db } from '../db.js';
import {
  BUILDINGS,
  BUILDING_SPACING_M,
  HOMESTEAD_M,
  REACH_M,
  SPECIES,
  accumulatedGrowthMs,
  plantState,
  soilAccusative,
  spotForCell,
} from '../game.js';
import { distance, parseCellKey } from '../geo.js';
import {
  addItem,
  grantCoins,
  grantXp,
  growthBonusAt,
  nearbyBuildings,
  publicUser,
  refillWater,
  takeItem,
} from '../player.js';
import { readPosition, viewPlant } from './world.js';

export const router = Router();

const fail = (status, msg) => Object.assign(new Error(msg), { status });

/** XP fuers Giessen -- fremde Pflanzen bringen mehr, aber nur einmal je Pflanze. */
const XP_WATER_OWN = 2;
const XP_WATER_FOREIGN = 8;

/* -------------------------------------------------------------- Pflanzen */

router.post('/plant', requireAuth, (req, res, next) => {
  try {
    const { lat, lng } = readPosition(req);
    const me = refillWater(req.user, lat, lng);

    const idx = parseCellKey(req.body?.cell);
    if (!idx) throw fail(400, 'Unbekannter Pflanzplatz.');

    const spot = spotForCell(idx.ix, idx.iy);
    if (!spot) throw fail(404, 'Auf dieser Stelle lässt sich nichts pflanzen.');

    const dist = distance(lat, lng, spot.lat, spot.lng);
    if (dist > REACH_M) {
      throw fail(403, `Zu weit weg — geh näher ran (noch ${Math.round(dist - REACH_M)} m).`);
    }

    const speciesKey = String(req.body?.species ?? '');
    const species = SPECIES[speciesKey];
    if (!species) throw fail(400, 'Diese Sorte gibt es nicht.');
    if (!species.soil.includes(spot.soil)) {
      const needs = species.soil.map(soilAccusative).join(' oder ');
      throw fail(400, `Hier ist ${spot.soilName}. ${species.name} braucht ${needs}.`);
    }

    const occupied = db
      .prepare('SELECT 1 FROM plants WHERE cell = ? AND harvested_at IS NULL')
      .get(spot.id);
    if (occupied) throw fail(409, 'Hier wächst schon etwas.');

    if (!takeItem(me.id, `seed:${speciesKey}`, species.seedCost)) {
      throw fail(400, `Du brauchst ${species.seedCost}× ${species.name}-Samen.`);
    }

    const now = Date.now();
    const info = db
      .prepare(
        `INSERT INTO plants (cell, owner_id, species, lat, lng, planted_at, last_watered_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(spot.id, me.id, speciesKey, spot.lat, spot.lng, now, now);

    grantXp(me.id, 5);
    const plant = db
      .prepare('SELECT p.*, u.name AS owner_name FROM plants p JOIN users u ON u.id = p.owner_id WHERE p.id = ?')
      .get(Number(info.lastInsertRowid));
    const fresh = db.prepare('SELECT * FROM users WHERE id = ?').get(me.id);

    res.status(201).json({
      ok: true,
      message: `${species.name} gepflanzt. Nicht vergessen zu gießen!`,
      plant: viewPlant(plant, fresh, { lat, lng }),
      me: publicUser(fresh),
    });
  } catch (err) {
    next(err);
  }
});

/* --------------------------------------------------------------- Giessen */

router.post('/water', requireAuth, (req, res, next) => {
  try {
    const { lat, lng } = readPosition(req);
    const me = refillWater(req.user, lat, lng);

    const plant = db
      .prepare(
        `SELECT p.*, u.name AS owner_name FROM plants p JOIN users u ON u.id = p.owner_id
         WHERE p.id = ? AND p.harvested_at IS NULL`,
      )
      .get(Number(req.body?.plantId));
    if (!plant) throw fail(404, 'Diese Pflanze gibt es nicht mehr.');

    const dist = distance(lat, lng, plant.lat, plant.lng);
    if (dist > REACH_M) {
      throw fail(403, `Zu weit weg — geh näher ran (noch ${Math.round(dist - REACH_M)} m).`);
    }

    const now = Date.now();
    const state = plantState(plant, now, growthBonusAt(plant.lat, plant.lng));
    if (state.withered) throw fail(409, 'Diese Pflanze ist leider verwelkt.');
    if (state.ready) throw fail(409, 'Die Pflanze blüht schon — sie kann geerntet werden.');
    if (me.water < 1) throw fail(400, 'Deine Gießkanne ist leer. Sie füllt sich mit der Zeit wieder.');

    // Bisherigen Fortschritt festschreiben, dann das Durst-Fenster neu starten.
    const grown = accumulatedGrowthMs(plant, now);
    db.prepare('UPDATE plants SET growth_ms = ?, last_watered_at = ? WHERE id = ?')
      .run(grown, now, plant.id);
    db.prepare('UPDATE users SET water = water - 1, water_at = ? WHERE id = ?')
      .run(me.water >= me.water_max ? now : me.water_at, me.id);

    const mine = plant.owner_id === me.id;
    let xp = mine ? XP_WATER_OWN : 0;
    if (!mine) {
      // Fremde Pflanzen zaehlen nur beim ersten Mal -- sonst liesse sich
      // dieselbe Pflanze endlos fuer XP giessen.
      const already = db
        .prepare('SELECT 1 FROM waterings WHERE plant_id = ? AND user_id = ?')
        .get(plant.id, me.id);
      if (!already) {
        db.prepare('INSERT INTO waterings (plant_id, user_id, watered_at) VALUES (?, ?, ?)')
          .run(plant.id, me.id, now);
        xp = XP_WATER_FOREIGN;
      }
    }
    if (xp) grantXp(me.id, xp);

    const updated = db
      .prepare('SELECT p.*, u.name AS owner_name FROM plants p JOIN users u ON u.id = p.owner_id WHERE p.id = ?')
      .get(plant.id);
    const fresh = db.prepare('SELECT * FROM users WHERE id = ?').get(me.id);

    res.json({
      ok: true,
      message: mine
        ? 'Gegossen. 💧'
        : `Du hast ${plant.owner_name}s Pflanze gegossen.${xp ? ` +${xp} XP` : ''}`,
      xp,
      plant: viewPlant(updated, fresh, { lat, lng }),
      me: publicUser(fresh),
    });
  } catch (err) {
    next(err);
  }
});

/* ----------------------------------------------------------------- Ernten */

router.post('/harvest', requireAuth, (req, res, next) => {
  try {
    const { lat, lng } = readPosition(req);
    const me = refillWater(req.user, lat, lng);

    const plant = db
      .prepare('SELECT * FROM plants WHERE id = ? AND harvested_at IS NULL')
      .get(Number(req.body?.plantId));
    if (!plant) throw fail(404, 'Diese Pflanze gibt es nicht mehr.');
    if (plant.owner_id !== me.id) throw fail(403, 'Das ist nicht deine Pflanze.');

    const dist = distance(lat, lng, plant.lat, plant.lng);
    if (dist > REACH_M) {
      throw fail(403, `Zu weit weg — geh näher ran (noch ${Math.round(dist - REACH_M)} m).`);
    }

    const now = Date.now();
    const state = plantState(plant, now, growthBonusAt(plant.lat, plant.lng));
    const species = SPECIES[plant.species];

    // Erst pruefen, dann abraeumen -- ein verfruehter Erntversuch darf die
    // Pflanze nicht vernichten.
    if (!state.ready && !state.withered) {
      throw fail(409, `Noch nicht so weit — Stadium: ${state.stageName}.`);
    }
    db.prepare('UPDATE plants SET harvested_at = ? WHERE id = ?').run(now, plant.id);

    if (state.withered) {
      res.json({
        ok: true,
        withered: true,
        message: 'Die verwelkte Pflanze wurde entfernt. Der Platz ist wieder frei.',
        me: publicUser(db.prepare('SELECT * FROM users WHERE id = ?').get(me.id)),
      });
      return;
    }

    // Bienenstock in der Naehe gibt einen Bonus auf den Ertrag.
    const bonus = growthBonusAt(plant.lat, plant.lng) > 0 ? 1 : 0;
    const seeds = species.yieldSeeds + bonus;

    addItem(me.id, `seed:${plant.species}`, seeds);
    grantCoins(me.id, species.yieldCoins);
    grantXp(me.id, species.xp);

    res.json({
      ok: true,
      message: `${species.emoji} ${species.name} geerntet: +${seeds} Samen, +${species.yieldCoins} Münzen, +${species.xp} XP`,
      reward: { seeds, coins: species.yieldCoins, xp: species.xp, species: plant.species },
      me: publicUser(db.prepare('SELECT * FROM users WHERE id = ?').get(me.id)),
    });
  } catch (err) {
    next(err);
  }
});

/* ----------------------------------------------------------------- Bauen */

router.post('/build', requireAuth, (req, res, next) => {
  try {
    const { lat, lng } = readPosition(req);
    const me = refillWater(req.user, lat, lng);

    const kind = String(req.body?.kind ?? '');
    const def = BUILDINGS[kind];
    if (!def) throw fail(400, 'Dieses Gebäude gibt es nicht.');

    // Gebaut wird immer am eigenen Standort.
    const own = db.prepare('SELECT * FROM buildings WHERE owner_id = ?').all(me.id);
    const home = own.find((b) => b.kind === 'gewaechshaus');

    if (def.unique) {
      if (home) throw fail(409, 'Du hast bereits ein Gewächshaus. Es gibt nur eines pro Spieler.');
    } else {
      if (!home) throw fail(409, 'Setz zuerst dein Gewächshaus — es ist die Mitte deines Gartens.');
      const d = distance(lat, lng, home.lat, home.lng);
      if (d > HOMESTEAD_M) {
        throw fail(403, `Zu weit von deinem Gewächshaus (${Math.round(d)} m, erlaubt sind ${HOMESTEAD_M} m).`);
      }
    }

    // Nichts direkt aufeinander stapeln -- auch nicht auf fremde Gebaeude.
    const crowded = nearbyBuildings(lat, lng, BUILDING_SPACING_M);
    if (crowded.length) {
      throw fail(409, `Hier steht schon ${crowded[0].owner_name === me.name ? 'dein' : 'ein'} ${BUILDINGS[crowded[0].kind]?.name ?? 'Gebäude'}. Mindestens ${BUILDING_SPACING_M} m Abstand.`);
    }

    if (def.coinCost > 0) {
      const paid = db
        .prepare('UPDATE users SET coins = coins - ? WHERE id = ? AND coins >= ?')
        .run(def.coinCost, me.id, def.coinCost);
      if (paid.changes === 0) throw fail(400, `Dafür brauchst du ${def.coinCost} Münzen.`);
    }

    const now = Date.now();
    const info = db
      .prepare('INSERT INTO buildings (owner_id, kind, lat, lng, placed_at) VALUES (?, ?, ?, ?, ?)')
      .run(me.id, kind, lat, lng, now);

    if (def.waterBonus) {
      db.prepare('UPDATE users SET water_max = water_max + ? WHERE id = ?').run(def.waterBonus, me.id);
    }
    grantXp(me.id, 30);

    const fresh = db.prepare('SELECT * FROM users WHERE id = ?').get(me.id);
    res.status(201).json({
      ok: true,
      message: `${def.emoji} ${def.name} gebaut!`,
      building: {
        kind: 'building',
        id: Number(info.lastInsertRowid),
        type: kind,
        name: def.name,
        emoji: def.emoji,
        lat,
        lng,
        owner: me.name,
        mine: true,
        distance: 0,
        bearing: 0,
        inReach: true,
      },
      me: publicUser(fresh),
    });
  } catch (err) {
    next(err);
  }
});
