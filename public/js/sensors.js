/**
 * Standort und Blickrichtung des Geräts.
 *
 * Die Blickrichtung ist der heikle Teil: iOS liefert sie fertig als
 * `webkitCompassHeading`, Android nur als Eulerwinkel, aus denen sie erst
 * berechnet werden muss. Zusätzlich zählt, wie das Gerät gerade gedreht
 * gehalten wird (Hoch- oder Querformat).
 */

const DEG = Math.PI / 180;

/* ---------------------------------------------------------------- Standort */

export class LocationSource extends EventTarget {
  constructor() {
    super();
    this.position = null;   // { lat, lng, accuracy, at }
    this._watchId = null;
  }

  get available() {
    return 'geolocation' in navigator;
  }

  start() {
    if (!this.available) {
      this.dispatchEvent(new CustomEvent('error', {
        detail: 'Dieses Gerät kennt seinen Standort nicht.',
      }));
      return;
    }
    if (this._watchId !== null) return;

    this._watchId = navigator.geolocation.watchPosition(
      (pos) => {
        this.position = {
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy: pos.coords.accuracy ?? 999,
          at: pos.timestamp,
        };
        this.dispatchEvent(new CustomEvent('change', { detail: this.position }));
      },
      (err) => {
        const texte = {
          1: 'Ohne Standortfreigabe kann die App dir nichts in deiner Umgebung zeigen.',
          2: 'Standort nicht ermittelbar. Bist du vielleicht in einem Gebäude?',
          3: 'Die Standortsuche dauert zu lange. Geh nach draußen und versuch es erneut.',
        };
        this.dispatchEvent(new CustomEvent('error', {
          detail: texte[err.code] ?? 'Standort nicht verfügbar.',
        }));
      },
      { enableHighAccuracy: true, maximumAge: 3000, timeout: 20_000 },
    );
  }

  stop() {
    if (this._watchId !== null) {
      navigator.geolocation.clearWatch(this._watchId);
      this._watchId = null;
    }
  }
}

/* ----------------------------------------------------------- Blickrichtung */

/**
 * Rechnet die Eulerwinkel des Geräts in eine Kompassrichtung um.
 *
 * Nötig für Android: `alpha` allein stimmt nur, solange das Gerät flach
 * liegt. Beim Hochhalten -- also genau in der AR-Haltung -- kippt der Wert
 * weg, deshalb der Umweg über die Richtungsvektoren.
 */
export function headingFromEuler(alpha, beta, gamma) {
  const x = (beta ?? 0) * DEG;
  const y = (gamma ?? 0) * DEG;
  const z = (alpha ?? 0) * DEG;

  const cX = Math.cos(x), sX = Math.sin(x);
  const cY = Math.cos(y), sY = Math.sin(y);
  const cZ = Math.cos(z), sZ = Math.sin(z);

  const vx = -cZ * sY - sZ * sX * cY;
  const vy = -sZ * sY + cZ * sX * cY;

  let heading = Math.atan2(vx, vy) / DEG;
  if (heading < 0) heading += 360;
  return heading;
}

/** Winkeldifferenz auf -180..180 normalisieren. */
export function angleDelta(a, b) {
  return ((((a - b) % 360) + 540) % 360) - 180;
}

/**
 * Gleitender Mittelwert für lineare Werte, z. B. die Neigung.
 * Sie läuft von -90 bis +90 und darf gerade nicht im Kreis gerechnet werden.
 */
class Smoother {
  constructor(factor = 0.25) {
    this.factor = factor;
    this.value = null;
  }

  push(wert) {
    if (wert == null || Number.isNaN(wert)) return this.value;
    this.value = this.value === null ? wert : this.value + this.factor * (wert - this.value);
    return this.value;
  }
}

/** Gleitender Mittelwert für Kompasswinkel -- verhindert Sprünge bei 0°/360°. */
class AngleSmoother {
  constructor(factor = 0.18) {
    this.factor = factor;
    this.value = null;
  }

  push(angle) {
    if (angle == null || Number.isNaN(angle)) return this.value;
    if (this.value === null) {
      this.value = angle;
    } else {
      this.value = (this.value + this.factor * angleDelta(angle, this.value) + 360) % 360;
    }
    return this.value;
  }
}

export class OrientationSource extends EventTarget {
  constructor() {
    super();
    this.heading = null;     // 0..360, 0 = Norden
    this.pitch = 0;          // Grad über/unter dem Horizont
    this.absolute = false;   // true = echter Kompass, nicht nur relativ
    this._smoother = new AngleSmoother();
    this._pitchSmoother = new Smoother(0.25);
    this._onEvent = this._onEvent.bind(this);
    this._bound = [];
  }

  /** Braucht dieses Gerät eine ausdrückliche Erlaubnis? (iOS 13+) */
  static get needsPermission() {
    return typeof DeviceOrientationEvent !== 'undefined'
      && typeof DeviceOrientationEvent.requestPermission === 'function';
  }

  static async requestPermission() {
    if (!OrientationSource.needsPermission) return 'granted';
    try {
      return await DeviceOrientationEvent.requestPermission();
    } catch {
      return 'denied';
    }
  }

  start() {
    if (this._bound.length) return;
    // `deviceorientationabsolute` ist auf Android die verlässliche Quelle;
    // iOS kennt es nicht und liefert stattdessen webkitCompassHeading.
    for (const type of ['deviceorientationabsolute', 'deviceorientation']) {
      window.addEventListener(type, this._onEvent, true);
      this._bound.push(type);
    }
  }

  stop() {
    for (const type of this._bound) window.removeEventListener(type, this._onEvent, true);
    this._bound = [];
  }

  /** Drehung des Bildschirms, damit die Richtung im Querformat stimmt. */
  get screenAngle() {
    return screen.orientation?.angle ?? window.orientation ?? 0;
  }

  _onEvent(event) {
    let raw = null;
    let absolute = false;

    if (typeof event.webkitCompassHeading === 'number' && !Number.isNaN(event.webkitCompassHeading)) {
      raw = event.webkitCompassHeading;          // iOS: bereits Kompassgrad
      absolute = true;
    } else if (event.alpha != null) {
      raw = headingFromEuler(event.alpha, event.beta, event.gamma);
      absolute = event.absolute === true || event.type === 'deviceorientationabsolute';
    }
    if (raw === null) return;

    // Ein bereits absoluter Wert wird nicht von einem relativen überschrieben.
    if (this.absolute && !absolute) return;
    this.absolute = absolute;

    this.heading = this._smoother.push((raw + this.screenAngle + 360) % 360);

    // Neigung: 90° bedeutet senkrecht gehalten, also Blick zum Horizont.
    if (event.beta != null) {
      const angle = this.screenAngle;
      const tilt = Math.abs(angle) === 90 ? Math.abs(event.gamma ?? 0) : event.beta;
      this._pitchSmoother.push((tilt ?? 90) - 90);
      this.pitch = this._pitchSmoother.value ?? 0;
    }

    this.dispatchEvent(new CustomEvent('change', {
      detail: { heading: this.heading, pitch: this.pitch, absolute: this.absolute },
    }));
  }
}
