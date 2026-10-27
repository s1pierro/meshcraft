# MeshCraft — modeleur 3D tactile

PWA Android pour **tablette** (13 pouces, paysage de préférence ; le portrait doit rester utilisable), en JavaScript natif.
Projet : un **modeleur de maillages 3D « à l'ancienne »** (facettes, faces polygonales), rendu par **three.js** (WebGL),
avec ses propres modules dans `moteur/`. Isolé du projet GDA (moteur et éditeur de jeux) pour être publié sur GitHub
(`README.md`). Pièces d'échecs reprises d'echiquierJS (https://github.com/s1pierro/echiquierJS), modèles d'essai.

## Moteur (`moteur/`, chargé dans cet ordre, après `lib/three.min.js`)
three.js **r159** copié dans `lib/three.min.js` : dernière version livrée en script classique (variable globale
`THREE`) ; les versions suivantes n'existent qu'en modules ES, interdits ici. Ne pas utiliser les « addons »
(`examples/jsm`, modules ES) : écrire l'équivalent dans le moteur.
`modeles.js` `Modeles` (OBJ ou STL → BufferGeometry à facettes, un groupe par matériau `usemtl` dans
`geo.userData.materiaux` ; STL : Z vers le haut converti en Y ; `contour()` coque inversée ; `paliers(n, ombre)` pour MeshToonMaterial, `ombre` = ton du palier le plus sombre ; `damier()`) ·
`maillage.js` `Maillage` (primitives centrées sur l'origine, axe Y, faces vers l'extérieur : `boite(lx, ly, lz)`, `cube(c)`, `cone(r1, r2, h, n, fermeture)` (r2 = 0 : pointe ; fermeture 'polygone' | 'eventail'), `cylindre(r, h, n, fermeture)`, `sphereUV(r, segments, anneaux)`, `icosphere(r, subdivisions)` ; maillage éditable : `sommets` [[x,y,z]], `faces` [{ s: [i,j,k…], m }], `fils` [[i, j]] arêtes libres (sans face :
lignes « l » de l'OBJ, `l` des données, comprises dans `aretes()` ; ignorées par STL, glTF et Manifold ;
`nettoyerFils()`) ; lecture OBJ / STL /
glTF-GLB via `depuisFichier(nom, contenu)`, écriture `versOBJ(nom, mtllib)` / `versSTL()` / `versGLB(nom, couleurs)` / `Maillage.versMTL(materiaux)` / `Maillage.depuisMTL(texte)` (champs `Maillage.MTL`) ; `parMateriau()` (un maillage par matériau) ; `geometrie()` ; `trianguler(face)` (oreilles, concaves comprises) ; `contourFaces(faces)` (contour orienté de faces connexes à fusionner) ; `dissolution(aretes)` (groupes de faces à réunir autour d'arêtes) ; `connexe(depart)` (sommets et faces reliés de proche en proche) ; `chemin(t, depart, arrivee)` (plus court chemin,
Dijkstra : sommets le long des arêtes, arêtes par leurs extrémités, faces par les arêtes communes) ; `subdiviser(aretes, coupes)` ; `anneau(i, j)` (anneau
d'arêtes de quadrilatère en quadrilatère, boucle de coupe) et `couperBoucle(anneau, coupes, glissement, uniforme,
inverser)` ; `fusionner(indices, cible)` ('centre' | 'premier' | 'dernier'), `reunir(groupes)` (chaque groupe à sa position moyenne), `fusionnerProches(indices, tolerance, groupe)` (sommets confondus, de proche en proche, grille) et `supprimerSommets(indices)` renvoient la table ancien → nouveau indice ; `revolution(sommets, aretes, { centre, axe, angle, segments, fermer, materiau })` (sommets seuls → arcs d'arêtes libres, arêtes → bandes de faces orientées, sommets sur l'axe non recopiés, `fermer` : tour complet soudé) ; `objetsDepuisOBJ()` un objet par « o » ; les lecteurs
de `Modeles` passent par lui) ·
`visserie.js` `Visserie` (visserie métrique ISO en `Maillage` fermés, 1 unité = 1 mm, axe Y : `vis({ taille, tete
('hexagonale' | 'cylindrique' | 'fraisee'), longueur, filetage ('total' | 'partiel'), segments, rangs })`, `ecrou`,
`rondelle`, `tige` ; filet réel en hélice à droite échantillonné par anneaux plans (ou `methode:
'soustraction'` : corps lisse chanfreiné moins l'outil de coupe `outil(P, n, y0, y1, sortie)` d'un seul tenant — profil
du creux incliné de l'angle d'hélice au diamètre moyen, recopié n fois par tour ; vis : sortie de filet sur le dernier
tour ; écrou : prisme chanfreiné moins une tige filetée ainsi — par Manifold, à charger avant) (`segments` par tour, multiple de 6,
`rangs` par pas) ; cotes `Visserie.TAILLES` M2 à M24 ; `detail: true` : d, p, profondeur, sommet, gorge, filetee, lisse (écrou : hauteur, plats ; rondelle : interieur, exterieur, epaisseur), `parametres(piece, o)`, `probleme(piece, o)` ; pièce = suite d'anneaux le long du profil, `construire(anneaux,
n, cyclique)`) ·
`selection.js` `SelectionMaillage` (sélection typée d'un `Maillage` : `sommets` ordonnés, `aretes` [i, j] avec i < j,
`faces` par référence ; `basculer({ t: 's'|'a'|'f', … })`, `sommetsImpliques()`, `renumeroter(table)` puis
`nettoyer(maillage)` après une opération ; `versDonnees` / `donnees` → { s, a, f } ; « Selection » est pris par le
navigateur) ·
`booleens.js` `Booleens` (union / différence / intersection de deux `Maillage` fermés par Manifold, WASM chargé à la
première demande par `charger()` ; triangles d'une même face d'origine regroupés en polygones convexes) ·
`evenements.js` `Evenements` (bus « module:action », émission différée, minuteurs en temps de jeu) ·
`tactile.js` `Tactile` (Pointer Events → `tactile:appui`, `glisser`, `pincer`, `trois` (trois doigts)…) · `animation.js` `Animations`
(interpolations de propriétés numériques — `mesh.position`, `mesh.scale`… — et comportements continus, `Assouplir`) ·
`sons.js` `Sons` (effets sonores Web Audio : `charger({ nom: url })`, `jouer(nom, { volume, vitesse, delai })`,
contexte audio partagé réveillé au premier toucher ; `moteur.sons`) ·
`moteur.js` `Moteur` (renderer, `scene`, `camera`, `soleil` + `ciel`, `orbiter()`, `placerSoleil()`,
`objetSous()` qui ignore `userData.selectionnable = false`, `couleur('--var')` pour les couleurs du thème,
`pixelise`, boucle de jeu ; `continu: false` = rendu à la demande, `moteur.redessiner()`).
Les objets de la scène sont des objets three.js ordinaires ; données de jeu dans `userData`.
Modèles 3D : `modeles/` (OBJ / STL chargés par `Modeles.charger`, à lister dans `SHELL`). Sons : `sons/` (à lister dans `SHELL`). Bibliothèques copiées : `lib/`
(three.js, MIT ; Manifold 3.3.2, Apache 2.0 :
`manifold.js` converti en script classique — `import.meta.url` et `export default` remplacés, voir son en-tête — et
`manifold.wasm`).
Identifiants du moteur en français. Exemple d'utilisation : `ctx-editeur.js`.
Test hors navigateur possible dans Node avec un DOM simulé et un faux `WebGLRenderer` (aucun navigateur dans Termux).

## Contexte de développement
- Le développeur travaille sur tablette Android de 13 pouces (Termux), sans clavier de bureau : ne pas proposer de
  raccourcis clavier ni d'outils qui supposent un ordinateur. Préférer des solutions testables dans le navigateur
  de la tablette. L'application vise ce grand écran tactile, en paysage surtout : profiter de la place (panneaux
  latéraux, colonnes, aperçus) tout en gardant des cibles au doigt.
- Interface, textes et commentaires **en français** (typographie française : espaces avant « : ; ? ! », guillemets « »).

## Règles du projet
- **Aucune étape de build** : pas de bundler, pas de npm, pas de framework, pas de modules ES. Des scripts classiques
  chargés dans l'ordre par `index.html`, qui exposent leurs classes sur `window`.
- **Publier une version** : incrémenter `version` dans `app.config.js` (lu par la page ET par le service worker).
  À faire à chaque livraison, sinon les appareils gardent l'ancien cache.
  Le serveur (`../../secureserver.js`, `express.static`) reconnaît un fichier à sa taille et à sa date de
  modification (ETag) : `app.config.js` garde la même taille d'une version à l'autre, et sur ce stockage une
  édition (`sed -i` notamment) peut laisser sa date inchangée → réponse 304, version jamais vue par les appareils.
  Après l'incrément : `touch app.config.js` et vérifier la date avec `stat`.
- **Nouveau fichier** : l'ajouter à `index.html` (avant `app.js`) **et** à la liste `SHELL` de `service-worker.js`.
- **Stockage** : passer par `app.saveToLocal(clé, valeur)` / `app.loadFromLocal(clé)` ou `localStorage` ;
  le préfixe `meshcraft:` est ajouté automatiquement par `storage-ns.js` (ne jamais l'écrire à la main).
- **Écrans** : un onglet ou une page = une classe qui étend `Context` (voir `contexts.js`) :
  `build(el)` une seule fois, `onShow()` / `onHide()` à chaque affichage, état persistant dans `this.state`
  (`defaultState()`, puis `this.save()`). Onglets : `initContexts()` + tableau `TABS` dans `app.js`.
  Pages superposées : `register(…, { overlay: true })`, `app.contexts.open(id)` / `app.contexts.back()`.
- **Navigation** : menu déroulant flottant en haut à gauche (`buildNavDock()` dans `app.js`) ; au repos il affiche
  l'icône et le nom du contexte courant, qui tiennent lieu de titre : un écran n'affiche pas son propre titre et
  laisse libre le coin supérieur gauche (`var(--nav-reserve)` = hauteur de la pastille, zone sûre comprise).
  Un contexte qui a besoin de place déclare `get navMini() { return true; }` : la pastille n'affiche alors au repos
  que l'icône (classe `nd-mini`, environ 3,6rem de large) ; nom et chevron reviennent quand on la déroule.
  Plus de barre en bas : les barres d'outils posées en bas utilisent `max(.8em, env(safe-area-inset-bottom))`.
- **Styles** : couleurs et rayons via les variables de `css/app.css` (`--accent-color`, `--hot-color`…), jamais
  de couleur d'identité codée en dur. Le style propre à un écran est injecté une fois par son contexte
  (`<style id="xx-style">`) avec des classes préfixées (`gl-`, `gd-`…).
- **Écran d'accueil PWA** (`pwa.js` + `css/pwa.css`) : état, Démarrer en plein écran / dans le navigateur,
  installation, mise à jour, réinitialisation. Ne pas contourner : la mise à jour n'est appliquée que sur demande
  (`SKIP_WAITING`). Lignes d'état supplémentaires : `PWA.addRow(async () => ({ k, v, s }))`.
- Mise en page : tablette, paysage et portrait (les deux orientations, `"orientation": "any"` dans le manifeste),
  rester utilisable sur téléphone ; zones sûres (`env(safe-area-inset-*)`), hauteur réelle via `--app-h`.
- Pas de dépendance externe sans nécessité ; si une bibliothèque CDN est utile, version figée dans l'URL
  (elle est mise en cache par le service worker, voir `LIB_HOSTS`).

## Vérifier
- Syntaxe : `node --check <fichier>.js` sur chaque fichier modifié.
- Secours navigateur : `?reset` (vide service worker + caches), `?eruda` (console de débogage mobile).

## Fichiers
`app.config.js` identité/version · `index.html` coquille · `service-worker.js` cache hors ligne ·
`storage-ns.js` préfixe des données · `pwa.js` écran d'accueil · `contexts.js` contextes, en-tête à vague, `uiSvg` ·
`app.js` menu de navigation et stockage · `pave.js` `PaveNumerique` (pavé numérique flottant et déplaçable, instance `window.pave` : s'ouvre seul à l'appui
sur tout champ `inputMode` « decimal » / « numeric » à la place du clavier du système (`inputMode` « none » posé à
l'appui ; Android l'ignore sur type « number » : champs numériques en type « text » + inputMode, le module convertit sinon) ; calcul + − × ÷ ( ) ; OK / Suivant écrivent la valeur et émettent `input` puis `change`, un appui ailleurs
annule ; Suivant parcourt le groupe `[data-pave-groupe]` ; exclure un champ : `data-pave="non"` ; ⌨ rend le
clavier ; réglage dans l'onglet Réglages) · `panneau.js` `PanneauOnglets` (panneau latéral à onglets réutilisable : un contenu à la fois, à droite en paysage, en bas en portrait, ou sur le bord opposé avec `cote: 'debut'` ; un panneau de chaque côté possible ; l'espace de travail du contexte se réduit ; frontière réglable au doigt ; plutôt qu'une carte modale pour un contenu consulté en travaillant) · `moteur/` moteur 3D · `lib/` bibliothèques copiées · `ctx-*.js` écrans (`ctx-reglages.js` : plein écran, pavé, installation, version ; `ctx-editeur.js` : éditeur de scène à plusieurs objets rangés en sets (chacun : position, rotation en quaternion et échelle propre `echelle` selon ses axes, matrice T·R·S `_matrice`, projet `.gda` au format 2 ; en Scène, un seul objet choisi : colonnes Rotation (degrés, ordre XYZ, angles saisis gardés `_euler`) et Dimensions (boîte du maillage modifié selon ses axes × échelle, facteur déduit de la saisie) à côté de Position ; poignée d'échelle en Scène : objet tourné de quarts de tour → son échelle, de biais → son maillage, `ed_axesAlignes` ; Objets → Appliquer l'échelle), primitives (Scène → Ajouter, mode Scène seulement : formulaire dans le panneau latéral de fin, contenu 'ajout' (`_ajoutPrimitive(type)`, `_formulairePrimitive`), aperçu `_apercu(mm)` sur le curseur 3D (groupe hors des objets, jamais touché ni enregistré) mis à jour à chaque changement validé ; fermer le panneau ou changer de mode abandonne ; table `ED_PRIMITIVES` — champs (`si(v)` : affiché ou non, `interrupteur` : booléen dépliant), `creer(v)` → `Maillage`, `remplir(v, cle)`, `verifier(v)` ; derniers réglages dans `state.primitives` ; champs nombre, entier borné ou `choix` ; cube, cylindre, cône, sphère UV, icosphère ; fermeture des bases polygone / éventail ; rubrique Visserie : vis, écrou, rondelle, tige filetée, `nom` et `verifier` (cotes, sommets, `ED_VIS_MAX`), Paramètres détaillés repris de la taille par `remplir` (impression 3D) ; Méthode du filet Soustraction (par défaut) /
Anneaux (`booleens(v)` : Manifold chargé avant l'aperçu, calcul différé, maillage de l'aperçu repris par Ajouter)), modes de sélection (`ED_SELECTIONS`, interrupteur en tête de la barre d'outils, `state.selection`) : Toucher, Boîte
(un doigt trace le rectangle, ＋ / − ajoute ou retire, `_selectionBoite` ; sans Rayons X seulement le visible, tampon
de profondeur logiciel `ed_profondeurs` ; deux doigts tournent la vue, trois la déplacent dans tous les modes),
Chemin (mode Géométrie : plus court chemin de l'élément actif à l'élément touché du même type, `_cheminVers`),
opérations de géométrie réglées dans le même panneau d'ajout (`ED_OPERATIONS` : `essayer(ed, v)` rejoue l'opération sur l'état d'avant mémorisé, `_ouvrirOperation(type)`, `_annulerOperation` ; aperçu = le maillage même ; Appliquer valide, fermer / ↶ / changer de mode abandonne, toute autre modification valide) : Révolution autour d'un axe passant par le curseur 3D (`_revolution` ; arête dont les deux extrémités sont sélectionnées = profil), Fusionner les confondus à une tolérance (`_fusionProches`, sélection ou tout le maillage, objet par objet), modes Scène et Géométrie (Arêtes → Créer une arête, deux sommets exactement : face commune coupée en deux, sinon
arête libre, `_creerArete` ; Arêtes → Supprimer, avec leurs faces ; Arêtes → Boucle de coupe depuis l'arête active, `_boucleCoupe`, réglée
dans le panneau « dernière opération » : coupes, glissement par réglette ou champ, Uniforme, Inverser), modifieurs répétition et booléen, un matériau par objet (bibliothèque `this.materiaux` du projet : les réglages du format .mtl, `Maillage.MTL` — Kd, Ka, Ks, Ke, Ns, d, Ni, illum, textures exceptées ; import / export .mtl ; l'éclairage en paliers relèvera peut-être des paramètres de rendu du moteur, l'éditeur n'en utilise dans aucun rendu (faces en Lambert à facettes) ; panneau Matériaux en mode Scène ; un import à plusieurs matériaux est coupé en un objet par matériau), interrupteur de rendu Solide / Rayons X / En jeu (un appui = rendu suivant ; Rayons X en Géométrie seulement, En jeu en Scène seulement, retour en Solide au changement de mode, `_rendu()` ; en Scène, objets choisis cernés de leur silhouette, nuanceur `mat.silhouette` + `ed_silhouette(mm)`, les autres sans fil ; Solide et Rayons X éclairés par une lampe attachée à la caméra, `ED_LAMPE`, En jeu par le soleil fixe `ED_SOLEIL`) en tête de la boîte Scène / Géométrie, menus du haut et barre d'accès rapide du bas tirés d'une même table `_operations(id)` (item : `{ libelle, action, off, barre: { groupe, glyphe, court, defaut }, aide }` ; `aide` = description fixe de l'opération, source unique des rubriques « Menu … » de l'aide (générées par `_aide()`, qui ne garde à la main que les gestes et l'interface) et du chevron ⌄ de Réglages › Barre rapide : toute nouvelle opération y reçoit sa description ; `_acces()` choisit les opérations disponibles selon la sélection et l'élément actif, groupes `ED_ACCES` ; chaque opération peut être retirée ou ajoutée dans Réglages › Barre rapide, `state.acces` ; ↶ ↷ collés à droite), liste des objets dans un panneau latéral de début (gauche / haut, pastille Objets), Fichier / Aide / Réglages / Modifieurs / Matériaux dans celui de fin (`PanneauOnglets` ; `plein: true` dans `definir` : corps sans marges, pour une liste bord à bord ; `sansOnglets: true` (barre d'onglets cachée), `entete` (élément posé dans l'en-tête) ; options `fermeture: false` (pas de ✕ quand une pastille toujours visible le bascule) et `min` (taille minimale à la poignée)) (onglet Couleurs : clés `ED_COULEURS` propres à l'éditeur, variables CSS posées sur `#ctx-editeur`), projet complet enregistré en un fichier `.gda` (JSON versionné `ED_FORMAT`, 3 depuis les arêtes libres, migrations dans `ed_lireProjet` ; table `materiaux` remplie, `textures` réservée)) · `css/` thème · `icons/` icônes (PNG aux noms du manifeste,
`glyph.svg` monochrome pour l'en-tête). Voir aussi `README.md`.
