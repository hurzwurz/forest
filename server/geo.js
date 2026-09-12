/**
 * Weiterleitung: Die Geo-Helfer liegen unter public/shared/, weil der Browser
 * sie im Offline-Modus ebenfalls laden muss — und dorthin liefern kann er nur
 * aus dem öffentlichen Verzeichnis.
 */
export * from '../public/shared/geo.js';
