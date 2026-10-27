// service-worker.js — cache hors ligne de l'application.
// La version vient de app.config.js (APP.version) : l'incrémenter suffit pour publier une mise à jour.
importScripts('./app.config.js');
const VERSION = APP.prefix + '-' + APP.version;     // ex. « meshcraft-v1 »
const LIBS = APP.prefix + '-libs';                  // bibliothèques externes (CDN) : conservées entre les versions

// Coquille de l'application : mise en cache à l'installation. Ajouter ici tout nouveau fichier.
const SHELL = [
  './', './index.html', './manifest.json', './app.config.js',
  './css/app.css', './css/pwa.css',
  './storage-ns.js', './pwa.js', './contexts.js', './panneau.js', './pave.js',
  './lib/three.min.js', './moteur/modeles.js', './moteur/maillage.js', './moteur/visserie.js', './moteur/selection.js', './moteur/booleens.js', './lib/manifold.js', './lib/manifold.wasm',
  './moteur/evenements.js', './moteur/tactile.js', './moteur/animation.js', './moteur/sons.js', './moteur/moteur.js',
  './modeles/squelette.obj', './modeles/echecs/pion.obj', './modeles/echecs/tour.obj', './modeles/echecs/cavalier.obj',
  './modeles/echecs/fou.obj', './modeles/echecs/dame.obj', './modeles/echecs/roi.obj',
  './modeles/echecs/pawn.stl', './modeles/echecs/rook.stl', './modeles/echecs/knight.stl',
  './modeles/echecs/bishop.stl', './modeles/echecs/queen.stl', './modeles/echecs/king.stl',
  './ctx-editeur.js', './ctx-reglages.js', './app.js',
  './icons/icon.svg', './icons/glyph.svg',
  './icons/ph--selection-bold.svg', './icons/lucide--move-3d.svg', './icons/iconoir--box-3d-center.svg',
  './icons/iconoir--select-point-3d.svg', './icons/iconoir--3d-select-solid.svg', './icons/3d-move.svg', './icons/screen-move.svg',
  './icons/rotate-3d.svg', './icons/scaling.svg', './icons/file-import-export-line.svg', './icons/iconoir--select-edge-3d.svg', './icons/iconoir--select-face-3d.svg', './icons/question-line.svg', './icons/reglages.svg', './icons/scene.svg', './icons/lucide--wrench.svg', './icons/fa7-solid--folder-tree.svg', './icons/rendu-solide.svg', './icons/rendu-rayons.svg', './icons/rendu-jeu.svg', './icons/selection-toucher.svg', './icons/selection-boite.svg', './icons/selection-chemin.svg', './icons/materiaux.svg', './icons/pas.svg', './icons/iconoir--box-3d-three-points.svg',
  './icons/icon-192x192.png', './icons/icon-256x256.png', './icons/icon-512x512.png', './icons/icon-maskable-512x512.png'
];

// Origines externes mises en cache « cache d'abord » (bibliothèques versionnées). Exemple : 'cdn.jsdelivr.net'
const LIB_HOSTS = ['cdn.jsdelivr.net', 'cdnjs.cloudflare.com', 'unpkg.com'];

self.addEventListener('install', event => {
  // Un fichier manquant ne doit pas faire échouer toute l'installation
  event.waitUntil(caches.open(VERSION).then(cache =>
    Promise.all(SHELL.map(u => cache.add(new Request(u, { cache: 'reload' })).catch(() => null)))));
  // Pas de skipWaiting automatique : l'écran d'accueil propose « Mettre à jour » (message SKIP_WAITING)
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k.indexOf(APP.prefix + '-') === 0 && k !== VERSION && k !== LIBS)
        .map(k => caches.delete(k))))
      .then(() => self.clients.claim()));
});

self.addEventListener('message', event => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) {
    // Bibliothèques externes : cache d'abord (fonctionnent hors ligne après le premier chargement)
    if (LIB_HOSTS.includes(url.hostname)) {
      event.respondWith(caches.open(LIBS).then(async c => {
        const hit = await c.match(req);
        if (hit) return hit;
        const res = await fetch(req);
        if (res && (res.ok || res.type === 'opaque')) c.put(req, res.clone());
        return res;
      }));
    }
    return;                                                  // autres origines : réseau seul
  }

  // Tout (pages et ressources) : réseau d'abord, cache seulement en secours (hors ligne / serveur lent).
  // Évite de mélanger d'anciens et de nouveaux fichiers pendant le développement.
  event.respondWith((async () => {
    const cache = await caches.open(VERSION);
    try {
      const res = await Promise.race([
        fetch(req),
        new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 5000))
      ]);
      if (res && res.ok) cache.put(req.mode === 'navigate' ? './index.html' : req, res.clone());
      return res;
    } catch (e) {
      const hit = await cache.match(req.mode === 'navigate' ? './index.html' : req, { ignoreSearch: true });
      if (hit) return hit;
      throw e;
    }
  })());
});
