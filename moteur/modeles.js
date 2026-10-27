// moteur/modeles.js — géométries pour three.js : lecture des fichiers Wavefront OBJ et STL, contours « dessin animé »,
// dégradés en paliers (MeshToonMaterial) et damiers. Nécessite lib/three.min.js (variable globale THREE).
//
//   const geo = await Modeles.charger('modeles/echecs/roi.obj');   // BufferGeometry à facettes
//   geo.userData.materiaux      → ['blancs', 'HARDblack', …]   noms « usemtl », dans l'ordre des groupes
//   new THREE.Mesh(geo, geo.userData.materiaux.map(n => mesMateriaux[n]));
//   const bord = new THREE.Mesh(Modeles.contour(geo, 1.2), Modeles.materiauContour('#16121f'));
//   new THREE.MeshToonMaterial({ color, gradientMap: Modeles.paliers(4, 0.25) });   // 4 tons, ombre à 25 %
//   const pion = await Modeles.charger('modeles/echecs/pawn.stl');   // STL (binaire ou texte), Z vers le haut
//
// Les faces OBJ sont tournées dans le sens trigonométrique vu de l'extérieur (convention de three.js).

const Modeles = {
  // Lecture des fichiers : Maillage (maillage.js) ; ici, la géométrie three.js qui en résulte.
  // Résultat : géométrie non indexée à normales de facette (aspect « à facettes »), un groupe par matériau.
  // La version indexée, aux normales lissées, reste dans userData.lisse (elle sert au contour).
  depuisOBJ(texte, materiauParDefaut = 'defaut') {
    return Maillage.depuisOBJ(texte, materiauParDefaut).geometrie();
  },

  // STL binaire ou texte (un seul matériau). `zEnHaut` (par défaut, convention de Blender et de l'impression 3D) :
  // l'axe Z du fichier devient l'axe Y de three.js, (x, y, z) → (x, z, −y).
  depuisSTL(donnees, options) {
    return Maillage.depuisSTL(donnees, options).geometrie();
  },

  // Sommets [x, y, z, …] + Map matériau → indices de triangles : géométrie à facettes (et sa version lissée)
  _geometrie(sommets, parMateriau) {
    const lisse = new THREE.BufferGeometry(), index = [], materiaux = [];
    lisse.setAttribute('position', new THREE.Float32BufferAttribute(sommets, 3));
    for (const [nom, liste] of parMateriau) {
      lisse.addGroup(index.length, liste.length, materiaux.length);
      materiaux.push(nom);
      for (const v of liste) index.push(v);
    }
    lisse.setIndex(index);
    lisse.computeVertexNormals();
    const geo = lisse.toNonIndexed();
    geo.computeVertexNormals();                   // sans index : une normale par facette
    geo.computeBoundingSphere();
    geo.computeBoundingBox();
    geo.userData = { materiaux, lisse };
    return geo;
  },

  // Charge un fichier OBJ ou STL, d'après son extension (promesse). Penser à l'ajouter à la liste SHELL du
  // service worker (hors ligne). Pour un STL, `materiauParDefaut` peut aussi être { materiau, zEnHaut }.
  charger(url, materiauParDefaut) {
    const stl = /\.stl(\?|#|$)/i.test(url);
    return fetch(url).then(r => {
      if (!r.ok) throw new Error(url + ' : ' + r.status);
      return stl ? r.arrayBuffer() : r.text();
    }).then(d => stl
      ? Modeles.depuisSTL(d, materiauParDefaut && typeof materiauParDefaut === 'object' ? materiauParDefaut : { materiau: materiauParDefaut })
      : Modeles.depuisOBJ(d, materiauParDefaut));
  },

  // Coque du contour : la surface gonflée de `epaisseur` (unités du modèle) le long des normales lissées.
  // Dessinée face arrière seulement, elle ne dépasse qu'autour de la silhouette (« inverted hull »).
  contour(geo, epaisseur) {
    const lisse = (geo.userData && geo.userData.lisse) || geo;
    const g = new THREE.BufferGeometry();
    const p = lisse.getAttribute('position'), n = lisse.getAttribute('normal'), q = new Float32Array(p.count * 3);
    for (let k = 0; k < p.count; k++) {
      q[k * 3] = p.getX(k) + n.getX(k) * epaisseur;
      q[k * 3 + 1] = p.getY(k) + n.getY(k) * epaisseur;
      q[k * 3 + 2] = p.getZ(k) + n.getZ(k) * epaisseur;
    }
    g.setAttribute('position', new THREE.BufferAttribute(q, 3));
    if (lisse.index) g.setIndex(lisse.index);
    g.computeBoundingSphere();
    return g;
  },

  materiauContour(couleur) {
    return new THREE.MeshBasicMaterial({ color: couleur, side: THREE.BackSide });
  },

  // Dégradé de `n` paliers pour MeshToonMaterial (gradientMap) : éclairage en aplats, sans transition.
  // `ombre` : profondeur de l'ombre, ton du palier le plus sombre (0 : noir, 1 : aucune ombre) ; les autres paliers
  // se répartissent également jusqu'à la pleine lumière. Un seul palier : la couleur pleine, sans relief.
  paliers(n = 3, ombre = 0.25) {
    const d = new Uint8Array(n * 4);
    for (let k = 0; k < n; k++) {
      const v = Math.round(255 * (n === 1 ? 1 : ombre + (1 - ombre) * k / (n - 1)));
      d.set([v, v, v, 255], k * 4);
    }
    const t = new THREE.DataTexture(d, n, 1, THREE.RGBAFormat);
    t.minFilter = t.magFilter = THREE.NearestFilter;
    t.generateMipmaps = false;
    t.needsUpdate = true;
    return t;
  },

  // Texture en damier `cases` × `cases` (pixels nets), couleurs CSS ou THREE.Color
  damier(cases, c1, c2) {
    const a = new THREE.Color(c1), b = new THREE.Color(c2), d = new Uint8Array(cases * cases * 4);
    const octets = c => [c.r, c.g, c.b].map(v => Math.round(THREE.MathUtils.clamp(v, 0, 1) * 255));
    const ca = octets(a.clone().convertLinearToSRGB()), cb = octets(b.clone().convertLinearToSRGB());
    for (let j = 0; j < cases; j++) for (let i = 0; i < cases; i++) d.set([...((i + j) % 2 ? cb : ca), 255], (j * cases + i) * 4);
    const t = new THREE.DataTexture(d, cases, cases, THREE.RGBAFormat);
    t.colorSpace = THREE.SRGBColorSpace;
    t.minFilter = t.magFilter = THREE.NearestFilter;
    t.generateMipmaps = false;
    t.needsUpdate = true;
    return t;
  }
};

window.Modeles = Modeles;
