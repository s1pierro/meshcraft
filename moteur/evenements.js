// moteur/evenements.js — moteur événementiel : abonnements, émission immédiate ou différée,
// minuteurs en temps de jeu (suspendus quand le moteur est en pause).
//
//   const off = ev.ecouter('jeu:score', d => …);   off();          // se désabonner
//   ev.ecouterUneFois('niveau:fini', …);
//   ev.emettre('jeu:score', { points: 10 });       // tout de suite
//   ev.differer('jeu:score', { points: 10 });      // au début de la prochaine image (sûr dans une boucle)
//   ev.apres(2, () => …);   const m = ev.chaque(0.5, () => …);   m.arreter();
//   ev.ecouter('*', (d, type) => console.log(type, d));            // tout écouter (débogage)
//
// Convention de nommage : « module:action » (tactile:appui, moteur:image, jeu:…).

class Evenements {
  constructor() {
    this._abonnes = new Map();
    this._file = [];
    this._minuteurs = [];
    this.temps = 0;           // temps de jeu écoulé, en secondes
  }

  ecouter(type, fn) {
    if (!this._abonnes.has(type)) this._abonnes.set(type, []);
    this._abonnes.get(type).push(fn);
    return () => this.retirer(type, fn);
  }

  ecouterUneFois(type, fn) {
    const off = this.ecouter(type, (d, t) => { off(); fn(d, t); });
    return off;
  }

  retirer(type, fn) {
    const l = this._abonnes.get(type);
    if (!l) return;
    const k = l.indexOf(fn);
    if (k >= 0) l.splice(k, 1);
  }

  emettre(type, donnees) {
    this._appeler(this._abonnes.get(type), donnees, type);
    this._appeler(this._abonnes.get('*'), donnees, type);
  }

  differer(type, donnees) {
    this._file.push([type, donnees]);
  }

  // Une erreur dans un abonné ne doit pas arrêter les autres (ni la boucle de jeu)
  _appeler(liste, donnees, type) {
    if (!liste || !liste.length) return;
    for (const fn of liste.slice()) {
      try { fn(donnees, type); } catch (e) { console.error('Événement « ' + type + ' » :', e); }
    }
  }

  // ----- Minuteurs (temps de jeu) -------------------------------------------------------------------
  apres(delai, fn) {
    return this._minuteur(delai, fn, 0);
  }
  chaque(intervalle, fn) {
    return this._minuteur(intervalle, fn, intervalle);
  }
  _minuteur(delai, fn, repete) {
    const m = { echeance: this.temps + delai, fn, repete, actif: true };
    m.arreter = () => { m.actif = false; };
    this._minuteurs.push(m);
    return m;
  }

  // Appelé par le moteur à chaque image : file différée, puis minuteurs échus
  mettreAJour(dt) {
    this.temps += dt;
    if (this._file.length) {
      const f = this._file;
      this._file = [];
      for (const [type, d] of f) this.emettre(type, d);
    }
    if (!this._minuteurs.length) return;
    for (const m of this._minuteurs.slice()) {
      if (!m.actif || this.temps < m.echeance) continue;
      try { m.fn(); } catch (e) { console.error('Minuteur :', e); }
      if (m.repete > 0 && m.actif) m.echeance += m.repete;
      else m.actif = false;
    }
    this._minuteurs = this._minuteurs.filter(m => m.actif);
  }

  vider() {
    this._abonnes.clear();
    this._file = [];
    this._minuteurs = [];
  }
}

window.Evenements = Evenements;
