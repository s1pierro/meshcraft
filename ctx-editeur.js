// ctx-editeur.js — onglet « Éditeur » : scène de plusieurs objets, chacun un maillage (moteur/maillage.js) muni
// d'une position, d'une rotation (quaternion) et d'une échelle (facteurs selon ses axes), et édition bas niveau de la
// géométrie d'un objet.
// Formats : OBJ, STL, glTF / GLB en lecture (fichier du téléphone ou modèle du projet) et en écriture ; projet .gda
// (JSON, toute la scène sans perte, voir ED_FORMAT) en lecture et en écriture.
//
// Deux modes (interrupteur en haut à gauche, sous le menu de navigation), état de l'éditeur :
// · Scène : appui sur un objet = le (dé)sélectionner (le dernier choisi est l'objet actif) ; appui long = lui seul,
//   ailleurs = tout désélectionner ; double appui sur un objet = éditer sa géométrie. La poignée, les axes, le pivot,
//   les champs X / Y / Z et le panneau « dernière opération » agissent sur les origines des objets choisis.
// · Géométrie : les objets choisis (ou l'actif seul) sont modifiables ensemble, les autres sont estompés et inertes.
//   Leurs maillages sont réunis en une copie de travail au monde (voir _ouvrirEdition), chaque sommet restant à son
//   objet (`proprio`), et rangés dans le repère de chaque objet à chaque sauvegarde, avec leur sélection.
// Filtres de sélection (à droite de Scène / Géométrie, en mode Géométrie) : sommets, arêtes, faces ; appui = ce type
// seul, appui long = l'ajouter ou le retirer (cumulables, au moins un) ; l'appui cherche un sommet, puis une arête, puis une face, parmi les types permis. La sélection
// (`this.sel`, moteur/selection.js) distingue les trois types : choisir une face ne choisit ni ses arêtes ni ses
// sommets, mais la poignée déplace tous les sommets concernés ; chaque menu agit sur les éléments de son type.
// Éteindre un filtre met de côté les éléments choisis de ce type (ni dessinés, ni déplacés, ni opérés) ; le rallumer les rend. Seuls les éléments choisis directement sont marqués :
// sommets (et leurs numéros d'ordre), arêtes (bandes épaisses), faces (teintées).
// L'annulation couvre les deux modes : chaque étape mémorise toute la scène et le mode.
//
// Fichier, Aide et Réglages : pastilles à icône seule en haut à gauche, à côté du menu de navigation réduit.
// Chacune ouvre son contenu dans le panneau latéral partagé (panneau.js : un seul à la fois, à onglets, contenu
// défilant), qui prend la droite de l'écran en paysage, le bas en portrait : l'espace de travail (`.ed-espace`) se
// réduit d'autant. Fichier : Projet, Importer, Exporter ; Aide : ED_AIDE ; Réglages : Couleurs (ED_COULEURS, propres
// à l'éditeur, `state.couleurs` ne garde que les couleurs changées).
// Menus d'opérations (boutons en haut à droite) : Scène (toujours), Objets (mode Scène : dont l'origine des
// objets choisis), Faces, Arêtes, Sommets (mode Géométrie). Chacun ouvre une carte
// d'actions, rassemblées par rubrique, grisées quand la sélection ne s'y prête pas.
//
// Modifieurs (bouton à clé, à côté des menus d'opérations, mode Scène ; à la façon de Blender), affichés dans le
// panneau latéral : une pile par objet, appliquée dans l'ordre à son maillage, sans le
// modifier (le mode Géométrie édite le maillage de base). Répétition : copies décalées (en fraction de la taille de
// l'objet, ou en distance), éventuellement unies. Booléen : différence, union ou intersection avec un autre objet, la
// « cible » (bibliothèque Manifold, chargée à la première demande), affichée en fil de fer tant qu'elle sert.
// « Appliquer » fige un modifieur dans le maillage de base. Les exports prennent les maillages modifiés.
//
// Panneau des objets (à droite) : les objets rangés par sets (« main set » par défaut, toujours présent), chacun
// précédé d'un œil de visibilité (un objet caché, ou dont le set est caché, n'est ni affiché ni touchable).
// Appui sur un objet = le choisir comme dans la vue ; appui long = menu des sets, pour l'y déplacer ;
// ＋ Set en ajoute un, ⋯ d'un set : renommer, fusionner dans un autre set, supprimer (avec ou sans ses objets).
//
// Mode Géométrie — gestes : appui sur un sommet, une arête ou une face = le (dé)sélectionner (lui seul, pas ses
// sommets) · glisser depuis la sélection = la transformer · appui long sur un élément = lui seul ; ailleurs = tout désélectionner · glisser ailleurs = tourner · pincer = zoom
// et déplacement de la vue · trois doigts = déplacer la vue · double appui dans le vide = recadrer.
// Mode de sélection Boîte (ED_SELECTIONS, interrupteur en tête de la barre d'outils) : un doigt hors poignée trace
// un rectangle (_selectionBoite, visibilité par le tampon logiciel ed_profondeurs sauf en Rayons X), deux doigts
// tournent la vue et pincent pour zoomer, trois la déplacent. Mode Chemin : appui = plus court chemin depuis l'actif.
// Barre d'outils en haut à gauche : interrupteur translation / rotation / échelle, axes autorisés X / Y / Z, et en
// rotation et en échelle le point pivot (chevron : point médian, centre de la boîte, élément actif, curseur 3D, origine).
// Translation, poignée au centre de la sélection : glisser l'extrémité d'un axe = déplacer le long de cet axe ;
// glisser l'origine (ou un sommet sélectionné) = déplacer selon les axes cochés (trois : face à l'écran,
// deux : dans leur plan, un : le long de l'axe). Par pas (demi-carreau de la grille, ou valeur réglée) si le pas est actif.
// Rotation, poignée au pivot : glisser un anneau = tourner autour de cet axe ; l'anneau blanc (trois axes cochés),
// le pivot ou un sommet sélectionné = autour de l'axe de vue (trois axes) ou de l'axe coché le plus face à l'écran.
// Angle : celui balayé par le doigt autour du pivot, par pas (15° par défaut) si le pas est actif.
// Échelle, poignée au pivot : glisser le cube d'un axe = étirer le long de cet axe ; l'anneau blanc, le pivot ou un
// sommet sélectionné = selon les axes cochés. Facteur : rapport des distances du doigt au pivot (fin et départ),
// par pas (0,1 par défaut) si le pas est actif. En mode Scène, l'échelle est appliquée aux maillages des objets.
// Au lâcher, un panneau « dernière opération » (comme dans Blender) résume la transformation sous les champs X / Y / Z :
// décalage, ou angle, axe et pivot, modifiables ; la transformation est alors refaite depuis l'état de départ.
// Il disparaît à la modification suivante (ou à l'annulation).
// Curseur 3D (anneau rayé et réticule) : point de repère où « Sommets → Ajouter » crée un sommet ; son menu déroulant le
// place (sur la sélection, l'origine, le centre du modèle ou de la vue) ou y amène la sélection ou la vue.
// Une face se crée à partir des sommets sélectionnés, dans l'ordre de sélection (numéros affichés) :
// sens inverse des aiguilles d'une montre vu de l'extérieur. L'envers des faces est teinté (--hot-color).

const ED_MODELES = [
  'pion.obj', 'tour.obj', 'cavalier.obj', 'fou.obj', 'dame.obj', 'roi.obj',
  'pawn.stl', 'rook.stl', 'knight.stl', 'bishop.stl', 'queen.stl', 'king.stl'
].map(f => 'modeles/echecs/' + f).concat('modeles/squelette.obj');
const ED_HISTOIRE = 60;               // étapes d'annulation conservées
const ED_RAYON = 28;                  // distance (px) de capture d'un sommet sous le doigt
const ED_POIGNEE = 90;                // longueur (px) des axes de la poignée à l'écran
const ED_AXES = ['x', 'y', 'z'];
const ED_CURSEUR = 22;
// Groupes de la barre d'accès rapide (_acces), dans l'ordre de l'onglet Réglages › Barre rapide : [id, rubrique]
const ED_ACCES = [
  ['ajout', 'Scène, aucun objet choisi'], ['objet', 'Objets choisis'], ['scene', 'Scène, toujours'],
  ['l', 'Géométrie : élément actif'], ['f', 'Faces sélectionnées'], ['a', 'Arêtes sélectionnées'], ['s', 'Sommets sélectionnés'],
  ['geo', 'Géométrie, toujours'], ['vue', 'Vue et curseur 3D (les deux modes)']
];
// Pas (incrément) des transformations, réglables (appui long sur le bouton Pas) : translation (null : la moitié d'un
// carreau de la grille, qui suit la taille de la scène), angle en degrés, facteur d'échelle
const ED_PAS = { translation: null, angle: 15, echelle: 0.1 };
// Points pivots de la rotation : [identifiant, libellé, pictogramme]
const ED_PIVOTS = [
  ['median', 'Point médian', 'iconoir--box-3d-three-points'],
  ['boite', 'Centre de la boîte', 'iconoir--box-3d-center'],
  ['actif', 'Élément actif', 'iconoir--select-point-3d'],
  ['curseur', 'Curseur 3D', 'curseur'],
  ['origine', 'Origine', 'lucide--move-3d']
];
// Filtres de sélection du mode Géométrie : [clé, libellé, pictogramme]
const ED_FILTRES = [
  ['sommets', 'Sommets', 'iconoir--select-point-3d'],
  ['aretes', 'Arêtes', 'iconoir--select-edge-3d'],
  ['faces', 'Faces', 'iconoir--select-face-3d']
];
const ED_TYPES = { sommets: 's', aretes: 'a', faces: 'f' };   // filtre → type d'élément de SelectionMaillage
// Couleurs de l'éditeur, réglables dans le panneau Réglages (onglet Couleurs) : [clé, libellé, groupe, défaut].
// Défaut : '#rrggbb' ; '--variable' du thème général ; '@clé' d'une couleur précédente ; ['@clé', '#rrggbb', t] :
// mélange (t = part de la seconde). Les clés « --… » redéfinissent les variables générales dans l'éditeur seul ;
// les autres deviennent des variables CSS « --ed-<clé> » et colorent aussi la scène 3D (voir _couleurs).
const ED_COULEURS = [
  ['--accent-color', 'Accent', 'Interface', '--accent-color'],
  ['--hot-color', 'Relief', 'Interface', '--hot-color'],
  ['--background-color', 'Fond', 'Interface', '--background-color'],
  ['--surface-color', 'Panneaux et boutons', 'Interface', '--surface-color'],
  ['--navbar-footer-color', 'Pastilles', 'Interface', '--navbar-footer-color'],
  ['--border-color', 'Bordures', 'Interface', '--border-color'],
  ['--text-color', 'Texte', 'Interface', '--text-color'],
  ['--inactive-color', 'Texte secondaire', 'Interface', '--inactive-color'],
  ['fond-centre', 'Fond (centre)', 'Vue 3D', '@--surface-color'],
  ['fond-bord', 'Fond (bords)', 'Vue 3D', '@--background-color'],
  ['grille', 'Grille', 'Vue 3D', '@--inactive-color'],
  ['axe-x', 'Axe X', 'Vue 3D', '#d03b3b'],
  ['axe-y', 'Axe Y', 'Vue 3D', '#2f9a3a'],
  ['axe-z', 'Axe Z', 'Vue 3D', '#3b62d6'],
  ['poignee', 'Centre de la poignée', 'Vue 3D', '@--accent-color'],
  ['curseur', 'Curseur 3D', 'Vue 3D', '@--hot-color'],
  ['reticule', 'Réticule du curseur', 'Vue 3D', '@--text-color'],
  ['face', 'Faces', 'Géométrie', '#d4d0e2'],
  ['envers', 'Envers des faces', 'Géométrie', '@--hot-color'],
  ['arete', 'Arêtes', 'Géométrie', '@--text-color'],
  ['sommet', 'Sommets', 'Géométrie', '@--text-color'],
  ['face-choisie', 'Faces', 'Sélection (géométrie)', ['@--accent-color', '#ffffff', 0.35]],
  ['arete-choisie', 'Arêtes', 'Sélection (géométrie)', '@--accent-color'],
  ['sommet-choisi', 'Sommets', 'Sélection (géométrie)', '@--accent-color'],
  ['numero', 'Numéros d’ordre', 'Sélection (géométrie)', '@--accent-color'],
  ['objet', 'Objets', 'Objets (mode Scène)', '@face'],
  ['objet-choisi', 'Objets choisis', 'Objets (mode Scène)', ['@--accent-color', '#ffffff', 0.6]],
  ['objet-actif', 'Objet actif', 'Objets (mode Scène)', ['@--accent-color', '#ffffff', 0.3]],
  ['contour-choisi', 'Silhouette des objets choisis', 'Objets (mode Scène)', '@--accent-color'],
  ['origine', 'Origines', 'Objets (mode Scène)', '@--hot-color'],
  ['cible', 'Cible d’un booléen', 'Objets (mode Scène)', '@--hot-color']
];

// Couleurs résolues (Map clé → '#rrggbb') d'après les choix `perso` ({ clé: '#rrggbb' }) et le thème général
function ed_resoudreCouleurs(perso = {}) {
  const r = new Map(), racine = getComputedStyle(document.documentElement), c = new THREE.Color();
  const lire = v => {
    try { c.setStyle(v); } catch (e) { c.set('#888888'); }
    return '#' + c.getHexString();
  };
  const valeur = d => {
    if (Array.isArray(d)) return '#' + new THREE.Color(valeur(d[0])).lerp(new THREE.Color(valeur(d[1])), d[2]).getHexString();
    if (d.startsWith('@')) return r.get(d.slice(1)) || '#888888';
    if (d.startsWith('--')) return lire(racine.getPropertyValue(d).trim() || '#888888');
    return lire(d);
  };
  for (const [cle, , , defaut] of ED_COULEURS) r.set(cle, /^#[0-9a-f]{6}$/i.test(perso[cle] || '') ? perso[cle].toLowerCase() : valeur(defaut));
  return r;
}

// Onglets de l'aide (panneau Aide) : [identifiant, libellé] ; les rubriques y sont rangées par _aide()
const ED_AIDE = [['scene', 'Scène'], ['geometrie', 'Géométrie'], ['transformer', 'Transformer'], ['interface', 'Interface']];

const ED_BANDE = 4;                   // épaisseur (px) des arêtes sélectionnées
const ED_SILHOUETTE = 3;              // épaisseur (px) de la silhouette des objets choisis (mode Scène)
const ED_SVG_CURSEUR = '<circle cx="12" cy="12" r="6.5" stroke-dasharray="5.1 5.1"/><path d="M12 2v5M12 17v5M2 12h5M17 12h5"/>';                // rayon (px) du curseur 3D à l'écran
const ED_SET = 'main set';           // nom du premier set, celui par défaut, qui ne se supprime pas
const ED_ICONES = 'icons/';           // pictogrammes du menu du curseur (affichés par uiPic, à lister dans SHELL)
const ED_MODIFS = {
  repetition: { titre: 'Répétition', signe: '⁂', defaut: () => ({ n: 3, relatif: true, decalage: [1.2, 0, 0], unir: false }) },
  booleen: { titre: 'Booléen', signe: '◐', defaut: () => ({ op: 'difference', cible: '' }) }
};
// Modes de rendu de la vue (sélecteur en tête de la boîte Scène / Géométrie) : [identifiant, libellé, pictogramme]
// et modes où il est proposé : Rayons X sert à éditer la géométrie, En jeu à voir la scène ; changer de mode ramène
// en Solide un rendu qui n'y est pas proposé
const ED_RENDUS = [['solide', 'Solide', 'rendu-solide', ['scene', 'geometrie']], ['rayons', 'Rayons X', 'rendu-rayons', ['geometrie']],
  ['jeu', 'En jeu', 'rendu-jeu', ['scene']]];
// Modes de sélection (sélecteur en tête de la barre d'outils) : [identifiant, libellé, pictogramme]. Boîte : un
// doigt trace un rectangle (ajoute à la sélection, ou retire avec le bouton ＋ / −), deux doigts tournent la vue et
// pincent pour zoomer, trois doigts la déplacent ; sans Rayons X, seul ce qui est visible est pris. Chemin (mode
// Géométrie) : l'élément touché est relié à l'élément actif, du même type, par le plus court chemin (Maillage.chemin)
const ED_SELECTIONS = [['toucher', 'Toucher', 'selection-toucher'], ['boite', 'Boîte', 'selection-boite'],
  ['chemin', 'Chemin', 'selection-chemin']];
// Direction vers la lumière : en rendu En jeu, soleil fixe de la scène (repère du monde) ; en Solide et Rayons X,
// lampe qui suit la caméra (repère de la caméra, +z vers l'œil : un peu au-dessus et à gauche de la vue), si bien
// que toute face tournée vers l'œil est éclairée
const ED_SOLEIL = [0.4, 1, 0.8];
const ED_LAMPE = [-0.35, 0.45, 1];
// Matériaux : un seul par objet (un modèle fait de plusieurs matières est fait de plusieurs maillages), rangés par
// nom dans la bibliothèque du projet (this.materiaux), partagée entre les objets. Réglages : ceux du format Wavefront
// .mtl (Maillage.MTL, textures exceptées) — diffuse Kd, ambiante Ka, spéculaire Ks, émission Ke, brillance Ns,
// opacité d, réfraction Ni, modèle d'éclairage illum. Le rendu « En jeu » montre Kd, Ke, d et illum 0 ; les autres
// sont gardés et exportés. Les paliers d'éclairage (paramètres de rendu du moteur) n'en font pas partie.
// Le matériau par défaut existe toujours et ne se renomme ni ne se supprime.
const ED_DEFAUT = 'defaut';
const ED_MTL = 'materiaux.mtl';       // bibliothèque annoncée par les OBJ exportés (« mtllib »)
const ED_MATERIAU = { couleur: '#c9c3d8', ambiante: '#000000', speculaire: '#000000', emission: '#000000', brillance: 10, opacite: 1, refraction: 1, illumination: 1 };
// Modèles d'éclairage « illum » du .mtl (0 : couleur seule, sans éclairage, aussi dans le rendu En jeu)
const ED_ILLUM = [
  'Couleur seule, sans éclairage', 'Diffuse et ambiante', 'Avec reflets spéculaires', 'Reflets et réflexion (lancer de rayons)',
  'Verre : transparence et réflexion', 'Réflexion de Fresnel', 'Réfraction', 'Réfraction et Fresnel',
  'Réflexion sans lancer de rayons', 'Verre sans lancer de rayons', 'Ombres portées sur des surfaces invisibles'
];
// Couleurs données tour à tour aux nouveaux matériaux (créés ou importés)
const ED_TEINTES = ['#d9a066', '#7fae6e', '#6e93c9', '#c9736e', '#b08cc9', '#d9cf6e', '#6ec9c0', '#9a9a9a'];
const ed_hex = v => /^#[0-9a-f]{6}$/i.test(v || '') ? v.toLowerCase() : null;

// Géométrie de la silhouette d'un maillage (matériau silhouette) : une bande par arête, de deux triangles, dont les
// sommets portent l'autre extrémité (autre), leur côté (cote) et les normales des deux faces de l'arête (n1, n2 ;
// n2 nulle si l'arête n'a qu'une face ou en a plus de deux : toujours tracée)
function ed_silhouette(mm) {
  const normale = f => {                // méthode de Newell (polygones quelconques)
    const n = [0, 0, 0];
    for (let k = 0; k < f.s.length; k++) {
      const p = mm.sommets[f.s[k]], q = mm.sommets[f.s[(k + 1) % f.s.length]];
      n[0] += (p[1] - q[1]) * (p[2] + q[2]); n[1] += (p[2] - q[2]) * (p[0] + q[0]); n[2] += (p[0] - q[0]) * (p[1] + q[1]);
    }
    const l = Math.hypot(...n) || 1;
    return n.map(v => v / l);
  };
  const aretes = new Map();
  for (const f of mm.faces) {
    const n = normale(f);
    for (let k = 0; k < f.s.length; k++) {
      const i = f.s[k], j = f.s[(k + 1) % f.s.length], cle = i < j ? i + ' ' + j : j + ' ' + i;
      if (!aretes.has(cle)) aretes.set(cle, { i, j, n: [] });
      aretes.get(cle).n.push(n);
    }
  }
  const bp = [], ba = [], bc = [], b1 = [], b2 = [], bi = [];
  for (const { i, j, n } of aretes.values()) {
    const p = mm.sommets[i], q = mm.sommets[j], n1 = n[0], n2 = n.length === 2 ? n[1] : [0, 0, 0], v = bp.length / 3;
    bp.push(...p, ...p, ...q, ...q);
    ba.push(...q, ...q, ...p, ...p);
    bc.push(1, -1, -1, 1);
    for (let k = 0; k < 4; k++) { b1.push(...n1); b2.push(...n2); }
    bi.push(v, v + 1, v + 2, v + 1, v + 3, v + 2);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(bp, 3));
  g.setAttribute('autre', new THREE.Float32BufferAttribute(ba, 3));
  g.setAttribute('cote', new THREE.Float32BufferAttribute(bc, 1));
  g.setAttribute('n1', new THREE.Float32BufferAttribute(b1, 3));
  g.setAttribute('n2', new THREE.Float32BufferAttribute(b2, 3));
  g.setIndex(bi);
  return g;
}

// Réglages du pas lus (sauvegarde, saisie) : bornés ; hors bornes, la valeur de `defaut`
function ed_pas(p, defaut = ED_PAS) {
  const n = (v, min, max, def) => (typeof v === 'number' && isFinite(v) && v >= min && v <= max ? v : def);
  return { actif: !!p.actif, translation: p.translation == null ? null : n(p.translation, 1e-6, 1e6, null),
    angle: n(p.angle, 0.1, 180, defaut.angle), echelle: n(p.echelle, 0.001, 10, defaut.echelle) };
}

// Matériau lu (sauvegarde, projet, .mtl) : champs connus seulement, bornés (contour, paliers et ombre de la v61
// oubliés) ; `couleur` : celle d'un matériau neuf
function ed_materiau(m, couleur) {
  m = m || {};
  const nombre = (v, d, min, max) => typeof v === 'number' && Number.isFinite(v) ? ed_borner(v, min, max) : d;
  const d = ED_MATERIAU;
  return {
    couleur: ed_hex(m.couleur) || couleur || d.couleur,
    ambiante: ed_hex(m.ambiante) || d.ambiante,
    speculaire: ed_hex(m.speculaire) || d.speculaire,
    emission: ed_hex(m.emission) || d.emission,
    brillance: nombre(m.brillance, d.brillance, 0, 1000),
    opacite: nombre(m.opacite, d.opacite, 0, 1),
    refraction: nombre(m.refraction, d.refraction, 0.001, 10),
    illumination: Math.round(nombre(m.illumination, d.illumination, 0, 10))
  };
}

// Menus d'opérations : [identifiant, libellé du bouton, modes où il apparaît]
// [identifiant, libellé, modes, pictogramme (icons/) : ceux des filtres de sélection pour la géométrie]
const ED_MENUS = [
  ['scene', 'Scène', ['scene', 'geometrie'], 'scene'],
  ['objets', 'Objets', ['scene'], 'iconoir--3d-select-solid'],
  ['faces', 'Faces', ['geometrie'], 'iconoir--select-face-3d'],
  ['aretes', 'Arêtes', ['geometrie'], 'iconoir--select-edge-3d'],
  ['sommets', 'Sommets', ['geometrie'], 'iconoir--select-point-3d']
];
// Primitives (menu Scène → Ajouter et Visserie, mode Scène seulement) : réglages dans le panneau latéral, aperçu
// mis à jour à chaque changement, puis ajout. `champs` : [{ cle, libelle, defaut, rubrique (intitulé posé avant le
// champ), classe (couleur d'axe), si(v) (affiché seulement si vrai ; caché, il ne compte pas) ; nombre > 0 (≥ 0 avec
// `zero`), entier de `min` à `max` avec `entier` (et multiple de `multiple`), une valeur de `choix` [[valeur,
// libellé]], ou un booléen dépliant avec `interrupteur` (son libellé) }], derniers réglages gardés dans
// state.primitives ; `creer(v)` → Maillage centré sur l'origine de l'objet ; `nom` : texte ou fonction des valeurs ;
// `verifier(v)` facultatif → { texte, erreur } (ligne d'information ; `erreur` grise Ajouter, sans aperçu) ;
// `remplir(v, cle)` facultatif → valeurs à écrire dans les champs après le changement de `cle` (choix, interrupteur) ;
// `recadrer` : vue cadrée sur le premier aperçu (visserie, en mm) ; `booleens(v)` : Manifold nécessaire (chargé avant
// l'aperçu et l'ajout)
const ED_FERMETURES = [['polygone', 'Polygone'], ['eventail', 'Éventail']];
const ed_virgule = x => String(Math.round(x * 1e4) / 1e4).replace('.', ',');
// Visserie : taille ISO, tête [valeur, libellé, abréviation], paramètres détaillés (repris de la taille par
// `remplir`), finesse du filet ; au-delà d'ED_VIS_MAX sommets, refusée
const ED_CHAMP_TAILLE = { rubrique: 'Taille ISO (pas gros ; 1 unité = 1 mm)', cle: 'taille', defaut: 'M8',
  choix: Object.keys(Visserie.TAILLES).map(t => [t, t]) };
const ED_TETES_VIS = [['hexagonale', 'Hexagonale', 'H'], ['cylindrique', 'Cylindrique', 'CHC'], ['fraisee', 'Fraisée', 'FHC']];
const ed_detail = v => v.detail, ed_iso = v => !v.detail;
const ED_CHAMP_DETAIL = { cle: 'detail', interrupteur: 'Paramètres détaillés', defaut: false };
const ED_DETAIL_FILET = [
  { rubrique: 'Filet (repris de la taille, puis libre : jeu pour l’impression 3D…)', cle: 'd', libelle: 'Diamètre extérieur', defaut: 8, si: ed_detail },
  { cle: 'p', libelle: 'Pas', defaut: 1.25, si: ed_detail },
  { cle: 'profondeur', libelle: 'Profondeur du filet', defaut: 0.6766, si: ed_detail },
  { cle: 'sommet', libelle: 'Épaisseur du sommet du filet', defaut: 0.15625, zero: true, si: ed_detail },
  { cle: 'gorge', libelle: 'Épaisseur de la gorge (fond)', defaut: 0.3125, zero: true, si: ed_detail }];
const ED_CHAMPS_FILET = [
  { rubrique: 'Maillage du filet', cle: 'segments', libelle: 'Segments par tour (multiple de 6)', defaut: 24, entier: true, min: 12, max: 96, multiple: 6 },
  { cle: 'rangs', libelle: 'Anneaux par pas', defaut: 8, entier: true, min: 4, max: 16, si: v => v.methode !== 'soustraction' }];
// Filet par soustraction d'un outil de coupe hélicoïdal (Manifold, chargé à la demande ; par défaut), ou par anneaux
const ED_CHAMP_METHODE = { rubrique: 'Méthode du filet', cle: 'methode', defaut: 'soustraction',
  choix: [['soustraction', 'Soustraction'], ['anneaux', 'Anneaux']] };
const ed_coupe = v => v.methode === 'soustraction';
const ED_VIS_MAX = 60000;
// Ligne d'information : cotes (`cotes(P)`, P = Visserie.parametres), nombre de sommets, ou ce qui empêche la pièce
const ed_verifierVis = (piece, v, cotes) => {
  const e = Visserie.probleme(piece, v), n = e ? 0 : Visserie.sommets(piece, v);
  const lourd = n > ED_VIS_MAX ? `trop lourde (plus de ${ED_VIS_MAX.toLocaleString('fr-FR')} sommets) : moins d’anneaux par pas ou de segments` : '';
  const tete = (v.detail ? 'Réglages détaillés' : v.taille) + ' : ';
  if (e) return { texte: tete + e, erreur: true };
  return { texte: tete + cotes(Visserie.parametres(piece, v)) + ` · ≈ ${n.toLocaleString('fr-FR')} sommets` + (lourd ? ' — ' + lourd : ''), erreur: !!lourd };
};
// Après un changement de taille, ou à l'ouverture des paramètres détaillés : ceux de la taille ISO
const ed_remplirVis = piece => (v, cle) => cle === 'taille' || (cle === 'detail' && v.detail)
  ? Visserie.parametres(piece, Object.assign({}, v, { detail: false })) : null;
const ed_longueurVis = v => {
  const P = Visserie.parametres('vis', v);
  return v.detail ? P.lisse + P.filetee + (v.tete === 'fraisee' ? (Visserie.TAILLES[v.taille].dkF - Visserie.TAILLES[v.taille].d) / 2 : 0) : v.longueur;
};
const ed_diametre = (piece, v) => v.detail ? 'Ø' + ed_virgule(Visserie.parametres(piece, v).d) : v.taille;
const ED_PRIMITIVES = {
  cube: { titre: 'Ajouter un cube', nom: 'cube',
    champs: [{ rubrique: 'Dimensions', cle: 'x', libelle: 'X', defaut: 1, classe: 'ed-x' }, { cle: 'y', libelle: 'Y', defaut: 1, classe: 'ed-y' },
      { cle: 'z', libelle: 'Z', defaut: 1, classe: 'ed-z' }],
    creer: v => Maillage.boite(v.x, v.y, v.z) },
  cylindre: { titre: 'Ajouter un cylindre', nom: 'cylindre',
    champs: [{ rubrique: 'Dimensions (axe Y)', cle: 'rayon', libelle: 'Rayon', defaut: 0.5 }, { cle: 'hauteur', libelle: 'Hauteur', defaut: 1 },
      { rubrique: 'Maillage', cle: 'cotes', libelle: 'Côtés', defaut: 16, entier: true, min: 3, max: 256 },
      { rubrique: 'Fermeture des bases', cle: 'fermeture', choix: ED_FERMETURES, defaut: 'polygone' }],
    creer: v => Maillage.cylindre(v.rayon, v.hauteur, v.cotes, v.fermeture) },
  cone: { titre: 'Ajouter un cône', nom: 'cône',
    champs: [{ rubrique: 'Dimensions (axe Y)', cle: 'rayon', libelle: 'Rayon de la base', defaut: 0.5 },
      { cle: 'haut', libelle: 'Rayon du haut (0 : pointe)', defaut: 0, zero: true }, { cle: 'hauteur', libelle: 'Hauteur', defaut: 1 },
      { rubrique: 'Maillage', cle: 'cotes', libelle: 'Côtés', defaut: 16, entier: true, min: 3, max: 256 },
      { rubrique: 'Fermeture des bases', cle: 'fermeture', choix: ED_FERMETURES, defaut: 'polygone' }],
    creer: v => Maillage.cone(v.rayon, v.haut, v.hauteur, v.cotes, v.fermeture) },
  sphere: { titre: 'Ajouter une sphère UV', nom: 'sphère',
    champs: [{ rubrique: 'Dimensions', cle: 'rayon', libelle: 'Rayon', defaut: 0.5 },
      { rubrique: 'Maillage (pôles sur l’axe Y)', cle: 'segments', libelle: 'Segments (méridiens)', defaut: 16, entier: true, min: 3, max: 256 },
      { cle: 'anneaux', libelle: 'Anneaux (bandes)', defaut: 8, entier: true, min: 2, max: 128 }],
    creer: v => Maillage.sphereUV(v.rayon, v.segments, v.anneaux) },
  icosphere: { titre: 'Ajouter une icosphère', nom: 'icosphère',
    champs: [{ rubrique: 'Dimensions', cle: 'rayon', libelle: 'Rayon', defaut: 0.5 },
      { rubrique: 'Maillage (1 : icosaèdre, 20 faces ; ×4 par subdivision)', cle: 'subdivisions', libelle: 'Subdivisions', defaut: 2, entier: true, min: 1, max: 6 }],
    creer: v => Maillage.icosphere(v.rayon, v.subdivisions) },
  // Visserie métrique ISO (moteur/visserie.js), 1 unité = 1 mm
  vis: { titre: 'Ajouter une vis', recadrer: true,
    nom: v => `vis ${ED_TETES_VIS.find(t => t[0] === v.tete)[2]} ${ed_diametre('vis', v)}×${ed_virgule(ed_longueurVis(v))}`,
    champs: [ED_CHAMP_TAILLE, { rubrique: 'Tête', cle: 'tete', choix: ED_TETES_VIS, defaut: 'hexagonale' },
      { rubrique: 'Longueur (sous la tête ; fraisée : tête comprise)', cle: 'longueur', libelle: 'Longueur', defaut: 20, si: ed_iso },
      { rubrique: 'Filetage', cle: 'filetage', choix: [['total', 'Toute la longueur'], ['partiel', 'Partiel (2d + 6)']], defaut: 'total', si: ed_iso },
      ED_CHAMP_DETAIL, ...ED_DETAIL_FILET,
      { rubrique: 'Longueurs', cle: 'filetee', libelle: 'Hauteur filetée', defaut: 20, si: ed_detail },
      { cle: 'lisse', libelle: 'Hauteur sans filet sous la tête', defaut: 0, zero: true, si: ed_detail },
      ED_CHAMP_METHODE, ...ED_CHAMPS_FILET],
    booleens: ed_coupe,
    remplir: ed_remplirVis('vis'),
    verifier: v => ed_verifierVis('vis', v, P => `Ø ${ed_virgule(P.d)}, pas ${ed_virgule(P.p)}, filetée sur ${ed_virgule(P.filetee)}`
      + (P.lisse > 0 ? `, lisse sur ${ed_virgule(P.lisse)}` : '')),
    creer: v => Visserie.vis(v) },
  ecrou: { titre: 'Ajouter un écrou', recadrer: true, nom: v => 'écrou ' + ed_diametre('ecrou', v),
    champs: [ED_CHAMP_TAILLE, ED_CHAMP_DETAIL, ...ED_DETAIL_FILET,
      { rubrique: 'Écrou', cle: 'hauteur', libelle: 'Hauteur', defaut: 6.8, si: ed_detail },
      { cle: 'plats', libelle: 'Sur plats', defaut: 13, si: ed_detail }, ED_CHAMP_METHODE, ...ED_CHAMPS_FILET],
    booleens: ed_coupe,
    remplir: ed_remplirVis('ecrou'),
    verifier: v => ed_verifierVis('ecrou', v, P => `Ø ${ed_virgule(P.d)}, pas ${ed_virgule(P.p)}, ${ed_virgule(P.plats)} sur plats, hauteur ${ed_virgule(P.hauteur)}`),
    creer: v => Visserie.ecrou(v) },
  rondelle: { titre: 'Ajouter une rondelle', recadrer: true,
    nom: v => 'rondelle ' + (v.detail ? ed_virgule(v.interieur) + '×' + ed_virgule(v.exterieur) : v.taille),
    champs: [ED_CHAMP_TAILLE, ED_CHAMP_DETAIL,
      { rubrique: 'Rondelle (reprise de la taille, puis libre)', cle: 'interieur', libelle: 'Diamètre intérieur', defaut: 8.4, si: ed_detail },
      { cle: 'exterieur', libelle: 'Diamètre extérieur', defaut: 16, si: ed_detail },
      { cle: 'epaisseur', libelle: 'Épaisseur', defaut: 1.6, si: ed_detail },
      { rubrique: 'Maillage', cle: 'segments', libelle: 'Segments', defaut: 32, entier: true, min: 6, max: 256 }],
    remplir: ed_remplirVis('rondelle'),
    verifier: v => ed_verifierVis('rondelle', v, P => `Ø ${ed_virgule(P.interieur)} × ${ed_virgule(P.exterieur)}, épaisseur ${ed_virgule(P.epaisseur)}`),
    creer: v => Visserie.rondelle(v) },
  tige: { titre: 'Ajouter une tige filetée', recadrer: true, nom: v => `tige ${ed_diametre('tige', v)}×${ed_virgule(v.longueur)}`,
    champs: [ED_CHAMP_TAILLE, { rubrique: 'Longueur', cle: 'longueur', libelle: 'Longueur', defaut: 50 }, ED_CHAMP_DETAIL, ...ED_DETAIL_FILET,
      ED_CHAMP_METHODE, ...ED_CHAMPS_FILET],
    booleens: ed_coupe,
    remplir: ed_remplirVis('tige'),
    verifier: v => ed_verifierVis('tige', v, P => `Ø ${ed_virgule(P.d)}, pas ${ed_virgule(P.p)}`), creer: v => Visserie.tige(v) }
};
// Opérations de géométrie réglées dans le même panneau que les primitives (mode Géométrie), mêmes champs (`max` :
// borne d'un nombre) ; `bouton` : libellé de la validation ; `refus(ed)` → texte si la sélection ne s'y prête pas ;
// `essayer(ed, v)` applique l'opération à l'état d'avant (l'aperçu est le maillage même, remis à chaque réglage) et
// renvoie la ligne d'information. Fermer le panneau sans valider, Annuler (↶) ou changer de mode remet l'état d'avant ;
// toute autre modification valide l'aperçu. Derniers réglages dans state.primitives, au nom de l'opération.
const ED_OPERATIONS = {
  revolution: { titre: 'Révolution', bouton: 'Appliquer',
    champs: [{ rubrique: 'Axe (passant par le curseur 3D)', cle: 'axe', choix: [['x', 'X'], ['y', 'Y'], ['z', 'Z'], ['vue', 'Vue']], defaut: 'y' },
      { rubrique: 'Balayage', cle: 'angle', libelle: 'Angle (degrés ; 360 : tour complet)', defaut: 360, max: 360 },
      { cle: 'sens', choix: [[1, 'Sens direct'], [-1, 'Sens inverse']], defaut: 1 },
      { cle: 'segments', libelle: 'Segments', defaut: 16, entier: true, min: 1, max: 256 },
      { rubrique: 'Tour complet', cle: 'fermer', choix: [[true, 'Fermer (souder)'], [false, 'Laisser ouvert']], defaut: true, si: v => v.angle === 360 }],
    refus: ed => ed.sel.sommets.length || ed.sel.aretes.length ? null : 'Sélectionnez des sommets ou des arêtes',
    verifier: v => v.angle === 360 && v.fermer && v.segments < 3 ? { texte: 'Tour complet fermé : au moins 3 segments', erreur: true } : { texte: '', erreur: false },
    essayer: (ed, v) => ed._revolution(v) },
  proches: { titre: 'Fusionner les sommets confondus', bouton: 'Fusionner',
    champs: [{ rubrique: 'Tolérance (distance maximale, de proche en proche)', cle: 'tolerance', libelle: 'Tolérance', defaut: 0.0001, zero: true }],
    essayer: (ed, v) => ed._fusionProches(v) }
};
// Fusion de sommets : position du sommet obtenu (panneau « dernière opération »)
const ED_FUSIONS = [['centre', 'Centre'], ['premier', 'Premier'], ['dernier', 'Dernier']];
const ED_AIDE_REVOLUTION = 'faire tourner les sommets et arêtes sélectionnés autour d’un axe (X, Y, Z ou direction de la vue) passant par le curseur 3D, réglé dans le panneau latéral : angle (360 : tour complet), sens, nombre de segments ; chaque sommet seul décrit un arc d’arêtes libres, chaque arête (sélectionnée, ou dont les deux extrémités le sont) une bande de quadrilatères (triangles contre l’axe, où les sommets ne sont pas recopiés) ; tour complet : Fermer soude la dernière copie à la première ; faces orientées vers l’extérieur de l’axe (ou dans le sens des faces voisines du profil) ; aperçu dans le maillage à chaque réglage et au déplacement du curseur 3D, Appliquer valide, Annuler ou ✕ rend l’état d’avant ; la géométrie créée est sélectionnée';
const ED_OPS = [['difference', 'Différence'], ['union', 'Union'], ['intersection', 'Intersection']];
const ed_copie = x => JSON.parse(JSON.stringify(x));
const ed_borner = (v, min, max) => v < min ? min : v > max ? max : v;

// ----- Projet .gda ------------------------------------------------------------------------------------
// Fichier unique, en JSON, qui garde toute la scène sans perte (faces polygonales, noms, sets, modifieurs) :
//   { format: 'gda', version: 1, application: 'GDA v44',
//     scene: { objets: [{ nom, position, rotation (quaternion), set, visible, modifs, materiau, maillage: { v, f } }],
//              sets: [{ nom, visible, replie }], actif, curseur },
//     materiaux: { nom: { couleur, ambiante, speculaire, emission, brillance, opacite, refraction, illumination } },
//     textures: { id: { … } } }
// Maillage : `v` = [[x, y, z], …], `f` = [[matériau, i, j, k, …], …], `l` (facultatif) = arêtes libres [[i, j], …]
// (Maillage.versDonnees). Un objet n'a qu'un
// matériau (`materiau`, nom dans `materiaux`) : ses faces le répètent. Un projet sans `materiau` (avant la v61) prend
// celui de sa première face. `textures` est réservé (vide pour l'instant) : les matériaux y renverront par un
// identifiant ; des attributs facultatifs par face (uv…) pourront s'ajouter sans gêner les anciens.
// Toute évolution du format : incrémenter ED_FORMAT et ajouter sa migration dans ed_lireProjet.
const ED_FORMAT = 3;              // 2 (v85) : échelle des objets (`echelle`, absente au format 1 : [1, 1, 1]) ;
                                  // 3 (v95) : arêtes libres des maillages (`l`, absentes avant : aucune)

// Échelle d'un objet lue (état, historique, projet) : trois facteurs positifs, sinon [1, 1, 1]
const ed_echelle = e => Array.isArray(e) && e.length === 3 && e.every(v => typeof v === 'number' && isFinite(v) && v > 0) ? e.slice() : [1, 1, 1];

// Axes du monde portés par les axes X, Y, Z d'un objet tourné de `q` (Quaternion), si sa rotation est faite de
// quarts de tour : [a0, a1, a2], l'axe n de l'objet étant parallèle à l'axe a[n] du monde ; null sinon (de biais)
function ed_axesAlignes(q) {
  const m = new THREE.Matrix4().makeRotationFromQuaternion(q).elements, a = [];
  for (let n = 0; n < 3; n++) {
    const k = [0, 1, 2].find(c => Math.abs(Math.abs(m[4 * n + c]) - 1) < 1e-6);   // colonne n : image de l'axe n
    if (k === undefined) return null;
    a.push(k);
  }
  return a;
}

// Tampon de profondeur logiciel sur le rectangle `r` { x0, y0, x1, y1 } de l'écran (pixels CSS) : triangles
// `tris` [[a, b, c], …] d'indices dans `pts` [{ x, y, q }] (q = 1 / profondeur devant la caméra, null si derrière).
// Résolution réduite au-delà de `max` pixels. Renvoie visible(x, y, q) : le point n'est pas caché par une face plus
// proche (tolérance relative, et le plus lointain des 3 × 3 pixels voisins : les sommets d'un contour restent pris).
function ed_profondeurs(pts, tris, r, max = 600000) {
  const marge = 2, x0 = Math.floor(r.x0) - marge, y0 = Math.floor(r.y0) - marge;
  const lw = Math.ceil(r.x1) + marge - x0, lh = Math.ceil(r.y1) + marge - y0;
  const e = Math.min(1, Math.sqrt(max / Math.max(1, lw * lh))), w = Math.max(1, Math.ceil(lw * e)), h = Math.max(1, Math.ceil(lh * e));
  const tampon = new Float64Array(w * h).fill(-Infinity);
  const X = x => (x - x0) * e, Y = y => (y - y0) * e;
  for (const [ia, ib, ic] of tris) {
    const a = pts[ia], b = pts[ib], c = pts[ic];
    if (!a || !b || !c) continue;
    const ax = X(a.x), ay = Y(a.y), bx = X(b.x), by = Y(b.y), cx = X(c.x), cy = Y(c.y);
    const aire = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
    if (Math.abs(aire) < 1e-12) continue;
    const xmin = Math.max(0, Math.floor(Math.min(ax, bx, cx))), xmax = Math.min(w - 1, Math.ceil(Math.max(ax, bx, cx)));
    const ymin = Math.max(0, Math.floor(Math.min(ay, by, cy))), ymax = Math.min(h - 1, Math.ceil(Math.max(ay, by, cy)));
    for (let py = ymin; py <= ymax; py++) for (let px = xmin; px <= xmax; px++) {
      const x = px + 0.5, y = py + 0.5;
      const u = ((bx - x) * (cy - y) - (by - y) * (cx - x)) / aire, v = ((cx - x) * (ay - y) - (cy - y) * (ax - x)) / aire, t = 1 - u - v;
      if (u < -1e-9 || v < -1e-9 || t < -1e-9) continue;
      const q = u * a.q + v * b.q + t * c.q, k = py * w + px;
      if (q > tampon[k]) tampon[k] = q;
    }
  }
  return (x, y, q) => {
    const px = Math.floor(X(x)), py = Math.floor(Y(y));
    let loin = Infinity;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const i = px + dx, j = py + dy;
      if (i >= 0 && j >= 0 && i < w && j < h) loin = Math.min(loin, tampon[j * w + i]);
    }
    return q >= loin - Math.abs(q) * 0.004;
  };
}

// Texte du fichier : indenté, mais chaque tableau sans sous-tableau ni objet (un sommet, une face) sur une ligne
const ed_texteProjet = p => JSON.stringify(p, null, 2).replace(/\[\s*([^\[\]{}]*?)\s*\]/g, (_, c) => '[' + c.replace(/,\n\s*/g, ', ') + ']');

// Lecture d'un projet : vérifications et migrations des versions antérieures ; lève une erreur lisible sinon
function ed_lireProjet(texte) {
  let p;
  try { p = JSON.parse(texte); } catch (e) { throw new Error('fichier .gda illisible'); }
  if (!p || p.format !== 'gda') throw new Error('ce n’est pas un projet .gda');
  if (!(p.version >= 1)) throw new Error('version du projet inconnue');
  if (p.version > ED_FORMAT) throw new Error(`projet au format ${p.version}, plus récent que cette application (format ${ED_FORMAT}) : mettez-la à jour`);
  if (p.version < 2) p.version = 2;   // format 1 → 2 : rien à convertir, l'échelle absente vaut [1, 1, 1] (ed_echelle)
  if (p.version < 3) p.version = 3;   // format 2 → 3 : rien à convertir, `l` absent = aucune arête libre
  // Migrations à venir : if (p.version < 4) { …; p.version = 4; }
  const sc = p.scene;
  if (!sc || !Array.isArray(sc.objets)) throw new Error('projet sans objets');
  for (const o of sc.objets) {
    if (!o || !o.maillage || !Array.isArray(o.maillage.v) || !Array.isArray(o.maillage.f)) throw new Error('objet « ' + (o && o.nom) + ' » sans maillage');
  }
  p.materiaux = p.materiaux || {};
  p.textures = p.textures || {};
  return p;
}

class EditeurContext extends Context {
  // Menu de navigation réduit à son icône au repos : toute la largeur pour les outils
  get navMini() { return true; }

  defaultState() {
    // objets : [{ nom, maillage (données), position, rotation }] ; edition : 'scene' | 'geometrie' ;
    // actif : indice de l'objet actif (-1 : aucun) ; mode : opération de la poignée (translation / rotation) ;
    // sets : [{ nom, visible, replie }], le premier étant le set par défaut ; projet : nom du fichier .gda (sans
    // extension) ; panneau : panneau latéral de fin (Fichier, Aide…) ; panneauListe : celui de début (liste des objets)
    return { objets: null, sets: null, projet: '', actif: 0, edition: 'scene', axes: { x: true, y: true, z: true }, pas: { actif: false, ...ED_PAS }, acces: {}, rendu: 'solide', materiaux: null, vue: null, curseur: [0, 0, 0], mode: 'translation', pivot: 'median', filtres: { sommets: true, aretes: true, faces: true }, selection: 'toucher', boiteRetire: false, couleurs: {}, primitives: {}, panneau: { ouvert: null, onglets: {} }, panneauListe: { ouvert: 'objets', onglets: {} } };
  }

  build(el) {
    this._style();
    const st = this.state;
    // Ancien panneau Réglages seul (v52-53) : devient le panneau partagé (Fichier, Aide, Réglages)
    if (st.reglages) {
      const r = st.reglages;
      st.panneau = { ouvert: r.ouvert ? 'reglages' : null, onglets: { reglages: r.onglet }, largeur: r.largeur, hauteur: r.hauteur };
      delete st.reglages;
    }
    if (!st.panneau || typeof st.panneau !== 'object') st.panneau = { ouvert: null, onglets: {} };
    st.panneauListe = st.panneauListe || { ouvert: 'objets', onglets: {} };
    this._appliquerCouleurs();
    delete st.axe;                    // ancien réglage (Libre / X / Y / Z), remplacé par `axes`
    // Pas : ancien interrupteur « grille » (v68 « aimant ») ; valeurs bornées
    const pas = st.pas && typeof st.pas === 'object' ? st.pas : {};
    st.pas = ed_pas(Object.assign({ actif: !!st.grille }, pas));
    delete st.grille;
    // Ancien état à maillage unique : il devient le premier objet de la scène
    if (!st.objets) {
      st.objets = [{ nom: st.nom || 'cube', maillage: st.maillage || Maillage.cube(1).versDonnees(), position: [0, 0, 0], rotation: [0, 0, 0, 1] }];
      st.actif = 0;
    }
    delete st.maillage;
    delete st.nom;
    this.objets = st.objets.map(o => this._objet(Maillage.depuisDonnees(o.maillage), o.nom, o.position, o.rotation, o.sel, o.set, o.visible, o.modifs, o.materiau, o.echelle));
    this.materiaux = {};
    for (const [nom, m] of Object.entries(st.materiaux || {})) this.materiaux[nom] = ed_materiau(m);
    this._verifierMateriaux();
    // Ancien interrupteur Rayons X (mode Géométrie) : devient un mode de rendu
    if (st.rayonsX) st.rendu = 'rayons';
    delete st.rayonsX;
    if (!ED_RENDUS.some(e => e[0] === st.rendu)) st.rendu = 'solide';
    this.sets = (st.sets || []).map(e => Object.assign({}, e));
    this._verifierSets();
    if (!this.objets[st.actif]) st.actif = this.objets.length ? 0 : -1;
    this.choix = [];                  // mode Scène : indices des objets choisis, dans l'ordre (le dernier est l'actif)
    this.sel = new SelectionMaillage();   // mode Géométrie : sommets (dans l'ordre), arêtes et faces sélectionnés
    this.maillage = null;             // mode Géométrie : copie de travail de l'objet actif, en coordonnées du monde
    this.edites = st.edites || [];    // mode Géométrie : objets édités ensemble (l'actif en dernier)
    if (st.edition === 'geometrie' && st.actif >= 0) this._ouvrirEdition();
    else st.edition = 'scene';
    this.annuler = [];
    this.retablir = [];
    this._interface(el);
    let m;
    try {
      m = this.m = new Moteur(this.vue, { continu: false, champ: 50, ombres: false });
    } catch (e) {
      this.infos.textContent = e.message;
      return;
    }
    m.placerSoleil(ED_SOLEIL);
    this._scene(m);
    this._camera(m);
    this._gestes(m);
    this._rafraichir(true);
    if (!this.state.vue) this._recadrer();
  }

  onShow() {
    this._appliquerCouleurs();
    if (!this.m) return;
    this.m.redimensionner();
    this.m.demarrer();
  }

  onHide() {
    this._fermerMenuObjet();
    if (this.m) this.m.arreter();
  }

  // ----- Interface HTML -----------------------------------------------------------------------------
  _interface(el) {
    const div = (cls, parent) => { const d = document.createElement('div'); d.className = cls; if (parent) parent.appendChild(d); return d; };
    const bouton = (parent, texte, fn, cls) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'ed-btn' + (cls ? ' ' + cls : '');
      b.innerHTML = texte;
      b.addEventListener('click', fn);
      parent.appendChild(b);
      return b;
    };

    this.vue = div('ed-vue');
    this.numeros = div('ed-numeros');

    const hud = div('ed-hud');
    // Le titre est porté par le menu de navigation (en haut à gauche) : ici, le fichier ouvert et ses chiffres
    const boutons = div('ed-boutons', hud);
    // Fichier, Objets, Aide et Réglages : pastilles à icône seule, à droite du menu de navigation réduit (même
    // allure) ; chacune ouvre ou ferme son contenu dans un panneau latéral : la liste des objets dans celui de
    // début (gauche / haut), les autres dans le panneau partagé de fin (droite / bas)
    const pastilles = div('ed-pastilles');
    this.btnPanneaux = {};
    for (const [id, icone, titre] of [
      ['fichier', 'file-import-export-line', 'Fichier'],
      ['objets', 'fa7-solid--folder-tree', 'Liste des objets'],
      ['aide', 'question-line', 'Aide'],
      ['reglages', 'reglages', 'Réglages']
    ]) {
      const b = document.createElement('button');
      if (id === 'objets') this.btnListe = b; else this.btnPanneaux[id] = b;
      b.type = 'button';
      b.setAttribute('aria-label', titre);
      b.appendChild(uiPic(ED_ICONES + icone + '.svg'));
      b.addEventListener('click', () => (id === 'objets' ? this.panneauListe : this.panneau).basculer(id));
      pastilles.appendChild(b);
    }
    this.btnMenus = {};
    for (const [id, libelle, , icone] of ED_MENUS) {
      const b = this.btnMenus[id] = bouton(boutons, '', () => this._ouvrirMenu(id), 'ed-menu');
      b.append(uiPic(ED_ICONES + icone + '.svg'), libelle);
    }
    // Modifieurs de l'objet actif (mode Scène) : bouton bascule du même style, contenu dans le panneau latéral
    this.btnModifs = bouton(boutons, '', () => this._basculerModifs(), 'ed-menu');
    this.btnModifs.append(uiPic(ED_ICONES + 'lucide--wrench.svg'), 'Modifieurs');
    // Matériaux (mode Scène) : bouton bascule voisin, bibliothèque du projet dans le panneau latéral
    this.btnMateriaux = bouton(boutons, '', () => this._basculerMateriaux(), 'ed-menu');
    this.btnMateriaux.append(uiPic(ED_ICONES + 'materiaux.svg'), 'Matériaux');
    this._menuCurseur(hud);
    // Ligne d'état : chiffres de la scène ou du maillage, sélection, angle ou facteur pendant un glissé
    this.infos = div('ed-infos', hud);

    const bas = div('ed-bas');
    // Transformation, saisie directe (colonnes placées sous la barre d'outils, voir _barreOutils) : coordonnées du
    // centre de la sélection ; en mode Scène avec un seul objet choisi, aussi sa rotation et ses dimensions (titres
    // des colonnes affichés alors seulement, classe « complet »)
    this.transfo = div('ed-transfo');
    this.transfo.dataset.paveGroupe = '';
    const colonne = (titre, fn) => {
      const col = div('ed-coords ed-coords-sel', this.transfo), champs = {};
      div('ed-coords-titre', col).textContent = titre;
      ED_AXES.forEach((a, k) => {
        const l = document.createElement('label');
        l.className = 'ed-' + a;
        const nom = document.createElement('b');   // pastille à la couleur de l'axe
        nom.textContent = a.toUpperCase();
        l.appendChild(nom);
        const i = document.createElement('input');
        i.type = 'text';   // « number » : Android ignorerait inputMode « none » (pavé numérique, pave.js)
        i.inputMode = 'decimal';
        i.addEventListener('change', () => fn(k, i.value));
        l.appendChild(i);
        col.appendChild(l);
        champs[a] = i;
      });
      return [col, champs];
    };
    [this.coords, this.champs] = colonne('Position', (k, v) => this._saisir(k, v));
    [this.coordsRot, this.champsRot] = colonne('Rotation °', (k, v) => this._saisirRotation(k, v));
    [this.coordsDim, this.champsDim] = colonne('Dimensions', (k, v) => this._saisirDimension(k, v));

    // Annuler / Rétablir, dans les deux modes (les autres opérations sont dans les menus du haut)
    // Barre d'accès rapide : les opérations disponibles pour la sélection (_acces), qui défilent si la place manque,
    // et Annuler / Rétablir, toujours collés à droite
    const acces = div('ed-ligne ed-actions ed-acces', bas);
    this.accesOps = div('ed-acces-ops', acces);
    this.accesOps.addEventListener('scroll', () => this._fondreAcces());
    const historique = div('ed-acces-hist', acces);
    this.btnAnnuler = bouton(historique, '<b>↶</b>Annuler', () => this._defaire(this.annuler, this.retablir));
    this.btnRetablir = bouton(historique, '<b>↷</b>Rétablir', () => this._defaire(this.retablir, this.annuler));

    this.entree = document.createElement('input');
    this.entree.type = 'file';             // sans « accept » : Android masque souvent .obj / .stl / .glb sinon
    this.entree.hidden = true;
    this.entree.addEventListener('change', () => this._lireFichier());

    const outils = this._barreOutils();

    this.cartSet = this._carte('Set');
    this.carteMenu = this._carte('');
    // Espace de travail (vue et commandes), réduit quand le panneau latéral s'ouvre : à droite en paysage, en bas
    // en portrait (panneau.js). Les cartes modales couvrent tout l'écran.
    const espace = div('ed-espace');
    espace.append(this.vue, this.numeros, hud, pastilles, outils, bas);
    el.append(espace, this.cartSet.fond, this.carteMenu.fond, this.entree);
    if (this.state.panneau && this.state.panneau.ouvert === 'ajout') this.state.panneau.ouvert = null;   // ajout non repris
    this.panneau = new PanneauOnglets(el, espace, {
      etat: this.state.panneau,
      sauver: () => this.save(),
      changement: id => { for (const k in this.btnPanneaux) this.btnPanneaux[k].classList.toggle('on', k === id); }
    });
    this.panneau.definir('fichier', {
      onglets: [['projet', 'Projet', c => this._ongletProjet(c)], ['importer', 'Importer', c => this._ongletImporter(c)],
        ['exporter', 'Exporter', c => this._ongletExporter(c)]],
      quitter: () => { this.champProjet = null; }
    });
    this.panneau.definir('aide', { onglets: this._aide() });
    this.btnPanneaux.modifs = this.btnModifs;      // mis en évidence quand le panneau les affiche
    this.panneau.definir('modifs', {
      onglets: [['pile', 'Modifieurs', c => { this.corpsModifs = c; this._cleModifs = null; this._afficherModifs(); }]],
      quitter: () => { this.corpsModifs = null; }
    });
    this.btnPanneaux.materiaux = this.btnMateriaux;
    this.panneau.definir('materiaux', {
      onglets: [['bibliotheque', 'Matériaux', c => { this.corpsMateriaux = c; this._cleMateriaux = null; this._afficherMateriaux(); }]],
      quitter: () => { this.corpsMateriaux = null; this._saisieMat = false; }
    });
    this.panneau.definir('reglages', {
      onglets: [['couleurs', 'Couleurs', c => this._ongletCouleurs(c)], ['acces', 'Barre rapide', c => this._ongletAcces(c)]],
      quitter: () => { this._lignesCouleurs = null; }
    });
    // Liste des objets (sets) dans le panneau de début : gauche en paysage, haut en portrait
    this._listeObjets();
    this.panneauListe = new PanneauOnglets(el, espace, {
      cote: 'debut',
      etat: this.state.panneauListe,
      sauver: () => this.save(),
      changement: id => this.btnListe.classList.toggle('on', id === 'objets'),
      fermeture: false,                // la pastille Objets, toujours visible, l'ouvre et le ferme
      min: 100
    });
    this.panneauListe.definir('objets', {
      plein: true,                     // liste bord à bord
      sansOnglets: true,               // un seul onglet : la pastille Objets le nomme
      entete: this.btnAjoutSet,
      onglets: [['sets', 'Objets', c => { this.corpsListe = c; c.append(this.liste); this._cleListe = null; this._afficherListe(); }]],
      quitter: () => { this.corpsListe = null; }
    });
    this._afficherReglages();
  }

  // ----- Panneau latéral : Fichier, Aide, Réglages (panneau.js) ------------------------------------------
  // Onglet Couleurs : une ligne par clé (pastille du sélecteur natif, ↺ pour revenir au défaut), par groupe ;
  // chaque changement s'applique aussitôt (interface et scène 3D)
  _ongletCouleurs(corps) {
    const perso = this.state.couleurs = this.state.couleurs || {};
    this._lignesCouleurs = [];
    let groupe = null;
    for (const [cle, libelle, g] of ED_COULEURS) {
      if (g !== groupe) {
        groupe = g;
        const t = document.createElement('span');
        t.className = 'ed-rubrique';
        t.textContent = g;
        corps.appendChild(t);
      }
      const l = document.createElement('label');
      l.className = 'ed-couleur';
      const nom = document.createElement('span');
      nom.textContent = libelle;
      const entree = document.createElement('input');
      entree.type = 'color';
      entree.addEventListener('input', () => { perso[cle] = entree.value; this._appliquerCouleurs(); });
      entree.addEventListener('change', () => this.save());
      const raz = document.createElement('button');
      raz.type = 'button';
      raz.textContent = '↺';
      raz.setAttribute('aria-label', 'Couleur par défaut : ' + libelle);
      raz.addEventListener('click', e => { e.preventDefault(); delete perso[cle]; this.save(); this._appliquerCouleurs(); });
      l.append(nom, raz, entree);
      corps.appendChild(l);
      this._lignesCouleurs.push({ cle, entree, raz });
    }
    const tout = document.createElement('button');
    tout.type = 'button';
    tout.className = 'ed-couleurs-raz';
    tout.textContent = 'Tout remettre par défaut';
    tout.addEventListener('click', () => { this.state.couleurs = {}; this.save(); this._appliquerCouleurs(); });
    corps.appendChild(tout);
    this._afficherCouleurs();
  }

  // Valeurs des sélecteurs (une couleur par défaut peut dépendre d'une autre) et boutons ↺ des couleurs choisies
  _afficherCouleurs() {
    if (!this._lignesCouleurs || !this.couleurs) return;
    const perso = this.state.couleurs || {};
    for (const { cle, entree, raz } of this._lignesCouleurs) {
      if (document.activeElement !== entree) entree.value = this.couleurs.get(cle);
      raz.hidden = !perso[cle];
    }
  }

  _carte(titre) {
    const fond = document.createElement('div');
    fond.className = 'ed-fond';
    fond.hidden = true;
    fond.addEventListener('click', e => { if (e.target === fond) fond.hidden = true; });
    const carte = document.createElement('div');
    carte.className = 'ed-carte';
    carte.dataset.paveGroupe = '';   // Suivant du pavé numérique (pave.js) : les champs de la carte
    const b = document.createElement('b');
    b.textContent = titre;
    carte.appendChild(b);
    fond.appendChild(carte);
    const fermer = () => { fond.hidden = true; };
    return { fond, carte, fermer };
  }

  // Boutons en grille sous un intitulé (onglets du panneau Fichier) : items [texte, action]
  _grilleBoutons(corps, titre, items) {
    if (titre) {
      const t = document.createElement('span');
      t.className = 'ed-rubrique';
      t.textContent = titre;
      corps.appendChild(t);
    }
    const g = document.createElement('div');
    g.className = 'ed-grille';
    for (const [texte, fn] of items) {
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = texte;
      b.addEventListener('click', fn);
      g.appendChild(b);
    }
    corps.appendChild(g);
  }

  // Projet .gda : nom du fichier (gardé dans l'état), enregistrer, ouvrir ; nouvelle scène
  _ongletProjet(corps) {
    const t = document.createElement('span');
    t.className = 'ed-rubrique';
    t.textContent = 'Projet (.gda : toute la scène, sans perte)';
    const nom = document.createElement('div');
    nom.className = 'ed-set-renommer';
    this.champProjet = document.createElement('input');
    this.champProjet.type = 'text';
    this.champProjet.placeholder = 'projet';
    this.champProjet.value = this.state.projet || '';
    this.champProjet.addEventListener('change', () => { this.state.projet = this.champProjet.value.trim(); this.save(); });
    const ok = document.createElement('button');
    ok.type = 'button';
    ok.textContent = 'Enregistrer';
    ok.addEventListener('click', () => { this.state.projet = this.champProjet.value.trim(); this._enregistrerProjet(); });
    nom.append(this.champProjet, ok);
    corps.append(t, nom);
    this._grilleBoutons(corps, '', [['Ouvrir un projet…', () => this._choisirFichier()]]);
    this._grilleBoutons(corps, 'Scène', [['Nouvelle scène', () => this._nouvelleScene()]]);
  }

  _ongletImporter(corps) {
    this._grilleBoutons(corps, 'Fichier du téléphone', [['Ajouter un fichier… (OBJ, STL, glTF, MTL)', () => this._choisirFichier()]]);
    this._grilleBoutons(corps, 'Ajouter un modèle du projet', ED_MODELES.map(u => [u.split('/').pop(), () => this._chargerUrl(u)]));
  }

  _ongletExporter(corps) {
    this._grilleBoutons(corps, 'Exporter la scène', [
      ['OBJ', () => this._exporter('obj', true)], ['STL', () => this._exporter('stl', true)], ['GLB (glTF)', () => this._exporter('glb', true)]
    ]);
    this._grilleBoutons(corps, 'Exporter l’objet actif', [
      ['OBJ', () => this._exporter('obj')], ['STL', () => this._exporter('stl')], ['GLB (glTF)', () => this._exporter('glb')]
    ]);
    this._grilleBoutons(corps, 'Matériaux (bibliothèque des OBJ)', [['MTL', () => this._exporterMTL()]]);
  }

  // Barre d'outils (en haut à gauche, sous le menu de navigation) : interrupteur translation / rotation,
  // axes autorisés, et en rotation le choix du point pivot (chevron, liste déroulée vers le bas)
  _barreOutils() {
    const gauche = document.createElement('div');
    gauche.className = 'ed-gauche';
    const barre = document.createElement('div');
    barre.className = 'ed-outils';
    const bouton = (parent, html, fn, cls, titre) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = cls || '';
      if (typeof html === 'string') b.innerHTML = html; else b.appendChild(html);
      if (titre) b.setAttribute('aria-label', titre);
      b.addEventListener('click', fn);
      parent.appendChild(b);
      return b;
    };
    // Mode de l'éditeur : scène (objets) ou géométrie (sommets et faces de l'objet actif)
    const editions = document.createElement('div');
    editions.className = 'ed-editions';
    // En tête : mode de rendu de la vue (solide, rayons X, en jeu), interrupteur à trois positions : chaque appui
    // passe au mode suivant ; le pictogramme montre le mode courant, la glissière sa position
    this.btnRendu = bouton(editions, '', () => {
      const l = this._rendus(), i = l.findIndex(e => e[0] === this._rendu());
      this._choisirRendu(l[(i + 1) % l.length][0]);
    }, 'ed-rendu');
    this.btnEditions = {};
    for (const [id, libelle, icone] of [['scene', 'Scène', 'iconoir--3d-select-solid'], ['geometrie', 'Géométrie', 'iconoir--select-point-3d']]) {
      const b = this.btnEditions[id] = bouton(editions, uiPic(ED_ICONES + icone + '.svg'), () => this._changerEdition(id));
      b.append(libelle);
    }
    // Mode Géométrie : types d'éléments sélectionnables. Appui = ce type seul ; appui long (0,5 s, comme dans la vue)
    // = l'ajouter aux types actifs ou l'en retirer (au moins un reste)
    const filtres = this.filtresEl = document.createElement('div');
    filtres.className = 'ed-filtres';
    this.btnFiltres = {};
    for (const [cle, libelle, icone] of ED_FILTRES) {
      let minuteur = null, long = false;
      const b = this.btnFiltres[cle] = bouton(filtres, uiPic(ED_ICONES + icone + '.svg'), () => {
        if (long) { long = false; return; }       // le clic qui suit un appui long est ignoré
        this._filtreSeul(cle);
      }, '', 'Sélectionner les ' + libelle.toLowerCase() + ' seuls (appui long : les ajouter ou les retirer)');
      const annuler = () => { clearTimeout(minuteur); minuteur = null; };
      b.addEventListener('pointerdown', () => {
        long = false;
        annuler();
        minuteur = setTimeout(() => { minuteur = null; long = true; this._basculerFiltre(cle); }, 500);
      });
      for (const t of ['pointerup', 'pointercancel', 'pointerleave']) b.addEventListener(t, annuler);
      b.addEventListener('contextmenu', e => e.preventDefault());   // pas de menu du navigateur à l'appui long
    }
    editions.appendChild(filtres);
    const mode = document.createElement('div');
    mode.className = 'ed-mode';
    this.btnModes = {
      translation: bouton(mode, uiPic(ED_ICONES + '3d-move.svg'), () => this._choisirMode('translation'), '', 'Translation'),
      rotation: bouton(mode, uiPic(ED_ICONES + 'rotate-3d.svg'), () => this._choisirMode('rotation'), '', 'Rotation'),
      echelle: bouton(mode, uiPic(ED_ICONES + 'scaling.svg'), () => this._choisirMode('echelle'), '', 'Mise à l’échelle')
    };
    const axes = document.createElement('div');
    axes.className = 'ed-axes';
    this.btnAxes = {};
    for (const a of ED_AXES) this.btnAxes[a] = bouton(axes, a.toUpperCase(), () => this._basculerAxe(a), 'ed-' + a);
    // Pas (incrément) des transformations : appui = l'activer ou non ; appui long (0,5 s) = ses réglages
    let minuteurPas = null, longPas = false;
    this.btnPas = bouton(barre, uiPic(ED_ICONES + 'pas.svg'), () => {
      if (longPas) { longPas = false; return; }   // le clic qui suit un appui long est ignoré
      this.state.pas.actif = !this.state.pas.actif;
      this.save();
      this._afficherReglages();
    }, 'ed-pas', 'Pas (appui long : réglages)');
    const finPas = () => { clearTimeout(minuteurPas); minuteurPas = null; };
    this.btnPas.addEventListener('pointerdown', () => {
      longPas = false;
      finPas();
      minuteurPas = setTimeout(() => { minuteurPas = null; longPas = true; this._reglerPas(); }, 500);
    });
    for (const t of ['pointerup', 'pointercancel', 'pointerleave']) this.btnPas.addEventListener(t, finPas);
    this.btnPas.addEventListener('contextmenu', e => e.preventDefault());
    this.btnPivot = bouton(barre, '', () => this._deroulerPivots(), 'ed-pivot', 'Point pivot');
    this.btnPivot.setAttribute('aria-expanded', 'false');
    // Mode de sélection : interrupteur comme celui du rendu (appui = mode suivant), et en mode Boîte ajouter / retirer
    const selection = document.createElement('div');
    selection.className = 'ed-selection';
    this.btnSelection = bouton(selection, '', () => {
      const i = ED_SELECTIONS.findIndex(e => e[0] === this._modeSelection());
      this._choisirSelection(ED_SELECTIONS[(i + 1) % ED_SELECTIONS.length][0]);
    }, 'ed-rendu');
    this.btnBoiteSens = bouton(selection, '', () => {
      this.state.boiteRetire = !this.state.boiteRetire;
      this.save();
      this._afficherReglages();
    }, 'ed-boite-sens');
    barre.prepend(selection, mode, axes, this.btnPas);

    const liste = this.listePivots = document.createElement('div');
    liste.className = 'ed-pivots';
    const t = document.createElement('span');
    t.className = 'ed-rubrique';
    t.textContent = 'Point pivot (rotation, échelle)';
    liste.appendChild(t);
    this.btnPivots = {};
    for (const [id, libelle, icone] of ED_PIVOTS) {
      const b = bouton(liste, this._icone(icone), () => { this._deroulerPivots(false); this._choisirPivot(id); }, 'ed-curseur-action');
      b.append(libelle);
      this.btnPivots[id] = b;
    }
    gauche.append(editions, barre, liste, this._panneauPas(), this.transfo, this._panneauAjuster());
    return gauche;
  }

  // Panneau des réglages du pas, sous la barre d'outils (même allure que « dernière opération ») : translation (vide :
  // demi-carreau de la grille), angle, facteur d'échelle ; chaque saisie valide est gardée
  _panneauPas() {
    const p = this.panneauPas = document.createElement('div');
    p.className = 'ed-ajuster ed-reglages-pas';
    p.hidden = true;
    const tete = document.createElement('div');
    tete.className = 'ed-ajuster-tete';
    const titre = document.createElement('b');
    titre.textContent = 'Pas';
    const fermer = document.createElement('button');
    fermer.type = 'button';
    fermer.textContent = '✕';
    fermer.setAttribute('aria-label', 'Fermer');
    fermer.addEventListener('click', () => { p.hidden = true; });
    tete.append(titre, fermer);
    const corps = document.createElement('div');
    corps.className = 'ed-coords';
    corps.dataset.paveGroupe = '';
    // Saisie hors bornes : la valeur précédente est gardée (et réaffichée)
    const regler = (cle, v) => {
      this.state.pas = ed_pas(Object.assign({}, this.state.pas, { [cle]: v }), this.state.pas);
      this.save();
      if (this.champsPas[cle]) this.champsPas[cle].value = this.state.pas[cle];
    };
    const translation = this._champ('Dépl.', 'ed-pas-translation', '', v => regler('translation', v > 0 ? v : null), 'change');
    this.champPas = translation.children[1];
    this.champPas.addEventListener('change', () => { if (this.champPas.value === '') regler('translation', null); });
    const angle = this._champ('Angle °', 'ed-pas-angle', '', v => regler('angle', v), 'change');
    const echelle = this._champ('Échelle', 'ed-pas-echelle', '', v => regler('echelle', v), 'change');
    this.champsPas = { angle: angle.children[1], echelle: echelle.children[1] };
    const note = document.createElement('span');
    note.className = 'ed-ajuster-rubrique';
    note.textContent = 'Déplacement vide : un demi-carreau de grille';
    corps.append(translation, angle, echelle, note);
    p.append(tete, corps);
    return p;
  }

  // Ouvre les réglages du pas, remplis d'après l'état (le pas automatique en indication)
  _reglerPas() {
    if (!this.panneauPas) return;
    const st = this.state.pas;
    this._deroulerPivots(false);
    this.champPas.value = st.translation == null ? '' : st.translation;
    this.champPas.placeholder = 'auto · ' + +((this.pas || 1) / 2).toPrecision(4);
    this.champsPas.angle.value = st.angle;
    this.champsPas.echelle.value = st.echelle;
    this.panneauPas.hidden = false;
  }

  // Pas de translation en cours : réglé, sinon un demi-carreau de grille
  _pasTranslation() { return this.state.pas.translation || (this.pas || 1) / 2; }

  // Panneau « dernière opération » : rempli par _montrerAjuster() à la fin d'une transformation
  _panneauAjuster() {
    const p = this.ajuster = document.createElement('div');
    p.className = 'ed-ajuster';
    p.hidden = true;
    const tete = document.createElement('div');
    tete.className = 'ed-ajuster-tete';
    this.ajusterTitre = document.createElement('b');
    const fermer = document.createElement('button');
    fermer.type = 'button';
    fermer.textContent = '✕';
    fermer.setAttribute('aria-label', 'Valider');
    fermer.addEventListener('click', () => this._cacherAjuster());
    tete.append(this.ajusterTitre, fermer);
    this.ajusterCorps = document.createElement('div');
    this.ajusterCorps.className = 'ed-coords';
    this.ajusterCorps.dataset.paveGroupe = '';
    p.append(tete, this.ajusterCorps);
    return p;
  }

  _cacherAjuster() {
    this.derniere = null;
    if (this.ajuster) this.ajuster.hidden = true;
  }

  // Champ numérique à pastille ; `fn(valeur)` à chaque frappe donnant un nombre
  _champ(nom, cls, valeur, fn, evenement = 'input') {
    const l = document.createElement('label');
    l.className = cls;
    const b = document.createElement('b');
    b.textContent = nom;
    const i = document.createElement('input');
    i.type = 'text';
    i.inputMode = 'decimal';
    i.value = valeur;
    i.addEventListener(evenement, () => {
      const v = parseFloat(String(i.value).replace(',', '.'));
      if (isFinite(v)) fn(v);
    });
    l.append(b, i);
    return l;
  }

  // Remplit le panneau d'après this.derniere
  _montrerAjuster() {
    const o = this.derniere, corps = this.ajusterCorps, arrondi = v => +v.toFixed(4);
    corps.replaceChildren();
    if (o.type === 'subdivision') {
      this.ajusterTitre.textContent = '╱ Subdivision';
      const champ = this._champ('Coupes', 'ed-coupes', o.coupes, v => {
        const n = Math.round(ed_borner(v, 1, 64));
        if (n !== o.coupes) { o.coupes = n; this._refaire(); }
      });
      champ.querySelector('input').inputMode = 'numeric';
      corps.appendChild(champ);
    } else if (o.type === 'fusion') {
      this.ajusterTitre.textContent = '⊙ Fusion';
      const t = document.createElement('span');
      t.className = 'ed-ajuster-rubrique';
      t.textContent = 'Position du sommet obtenu';
      const options = document.createElement('div');
      options.className = 'ed-ajuster-axes ed-boucle-options';
      const boutons = ED_FUSIONS.map(([cible, texte]) => {
        const b = document.createElement('button');
        b.type = 'button';
        b.textContent = texte;
        b.classList.toggle('on', cible === o.cible);
        b.addEventListener('click', () => {
          if (cible === o.cible) return;
          o.cible = this.state.fusion = cible;
          this.save();
          boutons.forEach((x, k) => x.classList.toggle('on', ED_FUSIONS[k][0] === cible));
          this._refaire();
        });
        options.appendChild(b);
        return b;
      });
      corps.append(t, options);
    } else if (o.type === 'boucle') {
      this.ajusterTitre.textContent = '⫴ Boucle de coupe';
      const coupes = this._champ('Coupes', 'ed-coupes', o.coupes, v => {
        const n = Math.round(ed_borner(v, 1, 64));
        if (n !== o.coupes) { o.coupes = n; this._refaire(); }
      });
      coupes.querySelector('input').inputMode = 'numeric';
      // Glissement : réglette au doigt et champ (pavé numérique), l'un suit l'autre
      const t = document.createElement('span');
      t.className = 'ed-ajuster-rubrique';
      t.textContent = 'Glissement';
      const reglette = document.createElement('input');
      reglette.type = 'range';
      reglette.className = 'ed-glissement';
      reglette.min = '-1'; reglette.max = '1'; reglette.step = '0.01';
      reglette.value = String(o.glissement);
      reglette.dataset.pave = 'non';
      const champ = this._champ('↔', 'ed-coupes', arrondi(o.glissement), v => {
        o.glissement = ed_borner(v, -0.99, 0.99);
        reglette.value = String(o.glissement);
        this._refaire();
      });
      const saisie = champ.querySelector('input');
      reglette.addEventListener('input', () => {
        o.glissement = ed_borner(+reglette.value, -0.99, 0.99);
        saisie.value = String(o.glissement);
        this._refaire();
      });
      // Uniforme, Inverser : interrupteurs
      const options = document.createElement('div');
      options.className = 'ed-ajuster-axes ed-boucle-options';
      const bascule = (texte, cle) => {
        const b = document.createElement('button');
        b.type = 'button';
        b.textContent = texte;
        b.addEventListener('click', () => { o[cle] = !o[cle]; montrer(); this._refaire(); });
        options.appendChild(b);
        return b;
      };
      const uni = bascule('Uniforme', 'uniforme'), inv = bascule('Inverser', 'inverser');
      const montrer = () => {
        uni.classList.toggle('on', o.uniforme);
        inv.classList.toggle('on', o.inverser);
        inv.disabled = !o.uniforme;
      };
      montrer();
      corps.append(coupes, t, reglette, champ, options);
    } else if (o.type === 'translation') {
      this.ajusterTitre.textContent = '✥ Translation';
      ED_AXES.forEach((a, k) => corps.appendChild(this._champ('Δ' + a.toUpperCase(), 'ed-' + a, arrondi(o.d[k]), v => { o.d[k] = v; this._refaire(); })));
    } else if (o.type === 'echelle') {
      this.ajusterTitre.textContent = '⤢ Échelle';
      ED_AXES.forEach((a, k) => corps.appendChild(this._champ('×' + a.toUpperCase(), 'ed-' + a, arrondi(o.s[k]), v => { o.s[k] = v; this._refaire(); })));
      const t = document.createElement('span');
      t.className = 'ed-ajuster-rubrique';
      t.textContent = 'Pivot';
      corps.appendChild(t);
      ED_AXES.forEach((a, k) => corps.appendChild(this._champ(a.toUpperCase(), 'ed-' + a, arrondi(o.pivot[k]), v => { o.pivot[k] = v; this._refaire(); })));
    } else {
      this.ajusterTitre.textContent = '↻ Rotation';
      corps.appendChild(this._champ('°', 'ed-angle', +o.degres.toFixed(2), v => { o.degres = v; this._refaire(); }));
      // Axe : X / Y / Z, ou l'axe de vue si la rotation a été faite autour de lui
      const axes = document.createElement('div');
      axes.className = 'ed-ajuster-axes';
      const choix = [...ED_AXES, ...(o.vue ? ['vue'] : [])];
      const boutons = choix.map(a => {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = a === 'vue' ? 'ed-axe-vue' : 'ed-' + a;   // (« ed-vue » est la zone 3D)
        b.textContent = a === 'vue' ? 'Vue' : a.toUpperCase();
        b.addEventListener('click', () => { o.axe = a; boutons.forEach((x, k) => x.classList.toggle('on', choix[k] === a)); this._refaire(); });
        b.classList.toggle('on', o.axe === a);
        axes.appendChild(b);
        return b;
      });
      corps.appendChild(axes);
      const t = document.createElement('span');
      t.className = 'ed-ajuster-rubrique';
      t.textContent = 'Pivot';
      corps.appendChild(t);
      ED_AXES.forEach((a, k) => corps.appendChild(this._champ(a.toUpperCase(), 'ed-' + a, arrondi(o.pivot[k]), v => { o.pivot[k] = v; this._refaire(); })));
    }
    this.ajuster.hidden = false;
  }

  // Refait la dernière transformation depuis l'état de départ, avec les valeurs du panneau
  _refaire() {
    const o = this.derniere;
    if (!o || o.edition !== this.state.edition) return;
    // Opération de topologie : rejouée depuis l'état d'avant (dernière étape d'annulation)
    if (o.type === 'subdivision') {
      this._restaurer(this.annuler[this.annuler.length - 1]);
      this._subdiviser(o.coupes, true);
      return;
    }
    if (o.type === 'boucle') {
      this._restaurer(this.annuler[this.annuler.length - 1]);
      this._boucleCoupe(o);
      return;
    }
    if (o.type === 'fusion') {
      this._restaurer(this.annuler[this.annuler.length - 1]);
      this._fusionner(o.cible, true);
      return;
    }
    if (o.type === 'translation') {
      this._poser(o.indices, o.depart, new THREE.Vector3().fromArray(o.d));
    } else if (o.type === 'echelle') {
      this._poser(o.indices, o.depart, null, null, new THREE.Vector3().fromArray(o.pivot), new THREE.Vector3().fromArray(o.s));
    } else {
      const axe = new THREE.Vector3();
      if (o.axe === 'vue') axe.fromArray(o.vue); else axe.setComponent(ED_AXES.indexOf(o.axe), 1);
      const q = new THREE.Quaternion().setFromAxisAngle(axe.normalize(), o.degres * Math.PI / 180);
      this._poser(o.indices, o.depart, null, q, new THREE.Vector3().fromArray(o.pivot));
    }
    this._sauver();
    this._rafraichir();
  }

  // Fin d'un glissé de transformation : mémorise ce qu'il a fait et ouvre le panneau (sauf s'il n'a rien changé)
  _finTransformation(g) {
    const base = { indices: g.indices, depart: g.depart, edition: this.state.edition };
    if (g.echelle) {
      if (!g.s || g.s.every(v => v === 1)) return;
      this.derniere = { ...base, type: 'echelle', s: g.s.slice(), pivot: g.pivot.slice() };
    } else if (g.pivot) {
      if (!g.theta) return;
      const ax = g.axe.toArray(), k = ax.findIndex(v => Math.abs(Math.abs(v) - 1) < 1e-9);
      // Axe du monde : signe porté par l'angle ; sinon, axe de vue
      const axe = k >= 0 ? ED_AXES[k] : 'vue', signe = k >= 0 ? Math.sign(ax[k]) : 1;
      this.derniere = { ...base, type: 'rotation', degres: g.theta * 180 / Math.PI * signe, axe, vue: k >= 0 ? null : ax, pivot: g.pivot.slice() };
    } else {
      if (!g.d || g.d.every(v => !v)) return;
      this.derniere = { ...base, type: 'translation', d: g.d.slice() };
    }
    this._montrerAjuster();
  }

  // Pictogramme : fichier de icons/ (teinté par uiPic), ou le curseur 3D dessiné
  _icone(nom) {
    if (nom !== 'curseur') return uiPic(ED_ICONES + nom + '.svg');
    const s = document.createElement('span');
    s.className = 'ui-pic ed-pic-svg';
    s.innerHTML = uiSvg(ED_SVG_CURSEUR);
    return s;
  }

  _choisirMode(mode) {
    if (this.state.mode === mode) return;
    this.state.mode = mode;
    this.save();
    this._deroulerPivots(false);
    this._afficherReglages();
    this._rafraichir();
  }

  _choisirPivot(id) {
    this.state.pivot = id;
    this.save();
    this._afficherReglages();
    this._rafraichir();
  }

  _deroulerPivots(ouvrir) {
    const l = this.listePivots;
    if (!l) return;
    const o = ouvrir === undefined ? !l.classList.contains('ouvert') : ouvrir;
    l.classList.toggle('ouvert', o);
    this.btnPivot.setAttribute('aria-expanded', String(o));
  }

  // Widget du curseur 3D : au repos, son pictogramme et sa position (X / Y / Z, saisie directe, axe donné par la
  // couleur de la bordure) ; le pictogramme déroule les actions vers le bas
  _menuCurseur(parent) {
    const boite = this.boiteCurseur = document.createElement('div');
    boite.className = 'ed-curseur';
    const tete = document.createElement('button');
    tete.type = 'button';
    tete.className = 'ed-curseur-tete';
    tete.innerHTML = uiSvg(ED_SVG_CURSEUR);
    tete.setAttribute('aria-label', 'Curseur 3D : actions');
    tete.setAttribute('aria-expanded', 'false');
    tete.addEventListener('click', () => this._deroulerCurseur());
    const liste = document.createElement('div');
    liste.className = 'ed-curseur-liste';
    // Au repos : le pictogramme (qui déroule les actions) et la position du curseur, modifiable ; l'axe de chaque
    // champ est donné par la couleur de sa bordure
    const ligne = document.createElement('div');
    ligne.className = 'ed-curseur-ligne';
    ligne.dataset.paveGroupe = '';
    ligne.appendChild(tete);
    this.champsCurseur = ED_AXES.map((a, k) => {
      const i = document.createElement('input');
      i.className = 'ed-' + a;
      i.setAttribute('aria-label', 'Curseur ' + a.toUpperCase());
      i.type = 'text';
      i.inputMode = 'decimal';
      i.addEventListener('change', () => {
        const v = parseFloat(String(i.value).replace(',', '.'));
        if (!isFinite(v)) { this._afficherCurseur(); return; }
        const c = this.state.curseur.slice();
        c[k] = v;
        this._placerCurseurEn(c);
      });
      ligne.appendChild(i);
      return i;
    });
    const action = (icone, texte, fn) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'ed-curseur-action';
      b.appendChild(uiPic(ED_ICONES + icone + '.svg'));
      const t = document.createElement('span');
      t.textContent = texte;
      b.appendChild(t);
      b.addEventListener('click', () => { this._deroulerCurseur(false); fn(); });
      liste.appendChild(b);
      return t;
    };
    action('ph--selection-bold', 'Curseur → sélection', () => {
      if (!this._indices().length) { this._message('Rien de sélectionné'); return; }
      this._placerCurseurEn(this._centre());
    });
    action('lucide--move-3d', 'Curseur → origine', () => this._placerCurseurEn([0, 0, 0]));
    // Centre de l'objet édité (mode Géométrie) ou de toute la scène : libellé mis à jour par _afficherReglages
    this.texteCentre = action('iconoir--box-3d-center', 'Curseur → centre de la scène', () => {
      const b = this._geo() ? this.maillage.boite() : this._boiteMonde(this._affiches());
      this._placerCurseurEn(b ? [0, 1, 2].map(k => (b.min[k] + b.max[k]) / 2) : [0, 0, 0]);
    });
    action('iconoir--select-point-3d', 'Curseur → centre de la vue', () => this._placerCurseurEn(this.cam.cible.slice()));
    action('3d-move', 'Sélection → curseur', () => this._selectionVersCurseur());
    action('screen-move', 'Vue → curseur', () => this._vueVersCurseur());
    boite.append(ligne, liste);
    parent.appendChild(boite);
    this.teteCurseur = tete;
    this._afficherCurseur();
  }

  // Déroule (true), replie (false) ou inverse (sans argument) le menu du curseur
  _deroulerCurseur(ouvrir) {
    const b = this.boiteCurseur;
    if (!b) return;
    const o = ouvrir === undefined ? !b.classList.contains('ouvert') : ouvrir;
    b.classList.toggle('ouvert', o);
    this.teteCurseur.setAttribute('aria-expanded', String(o));
  }

  // Aide : gestes et outils de l'éditeur
  // Onglets du panneau Aide (ED_AIDE) : chaque rubrique est rangée dans un onglet, rendue à son ouverture
  _aide() {
    const parOnglet = new Map(ED_AIDE.map(([id]) => [id, []]));
    const rubrique = (onglet, titre, lignes) => parOnglet.get(onglet).push([titre, lignes]);
    const rendre = (corps, titre, lignes) => {
      const t = document.createElement('span');
      t.className = 'ed-rubrique';
      t.textContent = titre;
      // Un élément par geste : titre à chevron, paragraphe dessous, replié à chaque affichage de l'onglet
      const l = document.createElement('div');
      l.className = 'ed-aide';
      for (const [geste, effet] of typeof lignes === 'function' ? lignes() : lignes) {
        const d = document.createElement('details');
        const titre = document.createElement('summary');
        const nom = document.createElement('span');
        nom.textContent = geste;
        titre.appendChild(nom);
        titre.insertAdjacentHTML('beforeend', uiSvg('<path d="M6 9l6 6 6-6"/>', 'ed-chevron'));
        const texte = document.createElement('p');
        texte.textContent = effet.charAt(0).toUpperCase() + effet.slice(1) + '.';
        d.append(titre, texte);
        l.appendChild(d);
      }
      corps.append(t, l);
    };
    rubrique('scene', 'Modes', [
      ['Scène', 'placer et orienter les objets : la poignée, les champs X / Y / Z et le curseur agissent sur leurs origines'],
      ['Géométrie', 'modifier les sommets et les faces des objets édités ; les autres objets sont estompés et inertes'],
      ['Géométrie (en haut), ou double appui sur un objet', 'éditer ensemble la géométrie des objets sélectionnés (l’actif compris), ou de l’objet touché s’il ne l’est pas'],
      ['Plusieurs objets en Géométrie', 'chacun garde ses sommets et ses faces : une face ou une fusion ne peut pas relier deux objets ; un sommet ajouté va à l’objet du dernier sommet sélectionné'],
      ['↶ ↷', 'l’annulation traverse les deux modes et y ramène']
    ]);
    rubrique('scene', 'Scène', [
      ['Appui sur un objet', 'le sélectionner ; sur un objet déjà sélectionné, il devient actif, puis se désélectionne'],
      ['Objet actif', 'le dernier choisi, plus clair ; c’est lui qu’on édite et qu’on exporte seul'],
      ['Appui long sur un objet', 'ne sélectionner que lui'],
      ['Appui long ailleurs', 'tout désélectionner'],
      ['Glisser un objet sélectionné', 'comme l’origine de la poignée']
    ]);
    rubrique('interface', 'Panneaux latéraux (pastilles en haut à gauche)', [
      ['Fichier · Aide · Réglages', 'ouvrir ou fermer leur contenu dans le panneau, un seul à la fois, organisé en onglets'],
      ['Panneau', 'à droite en paysage, en bas en portrait : la vue se réduit pour lui laisser la place ; ✕ ou la même pastille le referme'],
      ['Objets (pastille à arborescence)', 'ouvrir ou fermer la liste des objets dans un second panneau, sur le bord opposé : à gauche en paysage, en haut en portrait ; les deux peuvent être ouverts ensemble ; seule la pastille le referme (pas de ✕, pour qu’il puisse être plus étroit)'],
      ['Glisser la frontière', 'régler la taille d’un panneau (gardée pour chaque orientation) ; double appui : taille par défaut'],
      ['Couleurs', 'interface, vue 3D, géométrie, sélection et objets de l’éditeur seul ; ↺ remet une couleur par défaut']
    ]);
    rubrique('interface', 'Rendu (interrupteur en tête de la boîte Scène / Géométrie : chaque appui passe au rendu suivant)', [
      ['Solide (les deux modes)', 'faces opaques, colorées d’après la sélection (couleurs de l’onglet Réglages), éclairées par une lampe qui suit la caméra : la face qu’on regarde est toujours claire ; en Scène, les objets choisis sont cernés de leur silhouette'],
      ['Rayons X (Géométrie)', 'faces translucides, même lampe qu’en Solide : voir et toucher les sommets et arêtes cachés'],
      ['En jeu (Scène)', 'chaque objet avec son matériau (couleur diffuse, émission, opacité), sous le soleil fixe de la scène, sans paliers d’éclairage ; les objets choisis sont cernés de leur silhouette'],
      ['Changer de mode', 'un rendu qui n’y est pas proposé repasse en Solide'],
      ['Silhouette', 'arêtes dont une face est tournée vers vous et l’autre non, et arêtes de bord : le contour de l’objet tel qu’on le voit, recalculé à chaque mouvement de la vue']
    ]);
    rubrique('interface', 'Menus d’opérations (en haut)', [
      ['Scène', 'ajouter un objet (primitives et visserie : mode Scène seulement), recadrer, placer le curseur 3D, nouvelle scène'],
      ['Objets (mode Scène)', 'origine des objets choisis, dupliquer, supprimer, modifieurs, sélection'],
      ['Faces · Arêtes · Sommets (mode Géométrie)', 'opérations sur les éléments sélectionnés de ce type, et conversions de la sélection (faces → sommets…)'],
      ['Détail', 'chaque opération est décrite dans les rubriques « Menu … » des onglets Scène et Géométrie']
    ]);
    rubrique('interface', 'Ajout d’une primitive ou de visserie', [
      ['Réglages', 'dans le panneau latéral (à droite en paysage, en bas en portrait) ; l’aperçu, sur le curseur 3D et cerné comme un objet choisi, suit chaque réglage validé (frappe au clavier : après une courte pause)'],
      ['Ajouter', 'pose l’objet et referme le panneau ; grisé tant qu’un champ est invalide ou que la ligne d’information signale un problème (en rouge)'],
      ['Annuler, ✕, autre panneau ou mode Géométrie', 'abandonne l’ajout, l’aperçu disparaît'],
      ['Visserie : Paramètres détaillés', 'repris de la taille choisie, puis libres : diamètre, pas, profondeur du filet, épaisseur de son sommet et de sa gorge, hauteur filetée et hauteur sans filet sous la tête (écrou : hauteur et sur plats ; rondelle : diamètres et épaisseur) ; pour l’impression 3D, un jeu : vis un peu plus fine ou écrou un peu plus large, sommet et gorge élargis ; toucher une taille reprend ses valeurs'],
      ['Visserie : méthode du filet (vis, écrou, tige)', 'Soustraction (par défaut) : corps lisse chanfreiné moins un outil de coupe d’un seul tenant, le profil du creux entre deux filets (trapèze, triangle si la gorge est nulle) incliné de l’angle d’hélice et recopié Segments par tour fois en hélice : flancs plans, arêtes nettes ; vis : sortie de filet sur le dernier tour sous la tête ; écrou : prisme chanfreiné moins une tige filetée de mêmes réglages ; Manifold est chargé au premier usage, le calcul prend jusqu’à une seconde ou deux · Anneaux : filet construit anneau par anneau (Anneaux par pas), sans Manifold, plus approximatif'],
      ['Visserie : unités', '1 unité = 1 mm ; la vue se cadre sur le premier aperçu']
    ]);
    rubrique('interface', 'Pavé numérique', [
      ['Champ numérique touché', 'le pavé s’ouvre à côté de lui, à la place du clavier du téléphone ; la valeur du champ y est reprise, en surbrillance : un chiffre la remplace, un opérateur la prolonge'],
      ['Calcul', '+ − × ÷ et parenthèses : « 2×3+0,5 », « 1÷3 » ; le résultat s’affiche dessous ; ± change le signe'],
      ['OK · Suivant', 'OK applique la valeur au champ ; Suivant l’applique et passe au champ suivant (X → Y → Z…) ; une saisie vide vide le champ'],
      ['Appui ailleurs', 'referme le pavé sans rien changer'],
      ['⌨', 'rend ce champ au clavier du téléphone, jusqu’à ce qu’on le quitte'],
      ['Barre du haut (⠿)', 'la glisser déplace le pavé ; il revient à cette place tant qu’il n’y cache pas le champ'],
      ['Désactiver', 'onglet Réglages de l’application (menu de navigation), rubrique Saisie']
    ]);
    rubrique('interface', 'Barre d’accès rapide (en bas)', [
      ['Opérations', 'celles des menus du haut retenues dans Réglages › Barre rapide, quand elles s’appliquent à la sélection ; elles changent avec elle (l’ordre, lui, ne change pas)'],
      ['Mode Scène', 'objets choisis : dupliquer, supprimer, éditer la géométrie, origine ; aucun objet choisi : ajouter une primitive (panneau de réglages avec aperçu : le cube par défaut, les autres dans Réglages › Barre rapide) ou un fichier'],
      ['Mode Géométrie', '⊶ Liés (élément actif), puis les opérations du type de l’élément actif, puis celles des autres types sélectionnés (faces, arêtes, sommets), séparées par un trait'],
      ['✕ Faces, ✕ Sommets', 'supprimer les faces (sommets gardés), ou les sommets et leurs faces'],
      ['Défilement', 'glisser la barre si les opérations ne tiennent pas (fondu au bord) ; ↶ Annuler et ↷ Rétablir restent à droite'],
      ['Réglages › Barre rapide', 'choisir, pour chaque opération des menus, si elle figure dans la barre (par groupe : objets, faces, arêtes, sommets, vue…) ; toucher son nom (⌄) déplie sa description ; « Revenir aux opérations par défaut » efface ces choix']
    ]);
    rubrique('scene', 'Modifieurs (bouton à clé en haut, mode Scène)', [
      ['Bouton Modifieurs', 'ouvrir ou fermer la pile de l’objet actif dans le panneau latéral ; elle suit l’objet actif'],
      ['Pile', 'modifieurs de l’objet actif, appliqués dans l’ordre sans toucher à son maillage (↑ ↓ pour les réordonner)'],
      ['Interrupteur', 'activer ou neutraliser un modifieur'],
      ['⁂ Répétition', 'N copies décalées : en fraction de la taille de l’objet (relatif) ou en distance (constant) ; « Unir » les fond en un seul volume'],
      ['◐ Booléen', 'différence, union ou intersection avec la cible, qui s’affiche alors en fil de fer et se déplace normalement'],
      ['Volumes fermés', 'les booléens demandent des maillages fermés (chaque arête entre deux faces)'],
      ['Appliquer', 'figer le modifieur dans le maillage (pour l’éditer en mode Géométrie)'],
      ['Exports', 'modifieurs appliqués ; la scène n’exporte ni les objets cachés ni les cibles des booléens'],
      ['Projet .gda (Fichier)', 'toute la scène dans un seul fichier, sans perte : objets, noms, sets, modifieurs, faces polygonales ; « Ouvrir un projet » la remplace (annulable)']
    ]);
    rubrique('scene', 'Matériaux (bouton Matériaux en haut, mode Scène)', [
      ['Un matériau par objet', 'un modèle fait de plusieurs matières est fait de plusieurs maillages ; le panneau ne s’ouvre qu’en mode Scène'],
      ['Bibliothèque', 'les matériaux du projet, partagés : changer un matériau change tous les objets qui l’utilisent'],
      ['Toucher un matériau', 'l’appliquer aux objets choisis'],
      ['Réglages', 'ceux du format .mtl (Kd, Ke, d, illum, Ka, Ks, Ns, Ni), pour le matériau de l’objet actif ; l’éclairage en paliers relève des paramètres de rendu du moteur, les textures viendront plus tard'],
      ['En jeu et à l’export', 'diffuse (Kd), émission (Ke : la couleur que le matériau dégage, même à l’ombre), opacité (d), éclairage (illum ; 0 : couleur seule, sans relief)'],
      ['À l’export seulement', 'ambiante (Ka), spéculaire (Ks, couleur des reflets), brillance (Ns, 0 à 1000 : reflets larges ou serrés), réfraction (Ni, indice : 1 air, 1,33 eau, 1,5 verre) ; gardés dans le projet et le .mtl, sans effet dans le rendu du moteur'],
      ['Fichier → Importer un .mtl', 'chaque matériau lu remplace celui du même nom, ou s’ajoute à la bibliothèque ; ses objets le prennent aussitôt (annulable)'],
      ['＋ Matériau · Dupliquer', 'un matériau neuf, ou la copie de celui de l’objet actif, appliqué aux objets choisis'],
      ['Supprimer', 'ses objets reprennent le matériau par défaut, qui ne se renomme ni ne se supprime'],
      ['Import', 'un objet à plusieurs matériaux est coupé en un objet par matériau, rangés dans un set au nom du fichier'],
      ['Exports', 'OBJ : « usemtl » et « mtllib materiaux.mtl » (Fichier → Exporter → MTL, à placer à côté) ; GLB : couleur, émission et opacité de chaque matériau ; STL : sans couleur']
    ]);
    rubrique('scene', 'Liste des objets (pastille Objets)', [
      ['Ligne d’état', 'sous les menus : nombre d’objets ou de sommets et de faces, sélection, angle ou facteur pendant un glissé, échelle de l’objet choisi quand elle n’est pas 1'],
      ['Œil', 'afficher ou cacher un objet, ou tout un set (œil barré) ; caché, il ne se touche plus'],
      ['Appui sur un objet', 'le choisir, comme dans la vue (mode Scène)'],
      ['Appui long sur un objet', 'menu des sets : y déplacer l’objet (son set est coché), ou dans un nouveau set'],
      ['Nom d’un set', 'le replier ou le déplier'],
      ['＋ Set (en haut du panneau, à droite de la pastille)', 'ajouter un set'],
      ['⋯', 'renommer le set, le fusionner dans un autre, le supprimer seul ou avec ses objets ; le premier set reçoit les objets par défaut']
    ]);
    rubrique('geometrie', 'Géométrie : sélection', [
      ['Filtres • ╱ ◭ (à droite de Géométrie)', 'appui : ce type d’élément seul sélectionnable ; appui long : l’ajouter ou le retirer (au moins un reste). Un type éteint met de côté ses éléments choisis, qui reviennent quand on le rallume'],
      ['Appui sur un sommet, une arête ou une face', 'le sélectionner ou le désélectionner, lui seul (une face choisie ne marque pas ses sommets) ; un sommet proche passe avant une arête, une arête avant une face'],
      ['Glisser depuis un élément choisi', 'déplacer toute la sélection : les sommets des arêtes et faces choisies suivent'],
      ['Appui long sur un élément', 'ne sélectionner que lui'],
      ['Appui long ailleurs', 'tout désélectionner'],
      ['Numéros', 'ordre de sélection, utilisé pour créer une face'],
      ['Rendu Rayons X', 'voir et toucher les sommets et arêtes cachés derrière les faces (interrupteur de rendu, en tête de la boîte Scène / Géométrie)']
    ]);
    rubrique('transformer', 'Translation, rotation et échelle', [
      ['Interrupteur ✥ / ↻ / ⤢', 'choisir l’opération de la poignée : translation, rotation ou mise à l’échelle'],
      ['X · Y · Z', 'axes autorisés (au moins un)'],
      ['Pivot ⌄ (rotation, échelle)', 'point autour duquel tourner ou depuis lequel agrandir : point médian, centre de la boîte, élément actif (dernier élément sélectionné), curseur 3D, origine'],
      ['Glisser un anneau', 'tourner autour de cet axe, d’autant que le doigt tourne autour du pivot'],
      ['Glisser l’anneau blanc, le pivot ou un sommet sélectionné', 'tourner autour de l’axe de vue (trois axes cochés), sinon autour de l’axe coché le plus face à l’écran'],
      ['Pas (rotation)', 'angle par crans (15° par défaut)'],
      ['Glisser le cube d’un axe (échelle)', 'étirer le long de cet axe : éloigner le doigt du pivot agrandit, le rapprocher réduit'],
      ['Glisser l’anneau blanc, le pivot ou un sommet sélectionné (échelle)', 'agrandir ou réduire selon les axes cochés'],
      ['Pas (échelle)', 'facteur par crans (0,1 par défaut)'],
      ['Échelle en mode Scène', 'change l’échelle propre des objets (et leurs positions autour du pivot), sans toucher à leur maillage ; un objet tourné de biais (pas de quarts de tour) ne peut pas être étiré selon un axe du monde par sa propre échelle : l’étirement va alors à son maillage. Objets → Appliquer l’échelle la fige dans le maillage'],
      ['Au lâcher', 'panneau « dernière opération » sous X / Y / Z : modifier le décalage, l’angle, l’axe, les facteurs ou le pivot ; ✕ ou toute autre modification le referme']
    ]);
    rubrique('transformer', 'Translation (poignée)', [
      ['Glisser l’extrémité d’un axe', 'déplacer la sélection le long de cet axe'],
      ['Glisser l’origine (cube)', 'déplacer selon les axes cochés'],
      ['Glisser un sommet (ou un objet) sélectionné', 'comme l’origine'],
      ['Axes cochés', 'trois = face à l’écran, deux = dans leur plan, un = le long de l’axe'],
      ['Pas, entre les axes et le pivot', 'appui : transformer par crans réguliers (incrément : le déplacement avance d’un demi-carreau de grille, ou de la valeur réglée, depuis la position de départ) ; appui long : régler le pas de déplacement, d’angle et d’échelle'],
      ['Champs X, Y, Z', 'saisir la position du centre de la sélection (sommets, ou origines des objets)'],
      ['Rotation ° (mode Scène, un seul objet choisi)', 'angles en degrés autour de X, puis de Y, puis de Z (ordre XYZ), autour de l’origine de l’objet ; les valeurs saisies restent affichées tant que l’objet ne tourne pas autrement (une même orientation s’écrit de plusieurs façons)'],
      ['Dimensions (mode Scène, un seul objet choisi)', 'taille de l’objet le long de ses propres axes (boîte de son maillage, modifieurs compris, multipliée par son échelle) : saisir une dimension en déduit le facteur d’échelle sur cet axe ; un objet plat n’a pas de facteur possible sur son axe nul (champ grisé)']
    ]);
    rubrique('interface', 'Vue', [
      ['Glisser hors poignée', 'tourner autour du modèle'],
      ['Pincer', 'zoomer'],
      ['Glisser à deux doigts', 'déplacer la vue (mode de sélection Boîte : tourner autour du modèle)'],
      ['Tourner à deux doigts', 'pivoter autour de l’axe vertical (sauf en mode Boîte)'],
      ['Glisser à trois doigts', 'déplacer la vue, dans tous les modes'],
      ['Double appui dans le vide, ou Scène → Recadrer', 'recadrer : sur l’objet édité, sinon sur les objets sélectionnés ou toute la scène']
    ]);
    rubrique('interface', 'Mode de sélection (en tête de la barre d’outils)', [
      ['Interrupteur', 'chaque appui passe au mode suivant ; le pictogramme montre le mode courant, la glissière sa position'],
      ['Toucher', 'un appui choisit ou retire l’élément touché (objet en mode Scène), un glissé hors poignée tourne la vue'],
      ['Boîte : un doigt', 'tracer un rectangle ; mode Géométrie : sommets dedans, arêtes dont les deux bouts y sont, faces dont tous les sommets y sont, selon les filtres ; sans Rayons X, seulement ceux qui se voient ; mode Scène : objets affichés dont le centre y est'],
      ['Boîte : ＋ / −', 'à côté de l’interrupteur : la boîte ajoute à la sélection, ou en retire ; l’appui long dans le vide désélectionne toujours tout'],
      ['Boîte : deux doigts, trois doigts', 'deux doigts tournent la vue autour du modèle (pincer : zoom), trois doigts la déplacent ; les poignées de transformation restent actives au doigt'],
      ['Chemin (mode Géométrie)', 'le premier appui choisit l’élément de départ ; chaque appui suivant sur un élément du même type ajoute le plus court chemin depuis l’élément actif, et l’élément touché devient l’actif (tronçons à la suite) : sommets le long des arêtes (longueur réelle, arêtes libres comprises), arêtes par leurs extrémités, faces de face en face par les arêtes communes ; un appui sur l’actif le retire, sur un autre type le bascule ; gestes de la vue comme en Toucher ; en mode Scène, comme Toucher']
    ]);
    rubrique('transformer', 'Curseur 3D', [
      ['Anneau rayé', 'point de repère : « Sommets → Ajouter » y crée le nouveau sommet'],
      ['Curseur ⌄', 'saisir sa position, ou le placer sur la sélection, l’origine, le centre du modèle ou de la vue']
    ]);
    // Menus d'opérations : une rubrique par menu, tirée de _operations (libellé et description de chaque opération),
    // lue à l'affichage de l'onglet ; menus de la géométrie dans l'onglet Géométrie, les autres dans l'onglet Scène.
    // Entrée « Rubrique → libellé », ou le libellé seul s'il a déjà sa flèche (« Origine → curseur 3D »)
    for (const [id, nom, modes] of ED_MENUS) {
      rubrique(modes.includes('scene') ? 'scene' : 'geometrie', 'Menu ' + nom, () =>
        this._operations(id).rubriques.flatMap(([t, items]) =>
          items.map(it => [it.libelle.includes('→') ? it.libelle : t + ' → ' + it.libelle, it.aide])));
    }
    return ED_AIDE.map(([id, libelle]) => [id, libelle, corps => {
      for (const [titre, lignes] of parOnglet.get(id)) rendre(corps, titre, lignes);
    }]);
  }

  _ouvrirFichier(onglet) { this.panneau.ouvrir('fichier', onglet); }

  _afficherReglages() {
    for (const a in this.btnAxes) this.btnAxes[a].classList.toggle('on', this.state.axes[a]);
    for (const k in this.btnModes) this.btnModes[k].classList.toggle('on', k === this.state.mode);
    this.btnPivot.hidden = this.state.mode === 'translation';
    const piv = ED_PIVOTS.find(p => p[0] === this.state.pivot) || ED_PIVOTS[0];
    if (this.btnPivot._pivot !== piv[0]) {
      this.btnPivot._pivot = piv[0];
      this.btnPivot.replaceChildren(this._icone(piv[2]));
      this.btnPivot.insertAdjacentHTML('beforeend', uiSvg('<path d="M6 9l6 6 6-6"/>', 'ed-chevron'));
      this.btnPivot.setAttribute('aria-label', 'Point pivot : ' + piv[1]);
    }
    for (const id in this.btnPivots) this.btnPivots[id].classList.toggle('on', id === piv[0]);
    this._habillerPoignee();
    this.btnPas.classList.toggle('on', this.state.pas.actif);
    const lr = this._rendus(), ir = lr.findIndex(e => e[0] === this._rendu()), rendu = lr[ir];
    if (this.btnRendu.dataset.rendu !== rendu[0] + ' ' + lr.length) {
      this.btnRendu.dataset.rendu = rendu[0] + ' ' + lr.length;
      const tri = document.createElement('span');
      tri.className = 'ed-tri';
      tri.style.setProperty('--p', ir);
      tri.style.setProperty('--n', lr.length);
      tri.appendChild(document.createElement('i'));
      this.btnRendu.replaceChildren(this._icone(rendu[2]), tri);
      this.btnRendu.setAttribute('aria-label', 'Rendu : ' + rendu[1] + ' (appui : ' + lr[(ir + 1) % lr.length][1] + ')');
    }
    const ls = ED_SELECTIONS, is = ls.findIndex(e => e[0] === this._modeSelection()), sel = ls[is];
    if (this.btnSelection.dataset.mode !== sel[0]) {
      this.btnSelection.dataset.mode = sel[0];
      const tri = document.createElement('span');
      tri.className = 'ed-tri';
      tri.style.setProperty('--p', is);
      tri.style.setProperty('--n', ls.length);
      tri.appendChild(document.createElement('i'));
      this.btnSelection.replaceChildren(this._icone(sel[2]), tri);
      this.btnSelection.setAttribute('aria-label', 'Sélection : ' + sel[1] + ' (appui : ' + ls[(is + 1) % ls.length][1] + ')');
    }
    this.btnBoiteSens.hidden = sel[0] !== 'boite';
    this.btnBoiteSens.textContent = this.state.boiteRetire ? '−' : '＋';
    this.btnBoiteSens.setAttribute('aria-label', this.state.boiteRetire ? 'La boîte retire de la sélection (appui : ajouter)' : 'La boîte ajoute à la sélection (appui : retirer)');
    const geo = this._geo();
    for (const k in this.btnEditions) this.btnEditions[k].classList.toggle('on', k === this.state.edition);
    this.filtresEl.hidden = !geo;
    for (const k in this.btnFiltres) this.btnFiltres[k].classList.toggle('on', !!this._filtres()[k]);
    if (this.btnMenus) {
      for (const [id, , modes] of ED_MENUS) this.btnMenus[id].hidden = !modes.includes(this.state.edition);
      this.btnModifs.hidden = geo;
      this.btnMateriaux.hidden = geo;
    }
    if (this.texteCentre) this.texteCentre.textContent = geo ? (this.edites.length > 1 ? 'Curseur → centre des objets édités' : 'Curseur → centre de l’objet') : 'Curseur → centre de la scène';
    if (this.btnAnnuler) {
      this.btnAnnuler.disabled = !this.annuler.length;
      this.btnRetablir.disabled = !this.retablir.length;
    }
    this._afficherAcces();
  }

  _filtres() {
    const f = this.state.filtres;
    return f && (f.sommets || f.aretes || f.faces) ? f : (this.state.filtres = { sommets: true, aretes: true, faces: true });
  }

  // Active le filtre du type d'élément `t` ('s', 'a', 'f') pour que ses éléments choisis soient visibles
  _rendreSelectionnable(t) {
    const f = this._filtres(), cle = Object.keys(ED_TYPES).find(k => ED_TYPES[k] === t);
    if (!f[cle]) { f[cle] = true; this.save(); if (this.sel) this.sel.montrer(t); }
  }

  // Filtre de sélection ajouté ou retiré (au moins un reste actif)
  _basculerFiltre(cle) {
    const f = this._filtres();
    if (f[cle] && ED_FILTRES.filter(([k]) => f[k]).length === 1) { this._message('Au moins un type d’élément doit rester sélectionnable'); return; }
    this._reglerFiltres(Object.assign({}, f, { [cle]: !f[cle] }));
  }

  // Ce filtre seul actif
  _filtreSeul(cle) {
    this._reglerFiltres({ sommets: false, aretes: false, faces: false, [cle]: true });
  }

  // Nouveaux filtres actifs. Type éteint : ses éléments choisis sont mis de côté (ils ne bougeraient plus qu'à l'insu),
  // rendus au rallumage
  _reglerFiltres(nouveaux) {
    const f = this._filtres();
    for (const [cle] of ED_FILTRES) {
      if (!!f[cle] === !!nouveaux[cle]) continue;
      f[cle] = !!nouveaux[cle];
      if (this._geo()) { if (f[cle]) this.sel.montrer(ED_TYPES[cle]); else this.sel.masquer(ED_TYPES[cle]); }
    }
    this.save();
    this._afficherReglages();
    this._numerosSales = true;
    this._rafraichir();
  }

  // Axes autorisés pour les translations (au moins un reste coché)
  _basculerAxe(a) {
    const ax = this.state.axes;
    if (ax[a] && ED_AXES.filter(b => ax[b]).length === 1) { this._message('Au moins un axe doit rester actif'); return; }
    ax[a] = !ax[a];
    this.save();
    this._afficherReglages();
    if (this.m) this.m.redessiner();
  }

  _message(texte, erreur) {
    if (this.app && this.app.toast) this.app.toast(texte, erreur ? 'err' : undefined);
  }

  // Informations (ligne d'état sous les menus) : en mode Géométrie, nombre de sommets et de faces ; sélection ;
  // coordonnées du centre de la sélection ; liste des objets
  _afficherInfos() {
    const n = this._indices().length, pl = k => k > 1 ? 's' : '';
    const sel = this._geo() ? (this.sel.vide ? '' : ' · choix : ' + this._resumeSelection()) : n ? ` · ${n} choisi${pl(n)}` : '';
    if (this._geo()) {
      const mm = this.maillage;
      this.infos.textContent = `${mm.sommets.length} sommets · ${mm.faces.length} faces` + sel;
    } else {
      const k = this.objets.length, o = this._seul();
      this.infos.textContent = `${k} objet${pl(k)}` + sel;
      if (o && o.echelle.some(f => f !== 1)) this.infos.textContent += ' · échelle ' + o.echelle.map(f => '×' + +f.toFixed(3)).join(' ');
    }
    if (this._glisse && this._glisse.degres !== undefined) this.infos.textContent += ` · ↻ ${this._glisse.degres}°`;
    if (this._glisse && this._glisse.facteur !== undefined) this.infos.textContent += ` · ×${+this._glisse.facteur.toFixed(2)}`;
    this._afficherListe();
    this._afficherModifs();
    this._afficherMateriaux();
    this.coords.classList.toggle('vide', !n);
    const c = this._centre();
    ['x', 'y', 'z'].forEach((a, k) => {
      const i = this.champs[a];
      i.disabled = !n;
      if (document.activeElement !== i) i.value = n ? +c[k].toFixed(4) : '';
    });
    // Rotation et dimensions : un seul objet choisi, en mode Scène
    const o = this._seul();
    this.transfo.classList.toggle('complet', !!o);
    this.coordsRot.hidden = this.coordsDim.hidden = !o;
    if (o) {
      const deg = this._euler(o), { base, dim } = this._dimensions(o);
      ED_AXES.forEach((a, k) => {
        const r = this.champsRot[a], t = this.champsDim[a];
        if (document.activeElement !== r) r.value = +deg[k].toFixed(2);
        t.disabled = !(base[k] > 1e-9);   // objet plat sur cet axe : aucun facteur ne donnerait une autre dimension
        if (document.activeElement !== t) t.value = +dim[k].toFixed(4);
      });
    }
    this._afficherReglages();
  }

  // Seul objet choisi, en mode Scène (champs de rotation et de dimensions) ; null sinon
  _seul() { return !this._geo() && this.choix.length === 1 ? this.objets[this.choix[0]] || null : null; }

  // Angles de la rotation de `o`, en degrés (ordre XYZ) : ceux saisis tant que la rotation n'a pas changé autrement
  // (une même orientation s'écrit de plusieurs façons), sinon déduits du quaternion
  _euler(o) {
    const cle = o.rotation.join(' ');
    if (!o._euler || o._euler.cle !== cle) {
      const e = new THREE.Euler().setFromQuaternion(new THREE.Quaternion().fromArray(o.rotation), 'XYZ');
      o._euler = { cle, deg: [e.x, e.y, e.z].map(v => v * 180 / Math.PI + 0) };   // + 0 : pas de « -0 »
    }
    return o._euler.deg;
  }

  // Dimensions de `o` selon ses propres axes : boîte de son maillage modifié (base), multipliée par son échelle
  _dimensions(o) {
    const b = this._evalue(o).boite(), base = b ? b.max.map((v, k) => v - b.min[k]) : [0, 0, 0];
    return { base, dim: base.map((v, k) => v * o.echelle[k]) };
  }

  // ----- Menus d'opérations -------------------------------------------------------------------------
  // Carte d'actions d'un menu, construite à l'ouverture (d'après le mode et la sélection du moment)
  // Opérations du menu `id` (ED_MENUS), source commune des menus du haut et de la barre d'accès rapide :
  // { resume: [textes], rubriques: [[titre, items]] } ; item : { libelle, action, off (désactivé), barre, aide },
  // `barre` = { groupe, glyphe, court (libellé court), defaut (dans la barre par défaut, vrai si absent) } pour
  // l'offrir à la barre (groupes : ED_ACCES, voir _acces ; identifiant « groupe:court », choix de l'utilisateur dans
  // state.acces) ; `aide` : description fixe, indépendante de la sélection (rubriques de l'aide, onglet Barre rapide)
  _operations(id) {
    const resume = [], rubriques = [], pl = k => k > 1 ? 's' : '';
    const geo = this._geo(), n = geo ? this.sel.sommets.length : 0, nc = this.choix.length;
    if (id === 'scene') {
      resume.push(`${this.objets.length} objet${pl(this.objets.length)} · ${this.sets.length} set${pl(this.sets.length)}`);
      rubriques.push(['Ajouter', [
        { libelle: 'Cube…', action: () => this._ajoutPrimitive('cube'), off: geo,
          barre: { groupe: 'ajout', glyphe: '＋', court: 'Cube' },
          aide: 'mode Scène : régler ses dimensions sur les trois axes, puis l’ajouter sur le curseur 3D, dans le set de l’objet actif' },
        { libelle: 'Cylindre…', action: () => this._ajoutPrimitive('cylindre'), off: geo,
          barre: { groupe: 'ajout', glyphe: '⌀', court: 'Cylindre', defaut: false },
          aide: 'mode Scène : régler rayon, hauteur (axe Y), nombre de côtés et fermeture des bases (un polygone, ou un éventail de triangles autour d’un sommet central), puis l’ajouter sur le curseur 3D' },
        { libelle: 'Cône…', action: () => this._ajoutPrimitive('cone'), off: geo,
          barre: { groupe: 'ajout', glyphe: '△', court: 'Cône', defaut: false },
          aide: 'mode Scène : régler rayon de la base, rayon du haut (0 : pointe, sinon tronc de cône), hauteur (axe Y), nombre de côtés et fermeture des bases (polygone ou éventail), puis l’ajouter sur le curseur 3D' },
        { libelle: 'Sphère UV…', action: () => this._ajoutPrimitive('sphere'), off: geo,
          barre: { groupe: 'ajout', glyphe: '◍', court: 'Sphère UV', defaut: false },
          aide: 'mode Scène : régler rayon, segments (méridiens) et anneaux (bandes entre les pôles, sur l’axe Y) ; quadrilatères, triangles autour des pôles ; puis l’ajouter sur le curseur 3D' },
        { libelle: 'Icosphère…', action: () => this._ajoutPrimitive('icosphere'), off: geo,
          barre: { groupe: 'ajout', glyphe: '⬡', court: 'Icosphère', defaut: false },
          aide: 'mode Scène : régler rayon et subdivisions (1 : icosaèdre de 20 triangles, chaque subdivision coupe chaque triangle en quatre) ; triangles presque égaux, sans pôles ; puis l’ajouter sur le curseur 3D' },
        { libelle: 'Modèle ou fichier…', action: () => this._ouvrirFichier('importer'),
          barre: { groupe: 'ajout', glyphe: '⤓', court: 'Fichier' },
          aide: 'ajouter sur le curseur 3D un modèle du projet ou un fichier du téléphone (OBJ, STL, glTF / GLB) ; un OBJ à plusieurs objets en donne un par objet, dans un set à son nom' }
      ]]);
      rubriques.push(['Visserie', [
        { libelle: 'Vis…', action: () => this._ajoutPrimitive('vis'), off: geo,
          barre: { groupe: 'ajout', glyphe: '⊤', court: 'Vis', defaut: false },
          aide: 'mode Scène : vis ou boulon métrique ISO (1 unité = 1 mm), filet réel en hélice : taille M2 à M24, tête hexagonale (H), cylindrique ou fraisée à six pans creux (CHC, FHC), longueur, filetage total ou partiel, finesse du filet, filet par soustraction d’un outil de coupe (sortie de filet sous la tête) ou par anneaux ; face d’appui de la tête sur l’origine, tige vers le bas (axe Y)' },
        { libelle: 'Écrou…', action: () => this._ajoutPrimitive('ecrou'), off: geo,
          barre: { groupe: 'ajout', glyphe: '⬢', court: 'Écrou', defaut: false },
          aide: 'mode Scène : écrou hexagonal ISO taraudé, taille M2 à M24, finesse du filet, filet par soustraction ou par anneaux ; se visse sur la vis de même taille ; posé sur l’origine' },
        { libelle: 'Rondelle…', action: () => this._ajoutPrimitive('rondelle'), off: geo,
          barre: { groupe: 'ajout', glyphe: '⊚', court: 'Rondelle', defaut: false },
          aide: 'mode Scène : rondelle plate ISO, taille M2 à M24, nombre de segments ; posée sur l’origine' },
        { libelle: 'Tige filetée…', action: () => this._ajoutPrimitive('tige'), off: geo,
          barre: { groupe: 'ajout', glyphe: '‖', court: 'Tige filetée', defaut: false },
          aide: 'mode Scène : tige filetée ISO chanfreinée aux deux bouts, taille M2 à M24, longueur, finesse du filet, filet par soustraction d’un outil de coupe ou par anneaux ; centrée sur l’origine' }
      ]]);
      rubriques.push(['Vue', [
        { libelle: 'Recadrer', action: () => this._recadrer(),
          barre: { groupe: 'vue', glyphe: '⛶', court: 'Recadrer', defaut: false },
          aide: 'cadrer la vue sur l’objet édité, sinon sur les objets sélectionnés ou toute la scène (aussi : double appui dans le vide)' },
        { libelle: 'Vue → curseur 3D', action: () => this._vueVersCurseur(),
          barre: { groupe: 'vue', glyphe: '◎', court: 'Vue → curs.', defaut: false },
          aide: 'centrer la vue sur le curseur 3D' }
      ]]);
      rubriques.push(['Curseur 3D', [
        { libelle: 'Curseur → origine du monde', action: () => this._placerCurseurEn([0, 0, 0]),
          barre: { groupe: 'vue', glyphe: '⌖', court: 'Curs. → 0', defaut: false },
          aide: 'ramener le curseur 3D au point 0, 0, 0' },
        { libelle: 'Curseur → centre de la scène', action: () => {
          const b = this._boiteMonde(this._affiches());
          this._placerCurseurEn(b ? [0, 1, 2].map(k => (b.min[k] + b.max[k]) / 2) : [0, 0, 0]);
        }, barre: { groupe: 'vue', glyphe: '⌖', court: 'Curs. → scène', defaut: false },
          aide: 'placer le curseur 3D au centre de la boîte des objets affichés' }
      ]]);
      rubriques.push(['Scène', [
        { libelle: 'Nouvelle scène', action: () => this._nouvelleScene(),
          barre: { groupe: 'vue', glyphe: '✱', court: 'Nouvelle scène', defaut: false },
          aide: 'repartir d’un cube seul, dans le set par défaut, avec la seule bibliothèque de matériaux par défaut (annulable)' }
      ]]);
    } else if (id === 'objets') {
      const a = this._actif();
      resume.push(nc ? `${nc} objet${pl(nc)} choisi${pl(nc)}` + (a && this.choix.includes(this.state.actif) ? ` · actif : ${a.nom}` : '') : 'Aucun objet choisi : touchez un objet');
      rubriques.push(['Origine', [
        { libelle: 'Origine → centre de la géométrie', action: () => this._origine('boite'), off: !nc,
          barre: { groupe: 'objet', glyphe: '⊡', court: 'Orig. centre' },
          aide: 'déplacer l’origine des objets choisis au centre de la boîte de leur maillage, sans bouger le maillage' },
        { libelle: 'Origine → point médian', action: () => this._origine('median'), off: !nc,
          barre: { groupe: 'objet', glyphe: '⊙', court: 'Orig. médian' },
          aide: 'déplacer l’origine des objets choisis à la moyenne de leurs sommets, sans bouger le maillage' },
        { libelle: 'Origine → curseur 3D', action: () => this._origine('curseur'), off: !nc,
          barre: { groupe: 'objet', glyphe: '⌖', court: 'Orig. curseur' },
          aide: 'déplacer l’origine des objets choisis sur le curseur 3D, sans bouger le maillage' },
        { libelle: 'Géométrie → origine', action: () => this._origine('geometrie'), off: !nc,
          barre: { groupe: 'objet', glyphe: '⇲', court: 'Géom. → orig.' },
          aide: 'déplacer le maillage des objets choisis pour centrer sa boîte sur leur origine' }
      ]]);
      rubriques.push(['Objets', [
        { libelle: 'Dupliquer', action: () => this._dupliquer(), off: !nc,
          barre: { groupe: 'objet', glyphe: '⧉', court: 'Dupliquer' },
          aide: 'copier les objets sélectionnés, sur place : glissez pour les écarter' },
        { libelle: 'Supprimer', action: () => this._supprimerObjets(), off: !nc,
          barre: { groupe: 'objet', glyphe: '✕', court: 'Supprimer' },
          aide: 'supprimer les objets sélectionnés' },
        { libelle: 'Appliquer l’échelle', action: () => this._appliquerEchelle(), off: !this.choix.some(k => this.objets[k].echelle.some(f => f !== 1)),
          barre: { groupe: 'objet', glyphe: '⤢', court: 'Appl. échelle', defaut: false },
          aide: 'figer l’échelle des objets choisis dans leur maillage : leur forme ne change pas, leur échelle revient à 1 (le décalage constant d’une répétition suit, pour que les copies restent en place)' },
        { libelle: 'Éditer la géométrie', action: () => this._changerEdition('geometrie'), off: !a,
          barre: { groupe: 'objet', glyphe: '✎', court: 'Géométrie' },
          aide: 'passer en mode Géométrie sur les objets choisis (l’actif compris) ; aussi : double appui sur un objet' },
        { libelle: 'Modifieurs…', action: () => this._basculerModifs(true), off: !a,
          barre: { groupe: 'objet', glyphe: '≋', court: 'Modifieurs', defaut: false },
          aide: 'ouvrir ou fermer la pile de modifieurs de l’objet actif dans le panneau latéral (voir Modifieurs)' },
        { libelle: 'Matériaux…', action: () => this._basculerMateriaux(true),
          barre: { groupe: 'scene', glyphe: '◍', court: 'Matériaux', defaut: false },
          aide: 'ouvrir ou fermer la bibliothèque de matériaux dans le panneau latéral (voir Matériaux)' }
      ]]);
      rubriques.push(['Sélection', [
        { libelle: 'Tout choisir', action: () => this._toutChoisir(true), off: !this._affiches().length,
          barre: { groupe: 'scene', glyphe: '▣', court: 'Tout choisir', defaut: false },
          aide: 'choisir tous les objets affichés' },
        { libelle: 'Ne rien choisir', action: () => this._toutChoisir(false), off: !nc,
          barre: { groupe: 'objet', glyphe: '▢', court: 'Rien', defaut: false },
          aide: 'désélectionner tous les objets' },
        { libelle: 'Curseur → sélection', action: () => this._placerCurseurEn(this._centre()), off: !nc,
          barre: { groupe: 'objet', glyphe: '⌖', court: 'Curs. → sél.', defaut: false },
          aide: 'placer le curseur 3D au centre de la sélection : origines des objets choisis, ou sommets sélectionnés en mode Géométrie' },
        { libelle: 'Sélection → curseur', action: () => this._selectionVersCurseur(), off: !nc,
          barre: { groupe: 'objet', glyphe: '⇥', court: 'Sél. → curs.', defaut: false },
          aide: 'déplacer la sélection pour amener son centre sur le curseur 3D' }
      ]]);
    } else if (id === 'faces') {
      const fs = this.sel.faces, nf = fs.length;
      resume.push(nf ? `${nf} face${pl(nf)} sélectionnée${pl(nf)}` : 'Aucune face : touchez-en une (filtre ◭ actif)');
      rubriques.push(['Faces', [
        { libelle: 'Créer une face', action: () => this._creerFace(), off: n < 3,
          barre: { groupe: 's', glyphe: '◭', court: 'Face' },
          aide: 'relier les sommets sélectionnés, dans l’ordre (sens inverse des aiguilles d’une montre vu de l’extérieur) ; la nouvelle face est sélectionnée' },
        { libelle: 'Inverser', action: () => this._inverser(), off: !nf,
          barre: { groupe: 'f', glyphe: '⇄', court: 'Inverser' },
          aide: 'retourner les faces sélectionnées ; l’envers est teinté' },
        { libelle: 'Trianguler', action: () => this._trianguler(), off: !fs.some(f => f.s.length > 3),
          barre: { groupe: 'f', glyphe: '◿', court: 'Trianguler' },
          aide: 'découper en triangles les faces sélectionnées de plus de 3 sommets (concaves comprises)' },
        { libelle: 'Séparer (nouvel objet)', action: () => this._separer(), off: !nf,
          barre: { groupe: 'f', glyphe: '⇱', court: 'Séparer' },
          aide: 'faire des faces sélectionnées un nouvel objet (avec les sommets qu’elles utilisent ; ceux du bord restent aussi à l’objet d’origine), à la même place, du même matériau et set ; l’objet d’origine perd ces faces et les sommets qui ne servaient qu’à elles, et il est supprimé s’il est vidé ; refusé sur un objet à modifieurs (les appliquer ou les retirer d’abord)' },
        { libelle: 'Supprimer (sommets gardés)', action: () => this._supprimerFaces(), off: !nf,
          barre: { groupe: 'f', glyphe: '✕', court: 'Faces' },
          aide: 'supprimer les faces sélectionnées ; leurs sommets restent' }
      ]]);
      rubriques.push(['Sélection', [
        { libelle: 'Toutes les faces', action: () => this._toutChoisir(true, 'f'),
          barre: { groupe: 'geo', glyphe: '▣', court: 'Toutes faces', defaut: false },
          aide: 'sélectionner toutes les faces des objets édités (le type face devient sélectionnable)' },
        { libelle: 'Aucune face', action: () => this._toutChoisir(false, 'f'), off: !nf,
          barre: { groupe: 'f', glyphe: '▢', court: 'Aucune face', defaut: false },
          aide: 'désélectionner les faces seules ; les sommets et arêtes choisis le restent' },
        { libelle: 'Éléments liés à l’actif', action: () => this._selectionnerLies(), off: !this.sel.dernier,
          barre: { groupe: 'l', glyphe: '⊶', court: 'Liés' },
          aide: 'ajouter à la sélection les sommets, arêtes et faces reliés, de proche en proche par les faces, à l’élément actif (le dernier touché) ; les filtres ne changent pas : les éléments d’un type au filtre éteint sont mis de côté et apparaissent quand on le rallume' },
        { libelle: 'Faces → leurs sommets', action: () => this._convertirSelection('f', 's'), off: !nf,
          barre: { groupe: 'f', glyphe: '•', court: 'F → sommets', defaut: false },
          aide: 'remplacer les faces sélectionnées par leurs sommets (le type sommet devient sélectionnable)' },
        { libelle: 'Faces → leurs arêtes', action: () => this._convertirSelection('f', 'a'), off: !nf,
          barre: { groupe: 'f', glyphe: '╱', court: 'F → arêtes', defaut: false },
          aide: 'remplacer les faces sélectionnées par leurs arêtes (le type arête devient sélectionnable)' }
      ]]);
    } else if (id === 'aretes') {
      const na = this.sel.aretes.length, dissolution = na ? this.maillage.dissolution(this.sel.aretes) : null;
      const depart = this._areteDepart(), anneau = depart && this.maillage.anneau(...depart);
      resume.push(na ? `${na} arête${pl(na)} sélectionnée${pl(na)}` : 'Aucune arête : touchez-en une (filtre ╱ actif)');
      if (dissolution && dissolution.erreur) resume.push(`Dissolution impossible : ${dissolution.erreur.charAt(0).toLowerCase() + dissolution.erreur.slice(1)}.`);
      rubriques.push(['Arêtes', [
        { libelle: 'Créer une arête', action: () => this._creerArete(), off: n !== 2,
          barre: { groupe: 's', glyphe: '⟋', court: 'Arête' },
          aide: 'relier les deux sommets sélectionnés (seulement deux) : s’ils appartiennent à une même face sans en être voisins, la face est coupée en deux le long de la nouvelle arête ; sinon, arête libre (sans face : exportée en OBJ, ignorée par le STL, le glTF et les booléens) ; la nouvelle arête est sélectionnée' },
        { libelle: 'Subdiviser', action: () => this._subdiviser(), off: !na,
          barre: { groupe: 'a', glyphe: '⋮', court: 'Subdiviser' },
          aide: 'couper les arêtes sélectionnées en segments égaux (1 coupe, nombre réglable ensuite dans le panneau « dernière opération ») ; les faces voisines reçoivent les nouveaux sommets, les morceaux restent sélectionnés' },
        { libelle: 'Boucle de coupe', action: () => this._boucleCoupe(), off: !anneau,
          barre: { groupe: 'a', glyphe: '⫴', court: 'Boucle' },
          aide: 'couper en travers l’anneau de quadrilatères que traverse l’arête active (la dernière touchée, ou la seule sélectionnée) : de face en face par l’arête opposée, jusqu’à une face qui n’est pas un quadrilatère, un bord ou le tour complet ; la nouvelle boucle d’arêtes est sélectionnée ; dans le panneau « dernière opération » : nombre de coupes, glissement (−1 à 1, réglette ou champ) vers l’un ou l’autre côté, Uniforme (même distance le long de chaque arête que sur l’arête active : la boucle garde la forme d’une boucle voisine) et Inverser (l’autre boucle voisine)' },
        { libelle: 'Révolution…', action: () => this._ouvrirOperation('revolution'), off: !n && !na,
          barre: { groupe: 'geo', glyphe: '↻', court: 'Révolution', defaut: false },
          aide: ED_AIDE_REVOLUTION },
        { libelle: 'Dissoudre (fusionner les faces)', action: () => this._dissoudre(), off: !dissolution || !!dissolution.erreur,
          barre: { groupe: 'a', glyphe: '◫', court: 'Dissoudre' },
          aide: 'fusionner les deux faces que borde chaque arête sélectionnée, dans le sens des faces (refusé sur une arête de bord, des faces d’orientations contraires ou si la face obtenue aurait un trou) ; la face obtenue est sélectionnée' },
        { libelle: 'Supprimer (et leurs faces)', action: () => this._supprimerAretes(), off: !na,
          barre: { groupe: 'a', glyphe: '✕', court: 'Arêtes' },
          aide: 'supprimer les arêtes sélectionnées et les faces qu’elles bordent ; les sommets restent' }
      ]]);
      rubriques.push(['Sélection', [
        { libelle: 'Toutes les arêtes', action: () => this._toutChoisir(true, 'a'),
          barre: { groupe: 'geo', glyphe: '▣', court: 'Toutes arêtes', defaut: false },
          aide: 'sélectionner toutes les arêtes des objets édités (le type arête devient sélectionnable)' },
        { libelle: 'Aucune arête', action: () => this._toutChoisir(false, 'a'), off: !na,
          barre: { groupe: 'a', glyphe: '▢', court: 'Aucune arête', defaut: false },
          aide: 'désélectionner les arêtes seules ; les sommets et faces choisis le restent' },
        { libelle: 'Éléments liés à l’actif', action: () => this._selectionnerLies(), off: !this.sel.dernier,
          barre: { groupe: 'l', glyphe: '⊶', court: 'Liés' },
          aide: 'ajouter à la sélection les sommets, arêtes et faces reliés, de proche en proche par les faces, à l’élément actif (le dernier touché) ; les filtres ne changent pas : les éléments d’un type au filtre éteint sont mis de côté et apparaissent quand on le rallume' },
        { libelle: 'Arêtes → leurs sommets', action: () => this._convertirSelection('a', 's'), off: !na,
          barre: { groupe: 'a', glyphe: '•', court: 'A → sommets', defaut: false },
          aide: 'remplacer les arêtes sélectionnées par leurs extrémités (le type sommet devient sélectionnable)' },
        { libelle: 'Arêtes → faces bordées', action: () => this._convertirSelection('a', 'f'), off: !na,
          barre: { groupe: 'a', glyphe: '◭', court: 'A → faces', defaut: false },
          aide: 'remplacer les arêtes sélectionnées par les faces qu’elles bordent (le type face devient sélectionnable)' }
      ]]);
    } else if (id === 'sommets') {
      resume.push(n ? `${n} sommet${pl(n)} sélectionné${pl(n)}` : 'Aucun sommet sélectionné');
      rubriques.push(['Sommets', [
        { libelle: 'Ajouter (sur le curseur 3D)', action: () => this._ajouterSommet(),
          barre: { groupe: 'geo', glyphe: '＋', court: 'Sommet', defaut: false },
          aide: 'ajouter un sommet sur le curseur 3D, à l’objet du dernier sommet sélectionné' },
        { libelle: 'Fusionner', action: () => this._fusionner(), off: n < 2,
          barre: { groupe: 's', glyphe: '⊙', court: 'Fusionner' },
          aide: 'réunir les sommets sélectionnés en un seul ; dans le panneau « dernière opération », sa position : Centre (moyenne), Premier ou Dernier sélectionné (choix retenu pour la fois suivante)' },
        { libelle: 'Fusionner les confondus…', action: () => this._ouvrirOperation('proches'),
          barre: { groupe: 'geo', glyphe: '⊚', court: 'Confondus', defaut: false },
          aide: 'réunir, à leur position moyenne, les sommets à moins d’une tolérance réglée dans le panneau latéral (de proche en proche ; seulement entre sommets d’un même objet) : parmi les sommets de la sélection (ceux des arêtes et faces compris), ou tout le maillage sans sélection ; l’aperçu et le nombre de sommets réunis suivent la tolérance, Fusionner valide, Annuler ou ✕ rend l’état d’avant ; les faces devenues dégénérées disparaissent' },
        { libelle: 'Révolution…', action: () => this._ouvrirOperation('revolution'), off: !n && !this.sel.aretes.length,
          barre: { groupe: 'geo', glyphe: '↻', court: 'Révolution', defaut: false },
          aide: ED_AIDE_REVOLUTION },
        { libelle: 'Supprimer (et leurs faces)', action: () => this._supprimerSommets(), off: !n,
          barre: { groupe: 's', glyphe: '✕', court: 'Sommets' },
          aide: 'supprimer les sommets sélectionnés et les faces qui les utilisent' }
      ]]);
      rubriques.push(['Sélection', [
        { libelle: 'Tous les sommets', action: () => this._toutChoisir(true, 's'),
          barre: { groupe: 'geo', glyphe: '▣', court: 'Tous sommets', defaut: false },
          aide: 'sélectionner tous les sommets des objets édités (le type sommet devient sélectionnable)' },
        { libelle: 'Aucun sommet', action: () => this._toutChoisir(false, 's'), off: !n,
          barre: { groupe: 's', glyphe: '▢', court: 'Aucun sommet', defaut: false },
          aide: 'désélectionner les sommets seuls ; les arêtes et faces choisies le restent' },
        { libelle: 'Éléments liés à l’actif', action: () => this._selectionnerLies(), off: !this.sel.dernier,
          barre: { groupe: 'l', glyphe: '⊶', court: 'Liés' },
          aide: 'ajouter à la sélection les sommets, arêtes et faces reliés, de proche en proche par les faces, à l’élément actif (le dernier touché) ; les filtres ne changent pas : les éléments d’un type au filtre éteint sont mis de côté et apparaissent quand on le rallume' },
        { libelle: 'Sommets → arêtes entre eux', action: () => this._convertirSelection('s', 'a'), off: n < 2,
          barre: { groupe: 's', glyphe: '╱', court: 'S → arêtes', defaut: false },
          aide: 'remplacer les sommets sélectionnés par les arêtes dont les deux extrémités sont sélectionnées (le type arête devient sélectionnable)' },
        { libelle: 'Sommets → faces entre eux', action: () => this._convertirSelection('s', 'f'), off: n < 3,
          barre: { groupe: 's', glyphe: '◭', court: 'S → faces', defaut: false },
          aide: 'remplacer les sommets sélectionnés par les faces dont tous les sommets sont sélectionnés (le type face devient sélectionnable)' },
        { libelle: 'Tout désélectionner', action: () => this._toutChoisir(false), off: this.sel.vide,
          barre: { groupe: 'geo', glyphe: '▢', court: 'Désélect.', defaut: false },
          aide: 'désélectionner tous les éléments, de tous les types, ceux mis de côté compris' },
        { libelle: 'Curseur → sélection', action: () => this._placerCurseurEn(this._centre()), off: this.sel.vide,
          barre: { groupe: 'geo', glyphe: '⌖', court: 'Curs. → sél.', defaut: false },
          aide: 'placer le curseur 3D au centre de la sélection : origines des objets choisis, ou sommets sélectionnés en mode Géométrie' },
        { libelle: 'Sélection → curseur', action: () => this._selectionVersCurseur(), off: this.sel.vide,
          barre: { groupe: 'geo', glyphe: '⇥', court: 'Sél. → curs.', defaut: false },
          aide: 'déplacer la sélection pour amener son centre sur le curseur 3D' }
      ]]);
    }
    return { resume, rubriques };
  }

  // Opérations de la barre d'accès rapide, en groupes [[groupe, items]], seules les disponibles, dans l'ordre des menus.
  // Scène : celles des objets choisis (« objet »), ou sans objet choisi l'ajout d'un objet (« ajout »). Géométrie :
  // « Liés » (élément actif, « l »), le groupe du type de l'élément actif, puis les autres : faces (« f »), arêtes
  // (« a »), sommets (« s ») ; un groupe n'a d'opération disponible que si la sélection compte des éléments de son type.
  _acces() {
    const geo = this._geo(), par = new Map();
    for (const it of this._catalogueAcces(ED_MENUS.filter(m => m[2].includes(this.state.edition)).map(m => m[0]))) {
      if (it.off || !this._dansBarre(it)) continue;
      if (!par.has(it.barre.groupe)) par.set(it.barre.groupe, []);
      par.get(it.barre.groupe).push(it);
    }
    const t = geo && this.sel.dernier ? this.sel.dernier.t : null;
    const ordre = !geo ? [this.choix.length ? 'objet' : 'ajout', 'scene', 'vue']
      : ['l', t, 'f', 'a', 's', 'geo', 'vue'].filter((g, k, o) => g && o.indexOf(g) === k);
    return ordre.filter(g => par.has(g)).map(g => [g, par.get(g)]);
  }

  // Opérations offertes à la barre des menus `menus` (tous par défaut), sans doublon (« Liés » est dans trois menus)
  _catalogueAcces(menus = ED_MENUS.map(m => m[0])) {
    const vus = new Set(), r = [];
    for (const id of menus) {
      for (const [, items] of this._operations(id).rubriques) {
        for (const it of items) {
          if (!it.barre || vus.has(this._idAcces(it))) continue;
          vus.add(this._idAcces(it));
          r.push(it);
        }
      }
    }
    return r;
  }

  _idAcces(it) { return it.barre.groupe + ':' + it.barre.court; }

  // L'opération figure-t-elle dans la barre : choix de l'utilisateur, sinon son réglage par défaut
  _dansBarre(it) {
    const choix = this.state.acces && this.state.acces[this._idAcces(it)];
    return typeof choix === 'boolean' ? choix : it.barre.defaut !== false;
  }

  // Onglet Réglages › Barre rapide : toutes les opérations, par groupe (ED_ACCES), chacune avec son interrupteur
  _ongletAcces(corps) {
    const intro = document.createElement('p');
    intro.className = 'ed-menu-resume';
    intro.textContent = 'Opérations à afficher dans la barre du bas. Elles n’y apparaissent que si elles s’appliquent à la sélection.';
    corps.appendChild(intro);
    const catalogue = this._catalogueAcces();
    for (const [g, titre] of ED_ACCES) {
      const items = catalogue.filter(it => it.barre.groupe === g);
      if (!items.length) continue;
      const t = document.createElement('span');
      t.className = 'ed-rubrique';
      t.textContent = titre;
      corps.appendChild(t);
      // Une ligne par opération : glyphe, libellé et chevron (appui : déplie sa description dessous), interrupteur
      for (const it of items) {
        const op = document.createElement('div');
        op.className = 'ed-acces-op';
        const l = document.createElement('div');
        l.className = 'ed-acces-choix';
        const tete = document.createElement('button');
        tete.type = 'button';
        tete.className = 'ed-acces-nom';
        tete.setAttribute('aria-expanded', 'false');
        const glyphe = document.createElement('b');
        glyphe.textContent = it.barre.glyphe;
        const nom = document.createElement('span');
        nom.textContent = it.libelle;
        tete.append(glyphe, nom);
        tete.insertAdjacentHTML('beforeend', uiSvg('<path d="M6 9l6 6 6-6"/>', 'ed-chevron'));
        const aide = document.createElement('p');
        aide.textContent = it.aide.charAt(0).toUpperCase() + it.aide.slice(1) + '.';
        aide.hidden = true;
        tete.addEventListener('click', () => {
          aide.hidden = !aide.hidden;
          tete.setAttribute('aria-expanded', aide.hidden ? 'false' : 'true');
        });
        const sw = this._interrupteur(this._dansBarre(it), () => {
          this.state.acces = Object.assign({}, this.state.acces, { [this._idAcces(it)]: !this._dansBarre(it) });
          this.save();
          sw.setAttribute('aria-pressed', this._dansBarre(it) ? 'true' : 'false');
          this._afficherAcces();
        }, 'Dans la barre : ' + it.libelle);
        l.append(tete, sw);
        op.append(l, aide);
        corps.appendChild(op);
      }
    }
    const raz = document.createElement('button');
    raz.type = 'button';
    raz.className = 'ed-couleurs-raz';
    raz.textContent = 'Revenir aux opérations par défaut';
    raz.addEventListener('click', () => { this.state.acces = {}; this.save(); this._afficherAcces(); this.panneau.rafraichir(); });
    corps.appendChild(raz);
  }

  // Barre d'accès rapide refaite seulement si ses opérations ont changé ; un trait fin sépare les groupes
  _afficherAcces() {
    if (!this.accesOps) return;
    const groupes = this._acces(), cle = JSON.stringify(groupes.map(([g, l]) => [g, l.map(i => i.barre.court)]));
    if (cle !== this._cleAcces) {
      this._cleAcces = cle;
      this.accesOps.replaceChildren();
      groupes.forEach(([, items], k) => {
        if (k) {
          const sep = document.createElement('span');
          sep.className = 'ed-acces-sep';
          this.accesOps.appendChild(sep);
        }
        for (const { libelle, action, barre: { glyphe, court } } of items) {
          const b = document.createElement('button');
          b.type = 'button';
          b.className = 'ed-btn';
          const g = document.createElement('b');
          g.textContent = glyphe;
          b.append(g, court);
          b.setAttribute('aria-label', libelle);
          b.addEventListener('click', action);
          this.accesOps.appendChild(b);
        }
      });
    }
    this._fondreAcces();
  }

  // Fondu au bord droit des opérations tant qu'il en reste à faire défiler
  _fondreAcces() {
    const o = this.accesOps;
    if (o && o.scrollWidth !== undefined) o.classList.toggle('deborde', o.scrollLeft + o.clientWidth < o.scrollWidth - 2);
  }

  _ouvrirMenu(id) {
    const { fond, carte, fermer } = this.carteMenu;
    const def = ED_MENUS.find(m => m[0] === id);
    const titre = document.createElement('b');
    titre.textContent = def[1];
    carte.replaceChildren(titre);
    if (!def[2].includes(this.state.edition)) {
      this._message(id === 'objets' ? 'Opérations sur les objets : mode Scène' : 'Opérations de géométrie : mode Géométrie');
      return;
    }
    const resume = texte => {
      const p = document.createElement('p');
      p.className = 'ed-menu-resume';
      p.textContent = texte;
      carte.appendChild(p);
    };
    const rubrique = (texte, items) => {
      const t = document.createElement('span');
      t.className = 'ed-rubrique';
      t.textContent = texte;
      const g = document.createElement('div');
      g.className = 'ed-grille ed-deux';
      for (const { libelle, action, off } of items) {
        const b = document.createElement('button');
        b.type = 'button';
        b.textContent = libelle;
        b.disabled = !!off;
        b.addEventListener('click', () => { fermer(); action(); });
        g.appendChild(b);
      }
      carte.append(t, g);
    };
    const ops = this._operations(id);
    for (const t of ops.resume) resume(t);
    for (const [t, items] of ops.rubriques) rubrique(t, items);
    const non = document.createElement('button');
    non.type = 'button';
    non.className = 'ed-non';
    non.textContent = 'Fermer';
    non.addEventListener('click', fermer);
    carte.appendChild(non);
    fond.hidden = false;
  }

  // Sélection résumée : « 2 faces, 1 arête, 3 sommets »
  _resumeSelection() {
    const pl = k => k > 1 ? 's' : '', l = [], { faces, aretes, sommets } = this.sel;
    if (faces.length) l.push(`${faces.length} face${pl(faces.length)}`);
    if (aretes.length) l.push(`${aretes.length} arête${pl(aretes.length)}`);
    if (sommets.length) l.push(`${sommets.length} sommet${pl(sommets.length)}`);
    return l.join(', ');
  }

  // Remplace les éléments du type `de` par ceux du type `vers` qu'ils désignent : faces ou arêtes → leurs sommets
  // ou arêtes ; arêtes → faces qu'elles bordent ; sommets → arêtes ou faces dont tous les sommets sont choisis.
  // Le type `vers` devient sélectionnable s'il ne l'était pas.
  _convertirSelection(de, vers) {
    const mm = this.maillage, sel = this.sel, el = [];
    const aretesDe = f => f.s.map((i, k) => [i, f.s[(k + 1) % f.s.length]]);
    if (de === 's') {
      const choisi = new Set(sel.sommets);
      if (vers === 'a') for (const a of mm.aretes()) { if (a.every(i => choisi.has(i))) el.push({ t: 'a', a }); }
      else for (const f of mm.faces) if (f.s.every(i => choisi.has(i))) el.push({ t: 'f', f });
    } else if (vers === 's') {
      for (const x of sel.liste(de)) for (const i of de === 'a' ? x : x.s) el.push({ t: 's', i });
    } else if (vers === 'a') {
      for (const f of sel.faces) for (const a of aretesDe(f)) el.push({ t: 'a', a });
    } else {
      const choisies = new Set(sel.aretes.map(a => a.join(' ')));
      for (const f of mm.faces) if (aretesDe(f).some(([i, j]) => choisies.has(SelectionMaillage.arete(i, j).join(' ')))) el.push({ t: 'f', f });
    }
    sel.vider(de);
    for (const e of el) sel.ajouter(e);
    this._rendreSelectionnable(vers);
    this._garderSelection();
    this._rafraichir();
    this._message(this.sel.vide ? 'Plus rien de sélectionné' : 'Sélection : ' + this._resumeSelection());
  }

  // Tout (dé)sélectionner : objets affichés en mode Scène ; en mode Géométrie, éléments du type `t` ('s', 'a', 'f'),
  // ou toute la sélection pour tout désélectionner sans type
  _toutChoisir(tout, t) {
    if (this._geo()) {
      if (tout) { this.sel.tout(this.maillage, t || 's'); this._rendreSelectionnable(t || 's'); } else this.sel.vider(t);
      this._garderSelection();
    } else {
      this.choix = tout ? this._affiches() : [];
      if (tout && this.choix.length && !this.choix.includes(this.state.actif)) { this.state.actif = this.choix[this.choix.length - 1]; this.save(); }
      if (tout && this.choix.includes(this.state.actif)) this.choix.push(this.choix.splice(this.choix.indexOf(this.state.actif), 1)[0]);
    }
    this._rafraichir();
  }

  // Origine des objets choisis (mode Scène). 'boite' / 'median' / 'curseur' : l'origine va au centre de la boîte
  // du maillage, à la moyenne de ses sommets ou au curseur 3D, le maillage restant en place dans le monde ;
  // 'geometrie' : le maillage est déplacé pour que le centre de sa boîte vienne sur l'origine.
  _origine(mode) {
    if (this._geo() || !this.choix.length) return;
    this._memoriser();
    for (const k of this.choix) {
      const o = this.objets[k], mm = o.maillage, b = mm.boite();
      if (!b) continue;
      const mx = this._matrice(o);
      let c;                             // nouvelle origine, dans le repère de l'objet
      if (mode === 'median') {
        c = new THREE.Vector3();
        for (const p of mm.sommets) c.add(new THREE.Vector3().fromArray(p));
        c.divideScalar(mm.sommets.length);
      } else if (mode === 'curseur') {
        c = new THREE.Vector3().fromArray(this.state.curseur).applyMatrix4(mx.clone().invert());
      } else c = new THREE.Vector3().fromArray(b.min).add(new THREE.Vector3().fromArray(b.max)).multiplyScalar(0.5);
      const neuf = mm.clone();
      neuf.sommets = neuf.sommets.map(p => [p[0] - c.x, p[1] - c.y, p[2] - c.z]);
      o.maillage = neuf;
      if (mode !== 'geometrie') o.position = c.applyMatrix4(mx).toArray();   // l'ancien point c, vu du monde
      o._donnees = null;
      o._geoSale = true;
    }
    this._sauver();
    this._rafraichir(true);
  }

  // ----- Modifieurs ---------------------------------------------------------------------------------
  _objetNomme(nom) { return this.objets.find(o => o.nom === nom) || null; }

  // Objets servant de cible à un booléen actif d'un objet affiché
  _cibles() {
    const c = new Set();
    for (const o of this.objets) {
      if (!this._affiche(o)) continue;
      for (const m of o.modifs) if (m.type === 'booleen' && m.actif) { const t = this._objetNomme(m.cible); if (t && t !== o) c.add(t); }
    }
    return c;
  }

  // Maillage modifié d'un objet, dans son repère : le maillage de base passé par ses modifieurs actifs, dans l'ordre.
  // Gardé en cache (o._ev) tant que ni le maillage, ni les modifieurs, ni les cibles (maillage modifié, position,
  // rotation, échelle) n'ont changé. `pile` : objets en cours d'évaluation (dépendance circulaire).
  _evalue(o, pile = []) {
    if (!o.modifs.length) { o._ev = null; return o.maillage; }
    const deps = [o.maillage], cibles = [];
    let cle = JSON.stringify(o.modifs) + (Booleens.pret ? '' : ' attente');
    for (const m of o.modifs) {
      const t = m.type === 'booleen' && m.actif ? this._objetNomme(m.cible) : null;
      const boucle = t && (t === o || pile.includes(t));
      const ev = t && !boucle ? this._evalue(t, pile.concat(o)) : null;
      cibles.push({ t, ev, boucle });
      if (boucle) cle += '|boucle';
      if (ev) { deps.push(ev); cle += '|' + t.position + '|' + t.rotation + '|' + t.echelle + '|' + o.position + '|' + o.rotation + '|' + o.echelle; }
    }
    const e = o._ev;
    if (e && e.cle === cle && e.deps.length === deps.length && e.deps.every((d, k) => d === deps[k])) return e.maillage;
    let mm = o.maillage;
    const erreurs = [];
    o.modifs.forEach((m, k) => {
      if (!m.actif) return;
      try { mm = this._modifier(o, mm, m, cibles[k]); } catch (err) { erreurs[k] = err.message; }
    });
    o._ev = { cle, deps, maillage: mm, erreurs };
    return mm;
  }

  // Applique un modifieur à `mm` (repère de `o`) ; lève une erreur lisible s'il ne peut pas
  _modifier(o, mm, m, c) {
    if (m.type === 'repetition') {
      const n = Math.max(1, Math.min(200, Math.round(m.n) || 1)), b = mm.boite();
      const pas = m.decalage.map((v, k) => m.relatif ? v * (b ? b.max[k] - b.min[k] : 0) : v);
      const copies = [];
      for (let i = 0; i < n; i++) {
        const c2 = mm.clone();
        c2.sommets = c2.sommets.map(p => p.map((v, k) => v + pas[k] * i));
        copies.push(c2);
      }
      if (!m.unir || n < 2) return Maillage.reunir(copies);
      if (!this._booleensPrets()) throw new Error('chargement de Manifold…');
      return copies.slice(1).reduce((r, c2) => Booleens.operation(r, c2, 'union'), copies[0]);
    }
    if (m.type === 'booleen') {
      if (!m.cible) throw new Error('choisissez une cible');
      if (!c.t) throw new Error('cible absente : ' + m.cible);
      if (c.boucle) throw new Error('dépendance circulaire');
      if (!this._booleensPrets()) throw new Error('chargement de Manifold…');
      const autre = this._versLocal(o, this._versMonde(c.t, c.ev));
      try { return Booleens.operation(mm, autre, m.op); } catch (err) {
        throw new Error(err.message === 'maillage non fermé' ? 'l’objet ou la cible n’est pas un volume fermé' : err.message);
      }
    }
    return mm;
  }

  // Manifold prêt ? Sinon lance son chargement, puis redessine
  _booleensPrets() {
    if (Booleens.pret) return true;
    if (!this._chargeBool) {
      this._chargeBool = Booleens.charger().then(() => this._rafraichir(true))
        .catch(e => { this._chargeBool = null; this._message('Booléens indisponibles : ' + e.message, true); });
    }
    return false;
  }

  // ----- Matériaux ------------------------------------------------------------------------------------
  // Bibliothèque complète : le matériau par défaut, et celui de chaque objet (créé s'il manque, d'une teinte neuve)
  _verifierMateriaux() {
    const b = this.materiaux = this.materiaux || {};
    if (!b[ED_DEFAUT]) b[ED_DEFAUT] = ed_materiau();
    for (const o of this.objets) {
      if (!o.materiau) o.materiau = ED_DEFAUT;
      if (!b[o.materiau]) b[o.materiau] = ed_materiau(null, this._teinteLibre());
    }
  }

  _teinteLibre() { return ED_TEINTES[Math.max(0, Object.keys(this.materiaux).length - 1) % ED_TEINTES.length]; }

  _nomMateriauLibre(base) {
    let n = 2, nom = base;
    while (this.materiaux[nom]) nom = base + ' ' + n++;
    return nom;
  }

  _nomAffiche(nom) { return nom === ED_DEFAUT ? 'défaut' : nom; }

  // Rendus proposés dans le mode courant (ED_RENDUS)
  _rendus() { return ED_RENDUS.filter(e => e[3].includes(this.state.edition)); }

  // Rendu courant ; s'il n'est pas proposé dans ce mode (changement de mode, annulation, ancien état), Solide
  _rendu() {
    if (!this._rendus().some(e => e[0] === this.state.rendu)) this.state.rendu = 'solide';
    return this.state.rendu;
  }

  _enRayons() { return this._rendu() === 'rayons'; }

  // Mode de sélection courant (ED_SELECTIONS) ; inconnu : Toucher
  _modeSelection() {
    if (!ED_SELECTIONS.some(e => e[0] === this.state.selection)) this.state.selection = 'toucher';
    return this.state.selection;
  }

  _boiteActive() { return this._modeSelection() === 'boite'; }

  _choisirSelection(id) {
    if (id === this._modeSelection()) return;
    this.state.selection = id;
    this.save();
    this._afficherReglages();
    const l = ED_SELECTIONS.find(e => e[0] === id);
    this._message('Sélection : ' + l[1] + ({
      boite: ' — un doigt trace la boîte, deux tournent la vue (pincer : zoom), trois la déplacent',
      chemin: ' — touchez un élément, puis un autre du même type : le plus court chemin entre eux est ajouté'
    }[id] || ''));
  }

  // Rectangle de la boîte (pixels relatifs à la vue) tracé au doigt : affiché, ou caché (null)
  _cadreBoite(b) {
    let el = this.cadre;
    if (!el) {
      el = this.cadre = document.createElement('div');
      el.className = 'ed-cadre';
      this.numeros.appendChild(el);
    }
    el.hidden = !b;
    if (!b) return;
    const x = Math.min(b.x0, b.x1), y = Math.min(b.y0, b.y1);
    el.style.setProperty('left', x + 'px');
    el.style.setProperty('top', y + 'px');
    el.style.setProperty('width', Math.abs(b.x1 - b.x0) + 'px');
    el.style.setProperty('height', Math.abs(b.y1 - b.y0) + 'px');
    el.classList.toggle('retire', !!this.state.boiteRetire);
  }

  // Sélection par la boîte `r` { x0, y0, x1, y1 } (pixels relatifs à la vue) : ajoutée, ou retirée (bouton − ).
  // Géométrie, selon les filtres : sommets dans la boîte ; arêtes dont les deux bouts y sont ; faces dont tous les
  // sommets y sont ; sans Rayons X, seulement ceux qui sont visibles (sommet, milieu de l'arête, centre de la face).
  // Scène : objets visibles dont le centre (de la boîte englobante) y est
  _selectionBoite(r) {
    r = { x0: Math.min(r.x0, r.x1), y0: Math.min(r.y0, r.y1), x1: Math.max(r.x0, r.x1), y1: Math.max(r.y0, r.y1) };
    const m = this.m, retire = !!this.state.boiteRetire, v = new THREE.Vector3();
    m.scene.updateMatrixWorld();
    m.camera.updateMatrixWorld();
    // Point du monde → { x, y (pixels de la vue), q (1 / profondeur) }, ou null s'il est derrière la caméra
    const ecran = p => {
      v.fromArray(p).applyMatrix4(m.camera.matrixWorldInverse);
      const z = -v.z;
      if (z <= m.camera.near) return null;
      v.fromArray(p).project(m.camera);
      return { x: (v.x + 1) / 2 * m.largeur, y: (1 - v.y) / 2 * m.hauteur, q: 1 / z };
    };
    const dans = e => !!e && e.x >= r.x0 && e.x <= r.x1 && e.y >= r.y0 && e.y <= r.y1;
    const pl = n => n > 1 ? 's' : '', signe = retire ? '−' : '+';
    if (!this._geo()) {
      let n = 0;
      this.objets.forEach((o, k) => {
        if (!this._affiche(o)) return;
        const b = this._boiteMonde([k]);
        if (!b || !dans(ecran(b.min.map((x, c) => (x + b.max[c]) / 2)))) return;
        const i = this.choix.indexOf(k);
        if (retire && i >= 0) { this.choix.splice(i, 1); n++; }
        if (!retire && i < 0) { this.choix.push(k); this.state.actif = k; n++; }
      });
      this.save();
      this._rafraichir();
      this._message(`Boîte : ${signe}${n} objet${pl(n)}`);
      return;
    }
    const mm = this.maillage, pts = mm.sommets.map(ecran), f = this._filtres();
    let visible = () => true;
    if (!this._enRayons()) {
      const tris = [];
      for (const l of mm.triangles(() => 0).values()) for (let k = 0; k < l.length; k += 3) tris.push([l[k], l[k + 1], l[k + 2]]);
      const t = ed_profondeurs(pts, tris, r);
      visible = p => { const e = ecran(p); return !!e && t(e.x, e.y, e.q); };
    }
    const centre = l => [0, 1, 2].map(c => l.reduce((t, i) => t + mm.sommets[i][c], 0) / l.length);
    const pris = [];
    if (f.sommets) for (let i = 0; i < pts.length; i++) if (dans(pts[i]) && visible(mm.sommets[i])) pris.push({ t: 's', i });
    if (f.aretes) for (const a of mm.aretes()) if (dans(pts[a[0]]) && dans(pts[a[1]]) && visible(centre(a))) pris.push({ t: 'a', a });
    if (f.faces) for (const x of mm.faces) if (x.s.every(i => dans(pts[i])) && visible(centre(x.s))) pris.push({ t: 'f', f: x });
    const n = { s: 0, a: 0, f: 0 };
    for (const el of pris) {
      const deja = this.sel.contient(el);
      if (retire && deja) { this.sel.retirer(el); n[el.t]++; }
      if (!retire && !deja) { this.sel.ajouter(el); n[el.t]++; }
    }
    this._garderSelection();
    this._rafraichir();
    const parts = [[n.s, 'sommet'], [n.a, 'arête'], [n.f, 'face']].filter(([k], j) => [f.sommets, f.aretes, f.faces][j]).map(([k, nom]) => `${signe}${k} ${nom}${pl(k)}`);
    this._message('Boîte : ' + parts.join(', '));
  }

  _choisirRendu(id) {
    if (id === this._rendu() || !this._rendus().some(e => e[0] === id)) return;
    this.state.rendu = id;
    this.save();
    this._afficherReglages();
    this._rafraichir();
  }

  // Matériau three.js du rendu « En jeu » pour le matériau `nom` : Lambert à facettes, éclairage continu (l'éditeur
  // n'utilise pas de paliers, qui relèveront des paramètres de rendu du moteur), de sa couleur diffuse, son émission
  // et son opacité ; illum 0 : couleur seule, sans éclairage (portée par l'émission). Mis à jour sur place quand ses
  // réglages changent.
  _matJeu(nom) {
    const m = this.materiaux[nom] || this.materiaux[ED_DEFAUT];
    this._matsJeu = this._matsJeu || new Map();
    let e = this._matsJeu.get(nom);
    if (!e) {
      e = { faces: new THREE.MeshLambertMaterial({ flatShading: true, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1 }) };
      this._matsJeu.set(nom, e);
    }
    const f = e.faces, transparent = m.opacite < 1, plat = m.illumination === 0;
    if (f.transparent !== transparent) Object.assign(f, { transparent, depthWrite: !transparent, needsUpdate: true });
    f.color.set(plat ? '#000000' : m.couleur);
    f.emissive.set(plat ? m.couleur : m.emission);
    f.opacity = m.opacite;
    return e;
  }

  // Matériaux dans le panneau latéral : ouvrir (true), fermer (false) ou basculer (sans argument)
  _basculerMateriaux(ouvrir) {
    const ouverts = this.panneau.ouvert === 'materiaux';
    if (ouvrir === undefined ? ouverts : !ouvrir) { if (ouverts) this.panneau.fermer(); }
    else this.panneau.ouvrir('materiaux');
  }

  _cleMat() {
    return JSON.stringify([this._geo(), this.state.actif, this.choix, this.objets.map(o => [o.nom, o.materiau]), this.materiaux]);
  }

  // Panneau Matériaux (mode Scène) : réglages du matériau de l'objet actif, puis la bibliothèque ; toucher un
  // matériau l'applique aux objets choisis. Refait seulement si quelque chose a changé (pas pendant une saisie).
  _afficherMateriaux() {
    const el = this.corpsMateriaux;
    if (!el) return;
    const cle = this._cleMat();
    if (cle === this._cleMateriaux) return;
    this._cleMateriaux = cle;
    el.replaceChildren();
    const geo = this._geo(), o = geo ? null : this._actif(), pl = k => k > 1 ? 's' : '';
    const texte = (balise, cls, t) => { const x = document.createElement(balise); x.className = cls; x.textContent = t; el.appendChild(x); return x; };
    texte('span', 'ed-rubrique', o ? 'Objet actif : ' + o.nom : 'Matériaux');
    if (geo) { texte('p', 'ed-modifs-vide', 'Les matériaux se règlent en mode Scène.'); return; }
    if (o) el.appendChild(this._reglagesMateriau(o.materiau));
    else texte('p', 'ed-modifs-vide', 'Aucun objet actif : touchez un objet pour régler son matériau.');
    texte('span', 'ed-rubrique', 'Bibliothèque du projet');
    const nc = this.choix.length;
    texte('p', 'ed-mat-aide', nc ? `Toucher un matériau l’applique ${nc > 1 ? 'aux ' + nc + ' objets choisis' : 'à l’objet choisi'}.` : 'Choisissez des objets pour leur appliquer un matériau.');
    const actuels = new Set(this.choix.map(k => this.objets[k] && this.objets[k].materiau));
    for (const [nom, m] of Object.entries(this.materiaux)) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'ed-mat' + (o && o.materiau === nom ? ' actif' : actuels.has(nom) ? ' choisi' : '');
      const pastille = document.createElement('i');
      pastille.style.background = m.couleur;
      const t = document.createElement('span');
      t.textContent = this._nomAffiche(nom);
      const n = this.objets.filter(x => x.materiau === nom).length, compte = document.createElement('small');
      compte.textContent = n ? n + ' objet' + pl(n) : 'inutilisé';
      b.append(pastille, t, compte);
      b.addEventListener('click', () => this._appliquerMateriau(nom));
      el.appendChild(b);
    }
    const ajout = document.createElement('div');
    ajout.className = 'ed-modifs-ajout';
    const nouveau = document.createElement('button');
    nouveau.type = 'button';
    nouveau.textContent = '＋ Matériau';
    nouveau.addEventListener('click', () => this._nouveauMateriau());
    ajout.appendChild(nouveau);
    el.appendChild(ajout);
  }

  // Carte des réglages du matériau `nom` : nom ; réglages du .mtl, ceux que montre le rendu En jeu d'abord, puis ceux
  // qui ne servent qu'à l'export ; dupliquer, supprimer
  _reglagesMateriau(nom) {
    const m = this.materiaux[nom], carte = document.createElement('div');
    carte.className = 'ed-mat-reglages';
    // Ligne : libellé (mot du .mtl affiché à côté, data-mtl), puis les champs
    const ligne = (libelle, mot, ...enfants) => {
      const l = document.createElement('div');
      l.className = 'ed-mat-ligne';
      const t = document.createElement('span');
      t.textContent = libelle;
      if (mot) t.dataset.mtl = mot;
      l.append(t, ...enfants);
      carte.appendChild(l);
      return l;
    };
    const groupe = texte => {
      const g = document.createElement('span');
      g.className = 'ed-mat-groupe';
      g.textContent = texte;
      carte.appendChild(g);
    };
    const champ = (type, attrs) => Object.assign(document.createElement('input'), { type }, attrs);
    // Saisie continue (sélecteur de couleur, curseur) : la vue suit ; enregistrée au relâcher
    const continu = (entree, lire, sortie, texte) => {
      const maj = () => { if (sortie) sortie.textContent = texte(m); };
      entree.addEventListener('input', () => { this._saisirMateriau(nom, x => lire(x, entree.value)); maj(); });
      entree.addEventListener('change', () => { this._saisirMateriau(nom, x => lire(x, entree.value), true); maj(); });
      maj();
    };
    const couleur = (libelle, mot, cle) => {
      const c = champ('color', { value: m[cle] });
      continu(c, (x, v) => { x[cle] = ed_hex(v) || x[cle]; });
      ligne(libelle, mot, c);
    };
    const curseur = (libelle, mot, cle, attrs, lire, texte) => {
      // Bornes et pas avant la valeur : le navigateur la ramène dans ceux en vigueur quand on l'affecte
      const c = champ('range', Object.assign({}, attrs.bornes, { value: attrs.versCurseur(m[cle]) })), o = document.createElement('output');
      continu(c, (x, v) => { x[cle] = lire(+v); }, o, texte);
      ligne(libelle, mot, c, o);
    };
    const nomEl = champ('text', { value: this._nomAffiche(nom), disabled: nom === ED_DEFAUT });
    nomEl.setAttribute('aria-label', 'Nom du matériau');
    nomEl.addEventListener('change', () => { if (!this._renommerMateriau(nom, nomEl.value)) nomEl.value = this._nomAffiche(nom); });
    ligne('Nom', '', nomEl);
    groupe('En jeu et à l’export');
    couleur('Diffuse', 'Kd', 'couleur');
    couleur('Émission', 'Ke', 'emission');
    curseur('Opacité', 'd', 'opacite', { bornes: { min: 0, max: 100, step: 1 }, versCurseur: v => Math.round(v * 100) },
      v => ed_borner(v / 100, 0, 1), x => Math.round(x.opacite * 100) + ' %');
    const illum = document.createElement('select');
    ED_ILLUM.forEach((t, k) => illum.appendChild(Object.assign(document.createElement('option'), { value: String(k), textContent: k + ' · ' + t })));
    illum.value = String(m.illumination);
    illum.addEventListener('change', () => this._saisirMateriau(nom, x => { x.illumination = ed_borner(Math.round(+illum.value) || 0, 0, 10); }, true));
    ligne('Éclairage', 'illum', illum);
    groupe('À l’export seulement');
    couleur('Ambiante', 'Ka', 'ambiante');
    couleur('Spéculaire', 'Ks', 'speculaire');
    curseur('Brillance', 'Ns', 'brillance', { bornes: { min: 0, max: 1000, step: 1 }, versCurseur: v => Math.round(v) },
      v => ed_borner(v, 0, 1000), x => String(Math.round(x.brillance)));
    curseur('Réfraction', 'Ni', 'refraction', { bornes: { min: 1, max: 3, step: 0.01 }, versCurseur: v => v },
      v => ed_borner(v, 0.001, 10), x => x.refraction.toFixed(2));
    const actions = document.createElement('div');
    actions.className = 'ed-modifs-ajout';
    for (const [libelle, fn, inactif] of [['Dupliquer', () => this._nouveauMateriau(nom)], ['Supprimer', () => this._supprimerMateriau(nom), nom === ED_DEFAUT]]) {
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = libelle;
      b.disabled = !!inactif;
      b.addEventListener('click', fn);
      actions.appendChild(b);
    }
    carte.appendChild(actions);
    return carte;
  }

  // Réglage continu d'un matériau (sélecteur de couleur, curseur, liste) : une étape d'annulation au premier changement, vue redessinée
  // à chaque fois, sauvegarde au relâcher (`fin`) ; le panneau n'est pas refait (le champ garde le doigt)
  _saisirMateriau(nom, fn, fin) {
    if (!this.materiaux[nom]) return;
    if (!this._saisieMat) { this._memoriser(); this._saisieMat = true; }
    fn(this.materiaux[nom]);
    if (fin) { this._saisieMat = false; this._sauver(); }
    this._cleMateriaux = this._cleMat();
    this._rafraichir();
  }

  // Applique le matériau aux objets choisis
  _appliquerMateriau(nom) {
    const l = this.choix.filter(k => this.objets[k]);
    if (!l.length) { this._message('Aucun objet choisi : touchez un objet'); return; }
    if (l.every(k => this.objets[k].materiau === nom)) return;
    this._memoriser();
    for (const k of l) this.objets[k].materiau = nom;
    this._sauver();
    this._rafraichir();
  }

  // Nouveau matériau (copie de `modele`, sinon réglages par défaut d'une teinte neuve), appliqué aux objets choisis
  _nouveauMateriau(modele) {
    this._memoriser();
    const nom = this._nomMateriauLibre(modele && modele !== ED_DEFAUT ? modele : 'materiau');
    this.materiaux[nom] = modele ? ed_materiau(this.materiaux[modele]) : ed_materiau(null, this._teinteLibre());
    for (const k of this.choix) if (this.objets[k]) this.objets[k].materiau = nom;
    this._sauver();
    this._rafraichir();
    this._message('Matériau « ' + nom + ' » créé' + (this.choix.length ? ' et appliqué' : ''));
  }

  // Ses objets reprennent le matériau par défaut
  _supprimerMateriau(nom) {
    if (nom === ED_DEFAUT || !this.materiaux[nom]) return;
    this._memoriser();
    for (const o of this.objets) if (o.materiau === nom) o.materiau = ED_DEFAUT;
    delete this.materiaux[nom];
    this._sauver();
    this._rafraichir();
  }

  // Renomme un matériau (ordre de la bibliothèque gardé) et ses objets suivent ; faux si le nom est refusé
  _renommerMateriau(ancien, nouveau) {
    nouveau = (nouveau || '').trim();
    if (ancien === ED_DEFAUT || !nouveau || nouveau === ancien || !this.materiaux[ancien]) return false;
    if (this.materiaux[nouveau] || nouveau === ED_DEFAUT || nouveau === this._nomAffiche(ED_DEFAUT)) { this._message('Ce nom est déjà pris', true); return false; }
    this._memoriser();
    this.materiaux = Object.fromEntries(Object.entries(this.materiaux).map(([n, m]) => [n === ancien ? nouveau : n, m]));
    for (const o of this.objets) if (o.materiau === ancien) o.materiau = nouveau;
    if (this._matsJeu) this._matsJeu.delete(ancien);
    this._sauver();
    this._rafraichir();
    return true;
  }

  // Modifieurs dans le panneau latéral : ouvrir (true), fermer (false) ou basculer (sans argument)
  _basculerModifs(ouvrir) {
    const ouverts = this.panneau.ouvert === 'modifs';
    if (ouvrir === undefined ? ouverts : !ouvrir) { if (ouverts) this.panneau.fermer(); }
    else this.panneau.ouvrir('modifs');
  }

  // Modifieurs de l'objet actif (mode Scène), dans le corps du panneau latéral quand il les affiche ; refaits
  // seulement si quelque chose a changé
  _afficherModifs() {
    const el = this.corpsModifs;
    if (!el) return;
    const geo = this._geo(), o = geo ? null : this._actif(), ev = o && o._ev;
    // Clé complète, et clé de structure (sans les valeurs saisies) : une saisie dans le panneau ne le refait pas,
    // pour ne pas perdre le champ suivant touché
    const valeurs = m => m.type === 'repetition' ? Object.assign({}, m, { n: 0, decalage: 0 }) : m;
    const structure = JSON.stringify([geo, o && o.nom, o && o.modifs.map(valeurs), ev && ev.erreurs, this.objets.map(x => x.nom)]);
    const cle = structure + JSON.stringify(o && o.modifs);
    const saisie = this._saisieModif;
    this._saisieModif = false;
    if (cle === this._cleModifs || (saisie && structure === this._structureModifs)) { this._cleModifs = cle; return; }
    this._cleModifs = cle;
    this._structureModifs = structure;
    el.replaceChildren();
    const titre = document.createElement('span');
    titre.className = 'ed-rubrique';
    titre.textContent = o ? 'Objet actif : ' + o.nom : 'Modifieurs';
    el.appendChild(titre);
    if (!o) {
      const p = document.createElement('p');
      p.className = 'ed-modifs-vide';
      p.textContent = geo ? 'Les modifieurs se règlent en mode Scène.' : 'Aucun objet actif : touchez un objet.';
      el.appendChild(p);
      return;
    }
    o.modifs.forEach((m, k) => el.appendChild(this._carteModif(o, m, k, ev && ev.erreurs[k])));
    const ajout = document.createElement('div');
    ajout.className = 'ed-modifs-ajout';
    for (const type in ED_MODIFS) {
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = '＋ ' + ED_MODIFS[type].titre;
      b.addEventListener('click', () => this._ajouterModif(o, type));
      ajout.appendChild(b);
    }
    el.appendChild(ajout);
  }

  // Modification d'un modifieur : annulable, puis sauvegarde et nouvel affichage
  _changerModif(fn) {
    this._memoriser();
    fn();
    this._sauver();
    this._rafraichir();
  }

  _ajouterModif(o, type) {
    this._changerModif(() => {
      const m = Object.assign({ type, actif: true }, ED_MODIFS[type].defaut());
      // Booléen : première cible proposée, l'objet choisi suivant s'il y en a un, sinon le plus récent
      if (type === 'booleen') {
        const autres = this.choix.map(k => this.objets[k]).filter(x => x !== o);
        const t = autres[0] || this.objets.slice().reverse().find(x => x !== o);
        if (t) m.cible = t.nom;
      }
      o.modifs.push(m);
    });
  }

  _carteModif(o, m, k, erreur) {
    const def = ED_MODIFS[m.type] || { titre: m.type, signe: '?' };
    const carte = document.createElement('div');
    carte.className = 'ed-modif' + (m.actif ? '' : ' eteint');
    const tete = document.createElement('div');
    tete.className = 'ed-modif-tete';
    const nom = document.createElement('b');
    nom.textContent = def.signe + ' ' + def.titre;
    const bouton = (texte, titre, fn, desactive) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = texte;
      b.setAttribute('aria-label', titre);
      b.disabled = !!desactive;
      b.addEventListener('click', fn);
      return b;
    };
    const deplacer = d => this._changerModif(() => { o.modifs.splice(k, 1); o.modifs.splice(k + d, 0, m); });
    tete.append(
      this._interrupteur(m.actif, () => this._changerModif(() => { m.actif = !m.actif; }), 'Activer le modifieur'), nom,
      bouton('↑', 'Monter', () => deplacer(-1), k === 0),
      bouton('↓', 'Descendre', () => deplacer(1), k === o.modifs.length - 1),
      bouton('Appliquer', 'Appliquer au maillage', () => this._appliquerModif(o, k), !!erreur),
      bouton('✕', 'Supprimer', () => this._changerModif(() => { o.modifs.splice(k, 1); }))
    );
    carte.appendChild(tete);
    const corps = document.createElement('div');
    corps.className = 'ed-modif-corps';
    const nombre = (libelle, cls, valeur, fn, pas) => {
      const l = this._champ(libelle, cls, valeur, v => { this._saisieModif = true; this._changerModif(() => fn(v)); }, 'change');
      const i = l.querySelector ? l.querySelector('input') : l.children[1];
      if (pas && i) i.step = pas;
      return l;
    };
    const choix = (items, actuel, fn) => {
      const g = document.createElement('div');
      g.className = 'ed-modif-choix';
      for (const [id, libelle] of items) {
        const b = document.createElement('button');
        b.type = 'button';
        b.textContent = libelle;
        b.classList.toggle('on', id === actuel);
        b.addEventListener('click', () => { if (id !== actuel) this._changerModif(() => fn(id)); });
        g.appendChild(b);
      }
      return g;
    };
    if (m.type === 'repetition') {
      const ligne = document.createElement('div');
      ligne.className = 'ed-coords';
      ligne.appendChild(nombre('N', 'ed-angle', m.n, v => { m.n = Math.max(1, Math.min(200, Math.round(v) || 1)); }, 1));
      corps.appendChild(ligne);
      corps.appendChild(choix([['relatif', 'Relatif (× taille)'], ['constant', 'Constant']], m.relatif ? 'relatif' : 'constant', id => { m.relatif = id === 'relatif'; }));
      const d = document.createElement('div');
      d.className = 'ed-coords';
      ED_AXES.forEach((a, i) => d.appendChild(nombre(a.toUpperCase(), 'ed-' + a, m.decalage[i], v => { m.decalage[i] = v; })));
      corps.appendChild(d);
      corps.appendChild(choix([['non', 'Copies séparées'], ['oui', 'Unir (booléen)']], m.unir ? 'oui' : 'non', id => { m.unir = id === 'oui'; }));
    } else if (m.type === 'booleen') {
      corps.appendChild(choix(ED_OPS, m.op, id => { m.op = id; }));
      const l = document.createElement('label');
      l.className = 'ed-modif-cible';
      const t = document.createElement('span');
      t.textContent = 'Cible';
      const sel = document.createElement('select');
      const vide = document.createElement('option');
      vide.value = '';
      vide.textContent = '— choisir —';
      sel.appendChild(vide);
      for (const x of this.objets) {
        if (x === o) continue;
        const op = document.createElement('option');
        op.value = op.textContent = x.nom;
        sel.appendChild(op);
      }
      sel.value = m.cible;
      sel.addEventListener('change', () => this._changerModif(() => { m.cible = sel.value; }));
      l.append(t, sel);
      corps.appendChild(l);
    }
    if (erreur) {
      const e = document.createElement('p');
      e.className = 'ed-modif-erreur';
      e.textContent = '⚠ ' + erreur;
      corps.appendChild(e);
    }
    carte.appendChild(corps);
    return carte;
  }

  // Fige le modifieur `k` dans le maillage de base (appliqué seul, comme dans Blender), puis le retire de la pile
  _appliquerModif(o, k) {
    const m = o.modifs[k];
    const t = m.type === 'booleen' ? this._objetNomme(m.cible) : null;
    const c = { t, ev: t && t !== o ? this._evalue(t, [o]) : null, boucle: t === o };
    let mm;
    try { mm = this._modifier(o, o.maillage, Object.assign({}, m, { actif: true }), c); } catch (err) { this._message(err.message, true); return; }
    this._changerModif(() => {
      o.maillage = mm === o.maillage ? mm.clone() : mm;
      o.sel = SelectionMaillage.donnees();
      o._donnees = null;
      o._geoSale = true;
      o.modifs.splice(k, 1);
    });
  }

  // ----- Panneau des objets et sets -----------------------------------------------------------------
  // Sets existants et cohérents : le premier (par défaut) toujours présent, un set pour chaque objet
  _verifierSets() {
    this.sets = this.sets.filter((e, n, t) => e && e.nom && t.findIndex(f => f.nom === e.nom) === n);
    if (!this.sets.length) this.sets.push({ nom: ED_SET });
    for (const o of this.objets) {
      if (!o.set) o.set = this.sets[0].nom;
      if (!this._set(o.set)) this.sets.push({ nom: o.set });
    }
    for (const e of this.sets) { e.visible = e.visible !== false; e.replie = !!e.replie; }
  }

  _set(nom) { return this.sets.find(e => e.nom === nom) || null; }

  // Un objet est affiché s'il est visible ainsi que son set
  _affiche(o) {
    const e = this._set(o.set);
    return o.visible && (!e || e.visible);
  }

  _affiches() { return this.objets.map((o, k) => k).filter(k => this._affiche(this.objets[k])); }

  // Liste des objets par set et bouton « ＋ Set » : placés dans le panneau de début quand il les affiche
  _listeObjets() {
    this.liste = document.createElement('div');
    this.liste.className = 'ed-objets-liste';
    // Nouveau set : dans l'en-tête du panneau, à droite de la pastille de navigation (le libellé disparaît quand le
    // panneau est très étroit)
    const ajout = this.btnAjoutSet = document.createElement('button');
    ajout.type = 'button';
    ajout.className = 'ed-objets-ajout';
    ajout.setAttribute('aria-label', 'Nouveau set');
    ajout.innerHTML = '<b>＋</b><span>Set</span>';
    ajout.addEventListener('click', () => this._ajouterSet());
  }

  // Interrupteur (modifieurs)
  _interrupteur(allume, fn, titre) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'ed-switch';
    b.setAttribute('aria-pressed', allume ? 'true' : 'false');
    b.setAttribute('aria-label', titre);
    b.appendChild(document.createElement('i'));
    b.addEventListener('click', e => { e.stopPropagation(); fn(); });
    return b;
  }

  // Visibilité dans la liste des objets : œil ouvert ou barré (plus étroit qu'un interrupteur)
  _oeil(visible, fn, titre) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'ed-oeil';
    b.setAttribute('aria-pressed', visible ? 'true' : 'false');
    b.setAttribute('aria-label', titre);
    b.innerHTML = uiSvg('<path d="M2.5 12s3.5-6.5 9.5-6.5 9.5 6.5 9.5 6.5-3.5 6.5-9.5 6.5S2.5 12 2.5 12z"/><circle cx="12" cy="12" r="2.7"/>'
      + (visible ? '' : '<path d="M4 4l16 16"/>'));
    b.addEventListener('click', e => { e.stopPropagation(); fn(); });
    return b;
  }

  // Liste des objets par set ; refaite seulement si quelque chose a changé
  _afficherListe() {
    if (!this.corpsListe) return;
    const geo = this._geo(), edites = this._edites();
    const cle = JSON.stringify([geo, this.state.actif, this.choix, edites, this.sets, this.objets.map(o => [o.nom, o.set, o.visible, o.modifs.length])]);
    if (cle === this._cleListe) return;
    this._cleListe = cle;
    const choisi = new Set(this.choix);
    this.liste.replaceChildren();
    this.sets.forEach((e, n) => {
      const bloc = document.createElement('div');
      bloc.className = 'ed-set' + (e.visible ? '' : ' eteint');
      bloc.dataset.set = e.nom;
      const membres = this.objets.map((o, k) => k).filter(k => this.objets[k].set === e.nom);
      const tete = document.createElement('div');
      tete.className = 'ed-set-tete';
      const nom = document.createElement('button');
      nom.type = 'button';
      nom.className = 'ed-set-nom';
      nom.insertAdjacentHTML('beforeend', uiSvg('<path d="M6 9l6 6 6-6"/>', 'ed-chevron' + (e.replie ? ' replie' : '')));
      const t = document.createElement('span');
      t.textContent = e.nom;
      const nb = document.createElement('small');
      nb.textContent = membres.length;
      nom.append(t, nb);
      nom.addEventListener('click', () => { e.replie = !e.replie; this.state.sets = this.sets; this.save(); this._afficherListe(); });
      const menu = document.createElement('button');
      menu.type = 'button';
      menu.className = 'ed-set-menu';
      menu.textContent = '⋯';
      menu.setAttribute('aria-label', 'Actions du set');
      menu.addEventListener('click', () => this._menuSet(e));
      tete.append(this._oeil(e.visible, () => this._basculerVisible(e), 'Afficher le set'), nom, menu);
      bloc.appendChild(tete);
      if (!e.replie) for (const k of membres) {
        const o = this.objets[k], edite = edites.includes(k);
        const ligne = document.createElement('div');
        ligne.className = 'ed-obj' + (choisi.has(k) ? ' choisi' : '') + (k === this.state.actif && (choisi.has(k) || edite) ? ' actif' : '')
          + (edite ? ' edite' : '') + (o.visible ? '' : ' eteint');
        const sw = this._oeil(o.visible, () => this._basculerVisible(o), 'Afficher l’objet');
        sw.disabled = edite;
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'ed-obj-nom';
        b.textContent = (edite ? '✎ ' : '') + o.nom + (o.modifs.length ? ' 🔧' : '');
        // Appui : choisir l'objet ; appui long (0,5 s, sans glisser : la liste défile) : menu des sets
        let minuteur = null, long = false, x0 = 0, y0 = 0;
        const annuler = () => { clearTimeout(minuteur); minuteur = null; };
        b.addEventListener('pointerdown', ev => {
          long = false;
          annuler();
          x0 = ev.clientX; y0 = ev.clientY;
          minuteur = setTimeout(() => { minuteur = null; long = true; this._menuObjet(k, ligne); }, 500);
        });
        b.addEventListener('pointermove', ev => { if (Math.hypot(ev.clientX - x0, ev.clientY - y0) > 8) annuler(); });
        for (const t of ['pointerup', 'pointercancel', 'pointerleave']) b.addEventListener(t, annuler);
        b.addEventListener('contextmenu', ev => ev.preventDefault());
        b.addEventListener('click', () => {
          if (long) { long = false; return; }      // le clic qui suit un appui long est ignoré
          if (this._geo()) return;
          if (!this._affiche(o)) { this._message('Objet caché'); return; }
          this._choisirObjet(k);
        });
        ligne.append(sw, b);
        bloc.appendChild(ligne);
      }
      if (!e.replie && !membres.length) {
        const vide = document.createElement('div');
        vide.className = 'ed-set-vide';
        vide.textContent = 'Vide : glissez-y des objets';
        bloc.appendChild(vide);
      }
      this.liste.appendChild(bloc);
    });
  }

  // Visibilité d'un objet ou d'un set ; les objets cachés quittent la sélection
  _basculerVisible(x) {
    if (this._geo() && x.maillage && this.edites.includes(this.objets.indexOf(x))) { this._message('Objet en cours d’édition'); return; }
    x.visible = !x.visible;
    this.choix = this.choix.filter(k => this._affiche(this.objets[k]));
    const a = this._actif();
    if (a && !this._geo() && !this._affiche(a)) this.state.actif = this.choix.length ? this.choix[this.choix.length - 1] : -1;
    this._sauver();
    this._rafraichir();
  }

  _nomSetLibre(base) {
    if (!this._set(base)) return base;
    let n = 2;
    while (this._set(base + ' ' + n)) n++;
    return base + ' ' + n;
  }

  _ajouterSet() {
    this._memoriser();
    const e = { nom: this._nomSetLibre('set'), visible: true, replie: false };
    this.sets.push(e);
    this._sauver();
    this._rafraichir();
    this._menuSet(e);
  }

  // Carte des actions d'un set : renommer, fusionner dans un autre set, supprimer
  _menuSet(e) {
    const { fond, carte, fermer } = this.cartSet;
    const titre = document.createElement('b');
    titre.textContent = 'Set « ' + e.nom + ' »';
    carte.replaceChildren(titre);
    const rubrique = texte => {
      const t = document.createElement('span');
      t.className = 'ed-rubrique';
      t.textContent = texte;
      carte.appendChild(t);
    };
    const grille = (items, une) => {
      const g = document.createElement('div');
      g.className = 'ed-grille' + (une ? ' ed-une' : '');
      for (const [texte, fn] of items) {
        const b = document.createElement('button');
        b.type = 'button';
        b.textContent = texte;
        b.addEventListener('click', () => { fermer(); fn(); });
        g.appendChild(b);
      }
      carte.appendChild(g);
    };
    rubrique('Nom');
    const ligne = document.createElement('div');
    ligne.className = 'ed-set-renommer';
    const champ = document.createElement('input');
    champ.type = 'text';
    champ.value = e.nom;
    const ok = document.createElement('button');
    ok.type = 'button';
    ok.textContent = 'Renommer';
    const renommer = () => { if (this._renommerSet(e, champ.value)) fermer(); };
    ok.addEventListener('click', renommer);
    champ.addEventListener('keydown', ev => { if (ev.key === 'Enter') renommer(); });
    ligne.append(champ, ok);
    carte.appendChild(ligne);
    const premier = e === this.sets[0], n = this.objets.filter(o => o.set === e.nom).length;
    if (!premier) {
      rubrique('Fusionner dans');
      grille(this.sets.filter(f => f !== e).map(f => [f.nom, () => this._fusionnerSet(e, f)]));
      rubrique('Supprimer');
      grille([
        [`Le set seul (objets vers « ${this.sets[0].nom} »)`, () => this._fusionnerSet(e, this.sets[0])],
        [`Le set et ses ${n} objet${n > 1 ? 's' : ''}`, () => this._supprimerSet(e)]
      ], true);
    }
    const non = document.createElement('button');
    non.type = 'button';
    non.className = 'ed-non';
    non.textContent = 'Fermer';
    non.addEventListener('click', fermer);
    carte.appendChild(non);
    fond.hidden = false;
  }

  _renommerSet(e, nom) {
    nom = nom.trim();
    if (!nom) { this._message('Nom vide', true); return false; }
    if (nom === e.nom) return true;
    if (this._set(nom)) { this._message('Ce nom est déjà pris', true); return false; }
    this._memoriser();
    for (const o of this.objets) if (o.set === e.nom) o.set = nom;
    e.nom = nom;
    this._sauver();
    this._rafraichir();
    return true;
  }

  // Les objets de `e` passent dans `dans`, puis `e` disparaît
  _fusionnerSet(e, dans) {
    if (e === this.sets[0]) return;
    this._memoriser();
    for (const o of this.objets) if (o.set === e.nom) o.set = dans.nom;
    this.sets.splice(this.sets.indexOf(e), 1);
    this._sauver();
    this._rafraichir();
  }

  // Supprime le set et ses objets (repasse en mode Scène)
  _supprimerSet(e) {
    if (e === this.sets[0]) return;
    this._changerEdition('scene');
    this._memoriser();
    const actif = this._actif();
    const restants = this.objets.filter(o => o.set !== e.nom);
    this.choix = this.choix.map(k => restants.indexOf(this.objets[k])).filter(k => k >= 0);
    this.objets = restants;
    this.state.actif = this.objets.indexOf(actif);   // -1 si l'actif a été supprimé
    this.sets.splice(this.sets.indexOf(e), 1);
    this._sauver();
    this._rafraichir(true);
  }

  // Menu contextuel d'un objet de la liste (appui long), posé sous sa ligne : les sets, pour l'y déplacer (le sien
  // coché), ou un nouveau set. Se ferme au choix ou à un appui ailleurs.
  _menuObjet(k, ligne) {
    const o = this.objets[k];
    if (!o) return;
    this._fermerMenuObjet();
    const m = this.menuObjet = document.createElement('div');
    m.className = 'ed-contexte';
    const t = document.createElement('span');
    t.className = 'ed-rubrique';
    t.textContent = 'Déplacer « ' + o.nom + ' » vers';
    m.appendChild(t);
    const choix = (texte, fn, cle) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'ed-curseur-action' + (cle ? ' ' + cle : '');
      b.textContent = texte;
      b.addEventListener('click', () => { this._fermerMenuObjet(); fn(); });
      m.appendChild(b);
      return b;
    };
    for (const e of this.sets) {
      const b = choix(e.nom, () => this._deplacerObjet(o, e.nom), e.nom === o.set ? 'on' : '');
      if (e.nom === o.set) { b.disabled = true; b.prepend('✓ '); }
    }
    choix('＋ Nouveau set', () => {
      const e = { nom: this._nomSetLibre('set'), visible: true, replie: false };
      this._memoriser();
      this.sets.push(e);
      o.set = e.nom;
      this._sauver();
      this._rafraichir();
      this._menuSet(e);                  // pour le nommer aussitôt
    }, 'ed-contexte-nouveau');
    this.el.appendChild(m);
    // Sous la ligne, ramené dans l'écran (au-dessus de la ligne s'il n'y a pas la place dessous)
    const r = ligne.getBoundingClientRect(), h = m.offsetHeight || 0, w = m.offsetWidth || 0;
    const haut = r.bottom + h > window.innerHeight - 8 ? Math.max(8, r.top - h) : r.bottom;
    m.style.top = haut + 'px';
    m.style.left = Math.max(8, Math.min(r.left + 8, window.innerWidth - w - 8)) + 'px';
    this._horsMenu = ev => { if (!m.contains(ev.target)) this._fermerMenuObjet(); };
    setTimeout(() => document.addEventListener('pointerdown', this._horsMenu, true));
  }

  _fermerMenuObjet() {
    if (this._horsMenu) document.removeEventListener('pointerdown', this._horsMenu, true);
    this._horsMenu = null;
    if (this.menuObjet) this.menuObjet.remove();
    this.menuObjet = null;
  }

  _deplacerObjet(o, set) {
    if (!o || o.set === set || !this._set(set)) return;
    this._memoriser();
    o.set = set;
    this._sauver();
    this._rafraichir();
    this._message('« ' + o.nom + ' » → ' + set);
  }

  // ----- Scène --------------------------------------------------------------------------------------
  _scene(m) {
    // Faces : Lambert à facettes, éclairage continu (pas de paliers dans l'éditeur)
    const lisse = { flatShading: true };
    const decale = { polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1 };
    this.mat = {
      face: new THREE.MeshLambertMaterial({ ...lisse, ...decale }),
      selection: new THREE.MeshLambertMaterial({ ...lisse, ...decale }),
      envers: new THREE.MeshLambertMaterial({ ...lisse, side: THREE.BackSide, ...decale }),
      aretes: new THREE.LineBasicMaterial({ transparent: true, opacity: 0.75 }),
      // Arêtes sélectionnées : bandes d'épaisseur constante à l'écran. Chaque arête est un quadrilatère dont les
      // sommets connaissent l'autre extrémité (`autre`) et leur côté (`cote`) ; le nuanceur les écarte
      // perpendiculairement à l'arête projetée.
      aretesChoisies: new THREE.ShaderMaterial({
        uniforms: { couleur: { value: new THREE.Color() }, resolution: { value: new THREE.Vector2(1, 1) }, largeur: { value: ED_BANDE } },
        vertexShader: `
          uniform vec2 resolution;
          uniform float largeur;
          attribute vec3 autre;
          attribute float cote;
          void main() {
            vec4 a = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
            vec4 b = projectionMatrix * modelViewMatrix * vec4(autre, 1.0);
            vec2 d = (b.xy / b.w - a.xy / a.w) * resolution;
            vec2 n = length(d) > 1e-6 ? normalize(vec2(-d.y, d.x)) : vec2(0.0, 1.0);
            a.xy += n * cote * largeur / resolution * a.w;
            gl_Position = a;
          }`,
        fragmentShader: `
          uniform vec3 couleur;
          void main() { gl_FragColor = vec4(couleur, 1.0); }`,
        side: THREE.DoubleSide
      }),
      points: new THREE.PointsMaterial({ size: 8, sizeAttenuation: false }),
      choisis: new THREE.PointsMaterial({ size: 13, sizeAttenuation: false }),
      // Objets de la scène : ordinaire, sélectionné, actif ; en mode Géométrie, les autres objets (estompés)
      objet: new THREE.MeshLambertMaterial({ ...lisse, ...decale }),
      objetChoisi: new THREE.MeshLambertMaterial({ ...lisse, ...decale }),
      objetActif: new THREE.MeshLambertMaterial({ ...lisse, ...decale }),
      passif: new THREE.MeshLambertMaterial({ ...lisse, transparent: true, opacity: 0.4, depthWrite: false }),
      // Cible d'un modifieur booléen
      outil: new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.08, depthWrite: false }),
      filOutil: new THREE.LineBasicMaterial({ transparent: true, opacity: 0.8 }),
      // Silhouette des objets choisis (mode Scène) : bandes comme aretesChoisies ; chaque arête connaît les normales
      // de ses deux faces (n1, n2 ; n2 nulle : arête de bord, toujours tracée) et n'est tracée que si l'une est tournée
      // vers l'œil et l'autre non (testé au milieu de l'arête, vu de la caméra) ; sinon elle sort du volume de vue
      silhouette: new THREE.ShaderMaterial({
        uniforms: { couleur: { value: new THREE.Color() }, resolution: { value: new THREE.Vector2(1, 1) }, largeur: { value: ED_SILHOUETTE } },
        vertexShader: `
          uniform vec2 resolution;
          uniform float largeur;
          attribute vec3 autre;
          attribute float cote;
          attribute vec3 n1;
          attribute vec3 n2;
          void main() {
            vec3 oeil = -(modelViewMatrix * vec4((position + autre) * 0.5, 1.0)).xyz;
            float f1 = dot(normalMatrix * n1, oeil), f2 = dot(normalMatrix * n2, oeil);
            if (dot(n2, n2) > 0.5 && f1 * f2 > 0.0) { gl_Position = vec4(0.0, 0.0, 2.0, 1.0); return; }
            vec4 a = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
            vec4 b = projectionMatrix * modelViewMatrix * vec4(autre, 1.0);
            vec2 d = (b.xy / b.w - a.xy / a.w) * resolution;
            vec2 n = length(d) > 1e-6 ? normalize(vec2(-d.y, d.x)) : vec2(0.0, 1.0);
            a.xy += n * cote * largeur / resolution * a.w;
            gl_Position = a;
          }`,
        fragmentShader: `
          uniform vec3 couleur;
          void main() { gl_FragColor = vec4(couleur, 1.0); }`,
        side: THREE.DoubleSide
      })
    };
    this.groupeObjets = new THREE.Group();
    m.scene.add(this.groupeObjets);
    // Origines des objets affichés (mode Scène) : points ronds épais, couleur de l'envers des faces, cerclés de noir
    // (la texture est blanche au centre, teintée par la couleur du matériau, et noire sur le bord), vus à travers tout
    const n = 32, disque = new Uint8Array(n * n * 4);
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
      const d = Math.hypot(x + 0.5 - n / 2, y + 0.5 - n / 2) / (n / 2), k = (y * n + x) * 4;
      disque[k] = disque[k + 1] = disque[k + 2] = d <= 0.68 ? 255 : 0;   // liseré : le tiers extérieur du rayon
      disque[k + 3] = d <= 1 ? 255 : 0;
    }
    const rond = new THREE.DataTexture(disque, n, n);
    rond.needsUpdate = true;
    this.mat.origines = new THREE.PointsMaterial({ size: 14, sizeAttenuation: false, map: rond, alphaTest: 0.5, depthTest: false, depthWrite: false });
    this.origines = new THREE.Points(new THREE.BufferGeometry(), this.mat.origines);
    this.origines.userData.selectionnable = false;
    this.origines.renderOrder = 8;
    m.scene.add(this.origines);
    this.objet = new THREE.Mesh(new THREE.BufferGeometry(), [this.mat.face, this.mat.selection]);
    this.envers = new THREE.Mesh(new THREE.BufferGeometry(), this.mat.envers);
    this.envers.userData.selectionnable = false;
    this.fil = new THREE.LineSegments(new THREE.BufferGeometry(), this.mat.aretes);
    this.filChoisi = new THREE.Mesh(new THREE.BufferGeometry(), this.mat.aretesChoisies);   // arêtes sélectionnées
    this.filChoisi.frustumCulled = false;   // positions écartées par le nuanceur
    this.filChoisi.renderOrder = 1;
    this.points = new THREE.Points(new THREE.BufferGeometry(), this.mat.points);
    this.choisis = new THREE.Points(new THREE.BufferGeometry(), this.mat.choisis);
    for (const o of [this.fil, this.filChoisi, this.points, this.choisis]) o.userData.selectionnable = false;
    this.choisis.renderOrder = 2;
    m.scene.add(this.objet, this.envers, this.fil, this.filChoisi, this.points, this.choisis);
    this._poignee(m);
    this._curseur3D(m);
    this._couleurs();
  }

  // Couleurs résolues (this.couleurs) posées en variables CSS sur l'éditeur seul (les clés d'interface ne le sont
  // que si elles ont été changées, pour suivre sinon le thème général), puis sur la scène 3D
  _appliquerCouleurs() {
    const perso = this.state.couleurs || {};
    this.couleurs = ed_resoudreCouleurs(perso);
    for (const [cle, v] of this.couleurs) {
      if (!cle.startsWith('--')) this.el.style.setProperty('--ed-' + cle, v);
      else if (perso[cle]) this.el.style.setProperty(cle, v);
      else this.el.style.removeProperty(cle);
    }
    this._couleurs();
    this._afficherCouleurs();
  }

  _couleurs() {
    const m = this.m, mat = this.mat;
    if (!m || !mat || !this.couleurs) return;
    const c = k => new THREE.Color(this.couleurs.get(k));
    const regles = [
      [mat.face, 'face'], [mat.selection, 'face-choisie'], [mat.envers, 'envers'], [mat.origines, 'origine'],
      [mat.aretes, 'arete'], [mat.points, 'sommet'], [mat.choisis, 'sommet-choisi'],
      [mat.objet, 'objet'], [mat.passif, 'objet'], [mat.objetChoisi, 'objet-choisi'], [mat.objetActif, 'objet-actif'],
      [mat.outil, '--text-color'], [mat.filOutil, 'cible']
    ];
    for (const [materiau, cle] of regles) if (materiau) materiau.color.copy(c(cle));
    mat.aretesChoisies.uniforms.couleur.value.copy(c('arete-choisie'));
    mat.silhouette.uniforms.couleur.value.copy(c('contour-choisi'));
    if (this.poignees) {
      this.poignees.o.material.color.copy(c('poignee'));
      for (const a of ED_AXES) {
        this.poignees[a].material.color.copy(c('axe-' + a));
        this.anneaux[a].material.color.copy(c('axe-' + a));
      }
    }
    if (this.matCurseur) {
      this.matCurseur.raye.color.copy(c('curseur'));
      this.matCurseur.reticule.color.copy(c('reticule'));
    }
    this._grille();
    m.redessiner();
  }


  // Poignée de translation : trois axes (tige + cône à l'extrémité) et l'origine (cube) ; de rotation : anneaux ;
  // d'échelle : axes à cube et anneau blanc. Dessinée par-dessus
  // le modèle, de taille constante à l'écran (voir _placerPoignee). Les axes non cochés sont estompés et inertes.
  _poignee(m) {
    const g = this.poignee = new THREE.Group();
    g.userData.selectionnable = false;
    g.visible = false;
    const mat = c => new THREE.MeshBasicMaterial({ color: c, depthTest: false, depthWrite: false, transparent: true });
    const maille = (geo, materiau) => { const o = new THREE.Mesh(geo, materiau); o.renderOrder = 10; return o; };
    this.poignees = {};
    const fleches = this.fleches = new THREE.Group(), cercles = this.cercles = new THREE.Group();
    g.add(fleches, cercles);
    for (const a of ED_AXES) {
      // Construit le long de Y, puis tourné vers X ou Z
      const axe = new THREE.Group(), m2 = mat('#ffffff');   // couleurs : voir _couleurs
      const tige = maille(new THREE.CylinderGeometry(0.028, 0.028, 0.7, 6), m2);
      tige.position.y = 0.45;
      const bout = maille(new THREE.ConeGeometry(0.1, 0.26, 8), m2);
      bout.position.y = 0.92;
      axe.add(tige, bout);
      if (a === 'x') axe.rotation.z = -Math.PI / 2;
      if (a === 'z') axe.rotation.x = Math.PI / 2;
      fleches.add(axe);
      this.poignees[a] = { groupe: axe, bout, material: m2 };
    }
    const o = maille(new THREE.BoxGeometry(0.17, 0.17, 0.17), mat('#ffffff'));
    fleches.add(o);
    this.poignees.o = { groupe: o, bout: o, material: o.material };
    // Rotation : un anneau par axe (dans le plan perpendiculaire), l'anneau de vue (face à la caméra) et le pivot
    this.anneaux = {};
    for (const a of ED_AXES) {
      const an = maille(new THREE.TorusGeometry(1, 0.03, 4, 64), mat('#ffffff'));
      if (a === 'x') an.rotation.y = Math.PI / 2;
      if (a === 'y') an.rotation.x = Math.PI / 2;
      cercles.add(an);
      this.anneaux[a] = an;
    }
    this.anneaux.v = maille(new THREE.TorusGeometry(1.22, 0.022, 4, 64), mat('#ffffff'));
    this.pointPivot = maille(new THREE.OctahedronGeometry(0.09), o.material);
    cercles.add(this.anneaux.v, this.pointPivot);
    // Échelle : par axe, une tige terminée par un cube (mêmes matériaux que les flèches) ; anneau blanc et pivot
    const echelles = this.echelles = new THREE.Group();
    g.add(echelles);
    for (const a of ED_AXES) {
      const axe = new THREE.Group(), m2 = this.poignees[a].material;
      const tige = maille(new THREE.CylinderGeometry(0.028, 0.028, 0.8, 6), m2);
      tige.position.y = 0.45;
      const bout = maille(new THREE.BoxGeometry(0.16, 0.16, 0.16), m2);
      bout.position.y = 0.9;
      axe.add(tige, bout);
      if (a === 'x') axe.rotation.z = -Math.PI / 2;
      if (a === 'z') axe.rotation.x = Math.PI / 2;
      echelles.add(axe);
      this.poignees[a].cube = bout;
    }
    this.anneauEchelle = maille(new THREE.TorusGeometry(1.22, 0.022, 4, 64), this.anneaux.v.material);
    this.pivotEchelle = maille(new THREE.OctahedronGeometry(0.09), o.material);
    echelles.add(this.anneauEchelle, this.pivotEchelle);
    m.scene.add(g);
  }

  // Curseur 3D : anneau à huit secteurs alternés (couleur chaude / blanc) et réticule, tourné vers la caméra,
  // dessiné par-dessus le modèle, de taille constante à l'écran (voir _placerCurseur)
  _curseur3D(m) {
    const g = this.curseur = new THREE.Group();
    g.userData.selectionnable = false;
    const mat = c => new THREE.MeshBasicMaterial({ color: c, depthTest: false, depthWrite: false, transparent: true, side: THREE.DoubleSide });
    this.matCurseur = { raye: mat('#ffffff'), blanc: mat('#ffffff'), reticule: mat('#ffffff') };   // voir _couleurs
    const maille = (geo, materiau) => { const o = new THREE.Mesh(geo, materiau); o.renderOrder = 9; g.add(o); return o; };
    for (let k = 0; k < 8; k++) {
      maille(new THREE.RingGeometry(0.78, 1, 4, 1, k * Math.PI / 4, Math.PI / 4), k % 2 ? this.matCurseur.blanc : this.matCurseur.raye);
    }
    for (let k = 0; k < 4; k++) {
      const t = maille(new THREE.PlaneGeometry(0.9, 0.09), this.matCurseur.reticule);
      const a = k * Math.PI / 2;
      t.position.set(Math.cos(a) * 0.95, Math.sin(a) * 0.95, 0);
      t.rotation.z = a;
    }
    m.scene.add(g);
    this._placerCurseur();
  }

  // Position (état), orientation face à la caméra et taille constante à l'écran
  _placerCurseur() {
    const g = this.curseur;
    if (!g) return;
    g.position.fromArray(this.state.curseur);
    g.quaternion.copy(this.m.camera.quaternion);
    g.scale.setScalar(this._repere(this.state.curseur).pixel * ED_CURSEUR);
  }

  _placerCurseurEn(p) {
    this.state.curseur = p.map(v => +v || 0);
    this.save();
    this._afficherCurseur();
    if (this.m) { this._placerCurseur(); this.m.redessiner(); }
    if (this._ajout && this._ajout.base && this._ajout.relancer) this._ajout.relancer();
  }

  _afficherCurseur() {
    if (!this.champsCurseur) return;
    this.champsCurseur.forEach((i, k) => { if (document.activeElement !== i) i.value = +this.state.curseur[k].toFixed(4); });
  }

  // Déplace la sélection pour que son centre arrive sur le curseur
  _selectionVersCurseur() {
    const indices = this._indices().slice();
    if (!indices.length) { this._message('Rien de sélectionné'); return; }
    const c = this._centre(), d = new THREE.Vector3().fromArray(this.state.curseur).sub(new THREE.Vector3().fromArray(c));
    this._memoriser();
    this._poser(indices, this._depart(indices), d);
    this._sauver();
    this._rafraichir();
  }

  // Centre la vue sur le curseur (même distance)
  _vueVersCurseur() {
    const c = this.state.curseur;
    this.m.animations.arreter(this.cam.cible);
    this.m.animations.vers(this.cam.cible, { 0: c[0], 1: c[1], 2: c[2] }, 0.4, {
      assouplir: 'sortie', fin: () => this._memoriserVue()
    });
    this._numerosSales = true;
  }

  // Opacité et taille des poignées selon les axes cochés et la poignée tenue
  _habillerPoignee() {
    if (!this.poignees) return;
    const ax = this.state.axes, tenue = this._glisse && this._glisse.prise;
    for (const a of ED_AXES) {
      const p = this.poignees[a];
      p.material.opacity = !ax[a] ? 0.18 : tenue && tenue !== a && !(tenue === 'o') ? 0.45 : 1;
      p.bout.scale.setScalar(tenue === a ? 1.35 : 1);
      p.cube.scale.setScalar(tenue === a ? 1.35 : 1);
    }
    this.poignees.o.bout.scale.setScalar(tenue === 'o' ? 1.35 : 1);
    this.poignees.o.material.opacity = tenue && tenue !== 'o' ? 0.45 : 1;
    // Anneaux : ceux des axes non cochés sont masqués ; l'anneau de vue n'existe qu'avec les trois axes
    const rotation = this.state.mode === 'rotation';
    this.fleches.visible = this.state.mode === 'translation';
    this.cercles.visible = rotation;
    this.echelles.visible = this.state.mode === 'echelle';
    this.pointPivot.scale.setScalar(tenue === 'o' ? 1.5 : 1);
    this.pivotEchelle.scale.setScalar(tenue === 'o' ? 1.5 : 1);
    this.anneauEchelle.visible = ED_AXES.some(b => ax[b]);
    this.anneauEchelle.scale.setScalar(tenue === 'v' ? 1.03 : 1);
    for (const a of ['x', 'y', 'z', 'v']) {
      const an = this.anneaux[a];
      an.visible = a === 'v' ? ED_AXES.every(b => ax[b]) : ax[a];
      an.material.opacity = !tenue || tenue === a ? 0.95 : 0.3;
      an.scale.setScalar(tenue === a ? 1.03 : 1);
    }
  }

  // Pivot de la rotation ou de l'échelle, selon le réglage (la sélection n'est pas vide) : sur les sommets sélectionnés, ou sur les
  // origines des objets choisis
  _pivot() {
    const pts = this._points();
    switch (this.state.pivot) {
      case 'curseur': return this.state.curseur.slice();
      case 'origine': return [0, 0, 0];
      case 'actif': {
        // Mode Géométrie : centre de l'élément choisi en dernier (à défaut, dernier sommet concerné)
        const el = this._geo() && this.sel.dernier;
        if (!el) return pts[pts.length - 1].slice();
        const l = SelectionMaillage.sommetsDe(el), c = [0, 0, 0];
        for (const i of l) for (let k = 0; k < 3; k++) c[k] += this.maillage.sommets[i][k] / l.length;
        return c;
      }
      case 'boite': {
        const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
        for (const p of pts) for (let k = 0; k < 3; k++) { min[k] = Math.min(min[k], p[k]); max[k] = Math.max(max[k], p[k]); }
        return min.map((v, k) => (v + max[k]) / 2);
      }
      default: return this._centre();
    }
  }

  // Taille constante à l'écran : appelée à chaque image, caméra placée
  _placerPoignee() {
    const g = this.poignee;
    if (!g || !g.visible) return;
    g.scale.setScalar(this._repere(g.position.toArray()).pixel * ED_POIGNEE);
    this.anneaux.v.quaternion.copy(this.m.camera.quaternion);
    this.anneauEchelle.quaternion.copy(this.m.camera.quaternion);
  }

  // Poignée sous le doigt (pixels relatifs à la vue) : 'x', 'y', 'z' (extrémité ou anneau d'un axe coché),
  // 'v' (anneau blanc), 'o' (origine ou pivot) ou null
  _poigneeSous(x, y) {
    const g = this.poignee, m = this.m;
    if (!g || !g.visible) return null;
    g.updateMatrixWorld();
    const v = new THREE.Vector3();
    let choix = null, dmin = ED_RAYON + 4;
    const essayer = (nom, p) => {
      v.copy(p).project(m.camera);
      if (v.z > 1 || v.z < -1) return;
      const d = Math.hypot((v.x + 1) / 2 * m.largeur - x, (1 - v.y) / 2 * m.hauteur - y);
      if (d < dmin) { dmin = d; choix = nom; }
    };
    essayer('o', g.position);
    const mode = this.state.mode;
    if (mode !== 'rotation') {
      const bout = mode === 'echelle' ? 'cube' : 'bout';
      for (const a of ED_AXES) if (this.state.axes[a]) essayer(a, this.poignees[a][bout].getWorldPosition(new THREE.Vector3()));
      if (mode === 'translation') return choix;
    }
    // Anneaux : distance au tracé projeté à l'écran (48 segments)
    const ecran = p => { v.copy(p).project(m.camera); return v.z > 1 || v.z < -1 ? null : [(v.x + 1) / 2 * m.largeur, (1 - v.y) / 2 * m.hauteur]; };
    const segment = (a, b) => {
      const dx = b[0] - a[0], dy = b[1] - a[1], l2 = dx * dx + dy * dy;
      const t = l2 ? ed_borner(((x - a[0]) * dx + (y - a[1]) * dy) / l2, 0, 1) : 0;
      return Math.hypot(a[0] + t * dx - x, a[1] + t * dy - y);
    };
    const anneaux = mode === 'echelle' ? { v: this.anneauEchelle } : this.anneaux;
    for (const a in anneaux) {
      const an = anneaux[a];
      if (!an.visible) continue;
      an.updateMatrixWorld();
      const r = an.geometry.parameters.radius, q = new THREE.Vector3();
      let avant = null;
      for (let k = 0; k <= 48; k++) {
        const t = k / 48 * Math.PI * 2;
        const p = ecran(q.set(Math.cos(t) * r, Math.sin(t) * r, 0).applyMatrix4(an.matrixWorld));
        if (p && avant) { const d = segment(avant, p); if (d < dmin) { dmin = d; choix = a; } }
        avant = p;
      }
    }
    return choix;
  }

  // Taille caractéristique de la scène : sert à la grille et au pas des transformations. Scène vide : le pas en cours est
  // gardé (sinon la grille, retombée à sa taille par défaut, donnerait l'impression que la vue a sauté)
  _echelle() {
    const b = this._boiteMonde();
    if (!b && this.pas) return this.pas;
    const t = b ? Math.max(b.max[0] - b.min[0], b.max[1] - b.min[1], b.max[2] - b.min[2]) : 1;
    return Math.pow(10, Math.floor(Math.log10((t || 1) / 2)));   // pas de grille : puissance de 10
  }

  // Grille au sol (y = 0) et axes X (rouge), Y (vert), Z (bleu), à l'échelle du modèle
  _grille() {
    const m = this.m, pas = this.pas = this._echelle(), n = 20, t = pas * n;
    if (this.sol) { m.scene.remove(this.sol); this.sol.geometry.dispose(); this.sol.material.dispose(); }
    if (this.axes) { m.scene.remove(this.axes); this.axes.geometry.dispose(); this.axes.material.dispose(); }
    const c = new THREE.Color(this.couleurs.get('grille'));
    this.sol = new THREE.GridHelper(t, n, c, c);
    this.sol.material.transparent = true;
    this.sol.material.opacity = 0.35;
    const h = t / 2, p = [-h, 0, 0, h, 0, 0, 0, -h, 0, 0, h, 0, 0, 0, -h, 0, 0, h];
    const col = [];
    for (const a of ED_AXES) { const v = new THREE.Color(this.couleurs.get('axe-' + a)).toArray(); col.push(...v, ...v); }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(p, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    this.axes = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ vertexColors: true }));
    for (const o of [this.sol, this.axes]) { o.userData.selectionnable = false; m.scene.add(o); }
  }

  // Reconstruit l'affichage d'après la scène, le maillage édité et la sélection. `tout` : la scène a changé (grille).
  _rafraichir(tout) {
    if (!this.m) return;
    const geo = this._geo();
    this._rafraichirObjets();
    for (const o of [this.objet, this.envers, this.fil, this.filChoisi, this.points, this.choisis]) o.visible = geo;
    // Filtres : seuls les types d'éléments sélectionnables sont dessinés (points et sélection)
    const f = this._filtres();
    this.points.visible = this.choisis.visible = geo && !!f.sommets;
    this.filChoisi.visible = geo && !!f.aretes;
    if (geo) this._rafraichirMaillage();

    const n = this._indices().length;
    this.poignee.visible = n > 0;
    const g = this._glisse;
    this.poignee.position.fromArray(g && g.pivot ? g.pivot : n && this.state.mode !== 'translation' ? this._pivot() : this._centre());
    this._habillerPoignee();
    this._placerPoignee();

    if (tout) this._grille();
    this._numerosSales = true;
    this._afficherInfos();
    this.m.redessiner();
  }

  // Objets de la scène : un groupe par objet (faces + arêtes) à sa position et sa rotation. La géométrie n'est
  // refaite que si le maillage a changé (`_geoSale`) ; les groupes des objets disparus sont libérés.
  _rafraichirObjets() {
    const geo = this._geo(), actif = this.state.actif, choisi = new Set(this.choix), vivants = new Set(), cibles = this._cibles();
    const jeu = this._rendu() === 'jeu';
    this.objets.forEach((o, k) => {
      const edite = geo && this.edites.includes(k);
      if (!o.vue) {
        const faces = new THREE.Mesh(new THREE.BufferGeometry(), this.mat.objet);
        // Fil de fer : cible d'un booléen seulement ; silhouette : objet choisi
        const fil = new THREE.LineSegments(new THREE.BufferGeometry(), this.mat.filOutil);
        const silhouette = new THREE.Mesh(new THREE.BufferGeometry(), this.mat.silhouette);
        silhouette.frustumCulled = false;  // positions écartées par le nuanceur
        silhouette.renderOrder = 1;
        silhouette.raycast = () => {};     // jamais touchée
        fil.userData.selectionnable = silhouette.userData.selectionnable = false;
        o.vue = new THREE.Group();
        o.vue.add(faces, fil, silhouette);
        o._geoSale = true;
        this.groupeObjets.add(o.vue);
      }
      vivants.add(o.vue);
      const [faces, fil, silhouette] = o.vue.children;
      o.vue.visible = !edite && this._affiche(o);
      // Maillage modifié (le même tant que rien n'a changé : voir _evalue)
      const mm = edite ? null : this._evalue(o);
      if (mm && (o._geoSale || faces.userData.source !== mm)) {
        o._geoSale = false;
        faces.userData.source = mm;
        faces.geometry.dispose();
        faces.geometry = mm.geometrie(() => 0);
        const a = [];
        for (const [i, j] of mm.aretes()) a.push(...mm.sommets[i], ...mm.sommets[j]);
        fil.geometry.dispose();
        fil.geometry = new THREE.BufferGeometry();
        fil.geometry.setAttribute('position', new THREE.Float32BufferAttribute(a, 3));
        silhouette.geometry.dispose();
        silhouette.geometry = ed_silhouette(mm);
      }
      o.vue.position.fromArray(o.position);
      o.vue.quaternion.fromArray(o.rotation);
      o.vue.scale.fromArray(o.echelle);
      o.vue.userData.objet = k;
      o.vue.userData.selectionnable = !geo;   // en mode Géométrie, les autres objets ne se touchent pas
      // Cible d'un booléen : presque transparente, en fil de fer (toujours touchable)
      // Rendu « En jeu » : le matériau de l'objet ; la sélection ne se voit qu'à la silhouette des objets choisis
      const mj = jeu && !geo && !cibles.has(o) ? this._matJeu(o.materiau) : null;
      faces.material = geo ? this.mat.passif : cibles.has(o) ? this.mat.outil : mj ? mj.faces : !choisi.has(k) ? this.mat.objet : k === actif ? this.mat.objetActif : this.mat.objetChoisi;
      fil.visible = !geo && cibles.has(o);
      silhouette.visible = !geo && choisi.has(k) && !cibles.has(o);
    });
    // Origines des objets affichés, en mode Scène
    const pts = geo ? [] : this.objets.filter(o => this._affiche(o)).flatMap(o => o.position);
    this.origines.geometry.dispose();
    this.origines.geometry = new THREE.BufferGeometry();
    this.origines.geometry.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    this.origines.visible = pts.length > 0;
    for (const v of this.groupeObjets.children.slice()) {
      if (vivants.has(v)) continue;
      this.groupeObjets.remove(v);
      for (const c of v.children) c.geometry.dispose();
    }
  }

  // Maillage édité (mode Géométrie) : faces, envers, arêtes, sommets et sommets choisis
  _rafraichirMaillage() {
    const mm = this.maillage, choisies = new Set(this.sel.faces), faces = !!this._filtres().faces;
    const remplacer = (o, g) => { o.geometry.dispose(); o.geometry = g; };
    // Groupes de triangles : faces ordinaires (0) et faces sélectionnées (1, si le filtre Faces est actif)
    const groupe = f => faces && choisies.has(f) ? 1 : 0;
    const geo = mm.geometrie(groupe);
    const mats = geo.userData.materiaux.map(g => g === 1 ? this.mat.selection : this.mat.face);
    this.objet.material = mats.length ? mats : [this.mat.face];
    geo.groups.forEach((g, k) => { g.materialIndex = k; });
    // Triangle n° k de la géométrie → face du maillage (groupes dans l'ordre de première apparition)
    const parGroupe = new Map();
    for (const f of mm.faces) {
      const g = groupe(f);
      if (!parGroupe.has(g)) parGroupe.set(g, []);
      for (let k = 1; k + 1 < f.s.length; k++) parGroupe.get(g).push(f);
    }
    this.triFaces = [...parGroupe.values()].flat();
    remplacer(this.objet, geo);
    remplacer(this.envers, geo);

    const a = [], bp = [], ba = [], bc = [], bi = [];
    for (const [i, j] of mm.aretes()) a.push(...mm.sommets[i], ...mm.sommets[j]);
    for (const [i, j] of this.sel.aretes) {
      const p = mm.sommets[i], q = mm.sommets[j];
      // Bande : deux sommets à chaque extrémité, de part et d'autre de l'arête
      const n = bp.length / 3;
      bp.push(...p, ...p, ...q, ...q);
      ba.push(...q, ...q, ...p, ...p);
      bc.push(1, -1, -1, 1);
      bi.push(n, n + 1, n + 2, n + 1, n + 3, n + 2);
    }
    const ga = new THREE.BufferGeometry();
    ga.setAttribute('position', new THREE.Float32BufferAttribute(a, 3));
    remplacer(this.fil, ga);
    const gb = new THREE.BufferGeometry();
    gb.setAttribute('position', new THREE.Float32BufferAttribute(bp, 3));
    gb.setAttribute('autre', new THREE.Float32BufferAttribute(ba, 3));
    gb.setAttribute('cote', new THREE.Float32BufferAttribute(bc, 1));
    gb.setIndex(bi);
    remplacer(this.filChoisi, gb);
    const gp = new THREE.BufferGeometry();
    gp.setAttribute('position', new THREE.Float32BufferAttribute(mm.sommets.flat(), 3));
    remplacer(this.points, gp);
    const gc = new THREE.BufferGeometry();
    gc.setAttribute('position', new THREE.Float32BufferAttribute(this.sel.sommets.flatMap(i => mm.sommets[i]), 3));
    remplacer(this.choisis, gc);

    // Rayons X : sommets et arêtes visibles à travers les faces, faces translucides
    const x = this._enRayons();
    if (this._rayonsX !== x) {
      this._rayonsX = x;
      for (const k of ['aretes', 'aretesChoisies', 'points', 'choisis']) Object.assign(this.mat[k], { depthTest: !x, needsUpdate: true });
      for (const k of ['face', 'selection', 'envers']) Object.assign(this.mat[k], { transparent: x, opacity: x ? 0.45 : 1, depthWrite: !x, needsUpdate: true });
    }
    const r = this.m.renderer.getPixelRatio ? this.m.renderer.getPixelRatio() : 1;
    this.mat.points.size = 8 * r;
    this.mat.choisis.size = 13 * r;
  }

  // Numéros d'ordre au-dessus des sommets sélectionnés (au plus 24, mode Géométrie)
  _placerNumeros() {
    const m = this.m, l = this._geo() && this._filtres().sommets ? this.sel.sommets.slice(0, 24) : [], v = new THREE.Vector3();
    while (this.numeros.children.length < l.length) {
      const s = document.createElement('span');
      this.numeros.appendChild(s);
    }
    [...this.numeros.children].forEach((s, k) => {
      if (k >= l.length) { s.hidden = true; return; }
      v.fromArray(this.maillage.sommets[l[k]]).project(m.camera);
      s.hidden = v.z > 1;
      s.textContent = k + 1;
      s.style.transform = `translate(${((v.x + 1) / 2 * m.largeur).toFixed(1)}px,${((1 - v.y) / 2 * m.hauteur).toFixed(1)}px)`;
    });
  }

  // ----- Sélection ----------------------------------------------------------------------------------
  // Sommet le plus proche du point touché (pixels relatifs à la vue), visible sauf en rayons X ; -1 sinon
  _sommetSous(x, y, parmi) {
    const m = this.m, mm = this.maillage, v = new THREE.Vector3(), cand = [];
    m.scene.updateMatrixWorld();
    m.camera.updateMatrixWorld();
    const liste = parmi || mm.sommets.map((_, i) => i);
    for (const i of liste) {
      v.fromArray(mm.sommets[i]).project(m.camera);
      if (v.z > 1 || v.z < -1) continue;
      const d = Math.hypot((v.x + 1) / 2 * m.largeur - x, (1 - v.y) / 2 * m.hauteur - y);
      if (d <= ED_RAYON) cand.push([d, i]);
    }
    cand.sort((a, b) => a[0] - b[0]);
    for (const [, i] of cand) if (this._enRayons() || this._visible(i)) return i;
    return -1;
  }

  // Un sommet (ou un point `p` du maillage) est visible si aucune face ne s'interpose entre lui et la caméra
  _visible(i, p = new THREE.Vector3().fromArray(this.maillage.sommets[i])) {
    const m = this.m;
    const o = m.camera.position, d = p.clone().sub(o), lg = d.length();
    m.raycaster.set(o, d.normalize());
    const t = m.raycaster.intersectObject(this.objet, false)[0];
    return !t || t.distance >= lg - Math.max(1e-4, lg * 0.002);
  }

  // Arête sous le doigt (pixels relatifs à la vue) : [i, j], ou null. Distance au segment projeté à l'écran ;
  // la plus proche dont le point touché n'est pas caché par une face (sauf en rayons X)
  _areteSous(x, y) {
    const m = this.m, mm = this.maillage, v = new THREE.Vector3(), cand = [];
    m.scene.updateMatrixWorld();
    m.camera.updateMatrixWorld();
    const ecran = mm.sommets.map(p => {
      v.fromArray(p).project(m.camera);
      return v.z > 1 || v.z < -1 ? null : [(v.x + 1) / 2 * m.largeur, (1 - v.y) / 2 * m.hauteur];
    });
    for (const [i, j] of mm.aretes()) {
      const a = ecran[i], b = ecran[j];
      if (!a || !b) continue;
      const dx = b[0] - a[0], dy = b[1] - a[1], l2 = dx * dx + dy * dy;
      const t = l2 ? ed_borner(((x - a[0]) * dx + (y - a[1]) * dy) / l2, 0, 1) : 0;
      const d = Math.hypot(a[0] + t * dx - x, a[1] + t * dy - y);
      if (d <= ED_RAYON * 0.75) cand.push([d, i, j, t]);
    }
    cand.sort((a, b) => a[0] - b[0]);
    for (const [, i, j, t] of cand) {
      if (this._enRayons()) return [i, j];
      const p = new THREE.Vector3().fromArray(mm.sommets[i]).lerp(new THREE.Vector3().fromArray(mm.sommets[j]), t);
      if (this._visible(-1, p)) return [i, j];
    }
    return null;
  }

  // Élément sélectionnable sous le doigt, selon les filtres : sommet, sinon arête, sinon face, comme élément de
  // SelectionMaillage ({ t: 's', i }, { t: 'a', a }, { t: 'f', f }), ou null
  _elementSous(d) {
    const f = this._filtres();
    if (f.sommets) { const i = this._sommetSous(d.x, d.y); if (i >= 0) return { t: 's', i }; }
    if (f.aretes) { const a = this._areteSous(d.x, d.y); if (a) return { t: 'a', a }; }
    if (f.faces && this.m.objetSous(d.clientX, d.clientY) === this.objet) {
      const hit = this.m.raycaster.intersectObject(this.objet, false)[0];
      const face = hit && this.triFaces[hit.faceIndex];
      if (face) return { t: 'f', f: face };
    }
    return null;
  }

  // Le doigt est sur la sélection (début d'un glissé qui la transforme) : sur un sommet concerné, ou sur une arête
  // ou une face choisie
  _surSelection(d) {
    if (this._sommetSous(d.x, d.y, this.sel.sommetsImpliques()) >= 0) return true;
    const el = this._elementSous(d);
    return !!el && el.t !== 's' && this.sel.contient(el);
  }

  // Centre de la sélection : moyenne des sommets sélectionnés, ou des origines des objets choisis
  _centre() {
    const c = [0, 0, 0], pts = this._points();
    for (const p of pts) for (let k = 0; k < 3; k++) c[k] += p[k] / pts.length;
    return c;
  }

  // ----- Scène et modes ------------------------------------------------------------------------------
  _geo() { return this.state.edition === 'geometrie'; }

  _actif() { return this.objets[this.state.actif] || null; }

  // Sélection du mode courant : indices des sommets concernés (ceux des arêtes et faces choisies compris), ou des objets
  _indices() { return this._geo() ? this.sel.sommetsImpliques() : this.choix; }

  // Points que transforme la poignée : sommets concernés, ou origines des objets choisis (références)
  _points() { return this._geo() ? this._indices().map(i => this.maillage.sommets[i]) : this.choix.map(k => this.objets[k].position); }

  // Objet d'exécution : maillage dans son repère, position, rotation (quaternion [x, y, z, w]), échelle (facteurs
  // positifs selon ses propres axes, appliqués avant la rotation : matrice T·R·S, voir _matrice), et `sel` : sa propre
  // sélection { s, a, f } (indices de son maillage, voir SelectionMaillage.versDonnees), retrouvée à chaque retour en
  // mode Géométrie, gardée par l'historique et la sauvegarde. `vue` (groupe three.js) et `_donnees` (versDonnees en cache, partagé avec l'historique) sont
  // ajoutés au besoin.
  _objet(maillage, nom, position = [0, 0, 0], rotation = [0, 0, 0, 1], sel = [], set = null, visible = true, modifs = [], materiau = ED_DEFAUT, echelle) {
    return { nom, maillage, position: position.slice(), rotation: rotation.slice(), echelle: ed_echelle(echelle), sel: SelectionMaillage.donnees(sel), set, visible: visible !== false, modifs: ed_copie(modifs || []), materiau: materiau || ED_DEFAUT };
  }

  // Mode Géométrie des objets `this.edites` (l'actif en dernier) : leurs maillages réunis en une copie de travail au
  // monde, `this.proprio` donnant l'objet de chaque sommet ; sélection : celles des objets, à la suite (éléments
  // encore valides, sans doublon). Maillage.reunir garde l'ordre : sommets et faces de chaque objet à la suite.
  _ouvrirEdition() {
    const st = this.state;
    let l = (this.edites || []).filter((k, n, t) => this.objets[k] && t.indexOf(k) === n && k !== st.actif);
    this.edites = l.concat(st.actif);
    this.proprio = [];
    const mondes = this.edites.map(k => {
      const o = this.objets[k];
      for (let i = 0; i < o.maillage.sommets.length; i++) this.proprio.push(k);
      return this._versMonde(o);
    });
    this.maillage = Maillage.reunir(mondes);
    this.sel = new SelectionMaillage();
    const decalage = { s: 0, f: 0 };
    this.edites.forEach((k, n) => {
      const sel = SelectionMaillage.donnees(this.objets[k].sel), nb = mondes[n].sommets.length;
      // Indices hors de cet objet écartés avant décalage (ils tomberaient dans l'objet suivant)
      sel.s = sel.s.filter(i => i < nb);
      sel.a = sel.a.filter(a => a[0] < nb && a[1] < nb);
      sel.f = sel.f.filter(i => i < mondes[n].faces.length);
      this.sel.ajouterDonnees(sel, this.maillage, decalage);
      decalage.s += nb;
      decalage.f += mondes[n].faces.length;
    });
    // Types dont le filtre est éteint : leurs éléments restent de côté
    const f = this._filtres();
    for (const cle in ED_TYPES) if (!f[cle]) this.sel.masquer(ED_TYPES[cle]);
    st.edites = this.edites.slice();
  }

  // Sélection de la copie de travail répartie entre les objets édités : Map objet → { s, a, f } en indices locaux.
  // `localS` : indice local de chaque sommet ; une face (ou une arête) appartient à l'objet de son premier sommet.
  _selectionParObjet(localS) {
    const r = new Map(this.edites.map(k => [k, { s: [], a: [], f: [] }])), d = this.sel.versDonnees(this.maillage);
    const localF = [], compte = new Map();
    for (const f of this.maillage.faces) { const k = this.proprio[f.s[0]], n = compte.get(k) || 0; localF.push(n); compte.set(k, n + 1); }
    for (const i of d.s) r.get(this.proprio[i]).s.push(localS[i]);
    for (const [i, j] of d.a) if (this.proprio[i] === this.proprio[j]) r.get(this.proprio[i]).a.push([localS[i], localS[j]]);
    for (const n of d.f) r.get(this.proprio[this.maillage.faces[n].s[0]]).f.push(localF[n]);
    return r;
  }

  _matrice(o) {
    return new THREE.Matrix4().compose(new THREE.Vector3().fromArray(o.position), new THREE.Quaternion().fromArray(o.rotation), new THREE.Vector3().fromArray(o.echelle));
  }

  // Copie du maillage de `o` en coordonnées du monde, et inverse (`mm` du monde → repère de `o`)
  _versMonde(o, base = o.maillage) {
    const mm = base.clone(), mx = this._matrice(o), v = new THREE.Vector3();
    mm.sommets = mm.sommets.map(p => v.fromArray(p).applyMatrix4(mx).toArray());
    return mm;
  }

  _versLocal(o, monde) {
    const mm = monde.clone(), mx = this._matrice(o).invert(), v = new THREE.Vector3();
    mm.sommets = mm.sommets.map(p => v.fromArray(p).applyMatrix4(mx).toArray());
    return mm;
  }

  // Mode Géométrie : range la copie de travail dans les objets édités (sommets, faces et sélection de chacun,
  // dans son repère). Une face appartient à l'objet de ses sommets (jamais à cheval sur deux objets).
  _rangerEdition() {
    if (!this._geo() || !this.maillage) return;
    const mm = this.maillage, local = new Map(), parts = new Map();
    this.sel.nettoyer(mm);                // faces et arêtes disparues oubliées avant la répartition
    for (const k of this.edites) parts.set(k, new Maillage());
    mm.sommets.forEach((p, i) => {
      const m = parts.get(this.proprio[i]);
      local.set(i, m.sommets.length);
      m.sommets.push(p.slice());
    });
    for (const f of mm.faces) parts.get(this.proprio[f.s[0]]).faces.push({ s: f.s.map(i => local.get(i)), m: f.m });
    for (const a of mm.fils) parts.get(this.proprio[a[0]]).fils.push(a.map(i => local.get(i)));
    const sels = this._selectionParObjet(mm.sommets.map((_, i) => local.get(i)));
    for (const k of this.edites) {
      const o = this.objets[k];
      o.sel = sels.get(k);
      o.maillage = this._versLocal(o, parts.get(k));
      o._donnees = null;
      o._geoSale = true;
    }
  }

  // Objets édités en mode Géométrie (vide en mode Scène)
  _edites() { return this._geo() ? this.edites : []; }

  // Boîte englobante, dans le monde, des objets `indices` (tous par défaut) ; null si vide
  _boiteMonde(indices) {
    const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity], v = new THREE.Vector3();
    let vide = true;
    const edites = this._edites();
    for (const k of indices || this.objets.map((_, k) => k)) {
      const o = this.objets[k], edite = edites.includes(k), mx = this._matrice(o);
      // Objet édité : ses sommets dans la copie de travail (au monde)
      const pts = edite ? this.maillage.sommets.filter((_, i) => this.proprio[i] === k) : this._evalue(o).sommets;
      for (const p of pts) {
        v.fromArray(p);
        if (!edite) v.applyMatrix4(mx);
        for (let c = 0; c < 3; c++) { min[c] = Math.min(min[c], v.getComponent(c)); max[c] = Math.max(max[c], v.getComponent(c)); }
        vide = false;
      }
    }
    return vide ? null : { min, max };
  }

  // Passe en mode Scène, ou Géométrie : des objets choisis s'il y en a (l'actif compris), sinon de l'actif seul
  _changerEdition(e) {
    if (e === this.state.edition) return;
    if (this.panneau && this.panneau.ouvert === 'ajout') this.panneau.fermer();   // ajout de primitive abandonné
    if (e === 'geometrie') {
      const o = this._actif();
      if (!o) { this._message('Aucun objet actif : touchez un objet'); return; }
      this.edites = this.choix.filter(k => this._affiche(this.objets[k]));
      this._ouvrirEdition();
    } else {
      const edites = this.edites || [];
      this._rangerEdition();
      this.maillage = null;
      this.sel = new SelectionMaillage();
      this.choix = edites.filter(k => this.objets[k]);
    }
    this._cacherAjuster();
    this._glisse = null;
    this.state.edition = e;
    this._sauver();
    this._rafraichir();
  }

  // Objet sous le doigt (pixels relatifs à la vue) : indice, ou -1 (faces seulement, objets visibles)
  _objetSous(x, y) {
    const m = this.m;
    m.raycaster.setFromCamera(new THREE.Vector2(x / m.largeur * 2 - 1, 1 - y / m.hauteur * 2), m.camera);
    this.groupeObjets.updateMatrixWorld();
    for (const t of m.raycaster.intersectObjects(this.groupeObjets.children, true)) {
      const g = t.object.parent;
      if (t.object.isMesh && g.visible && g.userData.selectionnable) return g.userData.objet;
    }
    return -1;
  }

  // Appui en mode Scène : choisir un objet ; déjà choisi, il devient actif, puis un nouvel appui le retire
  _toucherObjet(d) { this._choisirObjet(this._objetSous(d.x, d.y)); }

  _choisirObjet(k) {
    if (k < 0) return;
    const i = this.choix.indexOf(k);
    if (i >= 0 && this.state.actif === k) this.choix.splice(i, 1);
    else {
      if (i >= 0) this.choix.splice(i, 1);
      this.choix.push(k);
      this.state.actif = k;
      this.save();
    }
    this._rafraichir();
  }

  // Nom libre dans la scène : « cube », « cube 2 »…
  _nomLibre(base) {
    const pris = new Set(this.objets.map(o => o.nom));
    if (!pris.has(base)) return base;
    let n = 2;
    while (pris.has(base + ' ' + n)) n++;
    return base + ' ' + n;
  }

  // Ajoute un objet sur le curseur 3D (repasse en mode Scène), choisi et actif
  _ajouterObjet(maillage, nom, materiau) {
    this._changerEdition('scene');
    this._memoriser();
    // Dans le set de l'objet actif, sinon le set par défaut
    const a = this._actif();
    this.objets.push(this._objet(maillage, this._nomLibre(nom), this.state.curseur, undefined, undefined, (a || this).set || this.sets[0].nom, true, [], materiau));
    this._verifierMateriaux();
    this.state.actif = this.objets.length - 1;
    this.choix = [this.state.actif];
    this._sauver();
    this._rafraichir(true);
    if (this._trop) this._message('Scène trop grosse pour être gardée après fermeture : pensez à l’exporter');
  }

  // Ajout d'une primitive (ED_PRIMITIVES) par le panneau latéral : réglages, aperçu sur le curseur 3D mis à jour à
  // chaque changement, Ajouter le pose ; fermer le panneau, l'ouvrir sur autre chose ou changer de mode l'abandonne
  _ajoutPrimitive(type) {
    if (this._geo()) { this._message('Ajout de primitives : mode Scène'); return; }
    const def = ED_PRIMITIVES[type];
    this._ajout = { type, def, cadre: !def.recadrer };
    this.panneau.definir('ajout', {
      onglets: [['reglages', def.titre, c => this._formulairePrimitive(c)]],
      quitter: () => { if (this.panneau.ouvert !== 'ajout') this._finAjout(); }
    });
    if (this.panneau.ouvert === 'ajout') this.panneau.rafraichir(); else this.panneau.ouvrir('ajout');
  }

  _finAjout() {
    const a = this._ajout;
    this._ajout = null;
    this._apercu(null);
    if (a && a.base && !a.valide) this._annulerOperation(a);
  }

  // Opération de géométrie (ED_OPERATIONS) réglée dans le panneau d'ajout, aperçu dans le maillage : l'état d'avant
  // est mémorisé (étape d'annulation) et sert de base à chaque essai
  _ouvrirOperation(type) {
    if (!this._geo()) return;
    const def = ED_OPERATIONS[type], refus = def.refus && def.refus(this);
    if (refus) { this._message(refus); return; }
    const avant = this._ajout;
    if (avant && avant.base) { this._ajout = null; this._annulerOperation(avant); }   // autre opération en cours
    this._memoriser();
    this._ajout = { type, def, base: this.annuler[this.annuler.length - 1], vue: this.m.camera.getWorldDirection(new THREE.Vector3()).toArray() };
    this.panneau.definir('ajout', {
      onglets: [['reglages', def.titre, c => this._formulairePrimitive(c)]],
      quitter: () => { if (this.panneau.ouvert !== 'ajout') this._finAjout(); }
    });
    if (this.panneau.ouvert === 'ajout') this.panneau.rafraichir(); else this.panneau.ouvrir('ajout');
  }

  // Opération abandonnée : état d'avant remis, son étape d'annulation retirée
  _annulerOperation(a) {
    this._restaurer(a.base);
    if (this.annuler[this.annuler.length - 1] === a.base) this.annuler.pop();
    this._sauver();
    this._rafraichir(true);
  }

  // Formulaire du panneau d'ajout (champs de ED_PRIMITIVES) ; Ajouter reste grisé tant qu'un champ affiché est
  // invalide ; valeurs retenues pour la fois suivante
  _formulairePrimitive(corps) {
    const ajout = this._ajout;
    if (!ajout) return;
    const { type, def } = ajout;
    const garde = (this.state.primitives || {})[type] || {};
    const form = document.createElement('div');
    form.className = 'ed-prim';
    form.dataset.paveGroupe = '';   // Suivant du pavé numérique : les champs du formulaire
    corps.appendChild(form);
    const lire = (c, i) => {
      const v = parseFloat(String(i.value).replace(',', '.'));
      if (!isFinite(v)) return null;
      if (c.entier) return Number.isInteger(v) && v >= c.min && v <= c.max && (!c.multiple || v % c.multiple === 0) ? v : null;
      return (v > 0 || (c.zero && v === 0)) && (c.max === undefined || v <= c.max) ? v : null;
    };
    // Lignes : { c, l (cadre, marqué « faux »), t (intitulé), i (champ), valeur() → valeur ou null }
    const lignes = def.champs.map(c => {
      let t = null;
      if (c.rubrique) {
        t = document.createElement('span');
        t.className = 'ed-rubrique';
        t.textContent = c.rubrique;
        form.appendChild(t);
      }
      const v = garde[c.cle];
      if (c.interrupteur) {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'ed-prim-detail';
        let ouvert = typeof v === 'boolean' ? v : !!c.defaut;
        const montrer = () => {
          b.textContent = (ouvert ? '▾ ' : '▸ ') + c.interrupteur;
          b.setAttribute('aria-expanded', String(ouvert));
        };
        b.addEventListener('click', () => { ouvert = !ouvert; montrer(); changer(c.cle); });
        montrer();
        form.appendChild(b);
        return { c, l: b, t, valeur: () => ouvert };
      }
      if (c.choix) {
        const l = document.createElement('div');
        l.className = 'ed-prim-choix' + (c.choix.length > 4 ? ' ed-prim-grille' : '');
        let choisi = c.choix.some(([x]) => x === v) ? v : c.defaut;
        const boutons = c.choix.map(([x, texte]) => {
          const b = document.createElement('button');
          b.type = 'button';
          b.textContent = texte;
          b.addEventListener('click', () => {
            choisi = x;
            for (const [y, autre] of boutons) autre.classList.toggle('on', y === choisi);
            changer(c.cle);
          });
          l.appendChild(b);
          return [x, b];
        });
        for (const [y, b] of boutons) b.classList.toggle('on', y === choisi);
        form.appendChild(l);
        return { c, l, t, valeur: () => choisi };
      }
      const l = document.createElement('label');
      l.className = 'ed-prim-champ';
      const n = document.createElement('span');
      n.className = c.classe || '';
      n.textContent = c.libelle;
      const i = document.createElement('input');
      i.type = 'text';
      i.inputMode = c.entier ? 'numeric' : 'decimal';
      i.value = String(typeof v === 'number' && isFinite(v) ? v : c.defaut);
      l.append(n, i);
      form.appendChild(l);
      return { c, l, t, i, valeur: () => lire(c, i) };
    });
    const info = document.createElement('p');
    info.className = 'ed-prim-info';
    info.hidden = !def.verifier && !def.essayer;
    const actions = document.createElement('div');
    actions.className = 'ed-prim-actions';
    const non = document.createElement('button');
    non.type = 'button';
    non.className = 'ed-non';
    non.textContent = 'Annuler';
    non.addEventListener('click', () => this.panneau.fermer());
    const ok = document.createElement('button');
    ok.type = 'button';
    ok.className = 'ed-prim-ok';
    ok.textContent = def.bouton || 'Ajouter';
    actions.append(non, ok);
    form.append(info, actions);
    // Valeurs brutes (null : invalide)
    const brutes = () => {
      const v = {};
      for (const { c, valeur } of lignes) v[c.cle] = valeur();
      return v;
    };
    // Champs affichés selon les valeurs, validité, ligne d'information ; valeurs utilisables ou null
    const valeurs = () => {
      const v = brutes();
      let invalide = false;
      for (const { c, l, t } of lignes) {
        const vu = !c.si || c.si(v);
        l.hidden = !vu;
        if (t) t.hidden = !vu;
        const faux = vu && v[c.cle] === null;
        l.classList.toggle('faux', faux);
        if (faux) invalide = true;
        else if (v[c.cle] === null) v[c.cle] = c.defaut;   // caché : sans effet
      }
      ok.disabled = invalide;
      if (def.verifier) {
        const r = invalide ? { texte: '', erreur: true } : def.verifier(v);
        info.textContent = r.texte;
        info.classList.toggle('faux', !invalide && r.erreur);
        ok.disabled = r.erreur;
      }
      return ok.disabled ? null : v;
    };
    // Aperçu d'après les valeurs (rien si invalides) ; Manifold chargé d'abord s'il le faut
    const apercu = () => {
      clearTimeout(this._calculAjout);
      if (this._ajout !== ajout) return;
      const v = valeurs();
      // Opération de géométrie : rejouée sur l'état d'avant, dans le maillage même
      if (def.essayer) {
        ajout.cle = v && JSON.stringify(v);
        this._restaurer(ajout.base);
        let texte = null;
        if (v) try { texte = def.essayer(this, v); } catch (e) { this._restaurer(ajout.base); info.textContent = e.message; info.classList.add('faux'); ok.disabled = true; }
        if (texte === null) { this._sauver(); this._rafraichir(); } else { info.textContent = texte; info.classList.remove('faux'); }
        return;
      }
      let mm = null;
      if (v && def.booleens && def.booleens(v) && !Booleens.pret) {
        info.hidden = false;
        info.textContent = 'Chargement de Manifold…';
        ok.disabled = true;
        Booleens.charger().then(apercu, e => { info.textContent = 'Booléens indisponibles : ' + e.message; info.classList.add('faux'); });
        this._apercu(null);
        return;
      }
      const construire = () => {
        if (this._ajout !== ajout) return;
        if (v) try { mm = def.creer(v); } catch (e) { info.hidden = false; info.textContent = e.message; info.classList.add('faux'); ok.disabled = true; }
        if (calcul && mm) { info.textContent = texte; ok.disabled = false; }
        ajout.dernier = mm && { cle: JSON.stringify(v), mm };   // repris par Ajouter, sans nouveau calcul
        this._apercu(mm);
      };
      // Calcul long (booléen) : « Calcul… » affiché d'abord, le temps d'un rendu
      const calcul = v && def.booleens && def.booleens(v), texte = info.textContent;
      if (!calcul) return construire();
      info.textContent = texte + ' · calcul…';
      ok.disabled = true;
      this._calculAjout = setTimeout(construire, 30);
    };
    // Choix ou interrupteur changé : champs repris (remplir), puis aperçu
    const changer = cle => {
      const r = def.remplir && def.remplir(brutes(), cle);
      if (r) for (const { c, i } of lignes) if (i && typeof r[c.cle] === 'number' && isFinite(r[c.cle])) i.value = String(Math.round(r[c.cle] * 1e4) / 1e4);
      apercu();
    };
    let attente = null;
    for (const { i } of lignes) {
      if (!i) continue;
      // Frappe au clavier : aperçu après une courte pause ; validation (pavé : OK, Suivant) : aussitôt
      i.addEventListener('input', () => { valeurs(); clearTimeout(attente); attente = setTimeout(apercu, 250); });
      i.addEventListener('change', () => { clearTimeout(attente); apercu(); });
    }
    ok.addEventListener('click', () => {
      const v = valeurs();
      if (!v) return;
      if (def.essayer) {
        if (ajout.cle !== JSON.stringify(v)) apercu();   // frappe pas encore appliquée
        if (ok.disabled) return;
        ajout.valide = true;
        this.state.primitives = Object.assign({}, this.state.primitives, { [type]: v });
        this.save();
        this.panneau.fermer();
        return;
      }
      let maillage;
      const d = ajout.dernier;
      try { maillage = d && d.cle === JSON.stringify(v) ? d.mm : def.creer(v); } catch (e) { this._message('Ajout impossible : ' + e.message); return; }
      this.state.primitives = Object.assign({}, this.state.primitives, { [type]: v });
      this.panneau.fermer();
      this._ajouterObjet(maillage, typeof def.nom === 'function' ? def.nom(v) : def.nom);
    });
    ajout.relancer = apercu;            // curseur 3D déplacé : centre de la révolution
    apercu();
  }

  // Aperçu de la primitive en cours d'ajout, sur le curseur 3D, comme un objet choisi (faces et silhouette) ; jamais
  // touché ni enregistré ; `mm` null : caché. Le premier aperçu d'une pièce `recadrer` cadre la vue sur lui
  _apercu(mm) {
    if (!this.m || !this.mat) return;
    let g = this._apercuVue;
    if (!g && !mm) return;
    if (!g) {
      const faces = new THREE.Mesh(new THREE.BufferGeometry(), this.mat.objetChoisi);
      const silhouette = new THREE.Mesh(new THREE.BufferGeometry(), this.mat.silhouette);
      silhouette.frustumCulled = false;
      silhouette.renderOrder = 1;
      for (const o of [faces, silhouette]) { o.raycast = () => {}; o.userData.selectionnable = false; }
      g = this._apercuVue = new THREE.Group();
      g.add(faces, silhouette);
      this.m.scene.add(g);
    }
    const [faces, silhouette] = g.children;
    g.visible = !!mm;
    if (mm) {
      faces.geometry.dispose();
      faces.geometry = mm.geometrie(() => 0);
      silhouette.geometry.dispose();
      silhouette.geometry = ed_silhouette(mm);
      const c = this.state.curseur;
      g.position.fromArray(c);
      if (this._ajout && !this._ajout.cadre) {
        this._ajout.cadre = true;
        const b = mm.boite();
        this._recadrer({ min: b.min.map((x, k) => x + c[k]), max: b.max.map((x, k) => x + c[k]) });
      }
    }
    this.m.redessiner();
  }

  _nouvelleScene() {
    this._changerEdition('scene');
    this._memoriser();
    for (const o of this.objets) o.vue = null;   // libérés par _rafraichirObjets
    this.objets = [this._objet(Maillage.cube(1), 'cube')];
    this.materiaux = {};
    this._verifierMateriaux();
    this.sets = [];
    this.state.projet = '';
    if (this.champProjet) this.champProjet.value = '';
    this._verifierSets();
    this.state.actif = 0;
    this.choix = [];
    this._sauver();
    this._rafraichir(true);
    this._recadrer();
  }

  // Copie sur place des objets choisis, qui deviennent la sélection
  _dupliquer() {
    if (!this.choix.length) { this._message('Aucun objet sélectionné'); return; }
    this._memoriser();
    this.choix = this.choix.map(k => {
      const o = this.objets[k];
      this.objets.push(this._objet(o.maillage.clone(), this._nomLibre(o.nom), o.position, o.rotation, o.sel, o.set, o.visible, o.modifs, o.materiau, o.echelle));
      return this.objets.length - 1;
    });
    this.state.actif = this.choix[this.choix.length - 1];
    this._sauver();
    this._rafraichir();
    this._message('Dupliqué : glissez pour écarter la copie');
  }

  _supprimerObjets() {
    if (!this.choix.length) { this._message('Aucun objet sélectionné'); return; }
    this._memoriser();
    const retires = new Set(this.choix), actif = this._actif();
    this.objets = this.objets.filter((_, k) => !retires.has(k));
    this.state.actif = this.objets.indexOf(actif);   // -1 si l'actif a été supprimé
    this.choix = [];
    this._sauver();
    this._rafraichir(true);
  }

  // État de départ d'une transformation : positions des sommets, ou positions, rotations, échelles et maillages des objets
  _depart(indices) {
    return this._geo() ? indices.map(i => this.maillage.sommets[i].slice())
      : indices.map(k => { const o = this.objets[k]; return { p: o.position.slice(), q: o.rotation.slice(), e: o.echelle.slice(), m: o.maillage }; });
  }

  // Applique à partir de `depart` une translation `d` (Vector3), une rotation `q` (Quaternion) autour de `c`
  // (les objets tournent aussi sur eux-mêmes), ou une mise à l'échelle `s` (facteurs selon X, Y, Z du monde) depuis `c`
  // (en mode Scène : à l'échelle de chaque objet tourné de quarts de tour, chaque facteur allant à son axe parallèle ;
  // un objet tourné de biais ne saurait être étiré selon un axe du monde par sa propre échelle : le facteur est alors
  // appliqué à son maillage, exprimé dans son repère)
  _poser(indices, depart, d, q, c, s) {
    const v = new THREE.Vector3(), geo = this._geo();
    depart.forEach((e, n) => {
      v.fromArray(geo ? e : e.p);
      if (s) v.sub(c).multiply(s).add(c);
      else if (q) v.sub(c).applyQuaternion(q).add(c); else v.add(d);
      if (geo) { this.maillage.sommets[indices[n]] = v.toArray(); return; }
      const o = this.objets[indices[n]];
      o.position = v.toArray();
      if (q) o.rotation = q.clone().multiply(new THREE.Quaternion().fromArray(e.q)).normalize().toArray();
      if (s) {
        const r = new THREE.Quaternion().fromArray(e.q), axes = ed_axesAlignes(r);
        if (axes) {
          o.echelle = e.e.map((f, n) => f * s.getComponent(axes[n]));
          return;
        }
        const ri = r.clone().invert(), w = new THREE.Vector3(), se = new THREE.Vector3().fromArray(e.e);
        o.maillage = e.m.clone();
        o.maillage.sommets = e.m.sommets.map(p => w.fromArray(p).multiply(se).applyQuaternion(r).multiply(s).applyQuaternion(ri).divide(se).toArray());
        o._donnees = null;
        o._geoSale = true;
      }
    });
  }

  _toucher(d) {
    const h = this._poigneeSous(d.x, d.y);
    if (h && h !== 'o') return;          // l'extrémité d'un axe ne sert qu'à glisser
    if (!this._geo()) { this._toucherObjet(d); return; }
    const el = this._elementSous(d);
    if (!el) return;
    if (this._modeSelection() === 'chemin' && this._cheminVers(el)) return;
    this.sel.basculer(el);
    this._garderSelection();
    this._rafraichir();
  }

  // Mode Chemin : plus court chemin de l'élément actif à `el` (même type, autre élément) ajouté à la sélection, `el`
  // devenant l'actif (tronçons enchaînés). Faux si `el` doit simplement être basculé (pas d'actif, autre type, ou
  // l'actif lui-même)
  _cheminVers(el) {
    const a = this.sel.dernier;
    if (!a || a.t !== el.t || !this.sel.contient(a)) return false;
    const meme = el.t === 's' ? a.i === el.i : el.t === 'f' ? a.f === el.f
      : SelectionMaillage.arete(...a.a).join(' ') === SelectionMaillage.arete(...el.a).join(' ');
    if (meme) return false;
    const l = this.maillage.chemin(el.t, el.t === 's' ? a.i : el.t === 'f' ? a.f : a.a, el.t === 's' ? el.i : el.t === 'f' ? el.f : el.a);
    if (!l) { this._message('Aucun chemin : ces éléments ne sont pas reliés'); return true; }
    const n = l.length;
    for (const x of l) this.sel.ajouter(el.t === 's' ? { t: 's', i: x } : el.t === 'f' ? { t: 'f', f: x } : { t: 'a', a: x });
    this.sel.ajouter(el);                 // l'élément touché devient l'actif
    this.sel.dernier = el;
    this._garderSelection();
    this._rafraichir();
    const nom = { s: ['sommet', 'sommets'], a: ['arête', 'arêtes'], f: ['face', 'faces'] }[el.t];
    this._message(`Chemin : ${n} ${nom[n > 1 ? 1 : 0]}`);
    return true;
  }

  // Éléments liés à l'élément actif (sel.dernier), de proche en proche par les faces et les arêtes libres : leurs sommets, arêtes et faces
  // ajoutés à la sélection ; ceux d'un type dont le filtre est éteint vont, sans se montrer, parmi les éléments mis
  // de côté (rendus au rallumage du filtre). Les filtres ne changent pas ; l'élément actif reste le même.
  _selectionnerLies() {
    const actif = this.sel.dernier;
    if (!actif) { this._message('Aucun élément actif : touchez un sommet, une arête ou une face'); return; }
    const { sommets, faces } = this.maillage.connexe(SelectionMaillage.sommetsDe(actif)), f = this._filtres();
    const dans = new Set(sommets), fils = this.maillage.fils.filter(([i, j]) => dans.has(i) && dans.has(j));
    const aretes = Maillage.prototype.aretes.call({ faces, fils });
    const cible = t => {
      if (f[Object.keys(ED_TYPES).find(cle => ED_TYPES[cle] === t)]) return this.sel;
      return this.sel.cache || (this.sel.cache = new SelectionMaillage());
    };
    for (const i of sommets) cible('s').ajouter({ t: 's', i });
    for (const a of aretes) cible('a').ajouter({ t: 'a', a });
    for (const x of faces) cible('f').ajouter({ t: 'f', f: x });
    this.sel.dernier = actif;
    this._garderSelection();
    this._rafraichir();
    const pl = n => n > 1 ? 's' : '', caches = ['s', 'a', 'f'].filter(t => cible(t) !== this.sel).length;
    this._message(`Liés : ${sommets.length} sommet${pl(sommets.length)}, ${aretes.length} arête${pl(aretes.length)}, ${faces.length} face${pl(faces.length)}`
      + (caches ? ' (filtres éteints : mis de côté)' : ''));
  }

  // Sélection modifiée sans toucher au maillage : notée dans les objets édités et dans la sauvegarde,
  // sans recopier les sommets
  _garderSelection() {
    if (!this._geo()) return;
    // Indice local de chaque sommet dans son objet
    const local = [], compte = new Map();
    for (const k of this.proprio) { const n = compte.get(k) || 0; local.push(n); compte.set(k, n + 1); }
    const sels = this._selectionParObjet(local);
    for (const k of this.edites) {
      const o = this.objets[k], so = this.state.objets && this.state.objets[k];
      o.sel = sels.get(k);
      if (so) so.sel = o.sel;
    }
    this.save();
  }

  // ----- Modifications ------------------------------------------------------------------------------
  // À appeler avant chaque modification : mémorise l'état pour « Annuler »
  _memoriser() {
    if (this._ajout && this._ajout.base) { this._ajout.valide = true; this.panneau.fermer(); }   // aperçu gardé
    this._cacherAjuster();               // une nouvelle modification clôt la précédente
    this.annuler.push(this._instantane());
    if (this.annuler.length > ED_HISTOIRE) this.annuler.shift();
    this.retablir.length = 0;
  }

  // Étape d'historique : toute la scène et le mode. Les données d'un maillage inchangé sont partagées entre
  // les étapes (cache `_donnees`, jamais modifié) : déplacer des objets ne recopie pas leurs sommets.
  _instantane() {
    this._rangerEdition();
    return {
      objets: this.objets.map(o => ({ nom: o.nom, position: o.position.slice(), rotation: o.rotation.slice(), echelle: o.echelle.slice(), sel: SelectionMaillage.donnees(o.sel), set: o.set, visible: o.visible, modifs: ed_copie(o.modifs), materiau: o.materiau, d: this._donnees(o) })),
      sets: this.sets.map(e => Object.assign({}, e)),
      materiaux: ed_copie(this.materiaux),
      actif: this.state.actif, edition: this.state.edition, choix: this.choix.slice(), edites: this._edites().slice()
    };
  }

  _donnees(o) { return o._donnees || (o._donnees = o.maillage.versDonnees()); }

  _defaire(depuis, vers) {
    if (this._ajout && this._ajout.base) { this.panneau.fermer(); return; }   // opération en cours abandonnée
    if (!depuis.length) return;
    this._cacherAjuster();
    vers.push(this._instantane());
    this._restaurer(depuis.pop());
    this._sauver();
    this._rafraichir(true);
  }

  // Remet la scène dans l'état d'une étape d'historique `e` (sans toucher à l'historique)
  _restaurer(e) {
    for (const o of this.objets) o.vue = null;   // groupes libérés par _rafraichirObjets
    this.objets = e.objets.map(o => Object.assign(this._objet(Maillage.depuisDonnees(o.d), o.nom, o.position, o.rotation, o.sel, o.set, o.visible, o.modifs, o.materiau, o.echelle), { _donnees: o.d }));
    this.sets = e.sets.map(s => Object.assign({}, s));
    this._verifierSets();
    if (e.materiaux) this.materiaux = ed_copie(e.materiaux);
    this._verifierMateriaux();
    Object.assign(this.state, { actif: e.actif, edition: e.edition });
    this.choix = e.choix.slice();
    this.sel = new SelectionMaillage();
    this.maillage = null;
    this.edites = (e.edites || []).slice();
    if (this._geo()) this._ouvrirEdition();
    this._glisse = null;
  }

  // Sauvegarde locale de la scène (sauf si elle est trop grosse pour le stockage du navigateur)
  _sauver() {
    this._rangerEdition();
    const objets = this.objets.map(o => ({ nom: o.nom, maillage: this._donnees(o), position: o.position, rotation: o.rotation, echelle: o.echelle, sel: o.sel, set: o.set, visible: o.visible, modifs: o.modifs, materiau: o.materiau }));
    this.state.sets = this.sets;
    this.state.materiaux = this.materiaux;
    this._trop = objets.reduce((n, o) => n + o.maillage.v.length, 0) > 40000;
    this.state.objets = this._trop ? null : objets;
    this.save();
  }

  _ajouterSommet() {
    this._memoriser();
    const mm = this.maillage, impliques = this.sel.sommetsImpliques();
    // Il appartient à l'objet du dernier sommet concerné par la sélection, sinon à l'objet actif
    this.proprio.push(impliques.length ? this.proprio[impliques[impliques.length - 1]] : this.state.actif);
    mm.sommets.push(this.state.curseur.slice());
    this.sel.vider();
    this.sel.ajouter({ t: 's', i: mm.sommets.length - 1 });
    this._rendreSelectionnable('s');
    this._sauver();
    this._rafraichir();
    this._message('Sommet ajouté : glissez-le pour le placer');
  }

  // Face reliant les sommets sélectionnés, dans l'ordre ; elle remplace la sélection
  _creerFace() {
    const s = this.sel.sommets;
    if (s.length < 3) { this._message('Sélectionnez au moins 3 sommets'); return; }
    const mm = this.maillage, cle = l => l.slice().sort((a, b) => a - b).join(' ');
    const k = cle(s);
    if (mm.faces.some(f => cle(f.s) === k)) { this._message('Cette face existe déjà'); return; }
    if (this._aCheval(s)) { this._message('Ces sommets appartiennent à des objets différents'); return; }
    // Matériau d'une face voisine, s'il y en a une
    const choisi = new Set(s), voisine = mm.faces.find(f => f.s.some(i => choisi.has(i)));
    this._memoriser();
    const face = { s: s.slice(), m: voisine ? voisine.m : 'defaut' };
    mm.faces.push(face);
    mm.nettoyerFils();                    // arêtes libres devenues bords de la face
    this.sel.vider('s');
    this.sel.ajouter({ t: 'f', f: face });
    this._rendreSelectionnable('f');
    this._sauver();
    this._rafraichir();
  }

  // Arête entre les deux sommets sélectionnés : coupe en deux chaque face qui les contient sans qu'ils y soient
  // voisins (sens et matériau gardés), sinon arête libre ; la nouvelle arête est sélectionnée
  _creerArete() {
    const s = this.sel.sommets;
    if (s.length !== 2) { this._message('Sélectionnez exactement 2 sommets'); return; }
    const [a, b] = s, mm = this.maillage;
    if (mm.aretes().some(([i, j]) => (i === a && j === b) || (i === b && j === a))) { this._message('Cette arête existe déjà'); return; }
    if (this._aCheval(s)) { this._message('Ces sommets appartiennent à des objets différents'); return; }
    this._memoriser();
    const coupees = [];
    mm.faces = mm.faces.flatMap(f => {
      const ia = f.s.indexOf(a), ib = f.s.indexOf(b);
      if (ia < 0 || ib < 0) return [f];
      // De a à b, puis de b à a, dans le sens de la face (a et b non voisins : chaque part a au moins 3 sommets)
      const tour = d => { const r = []; for (let k = d; ; k = (k + 1) % f.s.length) { r.push(f.s[k]); if (k === (d === ia ? ib : ia)) return r; } };
      const g = { s: tour(ib), m: f.m };
      f.s = tour(ia);
      coupees.push(f, g);
      return [f, g];
    });
    if (!coupees.length) mm.fils.push([a, b]);
    this.sel.vider('s');
    this.sel.ajouter({ t: 'a', a: [a, b] });
    this._rendreSelectionnable('a');
    this.sel.nettoyer(mm);
    this._sauver();
    this._rafraichir();
    const nf = coupees.length / 2;
    this._message(nf ? `Face${nf > 1 ? 's' : ''} coupée${nf > 1 ? 's' : ''} en deux` : 'Arête libre créée (sans face)');
  }

  // Arêtes sélectionnées supprimées, avec les faces qu'elles bordent ; les sommets restent
  _supprimerAretes() {
    const l = this.sel.aretes;
    if (!l.length) return;
    this._memoriser();
    const mm = this.maillage, cle = (i, j) => i < j ? i + ' ' + j : j + ' ' + i, retirees = new Set(l.map(([i, j]) => cle(i, j)));
    mm.faces = mm.faces.filter(f => !f.s.some((i, k) => retirees.has(cle(i, f.s[(k + 1) % f.s.length]))));
    mm.fils = mm.fils.filter(([i, j]) => !retirees.has(cle(i, j)));
    this.sel.vider('a');
    this.sel.nettoyer(mm);
    this._sauver();
    this._rafraichir();
  }

  // Sommets `l` pris dans plusieurs objets (une face ou une fusion ne peut pas les relier)
  _aCheval(l) { return new Set(l.map(i => this.proprio[i])).size > 1; }

  _inverser() {
    const fs = this.sel.faces;
    if (!fs.length) { this._message('Aucune face sélectionnée'); return; }
    this._memoriser();
    for (const f of fs) f.s.reverse();
    this._sauver();
    this._rafraichir();
  }

  // Faces sélectionnées de plus de 3 sommets découpées en triangles (même sens, même matériau, même place),
  // qui sont sélectionnés à leur place
  _trianguler() {
    const fs = new Set(this.sel.faces.filter(f => f.s.length > 3));
    if (!fs.size) { this._message('Aucune face de plus de 3 sommets sélectionnée'); return; }
    this._memoriser();
    const mm = this.maillage, faces = [];
    let n = 0;
    for (const f of mm.faces) {
      if (!fs.has(f)) { faces.push(f); continue; }
      this.sel.retirer({ t: 'f', f });
      for (const s of mm.trianguler(f)) {
        const t = { s, m: f.m };
        faces.push(t);
        this.sel.ajouter({ t: 'f', f: t });
        n++;
      }
    }
    mm.faces = faces;
    this._sauver();
    this._rafraichir();
    this._message(`${fs.size} face${fs.size > 1 ? 's' : ''} → ${n} triangles`);
  }

  // Arêtes sélectionnées dissoutes : les deux faces de chacune (et les faces reliées de proche en proche) réunies ;
  // les faces obtenues sont sélectionnées
  _dissoudre() {
    const na = this.sel.aretes.length, r = this.maillage.dissolution(this.sel.aretes);
    if (r.erreur) { this._message(r.erreur); return; }
    this._memoriser();
    this._remplacerFaces(r.groupes);
    this._rendreSelectionnable('f');
    this._sauver();
    this._rafraichir();
    const ng = r.groupes.length, pl = k => k > 1 ? 's' : '';
    this._message(`${na} arête${pl(na)} dissoute${pl(na)} → ` + (ng > 1 ? `${ng} faces` : `1 face de ${r.groupes[0].s.length} sommets`) +
      (r.groupes.every(g => g.plane) ? '' : ' (non plane)'));
  }

  // Arêtes sélectionnées coupées en `coupes` + 1 segments ; les morceaux remplacent chaque arête dans la sélection.
  // Première fois : mémorisée et proposée dans le panneau « dernière opération » (nombre de coupes) ; `refaire` :
  // rejouée par _refaire sur l'état d'avant
  _subdiviser(coupes = 1, refaire) {
    const aretes = this.sel.aretes.slice();
    if (!aretes.length) { this._message('Aucune arête sélectionnée'); return; }
    if (!refaire) this._memoriser();
    const nouveaux = this.maillage.subdiviser(aretes, coupes);
    for (const [c, l] of nouveaux) { const p = this.proprio[+c.split(' ')[0]]; for (const _ of l) this.proprio.push(p); }
    this.sel.vider('a');
    for (const [i, j] of aretes) {
      const chaine = [i, ...nouveaux.get(i + ' ' + j), j];
      for (let k = 0; k + 1 < chaine.length; k++) this.sel.ajouter({ t: 'a', a: [chaine[k], chaine[k + 1]] });
    }
    this._sauver();
    this._rafraichir();
    if (refaire) return;
    this.derniere = { type: 'subdivision', coupes, edition: this.state.edition };
    this._montrerAjuster();
  }

  // Arête de départ d'une boucle de coupe : l'arête active, sinon la seule sélectionnée
  _areteDepart() {
    const d = this.sel.dernier;
    if (d && d.t === 'a') return d.a;
    return this.sel.aretes.length === 1 ? this.sel.aretes[0] : null;
  }

  // Boucle de coupe à travers l'anneau de l'arête de départ (Maillage.anneau / couperBoucle) ; la nouvelle boucle est
  // sélectionnée. Réglages { arete, coupes, glissement, uniforme, inverser } dans le panneau « dernière opération » ;
  // `o` donné : rejouée par _refaire sur l'état d'avant
  _boucleCoupe(o) {
    const arete = o ? o.arete : this._areteDepart(), an = arete && this.maillage.anneau(...arete);
    if (!an) { this._message('Touchez une arête qui borde un quadrilatère'); return; }
    if (!o) this._memoriser();
    const r = o || { coupes: 1, glissement: 0, uniforme: false, inverser: false };
    const nouvelles = this.maillage.couperBoucle(an, r.coupes, r.glissement, r.uniforme, r.inverser);
    for (const [a] of an.rails) for (let k = 0; k < r.coupes; k++) this.proprio.push(this.proprio[a]);
    this.sel.vider('a');
    for (const a of nouvelles) this.sel.ajouter({ t: 'a', a });
    this.sel.nettoyer(this.maillage);
    this._sauver();
    this._rafraichir();
    if (o) return;
    this.derniere = Object.assign({ type: 'boucle', arete: arete.slice(), edition: this.state.edition }, r);
    this._montrerAjuster();
    this._message(`Boucle de coupe : ${an.rails.length} arête${an.rails.length > 1 ? 's' : ''} coupée${an.rails.length > 1 ? 's' : ''}` + (an.ferme ? ' (tour complet)' : ''));
  }

  // Chaque groupe { faces, s } devient une face de contour `s`, à la place de sa première face et avec son
  // matériau ; les nouvelles faces sont ajoutées à la sélection (les éléments disparus en sortent à la sauvegarde)
  _remplacerFaces(groupes) {
    const mm = this.maillage, nouvelle = new Map(), retirees = new Set();
    for (const g of groupes) {
      nouvelle.set(g.faces[0], { s: g.s, m: g.faces[0].m });
      for (const f of g.faces) retirees.add(f);
    }
    mm.faces = mm.faces.flatMap(f => nouvelle.has(f) ? [nouvelle.get(f)] : retirees.has(f) ? [] : [f]);
    for (const f of nouvelle.values()) this.sel.ajouter({ t: 'f', f });
    this.sel.nettoyer(mm);
  }

  // Révolution de la sélection autour de l'axe `v.axe` passant par le curseur 3D (Maillage.revolution) : sommets seuls
  // → arcs d'arêtes libres, arêtes → bandes de faces ; une arête du maillage dont les deux extrémités sont des sommets
  // sélectionnés compte comme sélectionnée (profil choisi par ses sommets) ; la géométrie créée est sélectionnée.
  // Appelée par le panneau sur l'état d'avant (ED_OPERATIONS) ; renvoie la ligne d'information
  _revolution(v) {
    const mm = this.maillage, sommets = this.sel.sommets.slice(), n = mm.sommets.length;
    const choisis = new Set(sommets), aretes = this.sel.aretes.map(a => a.slice()), deja = new Set(aretes.map(a => a.join(' ')));
    for (const [i, j] of mm.aretes()) {
      const a = SelectionMaillage.arete(i, j);
      if (choisis.has(i) && choisis.has(j) && !deja.has(a.join(' '))) { deja.add(a.join(' ')); aretes.push(a); }
    }
    const profil = new Set([...sommets, ...aretes.flat()]), voisine = mm.faces.find(f => f.s.some(i => profil.has(i)));
    const axe = v.axe === 'vue' ? this._ajout.vue : { x: [1, 0, 0], y: [0, 1, 0], z: [0, 0, 1] }[v.axe];
    const r = mm.revolution(sommets, aretes, { centre: this.state.curseur, axe, angle: v.angle * v.sens, segments: v.segments,
      fermer: v.fermer, materiau: voisine ? voisine.m : 'defaut' });
    for (const [i, l] of r.copies) for (const j of l) if (j >= n) this.proprio[j] = this.proprio[i];
    this.sel.vider();
    for (const f of r.faces) this.sel.ajouter({ t: 'f', f });
    for (const a of r.fils) this.sel.ajouter({ t: 'a', a });
    if (r.faces.length) this._rendreSelectionnable('f');
    if (r.fils.length) this._rendreSelectionnable('a');
    this._sauver();
    this._rafraichir();
    const pl = k => k > 1 ? 's' : '', nf = r.faces.length, na = r.fils.length, ns = mm.sommets.length - n;
    return [nf && `${nf} face${pl(nf)}`, na && `${na} arête${pl(na)} libre${pl(na)}`, `${ns} sommet${pl(ns)} ajouté${pl(ns)}`].filter(Boolean).join(' · ');
  }

  // Sommets confondus (à `v.tolerance` près, de proche en proche) réunis à leur position moyenne, objet par objet :
  // parmi les sommets de la sélection, ou tous sans sélection. Appelée par le panneau (ED_OPERATIONS) ; renvoie la
  // ligne d'information
  _fusionProches(v) {
    const mm = this.maillage, tous = this.sel.vide, indices = tous ? mm.sommets.map((_, i) => i) : this.sel.sommetsImpliques();
    const r = mm.fusionnerProches(indices, v.tolerance, i => this.proprio[i]);
    if (r.retires) {
      const proprio = [];
      r.table.forEach((j, i) => { proprio[j] = this.proprio[i]; });
      this.proprio = proprio;
      this.sel.renumeroter(r.table);
      this.sel.nettoyer(mm);
    }
    this._sauver();
    this._rafraichir();
    const pl = k => k > 1 ? 's' : '', ou = tous ? 'tout le maillage' : 'la sélection';
    return r.retires ? `${r.retires + r.groupes} sommets réunis en ${r.groupes} (${r.retires} retiré${pl(r.retires)}), dans ${ou}`
      : `Aucun sommet confondu à cette tolérance dans ${ou}`;
  }

  // Sommets sélectionnés réunis en un seul (le premier choisi), placé selon `cible` : 'centre', 'premier' ou
  // 'dernier' sélectionné (Maillage.fusionner) ; les autres éléments suivent la renumérotation. Première fois : au
  // dernier choix (state.fusion), proposée dans le panneau « dernière opération » ; `refaire` : rejouée par _refaire
  // sur l'état d'avant
  _fusionner(cible = this.state.fusion || 'centre', refaire) {
    const s = this.sel.sommets.slice();
    if (s.length < 2) { this._message('Sélectionnez au moins 2 sommets'); return; }
    if (this._aCheval(s)) { this._message('Ces sommets appartiennent à des objets différents'); return; }
    if (!refaire) this._memoriser();
    const autres = new Set(s.slice(1));
    this.proprio = this.proprio.filter((_, i) => !autres.has(i));
    const table = this.maillage.fusionner(s, cible);
    this.sel.renumeroter(table);
    this.sel.nettoyer(this.maillage);
    this._sauver();
    this._rafraichir();
    if (refaire) return;
    this.derniere = { type: 'fusion', cible, edition: this.state.edition };
    this._montrerAjuster();
  }

  _supprimerFaces() {
    const fs = new Set(this.sel.faces);
    if (!fs.size) return;
    this._memoriser();
    this.maillage.faces = this.maillage.faces.filter(f => !fs.has(f));
    this.sel.nettoyer(this.maillage);
    this._sauver();
    this._rafraichir();
  }

  // Faces sélectionnées séparées en un nouvel objet par objet donneur : ses faces et les sommets qu'elles utilisent
  // (copiés : ceux du bord restent aussi au donneur), même place, matériau et set. Refusé si un donneur a des
  // modifieurs. Le donneur perd ces faces, et les sommets qui ne servaient qu'à elles ; vidé (ni face ni sommet),
  // il est supprimé. Les nouveaux objets ne sont pas édités ; on reste en Géométrie s'il reste un objet édité.
  _separer() {
    const fs = new Set(this.sel.faces);
    if (!fs.size) { this._message('Aucune face sélectionnée'); return; }
    const modifies = [...new Set([...fs].map(f => this.objets[this.proprio[f.s[0]]]))].filter(o => o.modifs.length);
    if (modifies.length) {
      this._message(modifies.map(o => '« ' + o.nom + ' »').join(', ') + (modifies.length > 1 ? ' ont' : ' a') + ' des modifieurs : appliquez-les ou retirez-les avant de séparer');
      return;
    }
    this._memoriser();
    const mm = this.maillage, parts = new Map();          // objet donneur → { faces, sommets (ancien → nouveau) }
    for (const f of mm.faces) {
      if (!fs.has(f)) continue;
      const k = this.proprio[f.s[0]];
      if (!parts.has(k)) parts.set(k, { maillage: new Maillage(), table: new Map() });
      const p = parts.get(k);
      p.maillage.faces.push({ s: f.s.map(i => {
        if (!p.table.has(i)) { p.table.set(i, p.maillage.sommets.length); p.maillage.sommets.push(mm.sommets[i].slice()); }
        return p.table.get(i);
      }), m: f.m });
    }
    const noms = [];
    for (const [k, p] of parts) {
      const o = this.objets[k];
      this.objets.push(this._objet(this._versLocal(o, p.maillage), this._nomLibre(o.nom), o.position, o.rotation, [], o.set, true, [], o.materiau, o.echelle));
      noms.push('« ' + this.objets[this.objets.length - 1].nom + ' »');
    }
    // Donneurs : faces retirées, puis les sommets qu'elles étaient seules à utiliser
    mm.faces = mm.faces.filter(f => !fs.has(f));
    const gardes = new Set(mm.fils.flat());
    for (const f of mm.faces) for (const i of f.s) gardes.add(i);
    const orphelins = new Set();
    for (const p of parts.values()) for (const i of p.table.keys()) if (!gardes.has(i)) orphelins.add(i);
    this.proprio = this.proprio.filter((_, i) => !orphelins.has(i));
    this.sel.renumeroter(mm.supprimerSommets([...orphelins]));
    this.sel.nettoyer(mm);
    const restants = new Set(this.proprio), vides = [...parts.keys()].filter(k => !restants.has(k)).map(k => this.objets[k]);
    if (vides.length) this._retirerVides(new Set(vides), this.objets.slice(-parts.size));
    this._sauver();
    this._rafraichir(true);
    this._message(`${fs.size} face${fs.size > 1 ? 's' : ''} séparée${fs.size > 1 ? 's' : ''} → ${noms.join(', ')}`
      + (vides.length ? ` ; ${vides.map(o => '« ' + o.nom + ' »').join(', ')} vidé${vides.length > 1 ? 's' : ''}, supprimé${vides.length > 1 ? 's' : ''}` : ''));
  }

  // Mode Géométrie : objets édités `vides` (Set d'objets) supprimés, la copie de travail rangée puis rouverte sur les
  // autres ; s'il n'en reste aucun, retour en mode Scène avec les objets `nouveaux` choisis
  _retirerVides(vides, nouveaux) {
    this._rangerEdition();
    const edites = this.edites.map(k => this.objets[k]).filter(o => !vides.has(o)), actif = this._actif();
    const choix = this.choix.map(k => this.objets[k]).filter(o => o && !vides.has(o));
    this.objets = this.objets.filter(o => !vides.has(o));
    const k = o => this.objets.indexOf(o);
    if (!edites.length) {
      this.state.edition = 'scene';
      this.maillage = null;
      this.sel = new SelectionMaillage();
      this.edites = [];
      this.choix = nouveaux.map(k);
      this.state.actif = this.choix[this.choix.length - 1];
      return;
    }
    this.choix = choix.map(k);
    this.edites = edites.map(k);
    this.state.actif = vides.has(actif) ? this.edites[this.edites.length - 1] : k(actif);
    this._ouvrirEdition();
  }

  // Sommets sélectionnés retirés avec leurs faces ; arêtes et faces choisies ailleurs restent sélectionnées
  _supprimerSommets() {
    const s = this.sel.sommets.slice();
    if (!s.length) return;
    this._memoriser();
    const retires = new Set(s);
    this.proprio = this.proprio.filter((_, i) => !retires.has(i));
    const table = this.maillage.supprimerSommets(s);
    this.sel.renumeroter(table);
    this.sel.nettoyer(this.maillage);
    this._sauver();
    this._rafraichir();
  }

  // Saisie d'une coordonnée : la sélection est translatée pour que son centre prenne cette valeur
  _saisir(k, valeur) {
    const v = parseFloat(String(valeur).replace(',', '.')), indices = this._indices().slice();
    if (!indices.length || !isFinite(v)) { this._afficherInfos(); return; }
    const d = new THREE.Vector3();
    d.setComponent(k, v - this._centre()[k]);
    if (!d.getComponent(k)) return;
    this._memoriser();
    this._poser(indices, this._depart(indices), d);
    this._sauver();
    this._rafraichir();
  }

  // Angle `k` (degrés, ordre XYZ) de la rotation du seul objet choisi, autour de son origine
  _saisirRotation(k, valeur) {
    const o = this._seul(), v = parseFloat(String(valeur).replace(',', '.'));
    if (!o || !isFinite(v)) { this._afficherInfos(); return; }
    const deg = this._euler(o).slice();
    if (deg[k] === v) return;
    deg[k] = v;
    this._memoriser();
    const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(...deg.map(d => d * Math.PI / 180), 'XYZ'));
    o.rotation = q.toArray();
    o._euler = { cle: o.rotation.join(' '), deg };
    this._sauver();
    this._rafraichir();
  }

  // Dimension `k` du seul objet choisi : son facteur d'échelle sur cet axe en est déduit (dimension positive, et
  // l'objet n'est pas plat sur cet axe)
  _saisirDimension(k, valeur) {
    const o = this._seul(), v = parseFloat(String(valeur).replace(',', '.'));
    const base = o ? this._dimensions(o).base[k] : 0;
    if (!o || !isFinite(v) || v <= 0 || !(base > 1e-9)) { this._afficherInfos(); return; }
    const f = v / base;
    if (Math.abs(f - o.echelle[k]) < 1e-12) return;
    this._memoriser();
    o.echelle = o.echelle.map((e, n) => n === k ? f : e);
    this._sauver();
    this._rafraichir();
  }

  // Fige l'échelle des objets choisis dans leur maillage, sans changer leur forme : elle revient à [1, 1, 1] ; le
  // décalage constant (non relatif) d'une répétition suit, pour que les copies restent en place
  _appliquerEchelle() {
    const l = this._geo() ? [] : this.choix.map(k => this.objets[k]).filter(o => o.echelle.some(f => f !== 1));
    if (!l.length) { this._message('Aucun objet choisi n’a d’échelle à appliquer'); return; }
    this._memoriser();
    for (const o of l) {
      const e = o.echelle;
      o.maillage = o.maillage.clone();
      o.maillage.sommets = o.maillage.sommets.map(p => p.map((v, k) => v * e[k]));
      for (const m of o.modifs) if (m.type === 'repetition' && !m.relatif) m.decalage = m.decalage.map((v, k) => v * e[k]);
      o.echelle = [1, 1, 1];
      o._donnees = null;
      o._geoSale = true;
    }
    this._sauver();
    this._rafraichir(true);
    this._message(l.length > 1 ? `Échelle appliquée à ${l.length} objets` : `Échelle appliquée à « ${l[0].nom} »`);
  }

  // ----- Fichiers -----------------------------------------------------------------------------------
  _choisirFichier() {
    this.entree.value = '';
    this.entree.click();
  }

  // Fichier du téléphone : un projet .gda remplace la scène, un modèle s'y ajoute
  _lireFichier() {
    const f = this.entree.files && this.entree.files[0];
    if (!f) return;
    f.arrayBuffer().then(d => this._importer(f.name, d))
      .catch(e => this._message('Lecture impossible : ' + (e && e.message || e), true));
  }

  _chargerUrl(url) {
    fetch(url).then(r => { if (!r.ok) throw new Error(url + ' : ' + r.status); return r.arrayBuffer(); })
      .then(d => this._importer(url.split('/').pop(), d))
      .catch(e => this._message('Lecture impossible : ' + (e && e.message || e), true));
  }

  // D'après l'extension : .gda → projet ; OBJ à plusieurs objets → un objet chacun ; sinon un seul objet. Un maillage
  // n'a qu'un matériau : un objet qui en a plusieurs est coupé en un objet par matériau (« nom matériau »)
  _importer(fichier, d) {
    const base = fichier.replace(/\.[^.]+$/, ''), ext = (fichier.match(/\.([a-z0-9]+)$/i) || [])[1] || '';
    if (ext.toLowerCase() === 'gda') { this._ouvrirProjet(new TextDecoder().decode(d), base); return; }
    if (ext.toLowerCase() === 'mtl') { this._importerMTL(new TextDecoder().decode(d), fichier); return; }
    let liste = ext.toLowerCase() === 'obj' ? Maillage.objetsDepuisOBJ(new TextDecoder().decode(d)) : [];
    if (liste.length < 2) liste = [{ nom: base, maillage: Maillage.depuisFichier(fichier, d) }];
    const objets = liste.flatMap(({ nom, maillage }) => {
      const parts = maillage.parMateriau();
      return parts.map(p => ({ nom: parts.length > 1 ? nom + ' ' + p.m : nom, maillage: p.maillage, materiau: p.m }));
    });
    if (objets.length > 1) this._ajouterObjets(objets, base);
    else this._ajouterObjet(objets[0].maillage, base, objets[0].materiau);
  }

  // Bibliothèque .mtl : chaque matériau lu remplace celui du même nom (les objets qui l'utilisent le prennent),
  // ou s'ajoute ; annulable
  _importerMTL(texte, fichier) {
    const { materiaux, textures } = Maillage.depuisMTL(texte), noms = Object.keys(materiaux);
    if (!noms.length) { this._message('Aucun matériau dans ' + fichier, true); return; }
    this._changerEdition('scene');
    this._memoriser();
    const remplaces = noms.filter(n => this.materiaux[n]).length;
    for (const n of noms) this.materiaux[n] = ed_materiau(materiaux[n]);
    this._sauver();
    this._rafraichir();
    const pl = k => k > 1 ? 's' : '';
    this._message(`${noms.length} matériau${noms.length > 1 ? 'x' : ''} lu${pl(noms.length)}` + (remplaces ? ` (${remplaces} remplacé${pl(remplaces)})` : '')
      + (textures ? ` ; ${textures} texture${pl(textures)} ignorée${pl(textures)}` : ''));
  }

  // Objets d'un même fichier (sommets au monde), rangés dans un nouveau set au nom du fichier ; l'origine de
  // chacun au centre de sa boîte, pour qu'il reste à sa place
  _ajouterObjets(liste, nomSet) {
    this._changerEdition('scene');
    this._memoriser();
    const set = { nom: this._nomSetLibre(nomSet), visible: true, replie: false };
    this.sets.push(set);
    this.choix = liste.map(({ nom, maillage, materiau }) => {
      const b = maillage.boite() || { min: [0, 0, 0], max: [0, 0, 0] }, c = b.min.map((v, k) => (v + b.max[k]) / 2);
      for (const p of maillage.sommets) for (let k = 0; k < 3; k++) p[k] -= c[k];
      this.objets.push(this._objet(maillage, this._nomLibre(nom), c, undefined, undefined, set.nom, true, [], materiau));
      return this.objets.length - 1;
    });
    this._verifierMateriaux();
    this.state.actif = this.choix[this.choix.length - 1];
    this._sauver();
    this._rafraichir(true);
    this._recadrer();
    this._message(`${liste.length} objets ajoutés dans le set « ${set.nom} »`);
    if (this._trop) this._message('Scène trop grosse pour être gardée après fermeture : pensez à l’enregistrer');
  }

  // ----- Projet .gda --------------------------------------------------------------------------------
  _enregistrerProjet() {
    this._rangerEdition();
    const p = {
      format: 'gda', version: ED_FORMAT, application: ((window.APP && APP.name) || 'MeshCraft') + ' ' + ((window.APP && APP.version) || ''),
      scene: {
        objets: this.objets.map(o => {
          const d = this._donnees(o);
          return { nom: o.nom, position: o.position, rotation: o.rotation, echelle: o.echelle, set: o.set, visible: o.visible, modifs: o.modifs, materiau: o.materiau,
            maillage: { v: d.v, f: d.f.map(f => [o.materiau].concat(f.slice(1))) } };
        }),
        sets: this.sets.map(e => ({ nom: e.nom, visible: e.visible, replie: e.replie })),
        actif: this.state.actif, curseur: this.state.curseur
      },
      materiaux: ed_copie(this.materiaux), textures: {}
    };
    const nom = (this.state.projet || 'projet').replace(/[\\/:*?"<>|]+/g, '-');
    this._telecharger(ed_texteProjet(p), nom + '.gda', 'application/octet-stream');
    this._message('Projet enregistré : ' + nom + '.gda');
  }

  // Remplace la scène (annulable) ; le nom du fichier devient celui du projet
  _ouvrirProjet(texte, nom) {
    const p = ed_lireProjet(texte), sc = p.scene;
    this._changerEdition('scene');
    this._memoriser();
    for (const o of this.objets) o.vue = null;   // libérés par _rafraichirObjets
    this.objets = sc.objets.map(o => this._objet(Maillage.depuisDonnees(o.maillage), o.nom || 'objet', o.position || undefined, o.rotation || undefined, undefined, o.set, o.visible, o.modifs,
      typeof o.materiau === 'string' && o.materiau ? o.materiau : (o.maillage.f[0] && o.maillage.f[0][0]) || ED_DEFAUT, o.echelle));
    this.sets = (sc.sets || []).map(e => Object.assign({}, e));
    this._verifierSets();
    this.materiaux = {};
    for (const [n, m] of Object.entries(p.materiaux)) if (n) this.materiaux[n] = ed_materiau(m);
    this._verifierMateriaux();
    this.state.actif = this.objets[sc.actif] ? sc.actif : this.objets.length - 1;
    if (Array.isArray(sc.curseur) && sc.curseur.length === 3) this.state.curseur = sc.curseur.slice();
    this.choix = [];
    this.state.projet = nom;
    if (this.champProjet) this.champProjet.value = nom;
    this._sauver();
    this._rafraichir(true);
    this._recadrer();
    const n = this.objets.length;
    this._message(`Projet « ${nom} » ouvert : ${n} objet${n > 1 ? 's' : ''}`);
    if (this._trop) this._message('Scène trop grosse pour être gardée après fermeture : pensez à l’enregistrer');
  }

  // Fichier proposé au téléchargement (dossier Téléchargements sur Android)
  _telecharger(contenu, fichier, type) {
    const url = URL.createObjectURL(new Blob([contenu], { type }));
    const a = document.createElement('a');
    a.href = url;
    a.download = fichier;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
  }

  // Objet actif (dans son repère), ou toute la scène (dans le monde ; en OBJ, un « o » par objet)
  _exporter(format, scene) {
    this._rangerEdition();
    let mm, nom, contenu;
    if (scene) {
      // Objets affichés, modifieurs appliqués ; les cibles des booléens (outils) ne sont pas exportées
      const cibles = this._cibles();
      const liste = this.objets.filter(o => this._affiche(o) && !cibles.has(o)).map(o => ({ nom: o.nom, maillage: this._teinte(this._versMonde(o, this._evalue(o)), o) }));
      if (!liste.length) { this._message('Aucun objet à exporter'); return; }
      mm = Maillage.reunir(liste.map(o => o.maillage));
      nom = 'scene';
      if (format === 'obj') contenu = Maillage.objetsVersOBJ(liste, nom, ED_MTL);
    } else {
      const o = this._actif();
      if (!o) { this._message('Aucun objet actif'); return; }
      mm = this._teinte(this._evalue(o), o);
      nom = o.nom || 'maillage';
    }
    if (!mm.faces.length) { this._message('Aucune face à exporter'); return; }
    contenu = contenu || (format === 'obj' ? mm.versOBJ(nom, ED_MTL) : format === 'stl' ? mm.versSTL(nom) : mm.versGLB(nom, this.materiaux));
    // OBJ : pas de « text/plain », pour lequel Android ajoute « .txt » au nom du fichier
    const type = format === 'obj' ? 'application/octet-stream' : format === 'glb' ? 'model/gltf-binary' : 'model/stl';
    this._telecharger(contenu, nom + '.' + format, type);
    this._message('Exporté : ' + nom + '.' + format);
  }

  // Copie de `mm` dont toutes les faces portent le matériau de l'objet `o` (exports : un matériau par maillage)
  _teinte(mm, o) {
    const r = mm.clone();
    for (const f of r.faces) f.m = o.materiau;
    return r;
  }

  // Bibliothèque des matériaux au format .mtl (les OBJ exportés l'annoncent sous le nom ED_MTL)
  _exporterMTL() {
    this._telecharger(Maillage.versMTL(this.materiaux, 'materiaux'), ED_MTL, 'application/octet-stream');
    this._message('Exporté : ' + ED_MTL + ' (à placer à côté des OBJ)');
  }

  // ----- Caméra et gestes ---------------------------------------------------------------------------
  _camera(m) {
    const v = this.state.vue;
    this.cam = v ? { cible: v.cible.slice(), distance: v.distance, lacet: v.lacet, hauteur: v.hauteur }
      : { cible: [0, 0, 0], distance: 4, lacet: 0.6, hauteur: 0.5 };
    m.evenements.ecouter('moteur:image', () => {
      const c = this.cam, cam = m.camera;
      // Plans de coupe proportionnés à la distance : petits et grands modèles restent visibles
      if (Math.abs(cam.far - c.distance * 50) > c.distance) {
        cam.near = c.distance / 200;
        cam.far = c.distance * 50;
        cam.updateProjectionMatrix();
      }
      m.orbiter({ x: c.cible[0], y: c.cible[1], z: c.cible[2] }, c.distance, c.lacet, c.hauteur);
      this._eclairer(m);
      if (this._numerosSales) { this._numerosSales = false; m.camera.updateMatrixWorld(); this._placerNumeros(); }
      this._placerPoignee();
      this._placerCurseur();
      for (const k of ['aretesChoisies', 'silhouette']) if (this.mat[k]) this.mat[k].uniforms.resolution.value.set(m.largeur || 1, m.hauteur || 1);
    });
  }

  // Lumière de la vue, placée avant chaque image (sans passer par placerSoleil, qui redemanderait une image) :
  // soleil fixe en rendu En jeu, lampe attachée à la caméra sinon (ED_SOLEIL, ED_LAMPE)
  _eclairer(m) {
    const s = m.soleil, d = this._vLampe = this._vLampe || new THREE.Vector3();
    if (this._rendu() === 'jeu') d.fromArray(ED_SOLEIL);
    else d.fromArray(ED_LAMPE).applyQuaternion(m.camera.quaternion);
    s.target.position.set(0, 0, 0);
    s.position.copy(d.normalize().multiplyScalar(20));
  }

  // Recadre sur l'objet édité, sinon sur les objets choisis ou toute la scène
  // `boite` { min, max } dans le monde, sinon l'objet édité, les objets choisis ou toute la scène
  _recadrer(boite) {
    const b = boite || (this._geo() ? this.maillage.boite() : this._boiteMonde(this.choix.length ? this.choix : this._affiches()));
    if (!b) return;
    const c = [0, 1, 2].map(k => (b.min[k] + b.max[k]) / 2);
    const r = Math.max(Math.hypot(b.max[0] - b.min[0], b.max[1] - b.min[1], b.max[2] - b.min[2]) / 2, 1e-3);
    const asp = this.m.largeur && this.m.hauteur ? Math.min(1, this.m.largeur / this.m.hauteur) : 0.6;
    const distance = r / Math.sin(this.m.camera.fov * Math.PI / 360) / asp * 1.15;
    this.m.animations.arreter(this.cam);
    this.m.animations.vers(this.cam, { distance }, 0.4, { assouplir: 'sortie' });
    const cible = this.cam.cible;
    this.m.animations.vers(cible, { 0: c[0], 1: c[1], 2: c[2] }, 0.4, {
      assouplir: 'sortie', fin: () => this._memoriserVue()
    });
    this._numerosSales = true;
  }

  _memoriserVue() {
    this.state.vue = { cible: this.cam.cible.slice(), distance: this.cam.distance, lacet: this.cam.lacet, hauteur: this.cam.hauteur };
    this.save();
  }

  // Repère de l'écran dans le monde : vecteurs droite et haut de la caméra, et taille d'un pixel à la profondeur de `p`
  _repere(p) {
    const m = this.m, cam = m.camera;
    cam.updateMatrixWorld();
    const droite = new THREE.Vector3().setFromMatrixColumn(cam.matrixWorld, 0);
    const haut = new THREE.Vector3().setFromMatrixColumn(cam.matrixWorld, 1);
    const avant = new THREE.Vector3().setFromMatrixColumn(cam.matrixWorld, 2).negate();
    const prof = Math.max(new THREE.Vector3().fromArray(p).sub(cam.position).dot(avant), cam.near);
    const pixel = 2 * prof * Math.tan(cam.fov * Math.PI / 360) / (m.hauteur || 1);
    return { droite, haut, pixel };
  }

  // Point du plan (normale `n`, passant par `p`) sous le doigt (pixels relatifs à la vue) ; null s'il est rasant
  _surPlan(x, y, n, p) {
    const m = this.m, ray = m.raycaster.ray;
    m.raycaster.setFromCamera(new THREE.Vector2(x / m.largeur * 2 - 1, 1 - y / m.hauteur * 2), m.camera);
    const den = ray.direction.dot(n);
    if (Math.abs(den) < 0.12) return null;
    const t = p.clone().sub(ray.origin).dot(n) / den;
    return t > 0 ? ray.at(t, new THREE.Vector3()) : null;
  }

  // Déplacement de la sélection : (`x`, `y`) = position actuelle du doigt (pixels relatifs à la vue).
  // Extrémité d'un axe : le long de cet axe. Origine : selon les axes cochés.
  _deplacer(x, y) {
    const g = this._glisse, ax = this.state.axes;
    const libres = g.prise === 'o' ? ED_AXES.filter(a => ax[a]) : [g.prise];
    const sx = x - g.x0, sy = y - g.y0;
    const { droite, haut, pixel } = g.repere;
    const d = new THREE.Vector3();
    if (libres.length === 1) {
      // Projection du glissé sur la direction de l'axe à l'écran
      const k = ED_AXES.indexOf(libres[0]), u = new THREE.Vector3();
      u.setComponent(k, 1);
      const ux = u.dot(droite) / pixel, uy = -u.dot(haut) / pixel, l2 = ux * ux + uy * uy;
      if (l2 > 1e-6) d.setComponent(k, (sx * ux + sy * uy) / l2);
    } else {
      // Trois axes : dans le plan de l'écran. Deux axes : dans leur plan (le point suit le doigt), sinon à plat.
      const bloque = ED_AXES.find(a => !libres.includes(a));
      let fait = false;
      if (bloque) {
        const n = new THREE.Vector3(), c = new THREE.Vector3().fromArray(g.centre);
        n.setComponent(ED_AXES.indexOf(bloque), 1);
        const p0 = this._surPlan(g.x0, g.y0, n, c), p1 = p0 && this._surPlan(x, y, n, c);
        if (p1) { d.subVectors(p1, p0); fait = true; }
      }
      if (!fait) d.copy(droite).multiplyScalar(sx * pixel).addScaledVector(haut, -sy * pixel);
      if (bloque) d.setComponent(ED_AXES.indexOf(bloque), 0);
    }
    if (this.state.pas.actif) {
      const p = this._pasTranslation();
      d.set(Math.round(d.x / p) * p, Math.round(d.y / p) * p, Math.round(d.z / p) * p);
    }
    g.d = d.toArray();
    this._poser(g.indices, g.depart, d);
    this._rafraichir();
  }

  // Rotation de la sélection autour du pivot : angle balayé par le doigt (`x`, `y`) autour du pivot à l'écran
  _tourner(x, y) {
    const g = this._glisse;
    const a = Math.atan2(y - g.ecran[1], x - g.ecran[0]);
    let da = a - g.angle;
    if (da > Math.PI) da -= 2 * Math.PI;
    if (da < -Math.PI) da += 2 * Math.PI;
    g.angle = a;
    g.cumul += da;
    // Écran : y vers le bas, l'angle croît dans le sens horaire ; vu depuis la pointe de l'axe, une rotation
    // positive est antihoraire
    let theta = -g.cumul * g.signe;
    if (this.state.pas.actif) { const p = this.state.pas.angle * Math.PI / 180; theta = Math.round(theta / p) * p; }
    g.degres = Math.round(theta * 180 / Math.PI);
    g.theta = theta;
    this._poser(g.indices, g.depart, null, new THREE.Quaternion().setFromAxisAngle(g.axe, theta), new THREE.Vector3().fromArray(g.pivot));
    this._rafraichir();
  }

  // Début d'une rotation : axe (anneau tenu, sinon axe de vue ou axe coché le plus face à l'écran) et angle de départ
  _debutRotation(g, x, y) {
    const m = this.m, ax = this.state.axes, c = new THREE.Vector3().fromArray(g.pivot);
    const vue = m.camera.position.clone().sub(c).normalize();
    let axe;
    if (ED_AXES.includes(g.prise)) axe = g.prise;
    else if (g.prise === 'v' || ED_AXES.every(a => ax[a])) axe = null;
    else axe = ED_AXES.filter(a => ax[a]).sort((a, b) => Math.abs(vue.getComponent(ED_AXES.indexOf(b))) - Math.abs(vue.getComponent(ED_AXES.indexOf(a))))[0];
    if (axe) {
      g.axe = new THREE.Vector3();
      g.axe.setComponent(ED_AXES.indexOf(axe), 1);
    } else g.axe = vue.clone();
    g.signe = g.axe.dot(vue) < 0 ? -1 : 1;
    const p = c.clone().project(m.camera);
    g.ecran = [(p.x + 1) / 2 * m.largeur, (1 - p.y) / 2 * m.hauteur];
    g.angle = Math.atan2(y - g.ecran[1], x - g.ecran[0]);
    g.cumul = 0;
    g.degres = 0;
  }

  // Début d'une mise à l'échelle : axes libres (axe tenu, sinon les axes cochés), pivot et direction de l'axe à l'écran
  _debutEchelle(g) {
    const m = this.m, c = new THREE.Vector3().fromArray(g.pivot);
    const ecran = v => { const p = v.clone().project(m.camera); return [(p.x + 1) / 2 * m.largeur, (1 - p.y) / 2 * m.hauteur]; };
    g.echelle = true;
    g.libres = ED_AXES.includes(g.prise) ? [g.prise] : ED_AXES.filter(a => this.state.axes[a]);
    g.ecran = ecran(c);
    if (g.libres.length === 1 && ED_AXES.includes(g.prise)) {
      const u = new THREE.Vector3();
      u.setComponent(ED_AXES.indexOf(g.prise), g.repere.pixel * 100);
      const b = ecran(c.clone().add(u)), l = Math.hypot(b[0] - g.ecran[0], b[1] - g.ecran[1]);
      g.dir = l > 1e-3 ? [(b[0] - g.ecran[0]) / l, (b[1] - g.ecran[1]) / l] : null;
    }
    g.facteur = 1;
  }

  // Mise à l'échelle depuis le pivot : rapport des distances du doigt au pivot à l'écran (projetées sur l'axe tenu) ;
  // doigt parti trop près du pivot : glisser vers la droite ou le haut agrandit
  _echelonner(x, y) {
    const g = this._glisse, e = g.ecran;
    const mesure = (px, py) => g.dir ? (px - e[0]) * g.dir[0] + (py - e[1]) * g.dir[1] : Math.hypot(px - e[0], py - e[1]);
    const d0 = mesure(g.x0, g.y0);
    let f = Math.abs(d0) < 20 ? 1 + ((x - g.x0) - (y - g.y0)) / 120 : mesure(x, y) / d0;
    if (this.state.pas.actif) f = Math.round(f / this.state.pas.echelle) * this.state.pas.echelle;
    f = Math.max(f, 0.01);              // pas de facteur nul ni négatif (faces retournées)
    g.facteur = f;
    g.s = ED_AXES.map(a => g.libres.includes(a) ? f : 1);
    this._poser(g.indices, g.depart, null, null, new THREE.Vector3().fromArray(g.pivot), new THREE.Vector3().fromArray(g.s));
    this._rafraichir();
  }

  _gestes(m) {
    const ev = m.evenements, c = this.cam, anim = m.animations;
    ev.ecouter('tactile:appui', d => this._toucher(d));
    // Un geste dans la vue replie le menu du curseur
    for (const t of ['tactile:appui', 'tactile:glisser-debut', 'tactile:pincer']) ev.ecouter(t, () => { this._deroulerCurseur(false); this._deroulerPivots(false); });
    ev.ecouter('tactile:appui-long', d => {
      if (this._geo()) {
        const el = this._elementSous(d);
        this.sel.vider();
        if (el) this.sel.ajouter(el);
        this._garderSelection();
      } else {
        const k = this._objetSous(d.x, d.y);
        this.choix = k >= 0 ? [k] : [];
        if (k >= 0) { this.state.actif = k; this.save(); }
      }
      this._rafraichir();
    });
    ev.ecouter('tactile:double-appui', d => {
      if (!this._geo()) {
        // Sur un objet : éditer sa géométrie ; dans le vide : recadrer
        const k = this._objetSous(d.x, d.y);
        if (k < 0) { this._recadrer(); return; }
        // Objet déjà choisi : tous les objets choisis sont édités avec lui ; sinon, lui seul
        if (!this.choix.includes(k)) this.choix = [k];
        this.state.actif = k;
        this._changerEdition('geometrie');
        return;
      }
      if (this._sommetSous(d.x, d.y) < 0 && m.objetSous(d.clientX, d.clientY) !== this.objet) this._recadrer();
    });
    ev.ecouter('tactile:glisser-debut', d => {
      anim.arreter(c);
      anim.arreter(c.cible);
      this._glisse = null;
      // Le glissé commence sur une poignée (ou un sommet ou objet sélectionné = l'origine) : il transforme la sélection
      // Mode Boîte : seules les poignées transforment, un glissé ailleurs trace la boîte
      const boite = this._boiteActive();
      const surChoisi = !boite && (this._geo() ? !this.sel.vide && this._surSelection(d)
        : this.choix.length && this.choix.includes(this._objetSous(d.x, d.y)));
      const prise = this._poigneeSous(d.x, d.y) || (surChoisi ? 'o' : null);
      if (!prise && boite) {
        this._boite = { x0: d.x, y0: d.y, x1: d.x, y1: d.y };
        this._cadreBoite(this._boite);
        return;
      }
      if (prise) {
        this._memoriser();
        const centre = this._centre(), indices = this._indices().slice();
        this._glisse = { prise, x0: d.x, y0: d.y, centre, indices, depart: this._depart(indices), repere: this._repere(centre) };
        if (this.state.mode === 'rotation') {
          this._glisse.pivot = this._pivot();
          this._debutRotation(this._glisse, d.x, d.y);
        } else if (this.state.mode === 'echelle') {
          this._glisse.pivot = this._pivot();
          this._debutEchelle(this._glisse);
        }
        this._habillerPoignee();
      }
    });
    ev.ecouter('tactile:glisser', d => {
      if (this._boite) {
        Object.assign(this._boite, { x1: d.x, y1: d.y });
        this._cadreBoite(this._boite);
        return;
      }
      if (this._glisse) {
        const g = this._glisse;
        if (g.echelle) this._echelonner(d.x, d.y); else if (g.pivot) this._tourner(d.x, d.y); else this._deplacer(d.x, d.y);
        return;
      }
      c.lacet -= d.dx * 0.008;
      c.hauteur = ed_borner(c.hauteur + d.dy * 0.006, -1.5, 1.5);
      this._numerosSales = true;
    });
    ev.ecouter('tactile:glisser-fin', () => {
      if (this._boite) {
        const b = this._boite;
        this._boite = null;
        this._cadreBoite(null);
        if (Math.abs(b.x1 - b.x0) > 2 || Math.abs(b.y1 - b.y0) > 2) this._selectionBoite(b);
        return;
      }
      if (this._glisse) {
        const g = this._glisse;
        this._glisse = null;
        this._habillerPoignee();
        this._sauver();
        this._afficherInfos();
        this._finTransformation(g);
        return;
      }
      this._memoriserVue();
    });
    ev.ecouter('tactile:pincer', d => {
      c.distance = ed_borner(c.distance / d.echelle, 1e-3, 1e5);
      // Mode Boîte : deux doigts tournent autour du modèle (le déplacement de la vue passe à trois doigts)
      if (this._boiteActive()) {
        c.lacet -= d.dx * 0.008;
        c.hauteur = ed_borner(c.hauteur + d.dy * 0.006, -1.5, 1.5);
        this._numerosSales = true;
        return;
      }
      c.lacet -= d.rotation;
      // Deux doigts qui glissent ensemble : la vue se déplace
      const { droite, haut, pixel } = this._repere(c.cible);
      const t = droite.multiplyScalar(-d.dx * pixel).addScaledVector(haut, d.dy * pixel);
      for (let k = 0; k < 3; k++) c.cible[k] += t.getComponent(k);
      this._numerosSales = true;
    });
    ev.ecouter('tactile:pincer-fin', () => this._memoriserVue());
    // Trois doigts qui glissent ensemble : la vue se déplace (tous modes)
    ev.ecouter('tactile:trois', d => {
      const { droite, haut, pixel } = this._repere(c.cible);
      const t = droite.multiplyScalar(-d.dx * pixel).addScaledVector(haut, d.dy * pixel);
      for (let k = 0; k < 3; k++) c.cible[k] += t.getComponent(k);
      this._numerosSales = true;
    });
    ev.ecouter('tactile:trois-fin', () => this._memoriserVue());
  }

  _style() {
    if (document.getElementById('ed-style')) return;
    const st = document.createElement('style');
    st.id = 'ed-style';
    st.textContent = `
      #ctx-editeur{overflow:hidden;background:var(--background-color)}
      .pn-corps .ed-rubrique{margin-top:.8em}
      .ed-couleur{display:flex;align-items:center;gap:.5em;min-height:2.9em;padding:0 .2em;border-bottom:1px solid var(--border-color)}
      .ed-couleur span{flex:1;min-width:0}
      .ed-acces-op{border-bottom:1px solid var(--border-color)}
      .ed-acces-op p{margin:0 0 .7em;padding:0 3.6em 0 2.2em;font-size:.85em;line-height:1.4;color:var(--inactive-color)}
      .ed-acces-choix{display:flex;align-items:center;gap:.6em;padding:0 .2em}
      .ed-acces-nom{flex:1;min-width:0;display:flex;align-items:center;gap:.6em;min-height:2.9em;padding:0;border:0;
        background:none;color:inherit;font:inherit;text-align:left;cursor:pointer}
      .ed-acces-nom b{flex:none;width:1.4em;text-align:center;color:var(--accent-color);font-size:1.15em}
      .ed-acces-nom span{flex:1;min-width:0}
      .ed-acces-nom .ed-chevron{flex:none;width:1.1em;height:1.1em;color:var(--inactive-color);transition:transform .25s}
      .ed-acces-nom[aria-expanded="true"] .ed-chevron{transform:rotate(180deg)}
      @media (prefers-reduced-motion:reduce){.ed-acces-nom .ed-chevron{transition:none}}
      .ed-couleur button{border:0;background:none;color:var(--inactive-color);font-size:1.2em;width:2.2em;height:2.2em;padding:0;
        border-radius:999px;-webkit-tap-highlight-color:transparent}
      .ed-couleur button[hidden]{display:none}
      .ed-couleur input{flex:none;width:3.2em;height:2.2em;padding:0;border:1px solid var(--border-color);border-radius:10px;background:none}
      .ed-couleur input::-webkit-color-swatch-wrapper{padding:0}
      .ed-couleur input::-webkit-color-swatch{border:0;border-radius:9px}
      .ed-couleurs-raz{margin-top:1em;align-self:center;border:0;border-radius:999px;padding:.7em 1.2em;font:inherit;font-size:.9em;
        background:var(--background-color);color:var(--text-color)}
      .ed-vue{position:absolute;inset:0;
        background:radial-gradient(ellipse at 50% 40%,var(--ed-fond-centre) 0%,var(--ed-fond-bord) 70%)}
      .ed-numeros{position:absolute;inset:0;pointer-events:none;overflow:hidden}
      .ed-numeros span{position:absolute;left:0;top:0;margin:-1.9em 0 0 .3em;min-width:1.4em;padding:.05em .3em;
        border-radius:999px;background:var(--ed-numero);color:#fff;font-size:.7em;font-weight:700;text-align:center}
      .ed-numeros span[hidden]{display:none}
      .ed-hud{position:absolute;left:0;right:0;top:0;display:flex;flex-direction:column;align-items:flex-end;gap:.35em;
        padding:calc(env(safe-area-inset-top,0px) + .75em) .8em .4em;pointer-events:none}
      .ed-infos{max-width:min(28em,60%);font-size:.75em;color:var(--inactive-color);background:var(--surface-color);border-radius:999px;
        padding:.3em .8em;box-shadow:0 2px 8px rgba(0,0,0,.12);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
      .ed-infos:empty{display:none}
      .ed-objets-liste{font-size:.85em}
      .ed-set{border-bottom:1px solid var(--border-color);transition:background .15s}
      .ed-set-tete,.ed-obj{display:flex;align-items:center;gap:.15em;padding:0 .2em 0 .2em}
      .ed-set-nom,.ed-obj-nom{flex:1;min-width:0;display:flex;align-items:center;gap:.3em;border:0;background:none;color:var(--text-color);
        padding:.4em .1em;text-align:left;font:inherit;-webkit-tap-highlight-color:transparent}
      .ed-oeil{flex:none;display:flex;align-items:center;justify-content:center;width:2em;align-self:stretch;border:0;background:none;padding:0;
        color:var(--text-color);-webkit-tap-highlight-color:transparent}
      .ed-oeil svg{width:1.15em;height:1.15em;opacity:.75}
      .ed-oeil[aria-pressed="false"]{color:var(--inactive-color)}
      .ed-oeil:disabled{opacity:.35}
      .ed-set-nom{font-weight:700}
      .ed-set-nom span,.ed-obj-nom{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
      .ed-obj-nom{display:block}       /* text-overflow ne s'applique pas au texte d'une boîte flex */
      .ed-set-nom span{min-width:0}
      .ed-set-nom small{flex:none;color:var(--inactive-color);font-weight:400}
      .ed-set-nom .ed-chevron{flex:none;width:1em;height:1em;color:var(--inactive-color);transition:transform .25s}
      .ed-set-nom .ed-chevron.replie{transform:rotate(-90deg)}
      .ed-set-menu{flex:none;align-self:stretch;border:0;background:none;color:var(--inactive-color);font-size:1.2em;padding:0 .4em;line-height:1}
      .ed-obj{padding-left:.9em}
      .ed-obj.choisi{background:color-mix(in srgb,var(--accent-color) 12%,transparent)}
      .ed-obj.actif .ed-obj-nom{color:var(--accent-color);font-weight:700}
      .ed-obj.edite .ed-obj-nom{color:var(--accent-color)}
      .ed-set.eteint .ed-obj,.ed-obj.eteint .ed-obj-nom,.ed-set.eteint .ed-set-nom{opacity:.5}
      .ed-set-vide{padding:0 .8em .4em 2.9em;color:var(--inactive-color);font-size:.85em;font-style:italic}
      .ed-objets-ajout{display:flex;align-items:center;gap:.25em;border:0;border-radius:999px;font:inherit;font-size:.85em;font-weight:700;
        padding:.5em .85em;background:color-mix(in srgb,var(--accent-color) 14%,transparent);color:var(--accent-color);
        white-space:nowrap;-webkit-tap-highlight-color:transparent}
      .ed-objets-ajout b{font-size:1.1em;line-height:1}
      #ctx-editeur .pn-debut{container-type:inline-size}
      @container (max-width:10rem){.ed-objets-ajout span{display:none}.ed-objets-ajout{padding:.5em .65em}}
      .ed-switch{flex:none;position:relative;width:2.1em;height:1.2em;border:0;border-radius:999px;padding:0;background:var(--border-color);
        transition:background .15s;-webkit-tap-highlight-color:transparent}
      .ed-switch i{position:absolute;top:.15em;left:.15em;width:.9em;height:.9em;border-radius:50%;background:#fff;
        box-shadow:0 1px 2px rgba(0,0,0,.25);transition:transform .15s}
      .ed-switch[aria-pressed="true"]{background:var(--accent-color)}
      .ed-switch[aria-pressed="true"] i{transform:translateX(.9em)}
      .ed-switch:disabled{opacity:.4}
      @media (prefers-reduced-motion:reduce){.ed-switch,.ed-switch i,.ed-set-nom .ed-chevron{transition:none}}
      .ed-modifs-vide{margin:.3em .2em;color:var(--inactive-color);font-size:.9em}
      .ed-mat-aide{margin:0 .2em .3em;color:var(--inactive-color);font-size:.85em}
      .ed-mat{display:flex;align-items:center;gap:.6em;width:100%;border:0;border-radius:10px;background:none;color:var(--text-color);
        padding:.5em .4em;font:inherit;font-size:.95em;text-align:left;-webkit-tap-highlight-color:transparent}
      .ed-mat:active{background:var(--background-color)}
      .ed-mat.choisi{background:color-mix(in srgb,var(--accent-color) 7%,transparent)}
      .ed-mat.actif{background:color-mix(in srgb,var(--accent-color) 14%,transparent);font-weight:700}
      .ed-mat i{flex:none;width:1.6em;height:1.6em;border-radius:50%;border:1px solid var(--border-color)}
      .ed-mat span{flex:1;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
      .ed-mat small{flex:none;color:var(--inactive-color);font-weight:400;font-size:.85em}
      .ed-mat-reglages{display:flex;flex-direction:column;gap:.45em;background:var(--background-color);border-radius:12px;
        border-left:3px solid var(--accent-color);padding:.5em .6em;margin-bottom:.5em;font-size:.9em}
      .ed-mat-ligne{display:flex;align-items:center;gap:.5em;min-height:2.2em}
      .ed-mat-ligne>span:first-child{flex:none;width:6.2em;color:var(--inactive-color)}
      .ed-mat-ligne input[type=text]{flex:1;min-width:0;border:1px solid var(--border-color);border-radius:8px;background:var(--surface-color);
        color:var(--text-color);font:inherit;padding:.4em .5em}
      .ed-mat-ligne input[type=color]{flex:none;width:3.2em;height:2.1em;padding:0;border:1px solid var(--border-color);border-radius:10px;background:none}
      .ed-mat-ligne input[type=color]::-webkit-color-swatch-wrapper{padding:0}
      .ed-mat-ligne input[type=color]::-webkit-color-swatch{border:0;border-radius:9px}
      .ed-mat-ligne input:disabled{opacity:.4}
      .ed-mat-ligne>span[data-mtl]::after{content:' · ' attr(data-mtl);font-size:.85em;opacity:.75}
      .ed-mat-ligne input[type=range]{flex:1;min-width:0;accent-color:var(--accent-color)}
      .ed-mat-ligne output{flex:none;min-width:3.2em;text-align:right;font-variant-numeric:tabular-nums}
      .ed-mat-ligne select{flex:1;min-width:0;border:0;border-radius:8px;background:var(--surface-color);color:var(--text-color);font:inherit;padding:.45em}
      .ed-mat-groupe{margin-top:.25em;font-size:.8em;font-weight:700;color:var(--inactive-color);text-transform:uppercase;letter-spacing:.04em}
      .ed-modifs-ajout button:disabled{opacity:.4}
      .pn-corps .ed-modif,.pn-corps .ed-modifs-ajout{font-size:.9em}
      .ed-modif{background:var(--background-color);border-radius:12px;padding:.35em .45em;margin-bottom:.45em;border-left:3px solid var(--accent-color)}
      .ed-modif.eteint{border-left-color:var(--border-color)}
      .ed-modif.eteint .ed-modif-corps{opacity:.5}
      .ed-modif-tete{display:flex;align-items:center;gap:.3em}
      .ed-modif-tete b{flex:1;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
      .ed-modif-tete button:not(.ed-switch){flex:none;border:0;border-radius:8px;background:var(--surface-color);color:var(--text-color);
        padding:.35em .5em;font-size:.9em}
      .ed-modif-tete button:disabled{opacity:.35}
      .ed-modif-corps{display:flex;flex-direction:column;gap:.35em;margin-top:.4em}
      .ed-modif-corps .ed-coords label{background:var(--surface-color);box-shadow:none;font-size:1em;padding:.1em .4em}
      .ed-modif-corps .ed-angle b{background:var(--accent-color);width:auto;padding:0 .3em}
      .ed-modif-choix{display:flex;gap:.25em}
      .ed-modif-choix button{flex:1;border:0;border-radius:8px;background:var(--surface-color);color:var(--text-color);padding:.45em .2em;font-size:.9em}
      .ed-modif-choix button.on{background:var(--accent-color);color:#fff;font-weight:700}
      .ed-modif-cible{display:flex;align-items:center;gap:.5em}
      .ed-modif-cible select{flex:1;min-width:0;border:0;border-radius:8px;background:var(--surface-color);color:var(--text-color);font:inherit;padding:.45em}
      .ed-modif-erreur{margin:0;color:var(--hot-color);font-size:.95em}
      .ed-modifs-ajout{display:flex;gap:.4em}
      .ed-modifs-ajout button{flex:1;border:0;border-radius:10px;background:var(--background-color);color:var(--accent-color);font-weight:700;padding:.6em .3em}
      .ed-set-renommer{display:flex;gap:.4em}
      .ed-set-renommer input{flex:1;min-width:0;border:1px solid var(--border-color);border-radius:10px;background:var(--background-color);
        color:var(--text-color);font:inherit;padding:.5em .6em}
      .ed-set-renommer button{border:0;border-radius:10px;background:var(--accent-color);color:#fff;padding:.5em .8em;font-size:.85em}
      .ed-hud .ed-btn{pointer-events:auto}
      .ed-boutons{display:flex;flex-wrap:wrap;justify-content:flex-end;gap:.4em;max-width:calc(100% - 15.4rem)}
      .ed-pastilles{position:absolute;z-index:1;display:flex;gap:.4rem;top:calc(env(safe-area-inset-top,0px) + .6rem);
        left:calc(env(safe-area-inset-left,0px) + .6rem + 2.75rem + .4rem)}
      /* Panneau de début ouvert : la pastille de navigation est au-dessus de lui, plus de place à lui laisser */
      .pn-avec-debut .ed-pastilles{left:.6rem}
      @media (orientation:portrait){.pn-avec-debut .ed-pastilles{left:calc(env(safe-area-inset-left,0px) + .6rem)}}
      .pn-avec-debut .ed-boutons{max-width:calc(100% - 12.2rem)}
      .ed-pastilles button{width:2.75rem;height:2.75rem;display:flex;align-items:center;justify-content:center;border:0;padding:0;
        border-radius:22px;background:var(--navbar-footer-color);color:var(--accent-color);box-shadow:0 3px 14px rgba(20,18,31,.16);
        -webkit-tap-highlight-color:transparent}
      .ed-pastilles button:active{transform:scale(.95)}
      .ed-pastilles button.on{background:var(--accent-color);color:#fff}
      .ed-pastilles .ui-pic{width:26px;height:26px}
      .ed-grille.ed-deux{grid-template-columns:repeat(2,1fr)}
      .ed-menu-resume{margin:0 0 .2em;font-size:.8em;color:var(--inactive-color);text-align:left}
      .ed-gauche{position:absolute;top:var(--nav-reserve);left:calc(env(safe-area-inset-left,0px) + .6em);display:flex;flex-direction:column;
        align-items:flex-start;gap:.4em;font-size:.8em;z-index:1}
      .ed-outils{display:flex;align-items:center;gap:.3em;padding:.25em;border-radius:999px;background:var(--surface-color);
        box-shadow:0 2px 8px rgba(0,0,0,.12)}
      .ed-outils button{border:0;background:none;color:var(--text-color);border-radius:999px;padding:.4em .65em;
        display:flex;align-items:center;gap:.2em;-webkit-tap-highlight-color:transparent}
      .ed-outils button[hidden]{display:none}
      .ed-outils .ui-pic,.ed-outils .ed-pic-svg{width:1.45em;height:1.45em}
      .ed-editions{display:flex;padding:.25em;gap:.15em;border-radius:999px;background:var(--surface-color);box-shadow:0 2px 8px rgba(0,0,0,.12)}
      .ed-editions button{display:flex;align-items:center;gap:.4em;border:0;background:none;color:var(--text-color);border-radius:999px;
        padding:.4em .8em .4em .6em;font-size:1em;-webkit-tap-highlight-color:transparent}
      .ed-editions .ui-pic{width:1.45em;height:1.45em}
      .ed-editions .ed-rendu{padding:.4em .45em .4em .55em;gap:.3em;margin-right:.1em;color:var(--accent-color);
        background:color-mix(in srgb,var(--accent-color) 14%,transparent)}
      .ed-tri{position:relative;width:.5em;height:calc(.5em + (var(--n,3) - 1) * .475em);border-radius:999px;background:var(--border-color);flex:none}
      .ed-tri i{position:absolute;left:.075em;top:calc(.075em + var(--p,0) * .475em);width:.35em;height:.35em;border-radius:50%;
        background:var(--accent-color);transition:top .15s}
      .ed-editions button.on{background:var(--accent-color);color:#fff;font-weight:700}
      .ed-filtres{display:flex;gap:.1em;border-left:1px solid var(--border-color);margin-left:.15em;padding-left:.25em}
      .ed-filtres[hidden]{display:none}
      .ed-editions .ed-filtres button{padding:.4em .5em}
      .ed-ligne[hidden],.ed-btn[hidden]{display:none}
      .ed-mode{display:flex;border-radius:999px;background:var(--background-color)}
      .ed-selection{display:flex;align-items:center;gap:.1em;border-right:1px solid var(--border-color);padding-right:.2em;margin-right:.1em}
      .ed-outils .ed-rendu{display:flex;align-items:center;gap:.3em;padding:.4em .45em .4em .55em;border-radius:999px;color:var(--accent-color);
        background:color-mix(in srgb,var(--accent-color) 14%,transparent)}
      .ed-outils .ed-rendu .ui-pic{width:1.45em;height:1.45em}
      .ed-boite-sens{font-weight:700;min-width:2em;color:var(--accent-color)}
      .ed-boite-sens[hidden]{display:none}
      .ed-cadre{position:absolute;border:2px dashed var(--accent-color);background:color-mix(in srgb,var(--accent-color) 12%,transparent);border-radius:2px}
      .ed-cadre.retire{border-color:var(--hot-color);background:color-mix(in srgb,var(--hot-color) 12%,transparent)}
      .ed-cadre[hidden]{display:none}
      .ed-mode button.on{background:var(--accent-color);color:#fff}
      .ed-axes{display:flex;border-left:1px solid var(--border-color);border-right:1px solid var(--border-color);padding:0 .15em}
      .ed-axes button{font-weight:700;padding:.4em .55em}
      .ed-axes .ed-x{color:var(--ed-axe-x)}.ed-axes .ed-y{color:var(--ed-axe-y)}.ed-axes .ed-z{color:var(--ed-axe-z)}
      .ed-axes button.on{color:#fff}.ed-axes .ed-x.on{background:var(--ed-axe-x)}.ed-axes .ed-y.on{background:var(--ed-axe-y)}.ed-axes .ed-z.on{background:var(--ed-axe-z)}
      .ed-outils .ed-pas.on{background:color-mix(in srgb,var(--accent-color) 20%,transparent);color:var(--accent-color)}
      .ed-pivot{color:var(--accent-color)!important}
      .ed-pivot .ed-chevron{width:1.1em;height:1.1em;color:var(--inactive-color);transition:transform .25s}
      .ed-pivot[aria-expanded="true"] .ed-chevron{transform:rotate(180deg)}
      .ed-pic-svg{background:none!important}.ed-pic-svg svg{width:100%;height:100%;display:block}
      .ed-pivots{display:none;flex-direction:column;background:var(--surface-color);border-radius:16px;box-shadow:0 2px 10px rgba(0,0,0,.15);
        overflow:hidden;min-width:14em}
      .ed-pivots.ouvert{display:flex}
      .ed-pivots .ed-rubrique{margin:.6em .9em .4em}
      .ed-pivots .ed-curseur-action.on{color:var(--accent-color);font-weight:700}
      .ed-contexte{position:fixed;z-index:40;display:flex;flex-direction:column;background:var(--surface-color);border-radius:14px;
        box-shadow:0 4px 16px rgba(0,0,0,.2);overflow:hidden;min-width:11em;max-width:calc(100vw - 16px);max-height:60vh;overflow-y:auto;font-size:.85em}
      .ed-contexte .ed-rubrique{margin:.6em .9em .4em}
      .ed-contexte .ed-curseur-action{overflow:hidden;text-overflow:ellipsis}
      .ed-contexte .ed-curseur-action.on{color:var(--accent-color);font-weight:700;opacity:1}
      .ed-contexte-nouveau{color:var(--accent-color)!important}
      .ed-curseur{pointer-events:auto;background:var(--surface-color);border-radius:18px;box-shadow:0 2px 8px rgba(0,0,0,.12);
        overflow:hidden;max-width:100%;font-size:.8em}
      .ed-curseur-ligne{display:flex;align-items:center;gap:.3em;padding:.3em .4em .3em .3em}
      .ed-curseur-tete{flex:none;display:flex;align-items:center;border:0;border-radius:999px;background:none;color:var(--text-color);
        padding:.3em;-webkit-tap-highlight-color:transparent}
      .ed-curseur.ouvert .ed-curseur-tete{background:var(--background-color)}
      .ed-curseur-ligne input{width:6.5em;min-width:0;box-sizing:border-box;border:2px solid;border-radius:8px;background:var(--background-color);
        color:var(--text-color);font:inherit;padding:.3em .35em;text-align:right}
      .ed-curseur-ligne input.ed-x{border-color:var(--ed-axe-x)}.ed-curseur-ligne input.ed-y{border-color:var(--ed-axe-y)}.ed-curseur-ligne input.ed-z{border-color:var(--ed-axe-z)}
      .ed-curseur-ligne input:focus{outline:none;box-shadow:0 0 0 2px color-mix(in srgb,var(--accent-color) 35%,transparent)}
      .ed-curseur-tete svg{width:1.35em;height:1.35em;color:var(--hot-color)}
      .ed-curseur-liste{max-height:0;overflow:hidden;transition:max-height .25s ease-out}
      .ed-curseur.ouvert .ed-curseur-liste{max-height:24em}
      .ed-curseur-action{display:flex;align-items:center;gap:.6em;width:100%;border:0;border-top:1px solid var(--border-color);
        background:none;color:var(--text-color);padding:.6em .8em;text-align:left;white-space:nowrap;-webkit-tap-highlight-color:transparent}
      .ed-curseur-action:active{background:var(--background-color)}
      .ed-curseur-action .ui-pic{width:1.3em;height:1.3em;color:var(--accent-color)}
      @media (prefers-reduced-motion:reduce){.ed-curseur-liste{transition:none}}
      .ed-aide{display:flex;flex-direction:column;text-align:left;font-size:.85em;line-height:1.4}
      .ed-aide details{border-bottom:1px solid var(--border-color)}
      .ed-aide summary{display:flex;align-items:center;gap:.6em;min-height:2.8em;padding:.2em .1em;list-style:none;
        font-weight:700;color:var(--text-color);cursor:pointer;-webkit-tap-highlight-color:transparent}
      .ed-aide summary::-webkit-details-marker{display:none}
      .ed-aide summary span{flex:1;min-width:0}
      .ed-aide .ed-chevron{flex:none;width:1.1em;height:1.1em;color:var(--inactive-color);transition:transform .25s}
      .ed-aide details[open] .ed-chevron{transform:rotate(180deg)}
      .ed-aide p{margin:0 0 .7em;padding-right:1.7em;color:var(--inactive-color)}
      @media (prefers-reduced-motion:reduce){.ed-aide .ed-chevron{transition:none}}
      .ed-bas{position:absolute;left:0;right:0;bottom:0;display:flex;flex-direction:column;gap:.45em;padding:0 .6em max(.8em, env(safe-area-inset-bottom, 0px))}
      .ed-ligne{display:flex;gap:.4em;align-items:center;overflow-x:auto;scrollbar-width:none;padding:2px}
      .ed-ligne::-webkit-scrollbar{display:none}
      .ed-btn{flex:none;border:0;border-radius:999px;padding:.5em .85em;font-size:.8em;background:var(--surface-color);color:var(--text-color);
        box-shadow:0 2px 8px rgba(0,0,0,.12);-webkit-tap-highlight-color:transparent;white-space:nowrap}
      .ed-btn.on{background:var(--accent-color);color:#fff}
      .ed-menu{display:flex;align-items:center;gap:.35em;padding:.4em .85em .4em .6em}
      .ed-menu .ui-pic{width:1.5em;height:1.5em;color:var(--accent-color)}
      .ed-menu.on .ui-pic{color:#fff}
      .ed-btn:disabled{opacity:.4}
      .ed-btn:active{transform:scale(.97)}
      .ed-actions .ed-btn{border-radius:12px;display:flex;flex-direction:column;align-items:center;gap:.1em;padding:.4em .6em;min-width:4.2em}
      .ed-actions .ed-btn b{font-size:1.25em;line-height:1.1;color:var(--accent-color)}
      .ed-acces{overflow:visible;padding:0}
      .ed-acces-ops{flex:1;min-width:0;display:flex;align-items:center;gap:.4em;overflow-x:auto;scrollbar-width:none;padding:2px 2px 6px}
      .ed-acces-ops::-webkit-scrollbar{display:none}
      .ed-acces-ops.deborde{-webkit-mask-image:linear-gradient(to right,#000 calc(100% - 3em),transparent);
        mask-image:linear-gradient(to right,#000 calc(100% - 3em),transparent)}
      .ed-acces-sep{flex:none;width:1px;align-self:stretch;margin:.35em .15em;background:var(--border-color)}
      .ed-acces-hist{flex:none;display:flex;gap:.4em;margin-left:auto;padding:2px 2px 6px}
      .ed-coords{display:flex;gap:.4em}
      .ed-coords.vide{visibility:hidden}
      .ed-coords label{flex:1;display:flex;align-items:center;gap:.3em;background:var(--surface-color);border-radius:10px;padding:.2em .5em;
        font-size:.8em;font-weight:700;box-shadow:0 2px 8px rgba(0,0,0,.1);min-width:0}
      .ed-coords label b{flex:none;display:flex;align-items:center;justify-content:center;width:1.55em;height:1.55em;border-radius:7px;
        color:#fff;font-size:.9em}
      .ed-coords .ed-x b{background:var(--ed-axe-x)}.ed-coords .ed-y b{background:var(--ed-axe-y)}.ed-coords .ed-z b{background:var(--ed-axe-z)}
      .ed-coords-sel{flex-direction:column;gap:.3em;width:10em}
      .ed-coords[hidden]{display:none}
      .ed-transfo{display:flex;gap:.4em;align-items:flex-start}
      .ed-coords-titre{display:none;align-self:flex-start;padding:.15em .55em;border-radius:8px;background:var(--surface-color);
        font-size:.72em;font-weight:700;color:var(--inactive-color);box-shadow:0 2px 8px rgba(0,0,0,.1)}
      .ed-transfo.complet .ed-coords-titre{display:block}
      .ed-transfo.complet .ed-coords-sel{width:8.6em}
      .ed-ajuster{width:10em;box-sizing:border-box;background:var(--surface-color);border-radius:12px;padding:.4em;
        box-shadow:0 2px 10px rgba(0,0,0,.15);border-left:3px solid var(--accent-color)}
      .ed-ajuster[hidden]{display:none}
      .ed-ajuster-tete{display:flex;align-items:center;justify-content:space-between;margin:0 0 .35em .2em}
      .ed-ajuster-tete b{font-size:.95em;color:var(--text-color)}
      .ed-ajuster-tete button{border:0;background:none;color:var(--inactive-color);padding:.1em .4em;font-size:1em}
      .ed-ajuster .ed-coords{flex-direction:column;gap:.3em}
      .ed-ajuster label{flex:none;background:var(--background-color);box-shadow:none;padding:.1em .4em;font-size:1em}
      .ed-ajuster label b{width:auto;min-width:1.55em;padding:0 .25em;box-sizing:border-box}
      .ed-ajuster .ed-angle b,.ed-reglages-pas label b{background:var(--accent-color)}
      .ed-reglages-pas{width:12em}
      .ed-ajuster .ed-coupes b{background:var(--accent-color);width:auto;padding:0 .3em}
      .ed-ajuster-rubrique{font-size:.8em;color:var(--inactive-color);margin:.2em 0 0 .2em}
      .ed-ajuster-axes{display:flex;gap:.2em}
      .ed-ajuster-axes button{flex:1;border:0;border-radius:7px;padding:.35em 0;font-weight:700;font-size:.9em;background:var(--background-color);
        color:var(--text-color)}
      .ed-ajuster-axes .ed-x{color:var(--ed-axe-x)}.ed-ajuster-axes .ed-y{color:var(--ed-axe-y)}.ed-ajuster-axes .ed-z{color:var(--ed-axe-z)}
      .ed-ajuster-axes button.on{color:#fff;background:var(--accent-color)}
      .ed-ajuster-axes button:disabled{opacity:.4}
      .ed-boucle-options{flex-direction:column}
      .ed-glissement{width:100%;margin:.2em 0;accent-color:var(--accent-color);min-height:2.2em}
      .ed-ajuster-axes .ed-x.on{background:var(--ed-axe-x)}.ed-ajuster-axes .ed-y.on{background:var(--ed-axe-y)}.ed-ajuster-axes .ed-z.on{background:var(--ed-axe-z)}
      .ed-coords-sel label{flex:none;padding:.15em .4em;font-size:1em}
      .ed-coords input{flex:1;min-width:0;width:100%;border:0;background:none;font:inherit;font-weight:400;color:var(--text-color);padding:.3em 0}
      .ed-fond{position:absolute;inset:0;background:rgba(0,0,0,.35);display:flex;align-items:center;justify-content:center;padding:1em;z-index:2}
      .ed-fond[hidden]{display:none}
      .ed-carte{background:var(--surface-color);border-radius:var(--radius);padding:1.1em;width:100%;max-width:24em;max-height:100%;
        overflow:auto;text-align:center}
      .ed-carte>b{display:block;margin-bottom:.6em}
      .ed-rubrique{display:block;text-align:left;font-size:.8em;color:var(--inactive-color);margin:.6em 0 .35em}
      .ed-grille{display:grid;grid-template-columns:repeat(3,1fr);gap:.4em}
      .ed-grille.ed-une{grid-template-columns:1fr}
      .ed-grille button{border:0;border-radius:10px;background:var(--background-color);color:var(--text-color);padding:.65em .3em;font-size:.8em;
        overflow:hidden;text-overflow:ellipsis}
      .ed-grille button:disabled{opacity:.4}
      .ed-prim-champ{display:flex;align-items:center;gap:.5em;border:1px solid var(--border-color);border-radius:10px;
        background:var(--background-color);padding:0 .6em;margin-bottom:.4em;text-align:left}
      .ed-prim-champ.faux{border-color:var(--hot-color)}
      .ed-prim-champ span{font-weight:700;min-width:1.2em;font-size:.9em}
      .ed-prim-champ input{text-align:right}
      .ed-prim-choix{display:flex;gap:.3em;margin-bottom:.4em}
      .ed-prim-choix button{flex:1;border:0;border-radius:10px;background:var(--background-color);color:var(--text-color);padding:.65em .3em;font-size:.85em}
      .ed-prim-choix.ed-prim-grille{display:grid;grid-template-columns:repeat(6,1fr)}
      .ed-prim-info{margin:.5em 0 0;font-size:.8em;color:var(--inactive-color);text-align:left}
      .ed-prim-info.faux{color:var(--hot-color)}
      .ed-prim-choix button.on{background:var(--accent-color);color:#fff;font-weight:700}
      .ed-prim-champ .ed-x{color:var(--ed-axe-x)}.ed-prim-champ .ed-y{color:var(--ed-axe-y)}.ed-prim-champ .ed-z{color:var(--ed-axe-z)}
      .ed-prim-champ input{flex:1;min-width:0;border:0;background:none;font:inherit;color:var(--text-color);padding:.6em 0}
      .ed-prim-actions{display:flex;justify-content:flex-end;align-items:center;gap:.4em;margin-top:.8em;position:sticky;bottom:-1em;
        background:var(--surface-color);padding:.5em 0 1em}
      .ed-prim [hidden]{display:none}
      .ed-prim-detail{display:block;width:100%;margin-top:.8em;border:0;border-radius:10px;background:var(--background-color);
        color:var(--accent-color);font-weight:700;text-align:left;padding:.65em .7em}
      .ed-prim-actions .ed-non{padding:.6em 1em}
      .ed-prim-ok{border:0;border-radius:10px;background:var(--accent-color);color:#fff;padding:.6em 1.4em;font-weight:700}
      .ed-prim-ok:disabled{opacity:.4}
      .ed-non{border:0;background:none;color:var(--inactive-color);padding:.7em 1em .2em}
    `;
    document.head.appendChild(st);
  }
}

window.EditeurContext = EditeurContext;
