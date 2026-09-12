/**
 * Datenbank: PostgreSQL.
 *
 * Vorher lag die Welt in einer SQLite-Datei. Das funktioniert nur, solange
 * diese Datei erhalten bleibt -- auf kostenlosen Hostern ist das Dateisystem
 * aber flüchtig und nach jedem Einschlafen leer. Eine Datenbank außerhalb des
 * Containers überlebt das.
 */

import pg from 'pg';

const { Pool, types } = pg;

// Zeitstempel liegen als Millisekunden in BIGINT-Spalten. Ohne diesen Parser
// liefert der Treiber sie als Zeichenkette, und aus `now - wateredAt` würde
// stillschweigend Unsinn.
types.setTypeParser(types.builtins.INT8, (wert) => Number(wert));

const URL_ENV = process.env.DATABASE_URL;

if (!URL_ENV) {
  console.error(
    'DATABASE_URL fehlt. Beispiel für lokal:\n'
    + '  DATABASE_URL=postgres://postgres:test@localhost:5432/forest npm start\n'
    + 'Oder `docker compose up -d` benutzen, das setzt die Variable selbst.',
  );
  process.exit(1);
}

/**
 * Entscheidet, ob die Verbindung TLS benutzt.
 *
 * Maßgeblich ist `sslmode` in der Verbindungszeichenfolge -- so machen es
 * alle Postgres-Werkzeuge, und gehostete Anbieter hängen den Parameter selbst
 * an. Fehlt er, entscheidet die Adresse: Datenbanken im eigenen Netz (etwa
 * der Container aus docker-compose) sprechen meist kein TLS, alles andere
 * geht über das offene Internet und muss verschlüsselt sein.
 */
export function sslConfig(url, modeEnv = process.env.PGSSLMODE) {
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }

  const mode = modeEnv ?? parsed.searchParams.get('sslmode');
  if (mode === 'disable') return false;
  if (mode) {
    // `verify-full` prüft die Kette, alles andere akzeptiert die
    // Eigenzertifikate der Anbieter.
    return mode === 'verify-full' ? true : { rejectUnauthorized: false };
  }

  return istPrivat(parsed.hostname) ? false : { rejectUnauthorized: false };
}

/** Adresse im eigenen Netz? Dann ist unverschlüsselt vertretbar. */
function istPrivat(host) {
  if (!host) return true;
  if (host === 'localhost' || host.endsWith('.local') || host.endsWith('.internal')) return true;
  if (!host.includes('.')) return true;              // einzelner Containername, z. B. "db"

  const teile = host.split('.').map(Number);
  if (teile.length !== 4 || teile.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) {
    return false;                                     // kein IPv4 -- also ein DNS-Name im Internet
  }
  const [a, b] = teile;
  return a === 127                                    // Loopback
    || a === 10                                       // 10.0.0.0/8
    || (a === 172 && b >= 16 && b <= 31)              // 172.16.0.0/12
    || (a === 192 && b === 168)                       // 192.168.0.0/16
    || (a === 169 && b === 254);                      // Link-Local
}

export const pool = new Pool({
  connectionString: URL_ENV,
  ssl: sslConfig(URL_ENV),
  max: Number(process.env.DB_POOL_MAX) || 10,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 10_000,
});

pool.on('error', (err) => {
  // Leerlaufende Verbindungen können vom Anbieter getrennt werden; der Pool
  // holt sich neue. Ohne Handler würde das den Prozess beenden.
  console.error('[db] Verbindungsfehler im Pool:', err.message);
});

/* ------------------------------------------------------------- Abfragen */

/** Erste Zeile oder null. */
export async function one(sql, params = []) {
  const res = await pool.query(sql, params);
  return res.rows[0] ?? null;
}

/** Alle Zeilen. */
export async function many(sql, params = []) {
  const res = await pool.query(sql, params);
  return res.rows;
}

/** Schreibender Aufruf; liefert die Zahl betroffener Zeilen und RETURNING-Daten. */
export async function run(sql, params = []) {
  const res = await pool.query(sql, params);
  return { rowCount: res.rowCount, rows: res.rows };
}

/**
 * Führt `fn` in einer Transaktion aus. Nötig überall dort, wo mehrere
 * Schreibvorgänge zusammengehören -- etwa Samen abziehen und pflanzen.
 */
export async function tx(fn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const ergebnis = await fn(client);
    await client.query('COMMIT');
    return ergebnis;
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

/** Fehlercode für Verletzung einer Eindeutigkeitsregel. */
export const UNIQUE_VIOLATION = '23505';

/* --------------------------------------------------------------- Schema */

export async function migrate() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id          INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      name        TEXT    NOT NULL,
      pw_hash     TEXT    NOT NULL,
      created_at  BIGINT  NOT NULL,
      coins       INTEGER NOT NULL DEFAULT 20,
      xp          INTEGER NOT NULL DEFAULT 0,
      water       INTEGER NOT NULL DEFAULT 10,
      water_max   INTEGER NOT NULL DEFAULT 10,
      water_at    BIGINT  NOT NULL DEFAULT 0
    );

    -- Namen sind unabhängig von Groß- und Kleinschreibung eindeutig.
    CREATE UNIQUE INDEX IF NOT EXISTS users_name_lower ON users (lower(name));

    CREATE TABLE IF NOT EXISTS inventory (
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      item    TEXT    NOT NULL,
      qty     INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (user_id, item)
    );

    CREATE TABLE IF NOT EXISTS plants (
      id              INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      cell            TEXT    NOT NULL,
      owner_id        INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      species         TEXT    NOT NULL,
      lat             DOUBLE PRECISION NOT NULL,
      lng             DOUBLE PRECISION NOT NULL,
      planted_at      BIGINT  NOT NULL,
      last_watered_at BIGINT,
      growth_ms       BIGINT  NOT NULL DEFAULT 0,
      harvested_at    BIGINT
    );

    -- Auf einem Pflanzplatz wächst höchstens eine ungeerntete Pflanze. Diese
    -- Regel ersetzt die Vorabprüfung: Bei gleichzeitigen Anfragen gewinnt
    -- genau eine, die andere läuft in eine saubere Fehlermeldung.
    CREATE UNIQUE INDEX IF NOT EXISTS plants_cell_active
      ON plants(cell) WHERE harvested_at IS NULL;
    CREATE INDEX IF NOT EXISTS plants_bbox ON plants(lat, lng);
    CREATE INDEX IF NOT EXISTS plants_owner ON plants(owner_id);

    CREATE TABLE IF NOT EXISTS buildings (
      id        INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      owner_id  INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      kind      TEXT    NOT NULL,
      lat       DOUBLE PRECISION NOT NULL,
      lng       DOUBLE PRECISION NOT NULL,
      placed_at BIGINT  NOT NULL
    );

    -- Genau ein Gewächshaus pro Spieler, in der Datenbank festgeschrieben.
    CREATE UNIQUE INDEX IF NOT EXISTS buildings_one_home
      ON buildings(owner_id) WHERE kind = 'gewaechshaus';
    CREATE INDEX IF NOT EXISTS buildings_bbox ON buildings(lat, lng);
    CREATE INDEX IF NOT EXISTS buildings_owner ON buildings(owner_id);

    -- Wer wann welche Pflanze gegossen hat: verhindert XP-Farmen durch
    -- wiederholtes Gießen derselben Pflanze.
    CREATE TABLE IF NOT EXISTS waterings (
      plant_id   INTEGER NOT NULL REFERENCES plants(id) ON DELETE CASCADE,
      user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      watered_at BIGINT  NOT NULL,
      PRIMARY KEY (plant_id, user_id)
    );

    -- Der Schlüssel für die Anmelde-Tokens. Er gehört in die Datenbank und
    -- nicht auf die Festplatte des Containers: Ohne ihn wären nach jedem
    -- Ausrollen alle Spieler abgemeldet.
    CREATE TABLE IF NOT EXISTS settings (
      key   TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `);
}

export async function close() {
  await pool.end();
}

export default pool;
