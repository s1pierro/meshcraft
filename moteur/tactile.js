// moteur/tactile.js — entrées tactiles (Pointer Events : doigt, stylet et souris), traduites en gestes
// publiés sur le moteur événementiel. Coordonnées x, y relatives à l'élément (pixels CSS).
//
//   tactile:appui          { x, y, clientX, clientY }          toucher bref
//   tactile:double-appui   { x, y, clientX, clientY }          second appui rapproché (après « appui »)
//   tactile:appui-long     { x, y, clientX, clientY }          doigt immobile 0,5 s
//   tactile:glisser-debut  { x, y }
//   tactile:glisser        { x, y, dx, dy, vx, vy }            dx, dy depuis l'évènement précédent ; v en px/s
//   tactile:glisser-fin    { x, y, vx, vy }                    vitesse de lâcher (inertie)
//   tactile:pincer         { echelle, rotation, dx, dy, cx, cy }   à deux doigts (ou molette) ; échelle relative
//   tactile:pincer-fin     {}
//   tactile:trois          { dx, dy, cx, cy }                  trois doigts qui glissent ensemble (centre des trois)
//   tactile:trois-fin      {}

class Tactile {
  constructor(el, evenements, opts = {}) {
    this.el = el;
    this.ev = evenements;
    this.seuil = opts.seuil ?? 10;              // déplacement (px) au-delà duquel un appui devient un glissé
    this.dureeAppui = opts.dureeAppui ?? 300;   // ms
    this.dureeLong = opts.dureeLong ?? 500;     // ms
    this.dureeDouble = opts.dureeDouble ?? 320; // ms entre deux appuis
    this.actif = true;
    this.pointeurs = new Map();
    this._geste = null;         // null | 'appui' | 'glisser' | 'pincer' | 'long' | 'fini'
    this._dernierAppui = null;
    this._ecouteurs = [];

    const on = (type, fn, o) => { el.addEventListener(type, fn, o); this._ecouteurs.push([type, fn, o]); };
    on('pointerdown', e => this._bas(e));
    on('pointermove', e => this._bouge(e));
    on('pointerup', e => this._haut(e, false));
    on('pointercancel', e => this._haut(e, true));
    on('wheel', e => this._molette(e), { passive: false });
    on('contextmenu', e => e.preventDefault());
  }

  _local(e) {
    const r = this.el.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }
  _emettre(type, d) { if (this.actif) this.ev.emettre('tactile:' + type, d); }

  _bas(e) {
    try { this.el.setPointerCapture(e.pointerId); } catch (x) { /* ignoré */ }
    const p = this._local(e);
    this.pointeurs.set(e.pointerId, { x0: p.x, y0: p.y, x: p.x, y: p.y, cx: e.clientX, cy: e.clientY, t0: performance.now(), t: performance.now() });
    clearTimeout(this._minuteurLong);

    if (this.pointeurs.size === 1) {
      this._geste = 'appui';
      this._vx = this._vy = 0;
      this._minuteurLong = setTimeout(() => {
        if (this._geste !== 'appui') return;
        this._geste = 'long';
        const q = this.pointeurs.values().next().value;
        if (q) this._emettre('appui-long', { x: q.x, y: q.y, clientX: q.cx, clientY: q.cy });
      }, this.dureeLong);
    } else if (this.pointeurs.size === 2) {
      if (this._geste === 'glisser') this._emettre('glisser-fin', { x: p.x, y: p.y, vx: 0, vy: 0 });
      this._geste = 'pincer';
      this._pince = this._mesurePince();
    } else if (this.pointeurs.size === 3 && this._geste !== 'fini') {
      if (this._geste === 'pincer') this._emettre('pincer-fin', {});
      this._geste = 'trois';
      this._trois = this._centreTrois();
    }
  }

  // Centre des trois premiers doigts
  _centreTrois() {
    const l = [...this.pointeurs.values()].slice(0, 3);
    return { cx: l.reduce((t, q) => t + q.x, 0) / 3, cy: l.reduce((t, q) => t + q.y, 0) / 3 };
  }

  _mesurePince() {
    const [a, b] = [...this.pointeurs.values()];
    return { d: Math.hypot(b.x - a.x, b.y - a.y) || 1, ang: Math.atan2(b.y - a.y, b.x - a.x), cx: (a.x + b.x) / 2, cy: (a.y + b.y) / 2 };
  }

  _bouge(e) {
    const q = this.pointeurs.get(e.pointerId);
    if (!q) return;
    const p = this._local(e), t = performance.now();
    const dx = p.x - q.x, dy = p.y - q.y, dt = Math.max(1, t - q.t) / 1000;
    q.x = p.x; q.y = p.y; q.cx = e.clientX; q.cy = e.clientY; q.t = t;

    if (this._geste === 'trois') {
      if (this.pointeurs.size < 3) return;
      const m = this._centreTrois(), a = this._trois;
      this._emettre('trois', { dx: m.cx - a.cx, dy: m.cy - a.cy, cx: m.cx, cy: m.cy });
      this._trois = m;
      return;
    }
    if (this._geste === 'pincer' && this.pointeurs.size >= 2) {
      const m = this._mesurePince(), a = this._pince;
      let rot = m.ang - a.ang;
      if (rot > Math.PI) rot -= 2 * Math.PI; else if (rot < -Math.PI) rot += 2 * Math.PI;
      this._emettre('pincer', { echelle: m.d / a.d, rotation: rot, dx: m.cx - a.cx, dy: m.cy - a.cy, cx: m.cx, cy: m.cy });
      this._pince = m;
      return;
    }
    if (this.pointeurs.size !== 1) return;
    if (this._geste === 'appui' && Math.hypot(p.x - q.x0, p.y - q.y0) > this.seuil) {
      clearTimeout(this._minuteurLong);
      this._geste = 'glisser';
      this._emettre('glisser-debut', { x: q.x0, y: q.y0 });
    }
    if (this._geste === 'glisser') {
      // Vitesse lissée (px/s)
      this._vx = this._vx * 0.6 + (dx / dt) * 0.4;
      this._vy = this._vy * 0.6 + (dy / dt) * 0.4;
      this._emettre('glisser', { x: p.x, y: p.y, dx, dy, vx: this._vx, vy: this._vy });
    }
  }

  _haut(e, annule) {
    const q = this.pointeurs.get(e.pointerId);
    if (!q) return;
    this.pointeurs.delete(e.pointerId);
    clearTimeout(this._minuteurLong);
    const t = performance.now();

    if (this._geste === 'trois') {
      if (this.pointeurs.size < 3) {
        this._emettre('trois-fin', {});
        this._geste = 'fini';           // les doigts restants ne déclenchent rien
      }
    } else if (this._geste === 'pincer') {
      if (this.pointeurs.size < 2) {
        this._emettre('pincer-fin', {});
        this._geste = 'fini';           // le doigt restant ne déclenche ni appui ni glissé
      } else this._pince = this._mesurePince();
    } else if (this._geste === 'glisser') {
      const recent = t - q.t < 80;       // doigt arrêté avant le lâcher : pas d'inertie
      this._emettre('glisser-fin', { x: q.x, y: q.y, vx: recent ? this._vx : 0, vy: recent ? this._vy : 0 });
      this._geste = null;
    } else if (this._geste === 'appui' && !annule && t - q.t0 < this.dureeAppui) {
      const d = { x: q.x, y: q.y, clientX: e.clientX, clientY: e.clientY };
      this._emettre('appui', d);
      const prec = this._dernierAppui;
      if (prec && t - prec.t < this.dureeDouble && Math.hypot(d.x - prec.x, d.y - prec.y) < this.seuil * 3) {
        this._emettre('double-appui', d);
        this._dernierAppui = null;
      } else this._dernierAppui = { x: d.x, y: d.y, t };
    }
    if (!this.pointeurs.size) this._geste = null;
  }

  // Molette (ordinateur) : équivaut à un pincement
  _molette(e) {
    e.preventDefault();
    const p = this._local(e);
    this._emettre('pincer', { echelle: Math.exp(-e.deltaY * 0.0015), rotation: 0, dx: 0, dy: 0, cx: p.x, cy: p.y });
  }

  detruire() {
    clearTimeout(this._minuteurLong);
    for (const [type, fn, o] of this._ecouteurs) this.el.removeEventListener(type, fn, o);
    this._ecouteurs = [];
    this.pointeurs.clear();
  }
}

window.Tactile = Tactile;
