/** Schmale Hülle um fetch: hängt den Anmelde-Token an und wirft klare Fehler. */

const TOKEN_KEY = 'forest.token';

export function getToken() {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null; // privater Modus o. Ä. -- dann eben nur für diese Sitzung
  }
}

export function setToken(token) {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch { /* nicht schlimm */ }
}

export class ApiError extends Error {
  constructor(message, status) {
    super(message);
    this.status = status;
  }
}

/**
 * Alle Pfade sind relativ. GitHub Pages liefert die App unter einem
 * Unterordner aus (`/forest/`); absolute Pfade zeigten dort ins Leere.
 */
async function request(path, { method = 'GET', body, auth = true } = {}) {
  let res;
  try {
    res = await fetch(path, {
      method,
      headers: {
        ...(body ? { 'content-type': 'application/json' } : {}),
        ...(auth && getToken() ? { authorization: `Bearer ${getToken()}` } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ApiError('Keine Verbindung zum Server.', 0);
  }

  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(data.error ?? 'Etwas ist schiefgelaufen.', res.status);
  return data;
}

export const api = {
  register: (name, password) => request('api/auth/register', { method: 'POST', body: { name, password }, auth: false }),
  login: (name, password) => request('api/auth/login', { method: 'POST', body: { name, password }, auth: false }),
  me: () => request('api/auth/me'),
  catalog: () => request('api/world/catalog', { auth: false }),
  world: (lat, lng, radius = 150) =>
    request(`api/world?lat=${lat.toFixed(6)}&lng=${lng.toFixed(6)}&radius=${radius}`),
  plant: (cell, species, lat, lng) => request('api/action/plant', { method: 'POST', body: { cell, species, lat, lng } }),
  water: (plantId, lat, lng) => request('api/action/water', { method: 'POST', body: { plantId, lat, lng } }),
  harvest: (plantId, lat, lng) => request('api/action/harvest', { method: 'POST', body: { plantId, lat, lng } }),
  build: (kind, lat, lng) => request('api/action/build', { method: 'POST', body: { kind, lat, lng } }),
};
