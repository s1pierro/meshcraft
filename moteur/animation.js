// moteur/animation.js — animation des objets : interpolations (« tweens ») de propriétés numériques
// avec courbes d'accélération, et comportements continus appelés à chaque image.
//
//   anim.vers(cube.position, { y: 2 }, 0.4, { assouplir: 'sortie', allerRetour: true });
//   await anim.vers(cube.rotation, { y: Math.PI }, 1).fini;      // enchaîner avec await
//   const c = anim.comportement((dt, t) => { cube.rotation.y += dt; });   c.arreter();
//   anim.arreter(cube.position);                                    // stoppe les interpolations de cette cible

const Assouplir = {
  lineaire: t => t,
  entree: t => t * t,
  sortie: t => t * (2 - t),
  entreeSortie: t => t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t,
  cubique: t => t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2,
  retour: t => { const c = 1.70158; return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2); },
  elastique: t => t === 0 || t === 1 ? t : Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * (2 * Math.PI / 3)) + 1,
  rebond: t => {
    const n = 7.5625, d = 2.75;
    if (t < 1 / d) return n * t * t;
    if (t < 2 / d) return n * (t -= 1.5 / d) * t + 0.75;
    if (t < 2.5 / d) return n * (t -= 2.25 / d) * t + 0.9375;
    return n * (t -= 2.625 / d) * t + 0.984375;
  },
  // Paliers : mouvement saccadé façon animation image par image
  paliers: n => t => Math.floor(t * n) / n
};

class Interpolation {
  constructor(cible, props, duree, opts) {
    this.cible = cible;
    this.vers = props;
    this.duree = Math.max(0.0001, duree);
    this.assouplir = typeof opts.assouplir === 'function' ? opts.assouplir : (Assouplir[opts.assouplir] || Assouplir.entreeSortie);
    this.attente = opts.delai || 0;
    this.allerRetour = !!opts.allerRetour;
    this.repetitions = opts.repetitions || 0;    // Infinity : sans fin
    this.surFin = opts.fin || null;
    this.t = 0;
    this.depart = null;
    this.retour = false;
    this.actif = true;
    this.fini = new Promise(r => { this._resoudre = r; });
  }

  arreter() {
    if (!this.actif) return;
    this.actif = false;
    this._resoudre(false);
  }

  // Renvoie false quand l'interpolation est terminée
  avancer(dt) {
    if (!this.actif) return false;
    if (this.attente > 0) { this.attente -= dt; if (this.attente > 0) return true; dt = -this.attente; this.attente = 0; }
    if (!this.depart) {
      this.depart = {};
      for (const k in this.vers) this.depart[k] = this.cible[k];
    }
    this.t += dt;
    const p = Math.min(1, this.t / this.duree);
    const e = this.assouplir(this.retour ? 1 - p : p);
    for (const k in this.vers) this.cible[k] = this.depart[k] + (this.vers[k] - this.depart[k]) * e;
    if (p < 1) return true;

    // Fin d'un parcours
    if (this.allerRetour && !this.retour) { this.retour = true; this.t = 0; return true; }
    if (this.repetitions > 0) { this.repetitions--; this.retour = false; this.t = 0; return true; }
    this.actif = false;
    if (this.surFin) { try { this.surFin(); } catch (x) { console.error('Animation :', x); } }
    this._resoudre(true);
    return false;
  }
}

class Animations {
  constructor() {
    this._liste = [];
    this._comportements = [];
    this.temps = 0;
  }

  // Interpole les propriétés numériques de `cible` jusqu'aux valeurs de `props` en `duree` secondes.
  // opts : assouplir (nom ou fonction), delai, allerRetour, repetitions, fin
  vers(cible, props, duree, opts = {}) {
    const i = new Interpolation(cible, props, duree, opts);
    this._liste.push(i);
    return i;
  }

  // Fonction appelée à chaque image avec (dt, t) ; renvoyer false l'arrête
  comportement(fn) {
    const c = { fn, actif: true };
    c.arreter = () => { c.actif = false; };
    this._comportements.push(c);
    return c;
  }

  arreter(cible) {
    for (const i of this._liste) if (!cible || i.cible === cible) i.arreter();
  }

  get occupe() { return this._liste.length > 0 || this._comportements.length > 0; }

  mettreAJour(dt) {
    this.temps += dt;
    if (this._liste.length) this._liste = this._liste.filter(i => i.avancer(dt));
    if (this._comportements.length) {
      for (const c of this._comportements.slice()) {
        if (!c.actif) continue;
        try { if (c.fn(dt, this.temps) === false) c.actif = false; }
        catch (e) { console.error('Comportement :', e); c.actif = false; }
      }
      this._comportements = this._comportements.filter(c => c.actif);
    }
  }
}

window.Assouplir = Assouplir;
window.Animations = Animations;
