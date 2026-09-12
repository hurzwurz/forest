/**
 * Spielaktionen. Jede Aktion prüft serverseitig Position, Besitz und Kosten --
 * der Client schickt nur seine Koordinaten, entscheidet aber nichts selbst.
 *
 * Zusammengehörige Schreibvorgänge laufen in einer Transaktion, und wo zwei
 * Spieler gleichzeitig zugreifen können, entscheidet eine Regel in der
 * Datenbank statt einer Vorabprüfung im Code.
 */

import { Router } from 'express';
import { requireAuth } from '../auth.js';
import { one, run, tx, UNIQUE_VIOLATION } from '../db.js';
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
  reloadUser,
  takeItem,
} from '../player.js';
import { readPosition, viewPlant } from './world.js';

export const router = Router();

const fail = (status, msg) => Object.assign(new Error(msg), { status });

/** XP fürs Gießen -- fremde Pflanzen bringen mehr, aber nur einmal je Pflanze. */
const XP_WATER_OWN = 2;
const XP_WATER_FOREIGN = 8;

/** Pflanze samt Besitzername laden. */
function ladePflanze(id) {
  return one(
    `SELECT p.*, u.name AS owner_name FROM plants p
     JOIN users u ON u.id = p.owner_id
     WHERE p.id = $1 AND p.harvested_at IS NULL`,
    [Number.isFinite(Number(id)) ? Number(id) : -1],
  );
}

/** Wirft, wenn der Spieler zu weit entfernt steht. */
function pruefeReichweite(lat, lng, ziel) {
  const dist = distance(lat, lng, ziel.lat, ziel.lng);
  if (dist > REACH_M) {
    throw fail(403, `Zu weit weg — geh näher ran (noch ${Math.round(dist - REACH_M)} m).`);
  }
  return dist;
}

/* -------------------------------------------------------------- Pflanzen */

router.post('/plant', requireAuth, async (req, res, next) => {
  try {
    const { lat, lng } = readPosition(req);
    const me = await refillWater(req.user, lat, lng);

    const idx = parseCellKey(req.body?.cell);
    if (!idx) throw fail(400, 'Unbekannter Pflanzplatz.');

    const spot = spotForCell(idx.ix, idx.iy);
    if (!spot) throw fail(404, 'Auf dieser Stelle lässt sich nichts pflanzen.');
    pruefeReichweite(lat, lng, spot);

    const speciesKey = String(req.body?.species ?? '');
    const species = SPECIES[speciesKey];
    if (!species) throw fail(400, 'Diese Sorte gibt es nicht.');
    if (!species.soil.includes(spot.soil)) {
      const needs = species.soil.map(soilAccusative).join(' oder ');
      throw fail(400, `Hier ist ${spot.soilName}. ${species.name} braucht ${needs}.`);
    }

    const now = Date.now();
    let plant;
    try {
      plant = await tx(async (client) => {
        if (!await takeItem(me.id, `seed:${speciesKey}`, species.seedCost, client)) {
          throw fail(400, `Du brauchst ${species.seedCost}× ${species.name}-Samen.`);
        }
        const eingefuegt = await client.query(
          `INSERT INTO plants (cell, owner_id, species, lat, lng, planted_at, last_watered_at)
           VALUES ($1, $2, $3, $4, $5, $6, $6) RETURNING *`,
          [spot.id, me.id, speciesKey, spot.lat, spot.lng, now],
        );
        await grantXp(me.id, 5, client);
        return eingefuegt.rows[0];
      });
    } catch (err) {
      // Der eindeutige Index auf belegte Plätze schlägt zu, wenn jemand
      // anders im selben Moment gepflanzt hat. Die Transaktion nimmt den
      // Samen dann auch nicht weg.
      if (err.code === UNIQUE_VIOLATION) throw fail(409, 'Hier wächst schon etwas.');
      throw err;
    }

    const fresh = await reloadUser(me.id);
    res.status(201).json({
      ok: true,
      message: `${species.name} gepflanzt. Nicht vergessen zu gießen!`,
      plant: viewPlant({ ...plant, owner_name: me.name }, fresh, { lat, lng },
        await growthBonusAt(plant.lat, plant.lng)),
      me: await publicUser(fresh),
    });
  } catch (err) {
    next(err);
  }
});

/* --------------------------------------------------------------- Gießen */

router.post('/water', requireAuth, async (req, res, next) => {
  try {
    const { lat, lng } = readPosition(req);
    const me = await refillWater(req.user, lat, lng);

    const plant = await ladePflanze(req.body?.plantId);
    if (!plant) throw fail(404, 'Diese Pflanze gibt es nicht mehr.');
    pruefeReichweite(lat, lng, plant);

    const now = Date.now();
    const bonus = await growthBonusAt(plant.lat, plant.lng);
    const state = plantState(plant, now, bonus);
    if (state.withered) throw fail(409, 'Diese Pflanze ist leider verwelkt.');
    if (state.ready) throw fail(409, 'Die Pflanze blüht schon — sie kann geerntet werden.');
    if (me.water < 1) throw fail(400, 'Deine Gießkanne ist leer. Sie füllt sich mit der Zeit wieder.');

    const mine = plant.owner_id === me.id;
    const xp = await tx(async (client) => {
      // Wasser nur abziehen, wenn wirklich noch welches da ist.
      const bezahlt = await client.query(
        'UPDATE users SET water = water - 1, water_at = $1 WHERE id = $2 AND water >= 1',
        [me.water >= me.water_max ? now : me.water_at, me.id],
      );
      if (bezahlt.rowCount === 0) throw fail(400, 'Deine Gießkanne ist leer.');

      // Bisherigen Fortschritt festschreiben, dann das Durst-Fenster neu starten.
      await client.query(
        'UPDATE plants SET growth_ms = $1, last_watered_at = $2 WHERE id = $3',
        [accumulatedGrowthMs(plant, now), now, plant.id],
      );

      if (mine) {
        await grantXp(me.id, XP_WATER_OWN, client);
        return XP_WATER_OWN;
      }

      // Fremde Pflanzen zählen nur beim ersten Mal -- sonst ließe sich
      // dieselbe Pflanze endlos für XP gießen.
      const erstmals = await client.query(
        `INSERT INTO waterings (plant_id, user_id, watered_at) VALUES ($1, $2, $3)
         ON CONFLICT (plant_id, user_id) DO NOTHING`,
        [plant.id, me.id, now],
      );
      if (erstmals.rowCount === 0) return 0;
      await grantXp(me.id, XP_WATER_FOREIGN, client);
      return XP_WATER_FOREIGN;
    });

    const updated = await ladePflanze(plant.id);
    const fresh = await reloadUser(me.id);

    res.json({
      ok: true,
      message: mine
        ? 'Gegossen. 💧'
        : `Du hast ${plant.owner_name}s Pflanze gegossen.${xp ? ` +${xp} XP` : ''}`,
      xp,
      plant: viewPlant(updated, fresh, { lat, lng }, bonus),
      me: await publicUser(fresh),
    });
  } catch (err) {
    next(err);
  }
});

/* ----------------------------------------------------------------- Ernten */

router.post('/harvest', requireAuth, async (req, res, next) => {
  try {
    const { lat, lng } = readPosition(req);
    const me = await refillWater(req.user, lat, lng);

    const plant = await ladePflanze(req.body?.plantId);
    if (!plant) throw fail(404, 'Diese Pflanze gibt es nicht mehr.');
    pruefeReichweite(lat, lng, plant);

    const now = Date.now();
    const bonus = await growthBonusAt(plant.lat, plant.lng);
    const state = plantState(plant, now, bonus);
    const species = SPECIES[plant.species];

    // Ernten darf nur, wer gepflanzt hat. Verwelktes darf jeder wegräumen --
    // sonst blockiert eine verlassene Pflanze den Platz für alle dauerhaft.
    if (plant.owner_id !== me.id && !state.withered) {
      throw fail(403, 'Das ist nicht deine Pflanze.');
    }
    // Erst prüfen, dann abräumen -- ein verfrühter Erntversuch darf die
    // Pflanze nicht vernichten.
    if (!state.ready && !state.withered) {
      throw fail(409, `Noch nicht so weit — Stadium: ${state.stageName}.`);
    }

    if (state.withered) {
      const weg = await run(
        'UPDATE plants SET harvested_at = $1 WHERE id = $2 AND harvested_at IS NULL',
        [now, plant.id],
      );
      if (weg.rowCount === 0) throw fail(404, 'Diese Pflanze gibt es nicht mehr.');

      const fremd = plant.owner_id !== me.id;
      if (fremd) await grantXp(me.id, 3); // kleine Anerkennung fürs Aufräumen
      res.json({
        ok: true,
        withered: true,
        message: fremd
          ? `Du hast ${plant.owner_name}s verwelkte Pflanze entfernt. Der Platz ist wieder frei. +3 XP`
          : 'Die verwelkte Pflanze wurde entfernt. Der Platz ist wieder frei.',
        me: await publicUser(await reloadUser(me.id)),
      });
      return;
    }

    // Bienenstock in der Nähe gibt einen Bonus auf den Ertrag.
    const seeds = species.yieldSeeds + (bonus > 0 ? 1 : 0);

    await tx(async (client) => {
      // Die Bedingung auf harvested_at verhindert doppelte Belohnung, wenn
      // zwei Anfragen gleichzeitig eintreffen.
      const abgeraeumt = await client.query(
        'UPDATE plants SET harvested_at = $1 WHERE id = $2 AND harvested_at IS NULL',
        [now, plant.id],
      );
      if (abgeraeumt.rowCount === 0) throw fail(409, 'Diese Pflanze wurde schon geerntet.');

      await addItem(me.id, `seed:${plant.species}`, seeds, client);
      await grantCoins(me.id, species.yieldCoins, client);
      await grantXp(me.id, species.xp, client);
    });

    res.json({
      ok: true,
      message: `${species.emoji} ${species.name} geerntet: +${seeds} Samen, +${species.yieldCoins} Münzen, +${species.xp} XP`,
      reward: { seeds, coins: species.yieldCoins, xp: species.xp, species: plant.species },
      me: await publicUser(await reloadUser(me.id)),
    });
  } catch (err) {
    next(err);
  }
});

/* ----------------------------------------------------------------- Bauen */

router.post('/build', requireAuth, async (req, res, next) => {
  try {
    const { lat, lng } = readPosition(req);
    const me = await refillWater(req.user, lat, lng);

    const kind = String(req.body?.kind ?? '');
    const def = BUILDINGS[kind];
    if (!def) throw fail(400, 'Dieses Gebäude gibt es nicht.');

    // Gebaut wird immer am eigenen Standort.
    const home = await one(
      "SELECT * FROM buildings WHERE owner_id = $1 AND kind = 'gewaechshaus'",
      [me.id],
    );

    if (def.unique) {
      if (home) throw fail(409, 'Du hast bereits ein Gewächshaus. Es gibt nur eines pro Spieler.');
    } else {
      if (!home) throw fail(409, 'Setz zuerst dein Gewächshaus — es ist die Mitte deines Gartens.');
      const d = distance(lat, lng, home.lat, home.lng);
      if (d > HOMESTEAD_M) {
        throw fail(403, `Zu weit von deinem Gewächshaus (${Math.round(d)} m, erlaubt sind ${HOMESTEAD_M} m).`);
      }
    }

    // Nichts direkt aufeinander stapeln -- auch nicht auf fremde Gebäude.
    const crowded = await nearbyBuildings(lat, lng, BUILDING_SPACING_M);
    if (crowded.length) {
      const wessen = crowded[0].owner_name === me.name ? 'dein' : 'ein';
      const was = BUILDINGS[crowded[0].kind]?.name ?? 'Gebäude';
      throw fail(409, `Hier steht schon ${wessen} ${was}. Mindestens ${BUILDING_SPACING_M} m Abstand.`);
    }

    const now = Date.now();
    let gebaeude;
    try {
      gebaeude = await tx(async (client) => {
        if (def.coinCost > 0) {
          const bezahlt = await client.query(
            'UPDATE users SET coins = coins - $1 WHERE id = $2 AND coins >= $1',
            [def.coinCost, me.id],
          );
          if (bezahlt.rowCount === 0) throw fail(400, `Dafür brauchst du ${def.coinCost} Münzen.`);
        }
        const eingefuegt = await client.query(
          'INSERT INTO buildings (owner_id, kind, lat, lng, placed_at) VALUES ($1, $2, $3, $4, $5) RETURNING id',
          [me.id, kind, lat, lng, now],
        );
        if (def.waterBonus) {
          await client.query(
            'UPDATE users SET water_max = water_max + $1 WHERE id = $2',
            [def.waterBonus, me.id],
          );
        }
        await grantXp(me.id, 30, client);
        return eingefuegt.rows[0];
      });
    } catch (err) {
      // Der eindeutige Index lässt nur ein Gewächshaus je Spieler zu.
      if (err.code === UNIQUE_VIOLATION) {
        throw fail(409, 'Du hast bereits ein Gewächshaus. Es gibt nur eines pro Spieler.');
      }
      throw err;
    }

    const fresh = await reloadUser(me.id);
    res.status(201).json({
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
        owner: me.name,
        mine: true,
        distance: 0,
        bearing: 0,
        inReach: true,
      },
      me: await publicUser(fresh),
    });
  } catch (err) {
    next(err);
  }
});
