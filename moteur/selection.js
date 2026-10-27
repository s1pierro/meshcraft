// moteur/selection.js — sélection typée d'éléments d'un Maillage : sommets, arêtes et faces, indépendants
// (choisir une face ne choisit pas ses sommets). Nécessite moteur/maillage.js.
//
//   const sel = new SelectionMaillage();       // (« Selection » est déjà pris par le navigateur)
//   sel.basculer({ t: 's', i: 4 });            // sommet n° 4 (les sommets gardent l'ordre de sélection)
//   sel.basculer({ t: 'a', a: [2, 7] });       // arête entre les sommets 2 et 7 (paire rangée i < j)
//   sel.basculer({ t: 'f', f: maillage.faces[0] });   // face : la référence de l'objet face du maillage
//   sel.sommetsImpliques(maillage) → indices de tous les sommets concernés (ce que déplace une transformation)
//   sel.renumeroter(table)  // après une suppression ou une fusion de sommets (table ancien → nouveau, −1 : retiré)
//   sel.nettoyer(maillage)  // après toute modification : oublie les faces et arêtes disparues
//   sel.versDonnees(maillage) → { s, a, f } (indices, pour JSON) · SelectionMaillage.depuisDonnees(d, maillage)
//   sel.masquer('f') / sel.montrer('f')  // met de côté les faces choisies (filtre éteint), puis les rend
//
// Éléments masqués (`cache`, une SelectionMaillage) : hors des listes, donc ni dessinés, ni transformés, ni opérés,
// mais renumérotés, nettoyés et sauvegardés (versDonnees les compte) avec les autres.
// Les faces sont tenues par référence : inverser, renuméroter ou retirer d'autres faces ne les perd pas.
// `dernier` : élément choisi en dernier (pivot « élément actif »), ou null.

class SelectionMaillage {
  constructor() {
    this.sommets = [];
    this.aretes = [];
    this.faces = [];
    this.dernier = null;
    this.cache = null;
  }

  // Élément de type `t` d'après une valeur de sa liste
  static element(t, x) { return t === 's' ? { t, i: x } : t === 'a' ? { t, a: x } : { t, f: x }; }

  // Met de côté les éléments de type `t` (ils quittent la sélection active), ou les y rend
  masquer(t) {
    if (!this.cache) this.cache = new SelectionMaillage();
    for (const x of this.liste(t)) this.cache.ajouter(SelectionMaillage.element(t, x));
    this.liste(t).length = 0;
    if (this.dernier && this.dernier.t === t) this.dernier = null;
  }

  montrer(t) {
    if (!this.cache) return;
    for (const x of this.cache.liste(t)) this.ajouter(SelectionMaillage.element(t, x));
    this.cache.vider(t);
  }

  static arete(i, j) { return i < j ? [i, j] : [j, i]; }

  get vide() { return !this.sommets.length && !this.aretes.length && !this.faces.length; }

  // Liste d'un type : 's', 'a' ou 'f'
  liste(t) { return t === 's' ? this.sommets : t === 'a' ? this.aretes : this.faces; }

  // Position de l'élément `el` dans sa liste, ou −1
  indexDe(el) {
    if (el.t === 's') return this.sommets.indexOf(el.i);
    if (el.t === 'f') return this.faces.indexOf(el.f);
    const [i, j] = SelectionMaillage.arete(el.a[0], el.a[1]);
    return this.aretes.findIndex(a => a[0] === i && a[1] === j);
  }

  contient(el) { return this.indexDe(el) >= 0; }

  ajouter(el) {
    if (this.contient(el)) return;
    if (el.t === 's') this.sommets.push(el.i);
    else if (el.t === 'a') this.aretes.push(SelectionMaillage.arete(el.a[0], el.a[1]));
    else this.faces.push(el.f);
    this.dernier = el;
  }

  retirer(el) {
    const k = this.indexDe(el);
    if (k < 0) return;
    this.liste(el.t).splice(k, 1);
    if (this.dernier && this.dernier.t === el.t && !this.contient(this.dernier)) this.dernier = null;
  }

  // Ajoute l'élément, ou le retire s'il était choisi ; renvoie vrai s'il est choisi après coup
  basculer(el) {
    if (this.contient(el)) { this.retirer(el); return false; }
    this.ajouter(el);
    return true;
  }

  // Vide tout, ou un seul type ('s', 'a', 'f')
  vider(t) {
    for (const k of t ? [t] : ['s', 'a', 'f']) this.liste(k).length = 0;
    if (!t || (this.dernier && this.dernier.t === t)) this.dernier = null;
    if (this.cache) this.cache.vider(t);
  }

  // Choisit tous les éléments du type `t` du maillage
  tout(mm, t) {
    if (t === 's') this.sommets = mm.sommets.map((_, i) => i);
    else if (t === 'a') this.aretes = mm.aretes().map(([i, j]) => SelectionMaillage.arete(i, j));
    else this.faces = mm.faces.slice();
    this.dernier = null;
  }

  // Sommets d'un élément
  static sommetsDe(el) { return el.t === 's' ? [el.i] : el.t === 'a' ? el.a.slice() : el.f.s.slice(); }

  // Tous les sommets concernés, sans doublon : sommets choisis (dans l'ordre), puis ceux des arêtes et des faces
  sommetsImpliques() {
    const vus = new Set(), r = [];
    const ajouter = i => { if (!vus.has(i)) { vus.add(i); r.push(i); } };
    this.sommets.forEach(ajouter);
    for (const a of this.aretes) a.forEach(ajouter);
    for (const f of this.faces) f.s.forEach(ajouter);
    return r;
  }

  // Indices des sommets changés (table[ancien] = nouveau, −1 : retiré) ; doublons retirés (fusion)
  renumeroter(table) {
    const n = i => table[i] === undefined ? i : table[i];
    this.sommets = this.sommets.map(n).filter((i, k, t) => i >= 0 && t.indexOf(i) === k);
    this.aretes = this.aretes.map(([i, j]) => SelectionMaillage.arete(n(i), n(j)));
    if (this.dernier && this.dernier.t === 's') this.dernier = { t: 's', i: n(this.dernier.i) };
    else if (this.dernier && this.dernier.t === 'a') this.dernier = { t: 'a', a: SelectionMaillage.arete(n(this.dernier.a[0]), n(this.dernier.a[1])) };
    if (this.cache) this.cache.renumeroter(table);
  }

  // Oublie ce qui n'existe plus dans `mm` : sommets hors limites, arêtes qu'aucune face ne borde, faces retirées
  nettoyer(mm) {
    const nb = mm.sommets.length, aretes = new Set(mm.aretes().map(([i, j]) => SelectionMaillage.arete(i, j).join(' ')));
    const faces = new Set(mm.faces), vues = new Set();
    this.sommets = this.sommets.filter((i, k, t) => Number.isInteger(i) && i >= 0 && i < nb && t.indexOf(i) === k);
    this.aretes = this.aretes.filter(a => { const c = a.join(' '); if (!aretes.has(c) || vues.has(c)) return false; vues.add(c); return true; });
    this.faces = this.faces.filter((f, k, t) => faces.has(f) && t.indexOf(f) === k);
    if (this.dernier && !this.contient(this.dernier)) this.dernier = null;
    if (this.cache) this.cache.nettoyer(mm);
    return this;
  }

  // Indices, pour la sauvegarde : { s: [sommets], a: [[i, j]], f: [indices des faces] }, éléments masqués compris
  versDonnees(mm) {
    const rang = new Map(mm.faces.map((f, k) => [f, k]));
    const d = { s: this.sommets.slice(), a: this.aretes.map(a => a.slice()), f: this.faces.map(f => rang.get(f)).filter(k => k !== undefined) };
    if (!this.cache) return d;
    const c = this.cache.versDonnees(mm), cles = new Set(d.a.map(a => a.join(' ')));
    for (const i of c.s) if (!d.s.includes(i)) d.s.push(i);
    for (const a of c.a) if (!cles.has(a.join(' '))) d.a.push(a);
    for (const k of c.f) if (!d.f.includes(k)) d.f.push(k);
    return d;
  }

  // Lit { s, a, f } ou l'ancienne forme (tableau de sommets) ; `decalage` : { s, f } ajoutés aux indices (maillages
  // réunis). Les éléments absents de `mm` sont ignorés.
  static depuisDonnees(d, mm, decalage = { s: 0, f: 0 }) {
    const sel = new SelectionMaillage();
    sel.ajouterDonnees(d, mm, decalage);
    return sel;
  }

  ajouterDonnees(d, mm, decalage = { s: 0, f: 0 }) {
    d = SelectionMaillage.donnees(d);
    const ent = x => Number.isInteger(x) && x >= 0;
    for (const i of d.s) if (ent(i)) this.sommets.push(i + decalage.s);
    for (const a of d.a) if (Array.isArray(a) && ent(a[0]) && ent(a[1])) this.aretes.push(SelectionMaillage.arete(a[0] + decalage.s, a[1] + decalage.s));
    for (const k of d.f) if (ent(k) && mm.faces[k + decalage.f]) this.faces.push(mm.faces[k + decalage.f]);
    this.dernier = null;
    return this.nettoyer(mm);
  }

  // Données normalisées { s, a, f } (copie), depuis la forme enregistrée ou l'ancienne liste de sommets
  static donnees(d) {
    if (Array.isArray(d)) return { s: d.slice(), a: [], f: [] };
    d = d || {};
    return { s: (d.s || []).slice(), a: (d.a || []).map(a => a.slice()), f: (d.f || []).slice() };
  }
}

window.SelectionMaillage = SelectionMaillage;
