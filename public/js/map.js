/**
 * Minikarte auf einem Canvas -- ohne Kartenbilder, nur die Spielwelt.
 * Sie dreht sich mit der Blickrichtung, damit "oben" immer "vor dir" ist.
 */

const FARBEN = {
  hintergrund: '#0d1a12',
  raster: 'rgba(255,255,255,0.05)',
  reichweite: 'rgba(90,195,125,0.14)',
  reichweiteRand: 'rgba(90,195,125,0.5)',
  spieler: '#5ac37d',
  blick: 'rgba(90,195,125,0.22)',
  norden: '#e8695f',
};

export class MiniMap {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.objects = [];
    this.heading = null;
    this.reach = 40;
    this.rangeM = 120;   // Kartenradius in Metern
    this._frame = null;
  }

  update({ objects, heading, reach }) {
    if (objects) this.objects = objects;
    if (heading !== undefined) this.heading = heading;
    if (reach) this.reach = reach;
    this._schedule();
  }

  _schedule() {
    if (this._frame) return;
    this._frame = requestAnimationFrame(() => {
      this._frame = null;
      this.draw();
    });
  }

  /** Canvas an Anzeigegröße und Pixeldichte anpassen. */
  _resize() {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = this.canvas.clientWidth || 130;
    const h = this.canvas.clientHeight || 130;
    if (this.canvas.width !== Math.round(w * dpr) || this.canvas.height !== Math.round(h * dpr)) {
      this.canvas.width = Math.round(w * dpr);
      this.canvas.height = Math.round(h * dpr);
    }
    return { w, h, dpr };
  }

  draw() {
    const { w, h, dpr } = this._resize();
    const ctx = this.ctx;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);

    const cx = w / 2;
    const cy = h / 2;
    const radius = Math.min(w, h) / 2 - 6;
    const proMeter = radius / this.rangeM;

    ctx.fillStyle = FARBEN.hintergrund;
    ctx.fillRect(0, 0, w, h);

    // Karte drehen: ohne Kompass bleibt Norden oben.
    const drehung = this.heading == null ? 0 : -this.heading;

    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate((drehung * Math.PI) / 180);

    // Entfernungsringe alle 50 m
    ctx.strokeStyle = FARBEN.raster;
    ctx.lineWidth = 1;
    for (let m = 50; m <= this.rangeM; m += 50) {
      ctx.beginPath();
      ctx.arc(0, 0, m * proMeter, 0, Math.PI * 2);
      ctx.stroke();
    }

    // Reichweite, in der gepflanzt und gegossen werden kann
    ctx.beginPath();
    ctx.arc(0, 0, this.reach * proMeter, 0, Math.PI * 2);
    ctx.fillStyle = FARBEN.reichweite;
    ctx.fill();
    ctx.strokeStyle = FARBEN.reichweiteRand;
    ctx.setLineDash([4, 4]);
    ctx.stroke();
    ctx.setLineDash([]);

    // Nordmarke am Kartenrand
    ctx.save();
    ctx.translate(0, -radius + 2);
    ctx.fillStyle = FARBEN.norden;
    ctx.beginPath();
    ctx.moveTo(0, -5);
    ctx.lineTo(4, 3);
    ctx.lineTo(-4, 3);
    ctx.closePath();
    ctx.fill();
    ctx.restore();

    // Objekte
    for (const obj of this.objects) {
      if (obj.distance > this.rangeM) continue;
      const winkel = ((obj.bearing ?? 0) - 90) * (Math.PI / 180);
      const r = obj.distance * proMeter;
      const x = Math.cos(winkel) * r;
      const y = Math.sin(winkel) * r;

      ctx.save();
      ctx.translate(x, y);
      ctx.rotate((-drehung * Math.PI) / 180); // Symbole nicht mitdrehen
      this._zeichneObjekt(ctx, obj);
      ctx.restore();
    }

    ctx.restore();

    // Spieler in der Mitte, plus Blickkegel
    if (this.heading != null) {
      ctx.save();
      ctx.translate(cx, cy);
      ctx.fillStyle = FARBEN.blick;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.arc(0, 0, radius, (-90 - 28) * (Math.PI / 180), (-90 + 28) * (Math.PI / 180));
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }

    ctx.fillStyle = FARBEN.spieler;
    ctx.beginPath();
    ctx.arc(cx, cy, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.6)';
    ctx.lineWidth = 2;
    ctx.stroke();
  }

  _zeichneObjekt(ctx, obj) {
    if (obj.kind === 'spot') {
      ctx.beginPath();
      ctx.arc(0, 0, 3, 0, Math.PI * 2);
      ctx.fillStyle = obj.soil === 'fruchtbar' ? 'rgba(90,195,125,0.85)'
        : obj.soil === 'normal' ? 'rgba(160,130,95,0.8)'
        : 'rgba(190,190,190,0.55)';
      ctx.fill();
      return;
    }

    if (obj.kind === 'building') {
      ctx.font = '13px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(obj.emoji, 0, 0);
      return;
    }

    // Pflanze
    if (obj.ready) {
      ctx.beginPath();
      ctx.arc(0, 0, 9, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(240,192,90,0.28)';
      ctx.fill();
    }
    ctx.font = '13px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(obj.emoji, 0, 0);
  }
}
