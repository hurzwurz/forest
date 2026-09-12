/**
 * Datenbank: SQLite ueber das in Node eingebaute node:sqlite.
 * Kein nativer Build noetig, die Welt liegt in einer einzelnen Datei.
 */

import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

/** Pfad der Weltdatenbank. */
export const DB_FILE = process.env.DB_FILE
  ? resolve(process.env.DB_FILE)
  : resolve(process.cwd(), 'data/forest.db');

/**
 * Verzeichnis für alles Dauerhafte. Im Betrieb zeigt DB_FILE auf ein
 * eingehängtes Laufwerk -- dann muss auch der Token-Schlüssel dorthin, sonst
 * wäre er nach jedem Neustart weg und alle Anmeldungen ungültig.
 */
export const DATA_DIR = dirname(DB_FILE);

mkdirSync(DATA_DIR, { recursive: true });

export const db = new DatabaseSync(DB_FILE);

db.exec(`
  PRAGMA journal_mode = WAL;
  PRAGMA foreign_keys = ON;

  CREATE TABLE IF NOT EXISTS users (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    name        TEXT    NOT NULL UNIQUE,
    pw_hash     TEXT    NOT NULL,
    created_at  INTEGER NOT NULL,
    coins       INTEGER NOT NULL DEFAULT 20,
    xp          INTEGER NOT NULL DEFAULT 0,
    water       INTEGER NOT NULL DEFAULT 10,
    water_max   INTEGER NOT NULL DEFAULT 10,
    water_at    INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS inventory (
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    item    TEXT    NOT NULL,
    qty     INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (user_id, item)
  );

  CREATE TABLE IF NOT EXISTS plants (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    cell            TEXT    NOT NULL,
    owner_id        INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    species         TEXT    NOT NULL,
    lat             REAL    NOT NULL,
    lng             REAL    NOT NULL,
    planted_at      INTEGER NOT NULL,
    last_watered_at INTEGER,
    growth_ms       INTEGER NOT NULL DEFAULT 0,
    harvested_at    INTEGER
  );

  -- Auf einem Pflanzplatz waechst hoechstens eine ungeerntete Pflanze.
  CREATE UNIQUE INDEX IF NOT EXISTS plants_cell_active
    ON plants(cell) WHERE harvested_at IS NULL;
  CREATE INDEX IF NOT EXISTS plants_bbox ON plants(lat, lng);
  CREATE INDEX IF NOT EXISTS plants_owner ON plants(owner_id);

  CREATE TABLE IF NOT EXISTS buildings (
    id        INTEGER PRIMARY KEY AUTOINCREMENT,
    owner_id  INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    kind      TEXT    NOT NULL,
    lat       REAL    NOT NULL,
    lng       REAL    NOT NULL,
    placed_at INTEGER NOT NULL
  );

  CREATE INDEX IF NOT EXISTS buildings_bbox ON buildings(lat, lng);
  CREATE INDEX IF NOT EXISTS buildings_owner ON buildings(owner_id);

  -- Wer wann welche Pflanze gegossen hat: verhindert XP-Farmen durch
  -- wiederholtes Giessen derselben Pflanze.
  CREATE TABLE IF NOT EXISTS waterings (
    plant_id   INTEGER NOT NULL REFERENCES plants(id) ON DELETE CASCADE,
    user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    watered_at INTEGER NOT NULL,
    PRIMARY KEY (plant_id, user_id)
  );
`);

export default db;
