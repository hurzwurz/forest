/** HTTP-Server: API + Auslieferung der PWA. */

import express from 'express';
import { createServer as createHttpServer } from 'node:http';
import { createServer as createHttpsServer } from 'node:https';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

import { close as closeDb, migrate } from './db.js';
import { initAuth } from './auth.js';
import { router as authRoutes } from './routes/auth.js';
import { router as worldRoutes } from './routes/world.js';
import { router as actionRoutes } from './routes/actions.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = resolve(__dirname, '../public');
const PORT = Number(process.env.PORT) || 3000;

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', true);
app.use(express.json({ limit: '16kb' }));

/**
 * Einfache Ratenbegrenzung im Arbeitsspeicher. Haelt versehentliche
 * Endlosschleifen im Client und grobes Skript-Spam auf; fuer echten Betrieb
 * hinter einem Reverse-Proxy gehoert das dorthin.
 */
function rateLimit({ windowMs, max, key = (req) => req.ip }) {
  const hits = new Map();
  setInterval(() => {
    const cutoff = Date.now() - windowMs;
    for (const [k, v] of hits) if (v.start < cutoff) hits.delete(k);
  }, windowMs).unref();

  return (req, res, next) => {
    const k = key(req);
    const now = Date.now();
    const entry = hits.get(k);
    if (!entry || now - entry.start > windowMs) {
      hits.set(k, { start: now, count: 1 });
      return next();
    }
    if (++entry.count > max) {
      res.set('Retry-After', String(Math.ceil((entry.start + windowMs - now) / 1000)));
      return res.status(429).json({ error: 'Zu viele Anfragen. Kurz durchatmen.' });
    }
    next();
  };
}

const userKey = (req) => String(req.user?.id ?? req.ip);

app.use('/api/auth', rateLimit({ windowMs: 15 * 60_000, max: 40 }), authRoutes);
app.use('/api/world', rateLimit({ windowMs: 60_000, max: 120, key: userKey }), worldRoutes);
app.use('/api/action', rateLimit({ windowMs: 60_000, max: 60, key: userKey }), actionRoutes);

app.get('/api/health', (req, res) => res.json({ ok: true, time: Date.now() }));

app.use(express.static(PUBLIC_DIR, { extensions: ['html'], maxAge: '1h' }));

// Alles Unbekannte geht an die PWA -- sie regelt ihre Ansichten selbst.
app.use((req, res, next) => {
  if (req.method !== 'GET' || req.path.startsWith('/api/')) return next();
  res.sendFile(resolve(PUBLIC_DIR, 'index.html'));
});

app.use((req, res) => res.status(404).json({ error: 'Nicht gefunden.' }));

// eslint-disable-next-line no-unused-vars -- Express erkennt Fehler-Handler an der Stelligkeit
app.use((err, req, res, next) => {
  const status = err.status ?? 500;
  if (status >= 500) console.error(err);
  res.status(status).json({ error: status >= 500 ? 'Serverfehler.' : err.message });
});

/**
 * Die Kamera gibt der Browser nur in einem sicheren Kontext frei: localhost
 * oder HTTPS. Liegt ein Zertifikat unter data/, wird direkt HTTPS bedient --
 * so laesst sich die App im eigenen WLAN auf dem Handy testen.
 */
// Schema anlegen und den Token-Schlüssel laden, bevor Anfragen angenommen
// werden -- sonst liefen die ersten Aufrufe gegen eine leere Datenbank.
await migrate();
await initAuth();

const certFile = resolve(process.cwd(), 'data/cert.pem');
const keyFile = resolve(process.cwd(), 'data/key.pem');
const useHttps = existsSync(certFile) && existsSync(keyFile);

const server = useHttps
  ? createHttpsServer({ cert: readFileSync(certFile), key: readFileSync(keyFile) }, app)
  : createHttpServer(app);

server.listen(PORT, '0.0.0.0', () => {
  const scheme = useHttps ? 'https' : 'http';
  console.log(`🌱 Forest läuft auf ${scheme}://localhost:${PORT}`);
  // Im Betrieb beendet die Laufzeitumgebung TLS selbst -- dort wäre der
  // Hinweis auf ein eigenes Zertifikat irreführend.
  if (!useHttps && process.env.NODE_ENV !== 'production') {
    console.log('   Für den Test am Handy: npm run cert  (Kamera braucht HTTPS)');
  }
});

/**
 * Sauber beenden. Beim Ausrollen schickt die Laufzeitumgebung SIGTERM und
 * beendet den Prozess kurz darauf hart; offene Datenbankverbindungen würden
 * sonst erst nach einer Zeitüberschreitung freigegeben.
 */
let beendet = false;
for (const signal of ['SIGTERM', 'SIGINT']) {
  process.on(signal, () => {
    if (beendet) return;
    beendet = true;
    console.log(`\n${signal} empfangen — Server wird beendet.`);
    server.close(async () => {
      await closeDb().catch(() => {});
      process.exit(0);
    });
    // Hängende Verbindungen dürfen das Beenden nicht blockieren.
    setTimeout(() => process.exit(0), 8000).unref();
  });
}

export { app, server };
