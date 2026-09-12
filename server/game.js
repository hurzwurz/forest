/**
 * Weiterleitung: Die Spielregeln liegen unter public/shared/, damit Server und
 * Browser dieselbe Fassung benutzen. Zwei Kopien wären die sichere Quelle für
 * Regeln, die je nach Betriebsart anders ausfallen.
 */
export * from '../public/shared/game.js';
