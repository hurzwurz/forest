/** Registrierung, Login und Token-Prüfung. */

import { randomBytes } from 'node:crypto';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { one, run, tx, UNIQUE_VIOLATION } from './db.js';

const TOKEN_TTL = '30d';

let SECRET = null;

/**
 * Token-Schlüssel laden. Ohne JWT_SECRET wird einmalig einer erzeugt und in
 * der Datenbank abgelegt -- nicht im Dateisystem, denn das ist auf vielen
 * Hostern flüchtig, und ein verlorener Schlüssel meldet alle Spieler ab.
 */
export async function initAuth() {
  if (process.env.JWT_SECRET) {
    SECRET = process.env.JWT_SECRET;
    return;
  }

  const neuer = randomBytes(32).toString('hex');
  // Beim gleichzeitigen Start mehrerer Instanzen gewinnt die erste; alle
  // anderen lesen anschließend deren Schlüssel.
  await run(
    `INSERT INTO settings (key, value) VALUES ('jwt_secret', $1)
     ON CONFLICT (key) DO NOTHING`,
    [neuer],
  );
  const zeile = await one("SELECT value FROM settings WHERE key = 'jwt_secret'");
  SECRET = zeile.value;
  console.warn('[auth] JWT_SECRET nicht gesetzt — Schlüssel aus der Datenbank benutzt.');
}

export function signToken(user) {
  return jwt.sign({ uid: user.id, name: user.name }, SECRET, { expiresIn: TOKEN_TTL });
}

/** Startausstattung eines neuen Spielers. */
const STARTER_SEEDS = { feldhanf: 5, ruderalis: 2 };

export async function createUser(name, password) {
  const clean = String(name ?? '').trim();
  if (!/^[\p{L}\p{N} _.-]{3,20}$/u.test(clean)) {
    throw Object.assign(new Error('Name: 3-20 Zeichen, Buchstaben/Zahlen/._- erlaubt.'), { status: 400 });
  }
  if (String(password ?? '').length < 8) {
    throw Object.assign(new Error('Passwort muss mindestens 8 Zeichen haben.'), { status: 400 });
  }

  const now = Date.now();
  const hash = bcrypt.hashSync(String(password), 10);

  try {
    return await tx(async (client) => {
      const res = await client.query(
        `INSERT INTO users (name, pw_hash, created_at, water_at)
         VALUES ($1, $2, $3, $3) RETURNING *`,
        [clean, hash, now],
      );
      const user = res.rows[0];
      for (const [item, qty] of Object.entries(STARTER_SEEDS)) {
        await client.query(
          'INSERT INTO inventory (user_id, item, qty) VALUES ($1, $2, $3)',
          [user.id, `seed:${item}`, qty],
        );
      }
      return user;
    });
  } catch (err) {
    // Die Eindeutigkeit steht in der Datenbank; eine Vorabprüfung wäre bei
    // zwei gleichzeitigen Anmeldungen wirkungslos.
    if (err.code === UNIQUE_VIOLATION) {
      throw Object.assign(new Error('Dieser Name ist schon vergeben.'), { status: 409 });
    }
    throw err;
  }
}

export async function verifyUser(name, password) {
  const user = await one(
    'SELECT * FROM users WHERE lower(name) = lower($1)',
    [String(name ?? '').trim()],
  );
  // Auch ohne Treffer hashen, damit die Antwortzeit keine Namen verrät.
  const hash = user?.pw_hash ?? '$2a$10$invalidinvalidinvalidinvalidinvalidinvalidinvalidinvalidinv';
  const ok = bcrypt.compareSync(String(password ?? ''), hash);
  if (!user || !ok) throw Object.assign(new Error('Name oder Passwort stimmt nicht.'), { status: 401 });
  return user;
}

/** Express-Middleware: prüft den Bearer-Token und hängt req.user an. */
export async function requireAuth(req, res, next) {
  const header = req.get('authorization') ?? '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Nicht angemeldet.' });

  let payload;
  try {
    payload = jwt.verify(token, SECRET);
  } catch {
    return res.status(401).json({ error: 'Sitzung abgelaufen. Bitte neu anmelden.' });
  }

  try {
    const user = await one('SELECT * FROM users WHERE id = $1', [payload.uid]);
    if (!user) return res.status(401).json({ error: 'Konto existiert nicht mehr.' });
    req.user = user;
    next();
  } catch (err) {
    next(err);
  }
}
