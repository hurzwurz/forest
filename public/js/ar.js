/**
 * Die AR-Ansicht: Kamerabild plus darübergelegte Markierungen.
 *
 * Grundgedanke: Jedes Objekt in der Welt hat eine Peilung (wo liegt es,
 * vom Norden aus gezählt) und eine Entfernung. Zusammen mit der
 * Blickrichtung des Handys ergibt sich daraus, wo auf dem Bildschirm es
 * erscheinen muss.
 */

import { angleDelta } from './sensors.js';

/** Angenommene Augenhöhe über dem Boden in Metern. */
const AUGENHOEHE = 1.5;

/**
 * Jenseits dieser Entfernung wird nichts mehr eingeblendet. Bewusst kürzer
 * als der Kartenradius: Im Kamerabild drängen sich weit entfernte Plätze
 * am Horizont zu einem unlesbaren Band zusammen.
 */
export const SICHTWEITE_M = 80;

export class ArView {
  constructor({ video, layer, fallback, fallbackText, onSelect }) {
    this.video = video;
    this.layer = layer;
    this.fallback = fallback;
    this.fallbackText = fallbackText;
    this.onSelect = onSelect;

    this.stream = null;
    this.objects = [];
    this.origin = null;      // Standort, auf den sich die Peilungen beziehen
    this.heading = null;
    this.pitch = 0;

    this._markers = new Map();  // key -> { el, disc, label }
    this._frame = null;
  }

  /* -------------------------------------------------------------- Kamera */

  async startCamera() {
    if (!navigator.mediaDevices?.getUserMedia) {
      this._showFallback('Dieser Browser gibt die Kamera nicht frei. Die Karte funktioniert trotzdem.');
      return false;
    }
    if (!window.isSecureContext) {
      this._showFallback('Die Kamera braucht eine gesicherte Verbindung (HTTPS). Die Karte funktioniert trotzdem.');
      return false;
    }

    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false,
      });
      this.video.srcObject = this.stream;
      await this.video.play().catch(() => {});
      this.fallback.hidden = true;
      this.video.hidden = false;
      return true;
    } catch (err) {
      const texte = {
        NotAllowedError: 'Kamerazugriff abgelehnt. Du kannst ihn in den Browser-Einstellungen wieder erlauben.',
        NotFoundError: 'Keine Kamera gefunden.',
        NotReadableError: 'Die Kamera wird gerade von einer anderen App benutzt.',
      };
      this._showFallback(texte[err.name] ?? 'Kamera lässt sich nicht öffnen.');
      return false;
    }
  }

  stopCamera() {
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
  }

  _showFallback(text) {
    this.fallbackText.textContent = text;
    this.fallback.hidden = false;
    this.video.hidden = true;
  }

  /* --------------------------------------------------------- Blickfeld */

  /**
   * Öffnungswinkel der Kamera. Exakt lässt er sich im Browser nicht abfragen,
   * deshalb übliche Werte -- im Hochformat ist das Bild deutlich schmaler.
   */
  get fov() {
    const hoch = window.innerHeight >= window.innerWidth;
    return hoch ? { h: 55, v: 78 } : { h: 70, v: 45 };
  }

  /* ------------------------------------------------------------ Zeichnen */

  update({ objects, origin, heading, pitch }) {
    if (objects) this.objects = objects;
    if (origin) this.origin = origin;
    if (heading != null) this.heading = heading;
    if (pitch != null) this.pitch = pitch;
    this._schedule();
  }

  _schedule() {
    if (this._frame) return;
    this._frame = requestAnimationFrame(() => {
      this._frame = null;
      this._render();
    });
  }

  _render() {
    const w = this.layer.clientWidth;
    const h = this.layer.clientHeight;
    const { h: fovH, v: fovV } = this.fov;
    const heading = this.heading;

    // 1. Durchgang: ausrechnen, was überhaupt ins Bild fällt.
    const sichtbare = [];
    for (const obj of this.objects) {
      if (obj.distance > SICHTWEITE_M) continue;

      let x;
      if (heading === null) {
        // Ohne Kompass lässt sich nichts verorten -- dann nur das Nächste
        // mittig einblenden, damit die App bedienbar bleibt.
        if (obj.distance > 60) continue;
        x = w / 2;
      } else {
        const rel = angleDelta(obj.bearing, heading);
        // Etwas über den halben Öffnungswinkel hinaus, damit Objekte am Rand
        // hereingleiten statt zu springen.
        if (Math.abs(rel) > fovH * 0.58) continue;
        x = w / 2 + (rel / fovH) * w;
      }

      // Bodenobjekte liegen unter dem Horizont; je näher, desto tiefer.
      const senkung = -Math.atan2(AUGENHOEHE, Math.max(1.5, obj.distance)) * (180 / Math.PI);
      const y = Math.max(70, Math.min(h - 130, h / 2 + ((this.pitch - senkung) / fovV) * h));

      // Nahes wirkt groß, Fernes klein -- gedämpft, damit alles tippbar bleibt.
      const groesse = Math.round(Math.max(38, Math.min(88, 78 * (12 / Math.max(6, obj.distance)) ** 0.45)));

      // Die Beschriftung ist breiter als die Scheibe; sie bestimmt, wie weit
      // eine Markierung an den Rand rücken darf, ohne abgeschnitten zu werden.
      const text = `${beschreibe(obj).text} · ${Math.round(obj.distance)} m`;
      const breite = Math.min(text.length * 6 + 16, w * 0.46);
      const rand = Math.max(groesse / 2, breite / 2) + 6;

      sichtbare.push({
        obj,
        key: `${obj.kind}:${obj.id}`,
        x: Math.max(rand, Math.min(w - rand, x)),
        y,
        groesse,
        text,
        breite,
      });
    }

    // 2. Durchgang: Nächstes zuerst setzen und Beschriftungen ausblenden,
    // die auf einer bereits vergebenen Stelle landen würden.
    sichtbare.sort((a, b) => a.obj.distance - b.obj.distance);

    const belegt = [];
    const gesehen = new Set();
    for (const eintrag of sichtbare) {
      const kasten = {
        links: eintrag.x - eintrag.breite / 2,
        rechts: eintrag.x + eintrag.breite / 2,
        oben: eintrag.y + eintrag.groesse / 2,
        unten: eintrag.y + eintrag.groesse / 2 + 20,
      };
      const frei = !belegt.some((b) =>
        kasten.links < b.rechts && kasten.rechts > b.links
        && kasten.oben < b.unten && kasten.unten > b.oben);
      if (frei) belegt.push(kasten);

      gesehen.add(eintrag.key);
      this._place(eintrag.key, eintrag.obj, eintrag.x, eintrag.y, eintrag.groesse, frei);
    }

    for (const [key, marker] of this._markers) {
      if (!gesehen.has(key)) {
        marker.el.remove();
        this._markers.delete(key);
      }
    }
  }

  _place(key, obj, x, y, groesse, mitLabel) {
    let marker = this._markers.get(key);
    if (!marker) {
      const el = document.createElement('button');
      el.className = 'marker';
      el.type = 'button';

      const disc = document.createElement('span');
      disc.className = 'marker__disc';

      const label = document.createElement('span');
      label.className = 'marker__label';

      el.append(disc, label);
      el.addEventListener('click', () => this.onSelect?.(this._current(key) ?? obj));
      this.layer.append(el);
      marker = { el, disc, label };
      this._markers.set(key, marker);
    }

    marker.el.removeAttribute('hidden');
    marker.el.style.left = `${x}px`;
    marker.el.style.top = `${y}px`;
    marker.disc.style.width = `${groesse}px`;
    marker.disc.style.height = `${groesse}px`;
    marker.disc.style.fontSize = `${Math.round(groesse * 0.5)}px`;

    const { emoji, text, klassen } = beschreibe(obj);
    if (marker.disc.textContent !== emoji) marker.disc.textContent = emoji;
    const beschriftung = `${text} · ${Math.round(obj.distance)} m`;
    if (marker.label.textContent !== beschriftung) marker.label.textContent = beschriftung;
    marker.label.hidden = !mitLabel;

    marker.el.className = `marker ${klassen.join(' ')}${obj.distance > 60 ? ' is-far' : ''}`;
    marker.el.setAttribute('aria-label', `${text}, ${Math.round(obj.distance)} Meter entfernt`);
  }

  /** Frischen Datensatz zum Zeitpunkt des Tippens holen. */
  _current(key) {
    return this.objects.find((o) => `${o.kind}:${o.id}` === key);
  }
}

/** Aussehen und Beschriftung eines Objekts. */
export function beschreibe(obj) {
  if (obj.kind === 'spot') {
    return {
      emoji: obj.soil === 'fruchtbar' ? '🟢' : obj.soil === 'normal' ? '🟤' : '⚪',
      text: 'Freier Platz',
      klassen: ['marker--spot', obj.soil === 'fruchtbar' ? 'is-fertile' : ''].filter(Boolean),
    };
  }
  if (obj.kind === 'building') {
    return {
      emoji: obj.emoji,
      text: obj.mine ? obj.name : `${obj.name} (${obj.owner})`,
      klassen: ['marker--building', obj.mine ? 'is-mine' : ''].filter(Boolean),
    };
  }
  return {
    emoji: obj.emoji,
    text: obj.ready ? `${obj.speciesName} — reif!` : obj.speciesName,
    klassen: [
      'marker--plant',
      obj.mine ? 'is-mine' : '',
      obj.ready ? 'is-ready' : '',
      obj.thirsty && !obj.ready ? 'is-thirsty' : '',
    ].filter(Boolean),
  };
}
