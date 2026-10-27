// moteur/maillage.js — maillage éditable (sommets + faces polygonales) et formats de fichiers 3D :
// Wavefront OBJ, STL (binaire ou texte) et glTF 2.0 (.gltf à données intégrées, ou .glb). Nécessite three.js.
//
//   const m = Maillage.depuisFichier(nom, contenu);  // contenu : texte (OBJ, glTF) ou ArrayBuffer (tous formats)
//   m.sommets  → [[x, y, z], …]          m.faces → [{ s: [i, j, k, …], m: 'materiau' }, …]
//   m.fils → [[i, j], …] : arêtes libres (sans face ; lignes « l » de l'OBJ ; ignorées par STL, glTF et Manifold)
//   m.faces.push({ s: [0, 1, 2], m: 'defaut' });     // face tournée dans le sens trigonométrique vue de dehors
//   const geo = m.geometrie();                       // BufferGeometry à facettes (Modeles._geometrie)
//   m.versOBJ() → texte · m.versSTL() → ArrayBuffer · m.versGLB() → ArrayBuffer
//   Maillage.versMTL({ nom: { couleur, … } }) → texte · Maillage.depuisMTL(texte) → { materiaux, textures } (voir MTL)
//   m.parMateriau() → [{ m, maillage }] (un maillage par matériau, sommets renumérotés)
//   Maillage.reunir([m1, m2]) → un maillage · Maillage.objetsVersOBJ([{ nom, maillage }]) → OBJ à plusieurs « o »
//   Maillage.objetsDepuisOBJ(texte) → [{ nom, maillage }] (un objet par « o », ou par « g » à défaut)
//
// Repère : Y vers le haut (three.js, OBJ, glTF). Les STL sont supposés Z vers le haut (Blender, impression 3D)
// et convertis dans les deux sens. Les polygones sont découpés en éventail : convexes et plans de préférence.

class Maillage {

  constructor(sommets = [], faces = [], fils = []) {
    this.sommets = sommets;
    this.faces = faces;
    this.fils = fils;
  }

  clone() {
    return new Maillage(this.sommets.map(p => p.slice()), this.faces.map(f => ({ s: f.s.slice(), m: f.m })), this.fils.map(a => a.slice()));
  }

  // Objet simple pour JSON.stringify (sauvegarde locale, annulation) ; `l` : arêtes libres, s'il y en a
  versDonnees() {
    const d = { v: this.sommets.map(p => p.map(c => Math.round(c * 1e5) / 1e5)), f: this.faces.map(f => [f.m, ...f.s]) };
    if (this.fils.length) d.l = this.fils.map(a => a.slice());
    return d;
  }

  static depuisDonnees(d) {
    return new Maillage((d.v || []).map(p => p.slice()), (d.f || []).map(f => ({ m: f[0], s: f.slice(1) })),
      (d.l || []).map(a => a.slice()));
  }

  // Arêtes libres mises en ordre : sans doublon, ni boucle sur un sommet, ni arête déjà bordée par une face
  nettoyerFils() {
    const vues = new Set(), cle = (i, j) => i < j ? i + ' ' + j : j + ' ' + i;
    for (const f of this.faces) f.s.forEach((i, k) => vues.add(cle(i, f.s[(k + 1) % f.s.length])));
    this.fils = this.fils.filter(([i, j]) => {
      const c = cle(i, j);
      if (i === j || vues.has(c)) return false;
      vues.add(c);
      return true;
    });
    return this;
  }

  // Boîte centrée sur l'origine, de dimensions `lx` × `ly` × `lz` (six quadrilatères)
  static boite(lx = 1, ly = lx, lz = lx) {
    const s = [];
    for (const x of [-lx / 2, lx / 2]) for (const y of [-ly / 2, ly / 2]) for (const z of [-lz / 2, lz / 2]) s.push([x, y, z]);
    // indices : x * 4 + y * 2 + z (0 = négatif, 1 = positif)
    const f = [[0, 1, 3, 2], [4, 6, 7, 5], [0, 4, 5, 1], [2, 3, 7, 6], [0, 2, 6, 4], [1, 5, 7, 3]];
    return new Maillage(s, f.map(q => ({ s: q, m: 'defaut' })));
  }

  // Cube centré sur l'origine, de côté `c` : point de départ d'un nouveau maillage
  static cube(c = 1) { return Maillage.boite(c, c, c); }

  // Cône, ou tronc de cône, d'axe Y et centré sur l'origine : rayon `r1` en bas, `r2` en haut (0 : pointe), hauteur
  // `h`, `n` côtés ; fermeture des bases : 'polygone' (une face à n côtés) ou 'eventail' (n triangles autour d'un
  // sommet central)
  static cone(r1 = 0.5, r2 = 0, h = 1, n = 16, fermeture = 'polygone') {
    const s = [], f = [];
    const anneau = (r, y) => {
      const d = s.length;
      for (let k = 0; k < n; k++) {
        const a = 2 * Math.PI * k / n;
        s.push([r * Math.cos(a), y, r * Math.sin(a)]);
      }
      return k => d + k % n;
    };
    // `tour` : sommets de la base dans le sens de sa normale (vers l'extérieur)
    const fermer = (tour, y) => {
      if (fermeture !== 'eventail') { f.push(tour); return; }
      const c = s.push([0, y, 0]) - 1;
      tour.forEach((i, k) => f.push([c, i, tour[(k + 1) % n]]));
    };
    const b = anneau(r1, -h / 2);
    if (r2 > 0) {
      const t = anneau(r2, h / 2);
      for (let k = 0; k < n; k++) f.push([b(k), t(k), t(k + 1), b(k + 1)]);
      fermer(Array.from({ length: n }, (_, k) => t(n - 1 - k)), h / 2);
    } else {
      const p = s.push([0, h / 2, 0]) - 1;
      for (let k = 0; k < n; k++) f.push([b(k), p, b(k + 1)]);
    }
    fermer(Array.from({ length: n }, (_, k) => b(k)), -h / 2);
    return new Maillage(s, f.map(q => ({ s: q, m: 'defaut' })));
  }

  // Cylindre d'axe Y, centré sur l'origine (voir cone)
  static cylindre(r = 0.5, h = 1, n = 16, fermeture = 'polygone') { return Maillage.cone(r, r, h, n, fermeture); }

  // Sphère UV de rayon `r`, pôles sur l'axe Y : `segments` méridiens, `anneaux` bandes entre les pôles
  // (quadrilatères, triangles autour des pôles)
  static sphereUV(r = 0.5, segments = 16, anneaux = 8) {
    const s = [[0, r, 0]], f = [];
    for (let j = 1; j < anneaux; j++) {
      const p = Math.PI * j / anneaux;
      for (let k = 0; k < segments; k++) {
        const a = 2 * Math.PI * k / segments;
        s.push([r * Math.sin(p) * Math.cos(a), r * Math.cos(p), r * Math.sin(p) * Math.sin(a)]);
      }
    }
    const sud = s.push([0, -r, 0]) - 1, i = (j, k) => 1 + (j - 1) * segments + k % segments;
    for (let k = 0; k < segments; k++) {
      f.push([i(1, k), 0, i(1, k + 1)]);
      for (let j = 1; j + 1 < anneaux; j++) f.push([i(j + 1, k), i(j, k), i(j, k + 1), i(j + 1, k + 1)]);
      f.push([sud, i(anneaux - 1, k), i(anneaux - 1, k + 1)]);
    }
    return new Maillage(s, f.map(q => ({ s: q, m: 'defaut' })));
  }

  // Icosphère de rayon `r` : icosaèdre (subdivisions = 1), dont chaque triangle est coupé en quatre, sommets ramenés
  // sur la sphère, à chaque subdivision supplémentaire
  static icosphere(r = 0.5, subdivisions = 2) {
    const t = (1 + Math.sqrt(5)) / 2, s = [];
    const point = p => { const l = Math.hypot(...p); return s.push(p.map(c => c * r / l)) - 1; };
    [[-1, t, 0], [1, t, 0], [-1, -t, 0], [1, -t, 0], [0, -1, t], [0, 1, t], [0, -1, -t], [0, 1, -t],
      [t, 0, -1], [t, 0, 1], [-t, 0, -1], [-t, 0, 1]].forEach(point);
    let f = [[0, 11, 5], [0, 5, 1], [0, 1, 7], [0, 7, 10], [0, 10, 11], [1, 5, 9], [5, 11, 4], [11, 10, 2], [10, 7, 6], [7, 1, 8],
      [3, 9, 4], [3, 4, 2], [3, 2, 6], [3, 6, 8], [3, 8, 9], [4, 9, 5], [2, 4, 11], [6, 2, 10], [8, 6, 7], [9, 8, 1]];
    for (let n = 1; n < subdivisions; n++) {
      const milieux = new Map();
      const milieu = (a, b) => {
        const c = a < b ? a + ',' + b : b + ',' + a;
        if (!milieux.has(c)) milieux.set(c, point(s[a].map((v, k) => v + s[b][k])));
        return milieux.get(c);
      };
      f = f.flatMap(([a, b, c]) => {
        const ab = milieu(a, b), bc = milieu(b, c), ca = milieu(c, a);
        return [[a, ab, ca], [b, bc, ab], [c, ca, bc], [ab, bc, ca]];
      });
    }
    return new Maillage(s, f.map(q => ({ s: q, m: 'defaut' })));
  }

  // Liste des triangles (éventail) par matériau ; `materiauDe(face, n)` permet de regrouper autrement
  triangles(materiauDe = f => f.m) {
    const parMateriau = new Map();
    this.faces.forEach((f, n) => {
      const m = materiauDe(f, n);
      if (!parMateriau.has(m)) parMateriau.set(m, []);
      const l = parMateriau.get(m), s = f.s;
      for (let k = 1; k + 1 < s.length; k++) l.push(s[0], s[k], s[k + 1]);
    });
    return parMateriau;
  }

  geometrie(materiauDe) {
    return Modeles._geometrie(this.sommets.flat(), this.triangles(materiauDe));
  }

  // Partie connexe : sommets reliés de proche en proche, par les faces et les arêtes libres, aux sommets `depart`
  // (eux compris), et les faces qui les utilisent (dans l'ordre du maillage) → { sommets: [indices croissants],
  // faces: [faces] }
  connexe(depart) {
    const parSommet = this.sommets.map(() => []);
    for (const f of this.faces) for (const i of f.s) parSommet[i].push(f);
    for (const a of this.fils) for (const i of a) parSommet[i].push({ s: a, fil: true });
    const vus = new Set(depart.filter(i => parSommet[i])), pile = [...vus], faces = new Set();
    while (pile.length) {
      for (const f of parSommet[pile.pop()]) {
        if (faces.has(f)) continue;
        if (!f.fil) faces.add(f);
        for (const j of f.s) if (!vus.has(j)) { vus.add(j); pile.push(j); }
      }
    }
    return { sommets: [...vus].sort((i, j) => i - j), faces: this.faces.filter(f => faces.has(f)) };
  }

  // Arêtes uniques des polygones, puis arêtes libres [[i, j], …] (pour l'affichage en fil de fer)
  aretes() {
    const vues = new Set(), a = [];
    const ajouter = (i, j) => { const cle = i < j ? i + ' ' + j : j + ' ' + i; if (!vues.has(cle)) { vues.add(cle); a.push([i, j]); } };
    for (const f of this.faces) for (let k = 0; k < f.s.length; k++) ajouter(f.s[k], f.s[(k + 1) % f.s.length]);
    for (const [i, j] of this.fils) ajouter(i, j);
    return a;
  }

  // Plus court chemin (Dijkstra) entre deux éléments de même type, ou null s'ils ne sont pas reliés :
  //   't' = 's' : sommets i → j le long des arêtes (faces et arêtes libres), longueur réelle → [i, …, j]
  //   't' = 'a' : arêtes [i, j] → [k, l] : les deux, et celles du plus court chemin entre leurs extrémités → [[a, b], …]
  //   't' = 'f' : faces f → g, de face en face par les arêtes communes, distance entre centres → [f, …, g]
  chemin(t, depart, arrivee) {
    const L = (p, q) => Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]);
    if (t === 'f') {
      const faces = this.faces, n = faces.length, idx = new Map(faces.map((f, k) => [f, k]));
      const a = idx.get(depart), b = idx.get(arrivee);
      if (a === undefined || b === undefined) return null;
      const centres = faces.map(f => [0, 1, 2].map(c => f.s.reduce((x, i) => x + this.sommets[i][c], 0) / f.s.length));
      const parArete = new Map(), cle = (i, j) => i < j ? i + ' ' + j : j + ' ' + i;
      faces.forEach((f, k) => f.s.forEach((i, m) => {
        const c = cle(i, f.s[(m + 1) % f.s.length]);
        if (!parArete.has(c)) parArete.set(c, []);
        parArete.get(c).push(k);
      }));
      const voisins = k => {
        const f = faces[k], r = [];
        f.s.forEach((i, m) => { for (const g of parArete.get(cle(i, f.s[(m + 1) % f.s.length]))) if (g !== k) r.push([g, L(centres[k], centres[g])]); });
        return r;
      };
      const l = Maillage._dijkstra(n, voisins, [a], new Set([b]));
      return l && l.map(k => faces[k]);
    }
    const adj = this.sommets.map(() => []);
    for (const [i, j] of this.aretes()) {
      const w = L(this.sommets[i], this.sommets[j]);
      adj[i].push([j, w]);
      adj[j].push([i, w]);
    }
    if (t === 's') return Maillage._dijkstra(this.sommets.length, k => adj[k], [depart], new Set([arrivee]));
    const l = Maillage._dijkstra(this.sommets.length, k => adj[k], depart, new Set(arrivee));
    if (!l) return null;
    const cle = a => a[0] < a[1] ? a[0] + ' ' + a[1] : a[1] + ' ' + a[0];
    const r = [depart.slice()], vues = new Set([cle(depart)]);
    for (const a of [...l.slice(1).map((j, k) => [l[k], j]), arrivee.slice()]) if (!vues.has(cle(a))) { vues.add(cle(a)); r.push(a); }
    return r;
  }

  // Dijkstra sur n nœuds : `voisins(u)` → [[v, poids], …] ; départ des `sources` (coût nul), arrêt au premier nœud de
  // `cibles` atteint ; renvoie la suite des nœuds depuis une source, ou null
  static _dijkstra(n, voisins, sources, cibles) {
    const dist = new Float64Array(n).fill(Infinity), prec = new Int32Array(n).fill(-1), tas = [];
    const monter = k => { while (k > 0) { const p = (k - 1) >> 1; if (tas[p][0] <= tas[k][0]) break; [tas[p], tas[k]] = [tas[k], tas[p]]; k = p; } };
    const descendre = k => {
      for (;;) {
        const g = 2 * k + 1, d = g + 1;
        let m = k;
        if (g < tas.length && tas[g][0] < tas[m][0]) m = g;
        if (d < tas.length && tas[d][0] < tas[m][0]) m = d;
        if (m === k) return;
        [tas[m], tas[k]] = [tas[k], tas[m]];
        k = m;
      }
    };
    for (const s of sources) { dist[s] = 0; tas.push([0, s]); monter(tas.length - 1); }
    while (tas.length) {
      const [du, u] = tas[0], fin = tas.pop();
      if (tas.length) { tas[0] = fin; descendre(0); }
      if (du > dist[u]) continue;
      if (cibles.has(u)) {
        const l = [];
        for (let k = u; k >= 0; k = prec[k]) l.unshift(k);
        return l;
      }
      for (const [v, w] of voisins(u)) {
        if (du + w < dist[v]) { dist[v] = du + w; prec[v] = u; tas.push([dist[v], v]); monter(tas.length - 1); }
      }
    }
    return null;
  }

  // Normale d'une face (méthode de Newell : tient compte de tout le polygone)
  normale(f) {
    let x = 0, y = 0, z = 0;
    const s = f.s;
    for (let k = 0; k < s.length; k++) {
      const a = this.sommets[s[k]], b = this.sommets[s[(k + 1) % s.length]];
      x += (a[1] - b[1]) * (a[2] + b[2]);
      y += (a[2] - b[2]) * (a[0] + b[0]);
      z += (a[0] - b[0]) * (a[1] + b[1]);
    }
    const l = Math.hypot(x, y, z) || 1;
    return [x / l, y / l, z / l];
  }

  // Découpe d'une face en triangles [[i, j, k], …], dans le sens de la face : oreilles successives dans le plan moyen
  // (Newell), ce qui convient aussi aux polygones concaves ; parmi les oreilles possibles, celle dont le plus petit
  // angle est le plus grand (triangles bien formés). Polygone trop tordu pour en trouver une : fin en éventail.
  trianguler(f) {
    const s = f.s, n = this.normale(f);
    if (s.length <= 3) return [s.slice()];
    // Repère du plan : u ⟂ n, v = n × u
    const ax = Math.abs(n[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0];
    let u = [n[1] * ax[2] - n[2] * ax[1], n[2] * ax[0] - n[0] * ax[2], n[0] * ax[1] - n[1] * ax[0]];
    const lu = Math.hypot(...u); u = u.map(c => c / lu);
    const v = [n[1] * u[2] - n[2] * u[1], n[2] * u[0] - n[0] * u[2], n[0] * u[1] - n[1] * u[0]];
    const p = new Map(s.map(i => { const q = this.sommets[i]; return [i, [q[0] * u[0] + q[1] * u[1] + q[2] * u[2], q[0] * v[0] + q[1] * v[1] + q[2] * v[2]]]; }));
    const croix = (a, b, c) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
    const angle = (a, b, c) => {
      const x = [b[0] - a[0], b[1] - a[1]], y = [c[0] - a[0], c[1] - a[1]];
      return Math.acos(Math.max(-1, Math.min(1, (x[0] * y[0] + x[1] * y[1]) / (Math.hypot(...x) * Math.hypot(...y) || 1))));
    };
    const reste = s.slice(), tris = [];
    let echelle = 0;
    for (const q of p.values()) echelle = Math.max(echelle, Math.abs(q[0]), Math.abs(q[1]));
    const eps = 1e-12 * (echelle * echelle || 1);
    while (reste.length > 3) {
      let meilleur = -1, note = -1;
      for (let k = 0; k < reste.length; k++) {
        const ia = reste[(k + reste.length - 1) % reste.length], ib = reste[k], ic = reste[(k + 1) % reste.length];
        const a = p.get(ia), b = p.get(ib), c = p.get(ic);
        if (croix(a, b, c) <= eps) continue;                          // coin rentrant ou plat
        const dedans = reste.some(j => j !== ia && j !== ib && j !== ic &&
          croix(a, b, p.get(j)) >= -eps && croix(b, c, p.get(j)) >= -eps && croix(c, a, p.get(j)) >= -eps);
        if (dedans) continue;
        const m = Math.min(angle(a, b, c), angle(b, c, a), angle(c, a, b));
        if (m > note) { note = m; meilleur = k; }
      }
      if (meilleur < 0) break;
      const k = meilleur;
      tris.push([reste[(k + reste.length - 1) % reste.length], reste[k], reste[(k + 1) % reste.length]]);
      reste.splice(k, 1);
    }
    for (let k = 1; k + 1 < reste.length; k++) tris.push([reste[0], reste[k], reste[k + 1]]);
    return tris;
  }

  // Retire des sommets (et les faces et arêtes libres qui les utilisent), renumérote le reste
  supprimerSommets(indices) {
    const retires = new Set(indices), nouveau = [], n = [];
    this.sommets.forEach((p, i) => { if (retires.has(i)) n.push(-1); else { n.push(nouveau.length); nouveau.push(p); } });
    this.sommets = nouveau;
    this.faces = this.faces.filter(f => f.s.every(i => !retires.has(i)));
    for (const f of this.faces) f.s = f.s.map(i => n[i]);
    this.fils = this.fils.filter(a => !retires.has(a[0]) && !retires.has(a[1])).map(a => a.map(i => n[i]));
    return n;                        // ancien indice → nouveau (−1 : supprimé)
  }

  // Fusionne des sommets en un seul, placé selon `cible` : 'centre' (position moyenne), 'premier' ou 'dernier' (position
  // du premier ou du dernier de `indices`) ; les faces dégénérées disparaissent. Renvoie la table ancien indice
  // → nouveau (les sommets fusionnés y ont tous l'indice du sommet gardé, `table[indices[0]]`).
  fusionner(indices, cible = 'centre') {
    if (indices.length < 2) return this.sommets.map((_, i) => i);
    const k = { premier: 0, dernier: indices.length - 1 }[cible], p = k === undefined ? null : this.sommets[indices[k]].slice();
    const n = this.reunir([indices]);
    if (p) this.sommets[n[indices[0]]] = p;
    return n;
  }

  // Chaque groupe de sommets [i, j, …] réuni en son premier, placé à leur position moyenne ; les faces dégénérées
  // disparaissent, les arêtes libres suivent. Renvoie la table ancien indice → nouveau (sommets réunis : celui du gardé).
  reunir(groupes) {
    const vers = this.sommets.map((_, i) => i), autres = [];
    for (const g of groupes) {
      if (g.length < 2) continue;
      const c = [0, 0, 0];
      for (const i of g) for (let k = 0; k < 3; k++) c[k] += this.sommets[i][k] / g.length;
      this.sommets[g[0]] = c;
      for (const i of g.slice(1)) { vers[i] = g[0]; autres.push(i); }
    }
    if (!autres.length) return vers;
    for (const f of this.faces) {
      f.s = f.s.map(i => vers[i]).filter((i, k, s) => i !== s[(k + 1) % s.length]);   // doublons voisins
    }
    this.faces = this.faces.filter(f => new Set(f.s).size >= 3);
    this.fils = this.fils.map(a => a.map(i => vers[i]));
    this.nettoyerFils();
    const n = this.supprimerSommets(autres);
    for (const i of autres) n[i] = n[vers[i]];
    return n;
  }

  // Sommets `indices` (tous par défaut) distants d'au plus `tolerance`, de proche en proche, réunis à leur position
  // moyenne (voir reunir) ; `groupe(i)` facultatif : seuls les sommets d'un même groupe (objet) se réunissent.
  // Grille de cellules de la taille de la tolérance : chaque sommet n'est comparé qu'aux 27 cellules voisines.
  // Renvoie { table, groupes, retires } (sans réunion : table identité, 0, 0).
  fusionnerProches(indices = this.sommets.map((_, i) => i), tolerance = 1e-4, groupe = () => 0) {
    const pas = tolerance > 0 ? tolerance : 1, t2 = tolerance * tolerance, grille = new Map();
    const parent = new Map(indices.map(i => [i, i])), racine = i => parent.get(i) === i ? i : (parent.set(i, racine(parent.get(i))), parent.get(i));
    const cellule = p => p.map(x => Math.floor(x / pas));
    for (const i of indices) {
      const p = this.sommets[i], [cx, cy, cz] = cellule(p), g = groupe(i);
      for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) for (let dz = -1; dz <= 1; dz++) {
        for (const j of grille.get((cx + dx) + ' ' + (cy + dy) + ' ' + (cz + dz)) || []) {
          const q = this.sommets[j];
          if (groupe(j) !== g || (p[0] - q[0]) ** 2 + (p[1] - q[1]) ** 2 + (p[2] - q[2]) ** 2 > t2) continue;
          const a = racine(i), b = racine(j);
          if (a !== b) parent.set(Math.max(a, b), Math.min(a, b));
        }
      }
      const cle = cx + ' ' + cy + ' ' + cz;
      if (!grille.has(cle)) grille.set(cle, []);
      grille.get(cle).push(i);
    }
    const parRacine = new Map();
    for (const i of [...indices].sort((a, b) => a - b)) {
      const r = racine(i);
      if (!parRacine.has(r)) parRacine.set(r, []);
      parRacine.get(r).push(i);
    }
    const groupes = [...parRacine.values()].filter(g => g.length > 1);
    return { table: this.reunir(groupes), groupes: groupes.length, retires: groupes.reduce((n, g) => n + g.length - 1, 0) };
  }

  // Révolution (« spin ») autour de l'axe passant par `centre`, de direction `axe` (unitaire), sur `angle` degrés
  // (signe : sens de rotation, règle de la main droite) en `segments` pas. Chaque sommet de `sommets` et des arêtes
  // `aretes` est recopié à chaque pas (sauf sur l'axe : il reste unique) ; un sommet seul (hors des arêtes) donne un
  // arc d'arêtes libres, une arête une bande de quadrilatères (triangles contre l'axe). `fermer` (tour complet) : le
  // dernier pas retombe sur les sommets d'origine, sans couture. Faces orientées de proche en proche le long du
  // profil : à l'opposé d'une face existante qui borde le profil, sinon vers l'extérieur de l'axe. `materiau` des
  // faces nouvelles. Renvoie { faces, fils, copies } (copies : sommet d'origine → ses indices au pas 0 … segments).
  revolution(sommets, aretes, { centre = [0, 0, 0], axe = [0, 1, 0], angle = 360, segments = 16, fermer = true, materiau = 'defaut' } = {}) {
    const u = new THREE.Vector3().fromArray(axe).normalize(), o = new THREE.Vector3().fromArray(centre);
    const ferme = fermer && Math.abs(Math.abs(angle) - 360) < 1e-9, pas = angle / segments * Math.PI / 180;
    const tourne = (p, a) => new THREE.Vector3().fromArray(p).sub(o).applyAxisAngle(u, a).add(o);
    const surAxe = p => { const d = new THREE.Vector3().fromArray(p).sub(o); return d.sub(u.clone().multiplyScalar(d.dot(u))).length() < 1e-9; };
    const copies = new Map(), extremites = new Set(aretes.flat());
    for (const i of new Set([...sommets, ...extremites])) {
      const p = this.sommets[i], l = [i], fixe = surAxe(p);
      for (let k = 1; k <= segments; k++) {
        if (fixe || (ferme && k === segments)) l.push(i);
        else l.push(this.sommets.push(tourne(p, pas * k).toArray()) - 1);
      }
      copies.set(i, l);
    }
    const fils = [], faces = [];
    for (const i of new Set(sommets)) {
      if (extremites.has(i)) continue;
      const l = copies.get(i);
      for (let k = 0; k < segments; k++) if (l[k] !== l[k + 1]) fils.push([l[k], l[k + 1]]);
    }
    // Profil orienté de proche en proche : chaque composante d'arêtes reliées, sens [a, b] de chacune
    const cle = (i, j) => i < j ? i + ' ' + j : j + ' ' + i, sens = new Map(), voisines = new Map();
    for (const [i, j] of aretes) for (const s of [i, j]) { if (!voisines.has(s)) voisines.set(s, []); voisines.get(s).push([i, j]); }
    const dirigees = new Set();
    for (const f of this.faces) f.s.forEach((i, k) => dirigees.add(i + '>' + f.s[(k + 1) % f.s.length]));
    for (const depart of aretes) {
      if (sens.has(cle(...depart))) continue;
      const composante = [], file = [depart.slice()];
      sens.set(cle(...depart), file[0]);
      while (file.length) {
        const ab = file.pop(), [a, b] = ab;
        composante.push(ab);
        for (const [s, apres] of [[b, true], [a, false]]) for (const [i, j] of voisines.get(s)) {
          if (sens.has(cle(i, j))) continue;
          const autre = i === s ? j : i, ab = apres ? [s, autre] : [autre, s];
          sens.set(cle(i, j), ab);
          file.push(ab);
        }
      }
      // Face existante le long du profil : sens opposé au sien ; sinon, normale vers l'extérieur de l'axe
      let score = 0;
      for (const [a, b] of composante) {
        if (dirigees.has(a + '>' + b)) score -= 1e9;
        else if (dirigees.has(b + '>' + a)) score += 1e9;
        else {
          const pa = new THREE.Vector3().fromArray(this.sommets[a]), pb = new THREE.Vector3().fromArray(this.sommets[b]);
          const m = pa.clone().add(pb).multiplyScalar(0.5), d = tourne(m.toArray(), pas).sub(m);
          const radial = m.clone().sub(o), n = pb.clone().sub(pa).cross(d);
          score += n.dot(radial.sub(u.clone().multiplyScalar(radial.dot(u))));
        }
      }
      if (score < 0) for (const ab of composante) ab.reverse();
    }
    for (const ab of sens.values()) {
      const ca = copies.get(ab[0]), cb = copies.get(ab[1]);
      for (let k = 0; k < segments; k++) {
        const s = [ca[k], cb[k], cb[k + 1], ca[k + 1]].filter((i, n, t) => i !== t[(n + 1) % t.length]);
        if (new Set(s).size >= 3) faces.push({ s, m: materiau });
      }
    }
    this.faces.push(...faces);
    this.fils.push(...fils);
    this.nettoyerFils();
    return { faces, fils, copies };
  }

  // Contour d'un ensemble de faces réunies en une seule : { s: [i, j, …], plane } ou { erreur }. Les faces doivent
  // être connexes par leurs arêtes (une face qui ne touche les autres que par un sommet, ou pas du tout, est isolée),
  // orientées dans le même sens, et former un seul polygone sans trou. Les sommets du contour sont tous gardés
  // (alignés compris) : les faces voisines les partagent. `plane` : faux si les faces ne sont pas dans un même plan.
  contourFaces(faces) {
    if (faces.length < 2) return { erreur: 'Sélectionnez au moins 2 faces' };
    const cle = (i, j) => i < j ? i + ' ' + j : j + ' ' + i;
    const parArete = new Map(), dirigees = new Set();
    for (const [n, f] of faces.entries()) {
      for (let k = 0; k < f.s.length; k++) {
        const i = f.s[k], j = f.s[(k + 1) % f.s.length], d = i + '>' + j;
        if (dirigees.has(d)) return { erreur: 'Faces d’orientations opposées : inversez-en' };
        dirigees.add(d);
        const c = cle(i, j);
        if (!parArete.has(c)) parArete.set(c, []);
        parArete.get(c).push(n);
      }
    }
    // Connexité par les arêtes partagées (union-find)
    const parent = faces.map((_, n) => n), racine = n => parent[n] === n ? n : (parent[n] = racine(parent[n]));
    for (const l of parArete.values()) {
      if (l.length > 2) return { erreur: 'Une arête est partagée par plus de 2 faces' };
      if (l.length === 2) parent[racine(l[0])] = racine(l[1]);
    }
    if (faces.some((_, n) => racine(n) !== racine(0))) return { erreur: 'Faces non connexes : au moins une est isolée' };
    // Bord : arêtes dirigées dont l'opposée n'est pas dans l'ensemble
    const suivant = new Map();
    for (const d of dirigees) {
      const [i, j] = d.split('>').map(Number);
      if (dirigees.has(j + '>' + i)) continue;
      if (suivant.has(i)) return { erreur: 'Les faces se touchent par un sommet seulement : contour non simple' };
      suivant.set(i, j);
    }
    if (!suivant.size) return { erreur: 'Surface fermée : pas de contour' };
    const depart = faces[0].s.find(i => suivant.has(i)) ?? suivant.keys().next().value, s = [depart];
    for (let i = suivant.get(depart); i !== depart; i = suivant.get(i)) {
      if (i === undefined || s.length > suivant.size) return { erreur: 'Contour ouvert' };
      s.push(i);
    }
    if (s.length < suivant.size) return { erreur: 'La réunion entourerait un trou' };
    const f = { s }, n = this.normale(f), o = this.sommets[s[0]];
    let ecart = 0, taille = 0;
    for (const i of s) {
      const p = this.sommets[i], d = [p[0] - o[0], p[1] - o[1], p[2] - o[2]];
      ecart = Math.max(ecart, Math.abs(d[0] * n[0] + d[1] * n[1] + d[2] * n[2]));
      taille = Math.max(taille, Math.hypot(...d));
    }
    return { s, plane: ecart <= 1e-4 * (taille || 1) };
  }

  // Coupe chaque arête [[i, j], …] en `coupes` + 1 segments égaux : nouveaux sommets ajoutés à la fin, insérés
  // dans toutes les faces qui la bordent, dans le sens de chacune (faces modifiées sur place : mêmes objets).
  // Renvoie Map « i j » (i < j) → indices des nouveaux sommets, de i vers j.
  subdiviser(aretes, coupes = 1) {
    const nouveaux = new Map(), cle = (i, j) => i < j ? i + ' ' + j : j + ' ' + i;
    for (const [a, b] of aretes) {
      const i = Math.min(a, b), j = Math.max(a, b), c = cle(i, j);
      if (nouveaux.has(c) || i === j) continue;
      const p = this.sommets[i], q = this.sommets[j], l = [];
      for (let k = 1; k <= coupes; k++) {
        const t = k / (coupes + 1);
        l.push(this.sommets.length);
        this.sommets.push(p.map((x, d) => x + (q[d] - x) * t));
      }
      nouveaux.set(c, l);
    }
    for (const f of this.faces) {
      const s = [];
      f.s.forEach((a, k) => {
        const b = f.s[(k + 1) % f.s.length], l = nouveaux.get(cle(a, b));
        s.push(a);
        if (l) s.push(...(a < b ? l : l.slice().reverse()));
      });
      f.s = s;
    }
    // Arête libre coupée : remplacée par ses morceaux
    this.fils = this.fils.flatMap(([a, b]) => {
      const l = nouveaux.get(cle(a, b));
      if (!l) return [[a, b]];
      const c = [Math.min(a, b), ...l, Math.max(a, b)];
      return c.slice(1).map((j, k) => [c[k], j]);
    });
    return nouveaux;
  }

  // Anneau d'arêtes (boucle de coupe) à partir de l'arête [i, j] : de quadrilatère en quadrilatère, par l'arête
  // opposée, dans les deux sens, jusqu'à une face qui n'en est pas un, un bord, une arête à plus de deux faces, ou le
  // retour à l'arête de départ. Renvoie { rails: [[a, b], …] (côté a d'un même côté de l'anneau), quads, depart (indice
  // de [i, j] dans rails), ferme } ou null si l'arête ne borde aucun quadrilatère.
  anneau(i, j) {
    const cle = (a, b) => a < b ? a + ' ' + b : b + ' ' + a, bordees = new Map();
    for (const f of this.faces) f.s.forEach((a, k) => {
      const c = cle(a, f.s[(k + 1) % f.s.length]);
      if (!bordees.has(c)) bordees.set(c, []);
      bordees.get(c).push(f);
    });
    const depart = bordees.get(cle(i, j)) || [];
    if (depart.length > 2 || !depart.some(f => f.s.length === 4)) return null;
    // Autre voisin de `a` dans le quadrilatère f (que `b`)
    const voisin = (f, a, b) => { const k = f.s.indexOf(a), u = f.s[(k + 1) % 4]; return u === b ? f.s[(k + 3) % 4] : u; };
    const vus = new Set();
    let ferme = false;
    // Marche depuis le rail [a, b] à travers f ; renvoie [rails, quads] rencontrés après le départ
    const marcher = (a, b, f) => {
      const rails = [], quads = [];
      while (f && f.s.length === 4 && !vus.has(f)) {
        vus.add(f);
        quads.push(f);
        [a, b] = [voisin(f, a, b), voisin(f, b, a)];
        if (cle(a, b) === cle(i, j)) { ferme = true; break; }
        const l = bordees.get(cle(a, b)), g = l.length === 2 ? (l[0] === f ? l[1] : l[0]) : null;
        // Anneau qui revient sur un quadrilatère déjà coupé ailleurs : arrêt avant celui-ci (il aurait trois rails)
        if (g && vus.has(g)) { quads.pop(); break; }
        rails.push([a, b]);
        f = g;
      }
      return [rails, quads];
    };
    const [r1, q1] = marcher(i, j, depart[0]);
    let rails = [[i, j], ...r1], quads = q1, d = 0;
    if (!ferme && depart[1]) {
      const [r2, q2] = marcher(i, j, depart[1]);
      rails = [...r2.reverse(), ...rails];
      quads = [...q2.reverse(), ...quads];
      d = r2.length;
    }
    return { rails, quads, depart: d, ferme };
  }

  // Boucle de coupe le long de l'anneau `an` (voir anneau) : `coupes` boucles régulières ; `glissement` ∈ ]−1, 1[
  // les resserre vers le côté a (négatif) ou b (positif) de chaque rail ; `uniforme` : même distance le long de chaque
  // rail que sur le rail de départ (forme de la boucle voisine gardée), comptée depuis le côté b avec `inverser`.
  // Quadrilatères de l'anneau découpés en bandes (sens gardé, même matériau) ; une face au bout d'un anneau ouvert
  // reçoit les nouveaux sommets sur son arête. Renvoie les arêtes des nouvelles boucles [[i, j], …].
  couperBoucle(an, coupes = 1, glissement = 0, uniforme = false, inverser = false) {
    const cle = (a, b) => a < b ? a + ' ' + b : b + ' ' + a, L = (a, b) => Math.hypot(...[0, 1, 2].map(k => this.sommets[b][k] - this.sommets[a][k]));
    const g = Math.max(-0.99, Math.min(0.99, glissement));
    const ts = Array.from({ length: coupes }, (_, k) => {
      const t = (k + 1) / (coupes + 1);
      return g > 0 ? t + g * (1 - t) : t + g * t;
    });
    const [i0, j0] = an.rails[an.depart], l0 = L(i0, j0);
    const nouveaux = new Map();   // clé du rail → { a, l : nouveaux sommets de a vers b }
    for (const [a, b] of an.rails) {
      const p = this.sommets[a], q = this.sommets[b], l = L(a, b), ids = [];
      for (const t of ts) {
        // Uniforme : distance du rail de départ, bornée au rail ; inverser : comptée depuis b
        let u = t;
        if (uniforme && l > 0) u = Math.min(0.999, Math.max(0.001, inverser ? 1 - (1 - t) * l0 / l : t * l0 / l));
        ids.push(this.sommets.length);
        this.sommets.push(p.map((x, d) => x + (q[d] - x) * u));
      }
      nouveaux.set(cle(a, b), { a, l: ids });
    }
    const depuis = (a, b) => { const n = nouveaux.get(cle(a, b)); return n && (n.a === a ? n.l : n.l.slice().reverse()); };
    const quads = new Set(an.quads), aretes = [], faces = [];
    for (const f of this.faces) {
      const s = f.s;
      // Quadrilatère de l'anneau : ses deux rails opposés (s0 → s1 et s3 → s2), bandes de c0 à c3
      const k = quads.has(f) ? [0, 1].find(k => depuis(s[k], s[k + 1]) && depuis(s[(k + 3) % 4], s[(k + 2) % 4])) : undefined;
      if (k !== undefined) {
        const [p0, p1, p2, p3] = [0, 1, 2, 3].map(d => s[(k + d) % 4]);
        const c0 = [p0, ...depuis(p0, p1), p1], c3 = [p3, ...depuis(p3, p2), p2];
        for (let m = 0; m + 1 < c0.length; m++) faces.push({ s: [c0[m], c0[m + 1], c3[m + 1], c3[m]], m: f.m });
        for (let m = 1; m + 1 < c0.length; m++) aretes.push([c0[m], c3[m]]);
        continue;
      }
      const t = [];
      s.forEach((a, n) => { t.push(a); const l = depuis(a, s[(n + 1) % s.length]); if (l) t.push(...l); });
      f.s = t;
      faces.push(f);
    }
    this.faces = faces;
    return aretes;
  }

  // Dissolution d'arêtes [[i, j], …] : chacune doit border exactement deux faces ; les faces reliées par ces arêtes
  // forment des groupes, réunis chacun en une face par contourFaces (sens des faces conservé, arêtes communes non
  // choisies dissoutes aussi). Renvoie { groupes: [{ faces, s, plane }] } ou { erreur }.
  dissolution(aretes) {
    if (!aretes.length) return { erreur: 'Sélectionnez au moins une arête' };
    const cle = (i, j) => i < j ? i + ' ' + j : j + ' ' + i, bordees = new Map();
    for (const f of this.faces) {
      for (let k = 0; k < f.s.length; k++) {
        const c = cle(f.s[k], f.s[(k + 1) % f.s.length]);
        if (!bordees.has(c)) bordees.set(c, []);
        bordees.get(c).push(f);
      }
    }
    const parent = new Map(), racine = f => parent.get(f) === f ? f : racine(parent.get(f));
    for (const [i, j] of aretes) {
      const l = bordees.get(cle(i, j)) || [];
      if (l.length < 2) return { erreur: 'Arête de bord : une seule face, rien à dissoudre' };
      if (l.length > 2) return { erreur: 'Une arête est partagée par plus de 2 faces' };
      if (l[0] === l[1]) return { erreur: 'Arête bordée deux fois par la même face' };
      for (const f of l) if (!parent.has(f)) parent.set(f, f);
      parent.set(racine(l[0]), racine(l[1]));
    }
    // Groupes dans l'ordre des faces du maillage (la première de chaque groupe donne départ et matériau)
    const groupes = new Map();
    for (const f of this.faces) {
      if (!parent.has(f)) continue;
      const r = racine(f);
      if (!groupes.has(r)) groupes.set(r, []);
      groupes.get(r).push(f);
    }
    const r = [];
    for (const faces of groupes.values()) {
      const c = this.contourFaces(faces);
      if (c.erreur) return c;
      r.push({ faces, s: c.s, plane: c.plane });
    }
    return { groupes: r };
  }

  // Sommets à la même position (à `tolerance` près) réunis : les fichiers STL et glTF les répètent
  souder(tolerance = 1e-5) {
    const deja = new Map(), n = [], sommets = [];
    const q = c => Math.round(c / tolerance);
    for (const p of this.sommets) {
      const cle = q(p[0]) + ' ' + q(p[1]) + ' ' + q(p[2]);
      let i = deja.get(cle);
      if (i === undefined) { i = sommets.length; sommets.push(p); deja.set(cle, i); }
      n.push(i);
    }
    this.sommets = sommets;
    for (const f of this.faces) f.s = f.s.map(i => n[i]).filter((i, k, s) => i !== s[(k + 1) % s.length]);
    this.faces = this.faces.filter(f => new Set(f.s).size >= 3);
    this.fils = this.fils.map(a => a.map(i => n[i]));
    return this.nettoyerFils();
  }

  // Boîte englobante { min: [x, y, z], max: [x, y, z] } (null si vide)
  boite() {
    if (!this.sommets.length) return null;
    const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
    for (const p of this.sommets) for (let k = 0; k < 3; k++) { min[k] = Math.min(min[k], p[k]); max[k] = Math.max(max[k], p[k]); }
    return { min, max };
  }

  // ----- Lecture --------------------------------------------------------------------------------------
  // D'après l'extension du nom de fichier ; `contenu` : texte ou ArrayBuffer
  static depuisFichier(nom, contenu) {
    const ext = (nom.match(/\.([a-z0-9]+)(\?|#|$)/i) || [])[1];
    const e = ext ? ext.toLowerCase() : '';
    const texte = () => typeof contenu === 'string' ? contenu : new TextDecoder().decode(contenu);
    const octets = () => typeof contenu === 'string' ? new TextEncoder().encode(contenu).buffer : contenu;
    if (e === 'obj') return Maillage.depuisOBJ(texte());
    if (e === 'stl') return Maillage.depuisSTL(octets());
    if (e === 'gltf' || e === 'glb') return Maillage.depuisGLTF(octets());
    throw new Error('format non pris en charge : ' + (ext || nom) + ' (OBJ, STL, glTF, GLB)');
  }

  // Indices d'une ligne « f » ou « l » de l'OBJ (« 12/5/7 » → 11 ; négatifs : depuis la fin)
  static _indicesOBJ(t, n) {
    const s = [];
    for (let k = 1; k < t.length; k++) {
      const v = parseInt(t[k], 10);
      if (!isNaN(v)) s.push(v < 0 ? n + v : v - 1);
    }
    return s;
  }

  // Polyligne « l » → arêtes libres [[i, j], …]
  static _filsOBJ(s) { return s.slice(1).map((j, k) => [s[k], j]).filter(([i, j]) => i !== j); }

  // Lignes lues : v, f (formats « 1 », « 1/2 », « 1/2/3 », « 1//3 », indices négatifs), l (arêtes libres), usemtl.
  static depuisOBJ(texte, materiauParDefaut = 'defaut') {
    const sommets = [], faces = [], fils = [];
    let m = materiauParDefaut;
    for (const brute of texte.split(/\r?\n/)) {
      const ligne = brute.trim();
      if (!ligne || ligne[0] === '#') continue;
      const t = ligne.split(/\s+/);
      if (t[0] === 'v') sommets.push([+t[1], +t[2], +t[3]]);
      else if (t[0] === 'usemtl') m = t[1] || materiauParDefaut;
      else if (t[0] === 'f') {
        const s = Maillage._indicesOBJ(t, sommets.length);
        if (s.length >= 3) faces.push({ s, m });
      } else if (t[0] === 'l') fils.push(...Maillage._filsOBJ(Maillage._indicesOBJ(t, sommets.length)));
    }
    return new Maillage(sommets, faces, fils.filter(a => a.every(i => sommets[i]))).nettoyerFils();
  }

  // OBJ à plusieurs objets → [{ nom, maillage }] : un par nom de « o » (à défaut de « o », de « g » ; mêmes noms
  // réunis), avec les sommets qu'utilisent ses faces, plus les sommets isolés déclarés dans son bloc. Indices
  // renumérotés par objet, coordonnées inchangées (au monde). Fichier sans « o » ni « g » : un seul objet.
  static objetsDepuisOBJ(texte, materiauParDefaut = 'defaut') {
    const lignes = texte.split(/\r?\n/).map(l => l.trim()).filter(l => l && l[0] !== '#');
    const cle = lignes.some(l => /^o(\s|$)/.test(l)) ? 'o' : 'g';
    const sommets = [], parNom = new Map(), utilises = new Set();
    let m = materiauParDefaut, courant = null;
    const objet = nom => {
      if (!parNom.has(nom)) parNom.set(nom, { nom, faces: [], fils: [], declares: [] });
      return parNom.get(nom);
    };
    for (const ligne of lignes) {
      const t = ligne.split(/\s+/);
      if (t[0] === cle) courant = objet(t.slice(1).join(' ') || 'objet');
      else if (t[0] === 'v') { sommets.push([+t[1], +t[2], +t[3]]); if (courant) courant.declares.push(sommets.length - 1); }
      else if (t[0] === 'usemtl') m = t[1] || materiauParDefaut;
      else if (t[0] === 'f') {
        const s = Maillage._indicesOBJ(t, sommets.length);
        if (s.length < 3) continue;
        (courant || (courant = objet('objet'))).faces.push({ s, m });
        for (const i of s) utilises.add(i);
      } else if (t[0] === 'l') {
        const l = Maillage._filsOBJ(Maillage._indicesOBJ(t, sommets.length));
        (courant || (courant = objet('objet'))).fils.push(...l);
        for (const a of l) for (const i of a) utilises.add(i);
      }
    }
    const liste = [];
    for (const o of parNom.values()) {
      const local = new Map(), mm = new Maillage();
      const prendre = i => {
        if (!local.has(i)) { local.set(i, mm.sommets.length); mm.sommets.push(sommets[i].slice()); }
        return local.get(i);
      };
      for (const f of o.faces) mm.faces.push({ s: f.s.filter(i => sommets[i]).map(prendre), m: f.m });
      for (const a of o.fils) if (a.every(i => sommets[i])) mm.fils.push(a.map(prendre));
      for (const i of o.declares) if (!utilises.has(i)) prendre(i);
      mm.faces = mm.faces.filter(f => f.s.length >= 3);
      mm.nettoyerFils();
      if (mm.sommets.length) liste.push({ nom: o.nom, maillage: mm });
    }
    if (!parNom.size && sommets.length) liste.push({ nom: 'objet', maillage: new Maillage(sommets, []) });
    return liste;
  }

  // STL binaire ou texte, sommets soudés. `zEnHaut` : (x, y, z) du fichier → (x, z, −y)
  static depuisSTL(donnees, { materiau = 'defaut', zEnHaut = true } = {}) {
    const vue = new DataView(donnees), t = [];
    const n = donnees.byteLength >= 84 ? vue.getUint32(80, true) : -1;
    if (n >= 0 && 84 + n * 50 === donnees.byteLength) {
      for (let k = 0; k < n; k++) {
        const o = 84 + k * 50 + 12;                // 12 octets de normale, ignorée (recalculée)
        for (let c = 0; c < 9; c++) t.push(vue.getFloat32(o + c * 4, true));
      }
    } else {
      const texte = new TextDecoder().decode(donnees), re = /vertex\s+(\S+)\s+(\S+)\s+(\S+)/g;
      let r;
      while ((r = re.exec(texte))) t.push(+r[1], +r[2], +r[3]);
    }
    const sommets = [], faces = [];
    for (let k = 0; k + 2 < t.length; k += 3) sommets.push(zEnHaut ? [t[k], t[k + 2], -t[k + 1]] : [t[k], t[k + 1], t[k + 2]]);
    for (let k = 0; k + 2 < sommets.length; k += 3) faces.push({ s: [k, k + 1, k + 2], m: materiau });
    return new Maillage(sommets, faces).souder(1e-4);
  }

  // glTF 2.0 : .glb, ou .gltf dont les tampons sont intégrés (« data: ») ; les fichiers .bin séparés ne sont
  // pas lisibles ici. Toutes les primitives triangulaires de la scène, transformations des nœuds appliquées.
  static depuisGLTF(donnees) {
    const u8 = new Uint8Array(donnees), vue = new DataView(donnees);
    let json, bin = null;
    if (vue.byteLength >= 12 && vue.getUint32(0, true) === 0x46546C67) {          // « glTF »
      let o = 12;
      while (o + 8 <= vue.byteLength) {
        const lg = vue.getUint32(o, true), type = vue.getUint32(o + 4, true), d = u8.subarray(o + 8, o + 8 + lg);
        if (type === 0x4E4F534A) json = JSON.parse(new TextDecoder().decode(d));   // « JSON »
        else if (type === 0x004E4942) bin = d;                                      // « BIN »
        o += 8 + lg;
      }
    } else json = JSON.parse(new TextDecoder().decode(u8));
    if (!json) throw new Error('glTF illisible');

    const tampons = (json.buffers || []).map((b, i) => {
      if (b.uri && b.uri.startsWith('data:')) {
        const s = atob(b.uri.slice(b.uri.indexOf(',') + 1)), d = new Uint8Array(s.length);
        for (let k = 0; k < s.length; k++) d[k] = s.charCodeAt(k);
        return d;
      }
      if (i === 0 && bin) return bin;
      throw new Error('glTF : tampon externe « ' + (b.uri || '?') + ' » non pris en charge (utiliser un .glb)');
    });
    const TAILLES = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 };
    const lire = n => {
      const a = json.accessors[n], bv = json.bufferViews[a.bufferView], t = tampons[bv.buffer];
      const nc = TAILLES[a.type], dv = new DataView(t.buffer, t.byteOffset + (bv.byteOffset || 0) + (a.byteOffset || 0));
      const lg = { 5120: 1, 5121: 1, 5122: 2, 5123: 2, 5125: 4, 5126: 4 }[a.componentType];
      const pas = bv.byteStride || nc * lg, r = [];
      const lit = {
        5120: o => dv.getInt8(o), 5121: o => dv.getUint8(o), 5122: o => dv.getInt16(o, true),
        5123: o => dv.getUint16(o, true), 5125: o => dv.getUint32(o, true), 5126: o => dv.getFloat32(o, true)
      }[a.componentType];
      for (let i = 0; i < a.count; i++) for (let c = 0; c < nc; c++) r.push(lit(i * pas + c * lg));
      return r;
    };

    const m = new Maillage(), mat4 = new THREE.Matrix4(), v = new THREE.Vector3();
    const noeud = (i, parent) => {
      const nd = json.nodes[i], local = new THREE.Matrix4();
      if (nd.matrix) local.fromArray(nd.matrix);
      else local.compose(new THREE.Vector3(...(nd.translation || [0, 0, 0])),
        new THREE.Quaternion(...(nd.rotation || [0, 0, 0, 1])), new THREE.Vector3(...(nd.scale || [1, 1, 1])));
      const monde = parent.clone().multiply(local);
      if (nd.mesh !== undefined) {
        for (const p of json.meshes[nd.mesh].primitives) {
          const mode = p.mode ?? 4;
          if (mode < 4 || p.attributes.POSITION === undefined) continue;   // points et lignes ignorés
          const pos = lire(p.attributes.POSITION), base = m.sommets.length;
          for (let k = 0; k < pos.length; k += 3) {
            v.set(pos[k], pos[k + 1], pos[k + 2]).applyMatrix4(monde);
            m.sommets.push([v.x, v.y, v.z]);
          }
          const idx = p.indices !== undefined ? lire(p.indices) : Array.from({ length: pos.length / 3 }, (_, k) => k);
          const mt = p.material !== undefined ? ((json.materials || [])[p.material] || {}).name || 'materiau' + p.material : 'defaut';
          const tri = (a, b, c) => m.faces.push({ s: [base + a, base + b, base + c], m: mt });
          if (mode === 4) for (let k = 0; k + 2 < idx.length; k += 3) tri(idx[k], idx[k + 1], idx[k + 2]);
          else if (mode === 5) for (let k = 0; k + 2 < idx.length; k++) k % 2 ? tri(idx[k + 1], idx[k], idx[k + 2]) : tri(idx[k], idx[k + 1], idx[k + 2]);
          else for (let k = 1; k + 1 < idx.length; k++) tri(idx[0], idx[k], idx[k + 1]);
        }
      }
      for (const e of nd.children || []) noeud(e, monde);
    };
    if (!json.nodes) json.nodes = (json.meshes || []).map((_, i) => ({ mesh: i }));   // sans nœuds : maillages tels quels
    const scene = (json.scenes || [])[json.scene || 0];
    for (const r of (scene && scene.nodes) || json.nodes.map((_, i) => i)) noeud(r, mat4);
    return m.souder();
  }

  // Un seul maillage fait de plusieurs (copiés, indices décalés) : export d'une scène en STL ou GLB
  // Un maillage par matériau des faces, dans l'ordre de première apparition : [{ m, maillage }] ; chacun ne garde
  // que les sommets de ses faces (les sommets isolés vont avec le premier)
  parMateriau() {
    const groupes = new Map();
    for (const f of this.faces) {
      if (!groupes.has(f.m)) groupes.set(f.m, []);
      groupes.get(f.m).push(f);
    }
    if (groupes.size < 2) return [{ m: this.faces.length ? this.faces[0].m : 'defaut', maillage: this.clone() }];
    // Arêtes libres : avec le premier maillage, et leurs sommets s'ils ne servent à aucune face
    const utilises = new Set(this.faces.flatMap(f => f.s));
    return [...groupes].map(([m, faces], n) => {
      const r = new Maillage(), nouveau = new Map();
      const prendre = i => {
        if (!nouveau.has(i)) { nouveau.set(i, r.sommets.length); r.sommets.push(this.sommets[i].slice()); }
        return nouveau.get(i);
      };
      if (n === 0) this.sommets.forEach((_, i) => { if (!utilises.has(i)) prendre(i); });
      for (const f of faces) r.faces.push({ s: f.s.map(prendre), m });
      if (n === 0) r.fils = this.fils.map(a => a.map(prendre));
      return { m, maillage: r };
    });
  }

  static reunir(liste) {
    const r = new Maillage();
    for (const m of liste) {
      const base = r.sommets.length;
      for (const p of m.sommets) r.sommets.push(p.slice());
      for (const f of m.faces) r.faces.push({ s: f.s.map(i => i + base), m: f.m });
      for (const a of m.fils || []) r.fils.push(a.map(i => i + base));
    }
    return r;
  }

  // ----- Écriture -------------------------------------------------------------------------------------
  // OBJ de plusieurs objets [{ nom, maillage }] : un « o » chacun, numérotation des sommets commune
  // `mtllib` : fichier .mtl des matériaux (voir versMTL), annoncé en tête
  static objetsVersOBJ(liste, titre = 'scene', mtllib) {
    const l = ['# ' + titre + ' — exporté par MeshCraft'];
    if (mtllib) l.push('mtllib ' + mtllib);
    let base = 0;
    for (const { nom, maillage } of liste) {
      const o = maillage.versOBJ(nom).split('\n').slice(1).filter(Boolean);
      for (const ligne of o) l.push(/^[fl] /.test(ligne) ? ligne[0] + ' ' + ligne.slice(2).split(' ').map(i => +i + base).join(' ') : ligne);
      base += maillage.sommets.length;
    }
    return l.join('\n') + '\n';
  }

  versOBJ(nom = 'maillage', mtllib) {
    const l = ['# ' + nom + ' — exporté par MeshCraft'];
    if (mtllib) l.push('mtllib ' + mtllib);
    l.push('o ' + nom.replace(/\s+/g, '_'));
    for (const p of this.sommets) l.push('v ' + p.map(c => +c.toFixed(6)).join(' '));
    let m = null;
    for (const f of this.faces) {
      if (f.m !== m) { m = f.m; l.push('usemtl ' + m); }
      l.push('f ' + f.s.map(i => i + 1).join(' '));
    }
    for (const [i, j] of this.fils) l.push('l ' + (i + 1) + ' ' + (j + 1));
    return l.join('\n') + '\n';
  }

  // STL binaire, Z vers le haut (inverse de la lecture)
  versSTL(nom = 'maillage') {
    const tri = [];
    for (const l of this.triangles().values()) for (const i of l) tri.push(i);
    const n = tri.length / 3, d = new ArrayBuffer(84 + n * 50), vue = new DataView(d);
    const entete = new TextEncoder().encode((nom + ' — GDA').slice(0, 79));
    new Uint8Array(d).set(entete, 0);
    vue.setUint32(80, n, true);
    const z = p => [p[0], -p[2], p[1]];
    for (let t = 0; t < n; t++) {
      const a = z(this.sommets[tri[t * 3]]), b = z(this.sommets[tri[t * 3 + 1]]), c = z(this.sommets[tri[t * 3 + 2]]);
      const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], w = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
      const nn = [u[1] * w[2] - u[2] * w[1], u[2] * w[0] - u[0] * w[2], u[0] * w[1] - u[1] * w[0]];
      const ln = Math.hypot(...nn) || 1, o = 84 + t * 50;
      [...nn.map(x => x / ln), ...a, ...b, ...c].forEach((x, k) => vue.setFloat32(o + k * 4, x, true));
    }
    return d;
  }

  // Bibliothèque de matériaux Wavefront (.mtl) : { nom: { couleur: '#rrggbb', … } } → texte ; champs absents omis
  // (voir Maillage.MTL)
  static versMTL(materiaux, titre = 'materiaux') {
    const l = ['# ' + titre + ' — exporté par MeshCraft'];
    for (const [nom, m] of Object.entries(materiaux)) {
      l.push('', 'newmtl ' + nom);
      for (const [cle, mot, type] of Maillage.MTL) {
        const v = m[cle];
        if (v === undefined || v === null) continue;
        l.push(mot + ' ' + (type === 'rvb' ? Maillage._rvb(v).map(c => +c.toFixed(4)).join(' ') : type === 'entier' ? Math.round(v) : +(+v).toFixed(4)));
      }
    }
    return l.join('\n') + '\n';
  }

  // Lecture d'un .mtl : { materiaux: { nom: { couleur: '#rrggbb', … } }, textures: nombre de lignes map_… ignorées }.
  // Couleurs en r g b (0 à 1, bornées) ; « Tr » (transparence) devient l'opacité 1 − Tr si « d » manque.
  static depuisMTL(texte) {
    const materiaux = {}, hex = c => '#' + c.map(v => Math.round(Math.min(1, Math.max(0, v)) * 255).toString(16).padStart(2, '0')).join('');
    let m = null, textures = 0;
    for (const brute of texte.split(/\r?\n/)) {
      const t = brute.trim().split(/\s+/), mot = t[0];
      if (mot === 'newmtl') { m = materiaux[brute.trim().slice(6).trim() || 'materiau'] = {}; continue; }
      if (!m || !mot || mot[0] === '#') continue;
      if (/^(map_|bump|disp|decal|refl|norm)/i.test(mot)) { textures++; continue; }
      if (mot === 'Tr' && m.opacite === undefined) { const v = parseFloat(t[1]); if (Number.isFinite(v)) m._tr = 1 - v; continue; }
      const champ = Maillage.MTL.find(c => c[1] === mot);
      if (!champ) continue;
      const [cle, , type] = champ;
      if (type === 'rvb') {
        const c = t.slice(1, 4).map(parseFloat);
        if (c.length && c.every(Number.isFinite)) m[cle] = hex(c.length === 3 ? c : [c[0], c[0], c[0]]);
      } else {
        const v = parseFloat(t[1]);
        if (Number.isFinite(v)) m[cle] = type === 'entier' ? Math.round(v) : v;
      }
    }
    for (const x of Object.values(materiaux)) {
      if (x.opacite === undefined && x._tr !== undefined) x.opacite = x._tr;
      delete x._tr;
    }
    return { materiaux, textures };
  }

  // '#rrggbb' → [r, g, b] entre 0 et 1 (gris clair si illisible)
  static _rvb(hex) {
    const m = /^#?([0-9a-f]{6})$/i.exec(hex || '');
    if (!m) return [0.8, 0.8, 0.8];
    const n = parseInt(m[1], 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255].map(v => v / 255);
  }

  // glTF binaire (.glb) : un nœud, une primitive par matériau, sans normales (les lecteurs glTF calculent alors
  // des normales de facette, ce qui convient au style du moteur). `materiaux` : { nom: '#rrggbb' ou { couleur,
  // emission, opacite } } facultatif (glTF veut des couleurs linéaires, d'où la conversion depuis sRGB)
  versGLB(nom = 'maillage', materiaux = {}) {
    const groupes = [...this.triangles()].filter(([, l]) => l.length);
    const nv = this.sommets.length, lgPos = nv * 12;
    const lgIdx = groupes.reduce((s, [, l]) => s + l.length * 4, 0);
    const bin = new ArrayBuffer(lgPos + lgIdx), f32 = new Float32Array(bin, 0, nv * 3), u32 = new Uint32Array(bin, lgPos);
    const b = this.boite() || { min: [0, 0, 0], max: [0, 0, 0] };
    this.sommets.forEach((p, i) => f32.set(p, i * 3));
    const json = {
      asset: { version: '2.0', generator: 'GDA' }, scene: 0, scenes: [{ nodes: [0] }],
      nodes: [{ mesh: 0, name: nom }], meshes: [{ name: nom, primitives: [] }], materials: [],
      buffers: [{ byteLength: bin.byteLength }],
      bufferViews: [{ buffer: 0, byteOffset: 0, byteLength: lgPos, target: 34962 }],
      accessors: [{ bufferView: 0, componentType: 5126, count: nv, type: 'VEC3',
        min: b.min.map(c => Math.fround(c)), max: b.max.map(c => Math.fround(c)) }]
    };
    let o = 0;
    groupes.forEach(([m, l], k) => {
      u32.set(l, o / 4);
      json.bufferViews.push({ buffer: 0, byteOffset: lgPos + o, byteLength: l.length * 4, target: 34963 });
      json.accessors.push({ bufferView: k + 1, componentType: 5125, count: l.length, type: 'SCALAR' });
      const lin = v => v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4), lineaire = h => Maillage._rvb(h).map(v => +lin(v).toFixed(5));
      const d = typeof materiaux[m] === 'string' ? { couleur: materiaux[m] } : materiaux[m] || {};
      const opacite = Number.isFinite(d.opacite) ? Math.min(1, Math.max(0, d.opacite)) : 1;
      const mat = { name: m, pbrMetallicRoughness: { baseColorFactor: (d.couleur ? lineaire(d.couleur) : [0.8, 0.8, 0.8]).concat(opacite), metallicFactor: 0, roughnessFactor: 0.9 } };
      if (opacite < 1) mat.alphaMode = 'BLEND';
      if (d.emission && d.emission !== '#000000') mat.emissiveFactor = lineaire(d.emission);
      json.materials.push(mat);
      json.meshes[0].primitives.push({ attributes: { POSITION: 0 }, indices: k + 1, material: k, mode: 4 });
      o += l.length * 4;
    });
    // Assemblage : en-tête 12 octets, morceau JSON (complété d'espaces), morceau BIN (complété de zéros)
    const js = new TextEncoder().encode(JSON.stringify(json));
    const pad4 = n => (n + 3) & ~3, lj = pad4(js.length), lb = pad4(bin.byteLength);
    const total = 12 + 8 + lj + 8 + lb, d = new ArrayBuffer(total), vue = new DataView(d), u8 = new Uint8Array(d);
    vue.setUint32(0, 0x46546C67, true); vue.setUint32(4, 2, true); vue.setUint32(8, total, true);
    vue.setUint32(12, lj, true); vue.setUint32(16, 0x4E4F534A, true);
    u8.fill(0x20, 20, 20 + lj); u8.set(js, 20);
    vue.setUint32(20 + lj, lb, true); vue.setUint32(24 + lj, 0x004E4942, true);
    u8.set(new Uint8Array(bin), 28 + lj);
    return d;
  }
}

// Champs d'un matériau Wavefront (.mtl) lus et écrits : [clé, mot du .mtl, type]. Les textures (map_…) ne sont pas
// encore prises en charge.
Maillage.MTL = [
  ['couleur', 'Kd', 'rvb'], ['ambiante', 'Ka', 'rvb'], ['speculaire', 'Ks', 'rvb'], ['emission', 'Ke', 'rvb'],
  ['brillance', 'Ns', 'nombre'], ['opacite', 'd', 'nombre'], ['refraction', 'Ni', 'nombre'], ['illumination', 'illum', 'entier']
];

window.Maillage = Maillage;
