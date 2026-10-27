// moteur/moteur.js — assemble three.js (rendu WebGL) et les modules du moteur, et fait tourner la boucle de jeu.
//
//   const m = new Moteur(element, { champ: 50, ombres: { taille: 6 } });
//   const cube = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshLambertMaterial({ color: m.couleur('--accent-color') }));
//   cube.castShadow = true;  m.scene.add(cube);
//   m.evenements.ecouter('tactile:appui', d => { const o = m.objetSous(d.clientX, d.clientY); … });
//   m.demarrer();   …   m.arreter();
//
// Fournit : m.scene (THREE.Scene), m.camera (PerspectiveCamera), m.renderer, m.soleil (lumière directionnelle
// qui projette les ombres), m.ciel (lumière d'ambiance ciel / sol), m.evenements, m.tactile, m.animations,
// m.sons (effets sonores, voir sons.js).
// Les animations s'appliquent directement aux objets three.js : anim.vers(cube.position, { y: 2 }, 0.4).
// Un objet dont userData.selectionnable vaut false (lui ou un parent) est ignoré par objetSous().
//
// Ordre de chaque image : événements différés et minuteurs → animations → modules ajoutés →
// « moteur:image » → rendu. Un module ajouté par ajouterModule() est un objet { mettreAJour(dt, t, moteur), detruire?() }.
//
// Rendu à la demande (opts.continu = false) : une image n'est dessinée que si quelque chose l'exige — geste
// tactile, animation ou comportement en cours, redimensionnement, ou appel à moteur.redessiner() après une
// modification faite hors de ces cas. Le temps de jeu continue d'avancer. Économise la batterie (jeux calmes).
//
// Rendu « à l'ancienne » : opts.pixelise = n dessine un pixel pour n × n pixels CSS (agrandi sans lissage).

class Moteur {
  constructor(hote, opts = {}) {
    this.hote = hote;
    this.evenements = new Evenements();
    this.animations = new Animations();
    this.sons = new Sons();
    this.modules = [];
    this.continu = opts.continu !== false;
    this._pixelise = opts.pixelise || 0;
    this._sale = true;
    this.evenements.ecouter('*', (d, type) => { if (type.startsWith('tactile:')) this._sale = true; });

    // Rendu WebGL ; fond transparent : l'arrière-plan CSS de l'hôte reste visible
    let r;
    try {
      r = this.renderer = new THREE.WebGLRenderer({ antialias: !this._pixelise, alpha: true });
    } catch (e) {
      throw new Error('WebGL indisponible sur cet appareil');
    }
    r.setClearColor(0x000000, 0);
    r.shadowMap.enabled = opts.ombres !== false;
    r.shadowMap.type = THREE.PCFSoftShadowMap;
    this.canvas = r.domElement;
    this.canvas.style.cssText = 'display:block;width:100%;height:100%;touch-action:none;user-select:none;-webkit-user-select:none';
    hote.appendChild(this.canvas);

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(opts.champ || 50, 1, opts.proche || 0.1, opts.loin || 200);

    // Éclairage par défaut : ambiance ciel / sol et un soleil qui projette les ombres sur une zone carrée
    this.ciel = new THREE.HemisphereLight(0xffffff, 0x5a5468, 1.1);
    this.soleil = new THREE.DirectionalLight(0xffffff, 2.2);
    const o = opts.ombres || {}, taille = o.taille || 6, cam = this.soleil.shadow.camera;
    this.soleil.castShadow = r.shadowMap.enabled;
    this.soleil.shadow.mapSize.set(o.resolution || 1024, o.resolution || 1024);
    cam.left = cam.bottom = -taille;
    cam.right = cam.top = taille;
    cam.near = 0.5;
    cam.far = 60;
    this.soleil.shadow.bias = -0.0005;
    this.soleil.shadow.normalBias = o.decalage ?? 0.02;
    this.scene.add(this.ciel, this.soleil, this.soleil.target);
    this.placerSoleil([0.5, 1, 0.6]);

    this.raycaster = new THREE.Raycaster();
    this.tactile = new Tactile(this.canvas, this.evenements, opts.tactile);

    this.enMarche = false;
    this.temps = 0;
    this.ips = 0;                     // images par seconde (moyenne glissante)
    this.largeur = this.hauteur = 0;
    this._derniere = 0;
    this._boucle = ts => this._image(ts);

    // Taille de la zone de dessin
    this._obs = new ResizeObserver(() => { this.redimensionner(); if (!this.enMarche) this.dessiner(); });
    this._obs.observe(hote);
    this.redimensionner();
  }

  // ----- Réglages -----------------------------------------------------------------------------------
  // Direction vers le soleil [x, y, z] (pas besoin de la normer) ; `cible` : centre de la zone d'ombre
  placerSoleil(dir, cible = { x: 0, y: 0, z: 0 }) {
    const l = Math.hypot(dir[0], dir[1], dir[2]) || 1, d = 20 / l;
    this.soleil.target.position.set(cible.x, cible.y, cible.z);
    this.soleil.position.set(cible.x + dir[0] * d, cible.y + dir[1] * d, cible.z + dir[2] * d);
    this._sale = true;
  }

  // Caméra en orbite autour de `cible` : `lacet` autour de l'axe vertical (0 = côté +z), `hauteur` > 0 = vue
  // d'au-dessus (radians)
  orbiter(cible, distance, lacet, hauteur) {
    const c = Math.cos(hauteur);
    this.camera.position.set(
      cible.x + Math.sin(lacet) * c * distance,
      cible.y + Math.sin(hauteur) * distance,
      cible.z + Math.cos(lacet) * c * distance);
    this.camera.lookAt(cible.x, cible.y, cible.z);
  }

  // Couleur d'une variable CSS du thème (« --accent-color ») ; `secours` si elle est vide
  couleur(variable, secours = '#888888') {
    const v = getComputedStyle(this.hote).getPropertyValue(variable).trim();
    const c = new THREE.Color();
    try { c.setStyle(v || secours); } catch (e) { c.setStyle(secours); }
    return c;
  }

  get pixelise() { return this._pixelise; }
  set pixelise(n) {
    this._pixelise = n || 0;
    this.redimensionner();
  }

  // Nombre de triangles et d'appels de dessin de la dernière image
  get stats() {
    const i = this.renderer.info.render;
    return { triangles: i.triangles, appels: i.calls };
  }

  redimensionner() {
    const b = this.hote.getBoundingClientRect(), w = Math.round(b.width), h = Math.round(b.height);
    if (!w || !h) return;
    this.largeur = w;
    this.hauteur = h;
    this.renderer.setPixelRatio(this._pixelise ? 1 / this._pixelise : Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.setSize(w, h, false);
    this.canvas.style.imageRendering = this._pixelise ? 'pixelated' : '';
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this._sale = true;
  }

  // ----- Sélection ----------------------------------------------------------------------------------
  // Objet visible et sélectionnable le plus proche sous un point de l'écran (coordonnées client), ou null
  objetSous(clientX, clientY) {
    const b = this.canvas.getBoundingClientRect();
    if (!b.width || !b.height) return null;
    const p = new THREE.Vector2(((clientX - b.left) / b.width) * 2 - 1, -((clientY - b.top) / b.height) * 2 + 1);
    this.scene.updateMatrixWorld();
    this.raycaster.setFromCamera(p, this.camera);
    for (const t of this.raycaster.intersectObjects(this.scene.children, true)) {
      let o = t.object, ok = true;
      for (; o; o = o.parent) if (!o.visible || o.userData.selectionnable === false) { ok = false; break; }
      if (ok) return t.object;
    }
    return null;
  }

  // ----- Boucle -------------------------------------------------------------------------------------
  // Demande une nouvelle image (rendu à la demande)
  redessiner() {
    this._sale = true;
  }

  ajouterModule(m) {
    this.modules.push(m);
    return m;
  }

  demarrer() {
    if (this.enMarche) return;
    this.enMarche = true;
    this._derniere = 0;
    this._sale = true;
    this._raf = requestAnimationFrame(this._boucle);
    this.evenements.emettre('moteur:demarrage', {});
  }

  arreter() {
    if (!this.enMarche) return;
    this.enMarche = false;
    cancelAnimationFrame(this._raf);
    this.evenements.emettre('moteur:arret', {});
  }

  // Une seule image sans faire avancer le temps (après une modification, moteur arrêté)
  dessiner() {
    if (this.largeur) this.renderer.render(this.scene, this.camera);
  }

  _image(ts) {
    if (!this.enMarche) return;
    this._raf = requestAnimationFrame(this._boucle);
    // dt borné : après une mise en arrière-plan, le jeu ne fait pas un bond dans le temps
    const dt = this._derniere ? Math.min(0.1, (ts - this._derniere) / 1000) : 1 / 60;
    this._derniere = ts;
    this.temps += dt;
    if (dt > 0) this.ips = this.ips ? this.ips * 0.95 + (1 / dt) * 0.05 : 60;

    try {
      this.evenements.mettreAJour(dt);
      this.animations.mettreAJour(dt);
      for (const m of this.modules) m.mettreAJour(dt, this.temps, this);
      this.evenements.emettre('moteur:image', { dt, t: this.temps });
      if (this.continu || this._sale || this.animations.occupe) {
        this._sale = false;
        this.dessiner();
      }
    } catch (e) {
      console.error('Moteur :', e);
    }
  }

  detruire() {
    this.arreter();
    this._obs.disconnect();
    for (const m of this.modules) if (m.detruire) m.detruire();
    this.tactile.detruire();
    this.evenements.vider();
    this.renderer.dispose();
    this.canvas.remove();
  }
}

window.Moteur = Moteur;
