# MeshCraft

Modeleur de maillages 3D « à l'ancienne » (facettes, faces polygonales) pensé pour la **tablette tactile**,
en PWA installable et utilisable hors ligne. JavaScript natif, rendu WebGL par three.js, **aucune étape de build**.

## Fonctions

- Scène à plusieurs objets rangés en sets ; modes **Scène** (objets) et **Géométrie** (sommets, arêtes, faces).
- Sélection au toucher, par boîte ou par plus court chemin ; rendu Solide, Rayons X, En jeu.
- Translation, rotation, mise à l'échelle par poignée ou par champs ; curseur 3D.
- Primitives : cube, cylindre, cône, sphère UV, icosphère ; **visserie métrique ISO** M2 à M24 (vis, écrou, rondelle,
  tige filetée, filet réel en hélice, pour l'impression 3D).
- Géométrie : créer / supprimer sommets, arêtes, faces ; boucle de coupe, subdivision, fusion, dissolution,
  révolution, fusion des sommets confondus.
- Modifieurs répétition et **booléens** (union, différence, intersection, par Manifold en WebAssembly).
- Matériaux au format Wavefront `.mtl`.
- Import OBJ, STL, glTF / GLB ; export OBJ (+ MTL), STL, GLB ; projet complet en un fichier `.gda` (JSON).
- Annulation / rétablissement, barre d'accès rapide configurable, aide intégrée, pavé numérique flottant.

L'interface est en français.

## Essayer

**En ligne : <https://s1pierro.github.io/meshcraft/>** — à ouvrir sur la tablette, puis « Installer l'application »
pour l'avoir en plein écran et hors ligne.

## Utilisation locale

Servir le dossier tel quel par un serveur web statique et ouvrir `index.html` :

```sh
python3 -m http.server 8000      # puis http://localhost:8000/
```

Le service worker et l'installation exigent `https://` (ou `http://localhost`).
Une fois installée, l'application fonctionne hors ligne.

Secours : `?reset` à la fin de l'adresse vide le service worker et les caches (données conservées) ;
`?eruda` ouvre une console de débogage sur mobile.

## Organisation

| Fichier | Rôle |
|---|---|
| `app.config.js` | nom, **version**, préfixe des données et des caches |
| `index.html` | coquille, ordre de chargement des scripts |
| `service-worker.js` | cache hors ligne (liste `SHELL`) |
| `storage-ns.js` | préfixe `meshcraft:` automatique sur `localStorage` |
| `pwa.js` | écran d'accueil : installation, mise à jour, plein écran |
| `contexts.js`, `app.js` | écrans (contextes) et menu de navigation |
| `panneau.js`, `pave.js` | panneaux latéraux à onglets, pavé numérique |
| `ctx-editeur.js` | l'éditeur |
| `ctx-reglages.js` | réglages de l'application |
| `moteur/` | modules 3D : `maillage.js` (maillage éditable, lecture / écriture des formats), `selection.js`, `visserie.js`, `booleens.js`, `modeles.js`, `moteur.js` (rendu), `tactile.js`, `evenements.js`, `animation.js`, `sons.js` |
| `lib/` | three.js r159 (build classique), Manifold 3.3.2 |
| `modeles/` | modèles d'essai (pièces d'échecs d'[echiquierJS](https://github.com/s1pierro/echiquierJS)) |

**Publier une version** : incrémenter `version` dans `app.config.js` ; tout nouveau fichier va dans `index.html`
(avant `app.js`) et dans la liste `SHELL` de `service-worker.js`.

## Licences des bibliothèques

- [three.js](https://threejs.org/) r159 — MIT
- [Manifold](https://github.com/elalish/manifold) 3.3.2 — Apache 2.0 (`lib/manifold.LICENSE.txt`) ;
  `manifold.js` converti en script classique, voir son en-tête.
