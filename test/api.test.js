/**
 * Integrationstest gegen die echte API mit einer Wegwerf-Datenbank.
 * Start: npm test
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';

const dir = mkdtempSync(join(tmpdir(), 'forest-test-'));
process.env.DB_FILE = join(dir, 'test.db');
process.env.JWT_SECRET = 'test-secret';
process.env.PORT = '0';

const { server } = await import('../server/index.js');
const { spotsInRadius, REACH_M } = await import('../server/game.js');

await new Promise((res) => (server.listening ? res() : server.once('listening', res)));
const base = `http://127.0.0.1:${server.address().port}`;

test.after(() => {
  server.close();
  rmSync(dir, { recursive: true, force: true });
});

const LAT = 52.52;
const LNG = 13.405;

async function api(path, { token, method = 'GET', body } = {}) {
  const res = await fetch(base + path, {
    method,
    headers: {
      ...(body ? { 'content-type': 'application/json' } : {}),
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, body: await res.json() };
}

async function register(name, password = 'blumenwiese1') {
  const res = await api('/api/auth/register', { method: 'POST', body: { name, password } });
  assert.equal(res.status, 201, JSON.stringify(res.body));
  return res.body.token;
}

/** Zwei erreichbare Pflanzplaetze mit passendem Boden suchen. */
function reachableSpots(soils) {
  return spotsInRadius(LAT, LNG, REACH_M).filter((s) => soils.includes(s.soil));
}

/** Schreibt einer Pflanze genug Wachstumszeit gut, ohne zu warten. */
function fastForward(plantId, hours) {
  const db = new DatabaseSync(process.env.DB_FILE);
  db.prepare('UPDATE plants SET growth_ms = ?, last_watered_at = ? WHERE id = ?')
    .run(hours * 3600_000, Date.now(), plantId);
  db.close();
}

/**
 * Lässt eine Pflanze verdursten: lange nicht gegossen und als langsam
 * wachsende Sorte. Eine schnelle Sorte blüht im ersten Gießfenster ohnehin
 * auf und kann deshalb gar nicht verwelken.
 */
function letWither(plantId) {
  const db = new DatabaseSync(process.env.DB_FILE);
  const lange = Date.now() - 72 * 3600_000;
  db.prepare(`UPDATE plants SET species = 'rose', growth_ms = 0,
              planted_at = ?, last_watered_at = ? WHERE id = ?`)
    .run(lange, lange, plantId);
  db.close();
}

/** Pflanzt für `token` auf dem ersten freien passenden Platz. */
async function plantSomewhere(token, species = 'gaensebluemchen', soils = ['normal', 'fruchtbar', 'karg']) {
  for (const s of reachableSpots(soils)) {
    const res = await api('/api/action/plant', {
      token, method: 'POST', body: { cell: s.id, species, lat: LAT, lng: LNG },
    });
    if (res.status === 201) return res.body.plant;
  }
  return null;
}

test('Registrierung prüft Name und Passwort', async () => {
  assert.equal((await api('/api/auth/register', { method: 'POST', body: { name: 'ab', password: 'blumenwiese1' } })).status, 400);
  assert.equal((await api('/api/auth/register', { method: 'POST', body: { name: 'Gärtner', password: 'kurz' } })).status, 400);

  await register('Gärtner');
  const dupe = await api('/api/auth/register', { method: 'POST', body: { name: 'gärtner', password: 'blumenwiese1' } });
  assert.equal(dupe.status, 409, 'Namen sind unabhängig von Groß-/Kleinschreibung eindeutig');
});

test('Welt liefert Pflanzplätze und verlangt Anmeldung', async () => {
  assert.equal((await api(`/api/world?lat=${LAT}&lng=${LNG}`)).status, 401);

  const token = await register('Späher');
  const res = await api(`/api/world?lat=${LAT}&lng=${LNG}&radius=150`, { token });
  assert.equal(res.status, 200);
  assert.ok(res.body.spots.length > 10, 'im 150-m-Umkreis liegen etliche Plätze');
  assert.ok(res.body.spots.some((s) => s.inReach));
  assert.equal(res.body.me.name, 'Späher');

  const bad = await api('/api/world?lat=999&lng=13', { token });
  assert.equal(bad.status, 400);
});

test('Pflanzen prüft Entfernung, Boden und Samenbestand', async () => {
  const token = await register('Pflanzerin');
  const [spot] = reachableSpots(['normal', 'fruchtbar']);
  assert.ok(spot, 'Testort braucht einen erreichbaren Platz');

  const far = await api('/api/action/plant', {
    token, method: 'POST', body: { cell: spot.id, species: 'tulpe', lat: 52.6, lng: LNG },
  });
  assert.equal(far.status, 403, 'aus der Ferne lässt sich nichts pflanzen');

  const fake = await api('/api/action/plant', {
    token, method: 'POST', body: { cell: 'c:1:1', species: 'tulpe', lat: LAT, lng: LNG },
  });
  assert.equal(fake.status, 404, 'erfundene Zellen-IDs werden abgelehnt');

  const karg = reachableSpots(['karg'])[0];
  if (karg) {
    const wrongSoil = await api('/api/action/plant', {
      token, method: 'POST', body: { cell: karg.id, species: 'sonnenblume', lat: LAT, lng: LNG },
    });
    assert.equal(wrongSoil.status, 400);
    assert.match(wrongSoil.body.error, /fruchtbaren Boden/);
  }

  const ok = await api('/api/action/plant', {
    token, method: 'POST', body: { cell: spot.id, species: 'tulpe', lat: LAT, lng: LNG },
  });
  assert.equal(ok.status, 201, JSON.stringify(ok.body));
  assert.equal(ok.body.me.inventory['seed:tulpe'], 1, 'ein Samen wurde abgezogen');

  const twice = await api('/api/action/plant', {
    token, method: 'POST', body: { cell: spot.id, species: 'tulpe', lat: LAT, lng: LNG },
  });
  assert.equal(twice.status, 409, 'ein Platz trägt nur eine Pflanze');

  const broke = await api('/api/action/plant', {
    token, method: 'POST', body: { cell: reachableSpots(['normal', 'fruchtbar'])[1]?.id ?? spot.id, species: 'rose', lat: LAT, lng: LNG },
  });
  assert.equal(broke.status, 400, 'ohne Rosensamen geht nichts');
});

test('ein verfrühter Erntversuch zerstört die Pflanze nicht', async () => {
  const token = await register('Ungeduldig');
  const free = reachableSpots(['normal', 'fruchtbar']);
  let planted = null;
  for (const s of free) {
    const res = await api('/api/action/plant', {
      token, method: 'POST', body: { cell: s.id, species: 'gaensebluemchen', lat: LAT, lng: LNG },
    });
    if (res.status === 201) { planted = res.body.plant; break; }
  }
  assert.ok(planted, 'ein freier Platz muss sich finden lassen');

  const early = await api('/api/action/harvest', {
    token, method: 'POST', body: { plantId: planted.id, lat: LAT, lng: LNG },
  });
  assert.equal(early.status, 409);

  // Die Pflanze muss danach immer noch dastehen.
  const world = await api(`/api/world?lat=${LAT}&lng=${LNG}&radius=100`, { token });
  assert.ok(
    world.body.plants.some((p) => p.id === planted.id),
    'Pflanze verschwindet nach abgelehnter Ernte nicht',
  );

  fastForward(planted.id, 2);
  const harvest = await api('/api/action/harvest', {
    token, method: 'POST', body: { plantId: planted.id, lat: LAT, lng: LNG },
  });
  assert.equal(harvest.status, 200, JSON.stringify(harvest.body));
  assert.ok(harvest.body.reward.coins > 0);
  assert.ok(harvest.body.me.coins > 20, 'Münzen wurden gutgeschrieben');
});

test('Gießen: fremde Pflanzen geben XP, aber nur einmal', async () => {
  const owner = await register('Besitzerin');
  const helper = await register('Helferin');

  let planted = null;
  for (const s of reachableSpots(['normal', 'fruchtbar', 'karg'])) {
    const res = await api('/api/action/plant', {
      token: owner, method: 'POST', body: { cell: s.id, species: 'gaensebluemchen', lat: LAT, lng: LNG },
    });
    if (res.status === 201) { planted = res.body.plant; break; }
  }
  assert.ok(planted);

  const first = await api('/api/action/water', {
    token: helper, method: 'POST', body: { plantId: planted.id, lat: LAT, lng: LNG },
  });
  assert.equal(first.status, 200, JSON.stringify(first.body));
  assert.equal(first.body.xp, 8);

  const second = await api('/api/action/water', {
    token: helper, method: 'POST', body: { plantId: planted.id, lat: LAT, lng: LNG },
  });
  assert.equal(second.status, 200);
  assert.equal(second.body.xp, 0, 'dieselbe Pflanze bringt kein zweites Mal XP');

  const stranger = await api('/api/action/harvest', {
    token: helper, method: 'POST', body: { plantId: planted.id, lat: LAT, lng: LNG },
  });
  assert.equal(stranger.status, 403, 'fremde Pflanzen darf niemand ernten');
});

test('Bauen: ein Gewächshaus, danach nur in dessen Umkreis', async () => {
  const token = await register('Baumeister');

  const home = await api('/api/action/build', {
    token, method: 'POST', body: { kind: 'gewaechshaus', lat: LAT, lng: LNG },
  });
  assert.equal(home.status, 201, JSON.stringify(home.body));

  const again = await api('/api/action/build', {
    token, method: 'POST', body: { kind: 'gewaechshaus', lat: LAT + 0.001, lng: LNG },
  });
  assert.equal(again.status, 409, 'nur ein Gewächshaus pro Spieler');

  const tooClose = await api('/api/action/build', {
    token, method: 'POST', body: { kind: 'brunnen', lat: LAT, lng: LNG },
  });
  assert.equal(tooClose.status, 409, 'Gebäude brauchen Abstand zueinander');

  const tooFar = await api('/api/action/build', {
    token, method: 'POST', body: { kind: 'brunnen', lat: LAT + 0.01, lng: LNG },
  });
  assert.equal(tooFar.status, 403, 'außerhalb des eigenen Grundstücks wird nicht gebaut');

  const broke = await api('/api/action/build', {
    token, method: 'POST', body: { kind: 'brunnen', lat: LAT + 0.0004, lng: LNG },
  });
  assert.equal(broke.status, 400, 'Brunnen kostet 60 Münzen');
});

test('verwelkte Pflanzen darf jeder wegräumen, ernten nur der Besitzer', async () => {
  const owner = await register('Vergesslich');
  const fremder = await register('Aufräumer');

  const plant = await plantSomewhere(owner);
  assert.ok(plant, 'ein freier Platz muss sich finden lassen');

  // Solange sie lebt, ist sie tabu.
  const zuFrueh = await api('/api/action/harvest', {
    token: fremder, method: 'POST', body: { plantId: plant.id, lat: LAT, lng: LNG },
  });
  assert.equal(zuFrueh.status, 403);

  letWither(plant.id);

  const welt = await api(`/api/world?lat=${LAT}&lng=${LNG}&radius=100`, { token: fremder });
  const sicht = welt.body.plants.find((p) => p.id === plant.id);
  assert.equal(sicht.withered, true, 'nach 72 Stunden ohne Wasser ist sie verwelkt');

  const aufgeraeumt = await api('/api/action/harvest', {
    token: fremder, method: 'POST', body: { plantId: plant.id, lat: LAT, lng: LNG },
  });
  assert.equal(aufgeraeumt.status, 200, JSON.stringify(aufgeraeumt.body));
  assert.equal(aufgeraeumt.body.withered, true);

  // Der Platz muss danach wieder frei sein, sonst blockiert er für immer.
  const danach = await api(`/api/world?lat=${LAT}&lng=${LNG}&radius=100`, { token: fremder });
  assert.ok(!danach.body.plants.some((p) => p.id === plant.id));
  const spot = danach.body.spots.find((s) => s.id === plant.cell);
  assert.equal(spot.occupied, false, 'der Pflanzplatz ist wieder benutzbar');

  const neu = await api('/api/action/plant', {
    token: fremder, method: 'POST', body: { cell: plant.cell, species: 'gaensebluemchen', lat: LAT, lng: LNG },
  });
  assert.equal(neu.status, 201, 'auf dem freigeräumten Platz lässt sich neu pflanzen');
});
