/** Registrierung, Login und Token-Pruefung. */

import { randomBytes } from 'node:crypto';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { db, DATA_DIR } from './db.js';

const TOKEN_TTL = '30d';

/**
 * Token-Schluessel. Ohne JWT_SECRET wird einmalig einer erzeugt und abgelegt,
 * damit Anmeldungen einen Neustart ueberleben.
 */
function loadSecret() {
  if (process.env.JWT_SECRET) return process.env.JWT_SECRET;
  const file = resolve(DATA_DIR, '.jwt-secret');
  if (existsSync(file)) return readFileSync(file, 'utf8').trim();
  const secret = randomBytes(32).toString('hex');
  mkdirSync(DATA_DIR, { recursive: true });
  writeFileSync(file, secret, { mode: 0o600 });
  console.warn(`[auth] JWT_SECRET nicht gesetzt -- neuer Schlüssel in ${file}`);
  return secret;
}

const SECRET = loadSecret();

export function signToken(user) {
  return jwt.sign({ uid: user.id, name: user.name }, SECRET, { expiresIn: TOKEN_TTL });
}

/** Startausstattung eines neuen Spielers. */
const STARTER_SEEDS = { gaensebluemchen: 5, tulpe: 2 };

export function createUser(name, password) {
  const clean = String(name ?? '').trim();
  if (!/^[\p{L}\p{N} _.-]{3,20}$/u.test(clean)) {
    throw Object.assign(new Error('Name: 3-20 Zeichen, Buchstaben/Zahlen/._- erlaubt.'), { status: 400 });
  }
  if (String(password ?? '').length < 8) {
    throw Object.assign(new Error('Passwort muss mindestens 8 Zeichen haben.'), { status: 400 });
  }

  const exists = db.prepare('SELECT 1 FROM users WHERE name = ? COLLATE NOCASE').get(clean);
  if (exists) throw Object.assign(new Error('Dieser Name ist schon vergeben.'), { status: 409 });

  const now = Date.now();
  const hash = bcrypt.hashSync(String(password), 10);
  const info = db
    .prepare('INSERT INTO users (name, pw_hash, created_at, water_at) VALUES (?, ?, ?, ?)')
    .run(clean, hash, now, now);
  const id = Number(info.lastInsertRowid);

  const insItem = db.prepare('INSERT INTO inventory (user_id, item, qty) VALUES (?, ?, ?)');
  for (const [item, qty] of Object.entries(STARTER_SEEDS)) insItem.run(id, `seed:${item}`, qty);

  return db.prepare('SELECT * FROM users WHERE id = ?').get(id);
}

export function verifyUser(name, password) {
  const user = db.prepare('SELECT * FROM users WHERE name = ? COLLATE NOCASE').get(String(name ?? '').trim());
  // Auch ohne Treffer hashen, damit die Antwortzeit keine Namen verraet.
  const hash = user?.pw_hash ?? '$2a$10$invalidinvalidinvalidinvalidinvalidinvalidinvalidinvalidinv';
  const ok = bcrypt.compareSync(String(password ?? ''), hash);
  if (!user || !ok) throw Object.assign(new Error('Name oder Passwort stimmt nicht.'), { status: 401 });
  return user;
}

/** Express-Middleware: prueft den Bearer-Token und haengt req.user an. */
export function requireAuth(req, res, next) {
  const header = req.get('authorization') ?? '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Nicht angemeldet.' });

  let payload;
  try {
    payload = jwt.verify(token, SECRET);
  } catch {
    return res.status(401).json({ error: 'Sitzung abgelaufen. Bitte neu anmelden.' });
  }

  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(payload.uid);
  if (!user) return res.status(401).json({ error: 'Konto existiert nicht mehr.' });

  req.user = user;
  next();
}
