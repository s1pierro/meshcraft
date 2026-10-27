// app.config.js — identité et version de l'application, en un seul endroit.
// Chargé par la page (window) ET par le service worker (importScripts) : `self` désigne l'un ou l'autre.
//
// Pour publier une nouvelle version : incrémenter `version`. Le service worker change alors de cache,
// l'écran d'accueil propose « Mettre à jour l'application » et l'ancien cache est supprimé à l'activation.
self.APP = Object.freeze({
  name: 'MeshCraft',                        // nom court (écran d'accueil, titre)
  fullName: 'MeshCraft — modeleur 3D tactile',
  tagline: 'Modeleur 3D tactile',
  version: 'v1',                            // ← à incrémenter à chaque publication
  prefix: 'meshcraft',                      // préfixe des données locales (« meshcraft: ») et des caches (« meshcraft-v1 »)
  startTab: 'editeur'                       // onglet ouvert au premier lancement
});
