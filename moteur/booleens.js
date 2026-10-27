// moteur/booleens.js — opérations booléennes (union, différence, intersection) entre maillages, par Manifold
// (lib/manifold.js + lib/manifold.wasm, chargés à la première demande). Nécessite moteur/maillage.js.
//
//   Booleens.charger().then(() => { … });            // une seule fois ; Booleens.pret devient vrai
//   const r = Booleens.operation(a, b, 'difference'); // a, b : Maillage dans le même repère → Maillage (triangles)
//
// Les deux maillages doivent être fermés (chaque arête partagée par deux faces, orientées vers l'extérieur) :
// sinon `operation` lève une erreur « maillage non fermé ». Le matériau de chaque face est conservé.

const Booleens = {
  pret: false,
  erreur: null,
  _M: null,
  _promesse: null,

  // Charge le script (s'il ne l'est pas déjà) puis compile le WebAssembly
  charger(url = 'lib/manifold.js') {
    if (this._promesse) return this._promesse;
    const script = () => window.ManifoldModule ? Promise.resolve() : new Promise((ok, ko) => {
      const s = document.createElement('script');
      s.src = url;
      s.onload = ok;
      s.onerror = () => ko(new Error('Chargement impossible : ' + url));
      document.head.appendChild(s);
    });
    this._promesse = script()
      .then(() => window.ManifoldModule())
      .then(M => { M.setup(); this._M = M; this.pret = true; return M; })
      .catch(e => { this.erreur = e; this._promesse = null; throw e; });
    return this._promesse;
  },

  // `op` : 'union' | 'difference' | 'intersection'
  operation(a, b, op) {
    const M = this._M;
    if (!M) throw new Error('Manifold n’est pas chargé');
    const materiaux = [];
    const ma = this._versManifold(a, materiaux), mb = this._versManifold(b, materiaux);
    let r;
    try {
      r = M.Manifold[op](ma, mb);
      return this._versMaillage(r, materiaux);
    } finally {
      ma.delete();
      mb.delete();
      if (r) r.delete();
    }
  },

  // Maillage → Manifold : polygones découpés en éventail ; chaque triangle garde le numéro de sa face (faceID),
  // qui renvoie à son matériau dans `materiaux` (commun aux deux opérandes)
  _versManifold(mm, materiaux) {
    const M = this._M, tri = [], ids = [];
    for (const f of mm.faces) {
      const id = materiaux.push(f.m) - 1;
      for (let k = 1; k + 1 < f.s.length; k++) { tri.push(f.s[0], f.s[k], f.s[k + 1]); ids.push(id); }
    }
    const mesh = new M.Mesh({
      numProp: 3, vertProperties: new Float32Array(mm.sommets.flat()), triVerts: new Uint32Array(tri), faceID: new Uint32Array(ids)
    });
    mesh.merge();
    let m;
    try { m = new M.Manifold(mesh); } catch (e) { throw new Error('maillage non fermé'); }
    if (m.status && m.status() !== 'NoError') { m.delete(); throw new Error('maillage non fermé'); }
    return m;
  },

  // Manifold → Maillage : les triangles issus d'une même face d'origine sont regroupés en un polygone quand leur
  // contour est une seule boucle convexe (un quad coupé redevient un quad) ; sinon ils restent des triangles
  _versMaillage(manifold, materiaux) {
    const g = manifold.getMesh(), np = g.numProp, v = g.vertProperties, t = g.triVerts, ids = g.faceID;
    const mm = new Maillage();
    for (let i = 0; i < v.length; i += np) mm.sommets.push([v[i], v[i + 1], v[i + 2]]);
    const groupes = new Map();
    for (let i = 0; i < t.length; i += 3) {
      const id = ids && ids.length ? ids[i / 3] : -1;
      if (!groupes.has(id)) groupes.set(id, []);
      groupes.get(id).push([t[i], t[i + 1], t[i + 2]]);
    }
    for (const [id, tris] of groupes) {
      const m = materiaux[id] === undefined ? 'defaut' : materiaux[id];
      const poly = tris.length > 1 && this._contour(mm.sommets, tris);
      if (poly) mm.faces.push({ s: poly, m });
      else for (const s of tris) mm.faces.push({ s, m });
    }
    return mm;
  },

  // Contour d'un groupe de triangles coplanaires : boucle unique et convexe, sinon null
  _contour(sommets, tris) {
    const aretes = new Set();
    for (const [a, b, c] of tris) aretes.add(a + ' ' + b).add(b + ' ' + c).add(c + ' ' + a);
    const suivant = new Map();
    for (const [a, b, c] of tris) for (const [i, j] of [[a, b], [b, c], [c, a]]) {
      if (aretes.has(j + ' ' + i)) continue;          // arête intérieure
      if (suivant.has(i)) return null;                // contour qui se touche lui-même
      suivant.set(i, j);
    }
    if (!suivant.size) return null;
    const boucle = [], depart = suivant.keys().next().value;
    for (let i = depart; boucle.length <= suivant.size; i = suivant.get(i)) {
      boucle.push(i);
      if (suivant.get(i) === depart) break;
    }
    if (boucle.length !== suivant.size) return null;  // plusieurs boucles (trou)
    // Convexité : tous les virages du même côté que la normale (points alignés tolérés)
    const p = boucle.map(i => sommets[i]), n = [0, 0, 0];
    for (let k = 0; k < p.length; k++) {
      const a = p[k], b = p[(k + 1) % p.length];
      n[0] += (a[1] - b[1]) * (a[2] + b[2]); n[1] += (a[2] - b[2]) * (a[0] + b[0]); n[2] += (a[0] - b[0]) * (a[1] + b[1]);
    }
    for (let k = 0; k < p.length; k++) {
      const a = p[k], b = p[(k + 1) % p.length], c = p[(k + 2) % p.length];
      const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], w = [c[0] - b[0], c[1] - b[1], c[2] - b[2]];
      const x = [u[1] * w[2] - u[2] * w[1], u[2] * w[0] - u[0] * w[2], u[0] * w[1] - u[1] * w[0]];
      if (x[0] * n[0] + x[1] * n[1] + x[2] * n[2] < -1e-9) return null;
    }
    // Commencer sur un vrai coin : l'éventail ne produit alors pas de triangle plat au départ
    const coin = p.findIndex((b, k) => {
      const a = p[(k + p.length - 1) % p.length], c = p[(k + 1) % p.length];
      const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], w = [c[0] - b[0], c[1] - b[1], c[2] - b[2]];
      return Math.hypot(u[1] * w[2] - u[2] * w[1], u[2] * w[0] - u[0] * w[2], u[0] * w[1] - u[1] * w[0]) > 1e-9;
    });
    return coin > 0 ? boucle.slice(coin).concat(boucle.slice(0, coin)) : boucle;
  }
};

window.Booleens = Booleens;
