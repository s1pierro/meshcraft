// panneau.js — panneau latéral à onglets, réutilisable par un contexte : au lieu d'une carte modale, il prend la
// droite de l'écran en paysage, le bas en portrait, et l'espace de travail du contexte se réduit d'autant.
// Plusieurs contenus (Fichier, Aide, Réglages…) se partagent le même panneau : un seul est affiché à la fois.
// Avec `cote: 'debut'`, il prend le bord opposé (gauche en paysage, haut en portrait) ; un même hôte peut porter
// un panneau de chaque côté. Le panneau de début passe sous la pastille de navigation : son en-tête lui laisse
// la place `--pn-reserve` (défaut : pastille réduite d'un contexte navMini).
//
//   const pn = new PanneauOnglets(hote, espace, {
//     cote: 'fin',                        // 'fin' (droite / bas, défaut) ou 'debut' (gauche / haut)
//     etat: this.state.panneau,           // objet persistant { ouvert, onglets, largeur, hauteur }, gardé par le contexte
//     sauver: () => this.save(),          // après chaque changement de l'état
//     changement: id => …,                // contenu ouvert (ou null) : mettre en évidence le bouton qui l'ouvre
//     fermeture: false,                   // sans bouton ✕ (le contexte a un bouton toujours visible qui le bascule)
//     min: 140                            // taille minimale (px) à la poignée, défaut PanneauOnglets.MIN
//   });
//   pn.definir('aide', { onglets: [['scene', 'Scène', corps => …], …], quitter: () => … });
//   pn.definir('objets', { plein: true, sansOnglets: true, onglets: … })   // corps sans marges (liste bord à bord),
//                                                                            // barre d'onglets non affichée
//   pn.definir('objets', { entete: bouton, … })   // élément posé dans l'en-tête (à droite) quand ce contenu est ouvert
//   pn.basculer('aide') · pn.ouvrir('fichier', 'exporter') · pn.fermer() · pn.ouvert → 'aide' ou null
//   pn.rafraichir()                       // reconstruit l'onglet affiché (données changées)
//
// `rendre(corps)` remplit le corps défilant de l'onglet ; `quitter()` est appelé quand ce contenu disparaît.
// La frontière se règle au doigt (taille gardée par orientation, double appui : taille par défaut).
// `hote` doit être positionné ; `espace` y est en position absolue (inset: 0) : la classe pn-espace s'en charge.

class PanneauOnglets {
  constructor(hote, espace, { cote, etat, sauver, changement, fermeture = true, min = PanneauOnglets.MIN } = {}) {
    this.hote = hote;
    this.fermeture = fermeture;
    this.min = min;
    this.debut = cote === 'debut';
    // Classe posée sur l'hôte quand ce panneau est ouvert, variables CSS de sa taille (largeur, hauteur)
    this.cote = this.debut ? { avec: 'pn-avec-debut', l: '--pn-ld', h: '--pn-hd' } : { avec: 'pn-avec', l: '--pn-l', h: '--pn-h' };
    this.espace = espace;
    this.etat = Object.assign(etat || {}, { onglets: Object.assign({}, (etat && etat.onglets) || {}) });
    if (this.etat.ouvert === undefined) this.etat.ouvert = null;
    this.sauver = sauver || (() => {});
    this.changement = changement || (() => {});
    this.contenus = new Map();
    this.affiche = null;               // « contenu:onglet » actuellement rendu
    PanneauOnglets.style();
    hote.classList.add('pn-hote');
    espace.classList.add('pn-espace');
    this.el = this._construire();
    hote.appendChild(this.el);
  }

  get ouvert() { return this.contenus.has(this.etat.ouvert) ? this.etat.ouvert : null; }

  // Contenu `id` : { onglets: [[id, libellé, rendre(corps)], …], quitter(), plein (corps sans marges),
  // sansOnglets (barre d'onglets cachée : contenu d'un seul onglet, nommé par le bouton qui l'ouvre),
  // entete (élément du contenu posé dans l'en-tête, avant ✕) }
  definir(id, def) {
    this.contenus.set(id, def);
    if (this.etat.ouvert === id) this.afficher();
  }

  ouvrir(id, onglet) {
    if (!this.contenus.has(id)) return;
    this.etat.ouvert = id;
    if (onglet) this.etat.onglets[id] = onglet;
    this.sauver();
    this.afficher();
  }

  fermer() {
    if (this.etat.ouvert === null) return;
    this.etat.ouvert = null;
    this.sauver();
    this.afficher();
  }

  // Ouvre le contenu `id`, ou ferme le panneau s'il l'affiche déjà
  basculer(id) { if (this.ouvert === id) this.fermer(); else this.ouvrir(id); }

  rafraichir() { this.affiche = null; this.afficher(); }

  // Panneau ouvert ou non (l'espace se réduit), onglets du contenu ouvert, onglet actif et son corps
  afficher() {
    const id = this.ouvert, def = id && this.contenus.get(id);
    this.hote.classList.toggle(this.cote.avec, !!def);
    this._taille();
    let onglet = def && this.etat.onglets[id];
    if (def && !def.onglets.some(o => o[0] === onglet)) onglet = this.etat.onglets[id] = def.onglets[0][0];
    const cle = def ? id + ':' + onglet : null;
    if (cle !== this.affiche) {
      const avant = this.affiche && this.contenus.get(this.affiche.split(':')[0]);
      if (avant && avant.quitter) avant.quitter();
      this.affiche = cle;
      this.onglets.replaceChildren();
      this.corps.replaceChildren();
      this.corps.scrollTop = 0;
      this.corps.classList.toggle('pn-plein', !!(def && def.plein));
      this.entete.replaceChildren(...(def && def.entete ? [def.entete] : []));
      if (def) {
        if (!def.sansOnglets) for (const [o, libelle] of def.onglets) {
          const b = document.createElement('button');
          b.type = 'button';
          b.setAttribute('role', 'tab');
          b.setAttribute('aria-selected', String(o === onglet));
          b.classList.toggle('on', o === onglet);
          b.textContent = libelle;
          b.addEventListener('click', () => { this.etat.onglets[id] = o; this.sauver(); this.afficher(); });
          this.onglets.appendChild(b);
        }
        def.onglets.find(o => o[0] === onglet)[2](this.corps);
      }
    }
    this.changement(id);
  }

  _construire() {
    const p = document.createElement('aside');
    p.className = 'pn-panneau ' + (this.debut ? 'pn-debut' : 'pn-fin');
    const tete = document.createElement('div');
    tete.className = 'pn-tete';
    this.onglets = document.createElement('div');
    this.onglets.className = 'pn-onglets';
    this.onglets.setAttribute('role', 'tablist');
    this.entete = document.createElement('div');
    this.entete.className = 'pn-entete';
    tete.append(this.onglets, this.entete);
    if (this.fermeture) {
      const fermer = document.createElement('button');
      fermer.type = 'button';
      fermer.className = 'pn-fermer';
      fermer.textContent = '✕';
      fermer.setAttribute('aria-label', 'Fermer le panneau');
      fermer.addEventListener('click', () => this.fermer());
      tete.appendChild(fermer);
    }
    this.corps = document.createElement('div');
    this.corps.className = 'pn-corps';
    this.corps.setAttribute('role', 'tabpanel');
    // Poignée sur la frontière avec l'espace de travail : glisser = régler la taille, double appui = taille par défaut
    const bord = document.createElement('div');
    bord.className = 'pn-bord';
    bord.setAttribute('role', 'separator');
    bord.setAttribute('aria-label', 'Glisser pour régler la taille du panneau ; double appui : taille par défaut');
    bord.addEventListener('pointerdown', ev => this._glisserBord(ev));
    p.append(bord, tete, this.corps);
    return p;
  }

  // Glissé de la poignée : largeur (paysage) ou hauteur (portrait), en pixels, gardée par orientation ; bornée en
  // CSS (voir _taille). Deux appuis rapprochés sans glisser : taille par défaut.
  _glisserBord(ev) {
    ev.preventDefault();
    const bord = ev.currentTarget, e0 = this.etat;
    const portrait = window.matchMedia ? window.matchMedia('(orientation: portrait)').matches : false;
    const cle = portrait ? 'hauteur' : 'largeur', x0 = ev.clientX, y0 = ev.clientY, t0 = Date.now();
    bord.setPointerCapture(ev.pointerId);
    bord.classList.add('actif');
    let bouge = false;
    const placer = e => {
      if (!bouge && Math.hypot(e.clientX - x0, e.clientY - y0) < 6) return;
      bouge = true;
      const b = this.hote.getBoundingClientRect();
      const t = portrait ? (this.debut ? e.clientY - b.top : b.bottom - e.clientY) : (this.debut ? e.clientX - b.left : b.right - e.clientX);
      e0[cle] = Math.round(Math.max(this.min, t));
      this._taille();
    };
    const fin = () => {
      bord.removeEventListener('pointermove', placer);
      bord.removeEventListener('pointerup', fin);
      bord.removeEventListener('pointercancel', fin);
      bord.classList.remove('actif');
      if (!bouge) {
        // Double appui : retour à la taille par défaut de cette orientation
        if (t0 - (this._appui || 0) < 350) { delete e0[cle]; this._appui = 0; this._taille(); } else this._appui = t0;
      }
      this.sauver();
    };
    bord.addEventListener('pointermove', placer);
    bord.addEventListener('pointerup', fin);
    bord.addEventListener('pointercancel', fin);
  }

  // Taille choisie (variables CSS ; sans choix, celles du style s'appliquent). Le style la borne pour que l'espace
  // de travail garde au moins 30 % de l'écran, même après une rotation ou avec un panneau de chaque côté.
  _taille() {
    for (const [cle, variable] of [['largeur', this.cote.l], ['hauteur', this.cote.h]]) {
      if (this.etat[cle] > 0) this.hote.style.setProperty(variable, this.etat[cle] + 'px');
      else this.hote.style.removeProperty(variable);
    }
  }

  static style() {
    if (document.getElementById('pn-style')) return;
    const st = document.createElement('style');
    st.id = 'pn-style';
    st.textContent = `
      /* Tailles : --pn-l / --pn-h (fin), --pn-ld / --pn-hd (début), bornées par --pn-max / --pn-maxd */
      .pn-hote{--pn-l:min(24rem,40vw);--pn-h:min(45%,28rem);--pn-ld:min(18rem,30vw);--pn-hd:min(32%,20rem);--pn-max:70%;--pn-maxd:70%;
        --pn-tl:min(var(--pn-l),var(--pn-max));--pn-th:min(var(--pn-h),var(--pn-max));
        --pn-tld:min(var(--pn-ld),var(--pn-maxd));--pn-thd:min(var(--pn-hd),var(--pn-maxd))}
      .pn-hote.pn-avec.pn-avec-debut{--pn-max:42%;--pn-maxd:28%}
      .pn-espace{position:absolute;inset:0;overflow:hidden}
      .pn-panneau{position:absolute;display:none;flex-direction:column;background:var(--surface-color);color:var(--text-color);
        box-sizing:border-box;z-index:1}
      .pn-avec>.pn-fin,.pn-avec-debut>.pn-debut{display:flex}
      @media (orientation:landscape){
        .pn-avec>.pn-espace{right:var(--pn-tl)}
        .pn-avec-debut>.pn-espace{left:var(--pn-tld)}
        .pn-fin{top:0;right:0;bottom:0;width:var(--pn-tl);border-left:1px solid var(--border-color);
          padding:env(safe-area-inset-top,0px) env(safe-area-inset-right,0px) env(safe-area-inset-bottom,0px) 0}
        .pn-debut{top:0;left:0;bottom:0;width:var(--pn-tld);border-right:1px solid var(--border-color);
          padding:env(safe-area-inset-top,0px) 0 env(safe-area-inset-bottom,0px) env(safe-area-inset-left,0px)}
      }
      @media (orientation:portrait){
        .pn-avec>.pn-espace{bottom:var(--pn-th)}
        .pn-avec-debut>.pn-espace{top:var(--pn-thd)}
        .pn-fin{left:0;right:0;bottom:0;height:var(--pn-th);border-top:1px solid var(--border-color);
          padding:0 env(safe-area-inset-right,0px) env(safe-area-inset-bottom,0px) env(safe-area-inset-left,0px)}
        .pn-debut{left:0;right:0;top:0;height:var(--pn-thd);border-bottom:1px solid var(--border-color);
          padding:env(safe-area-inset-top,0px) env(safe-area-inset-right,0px) 0 env(safe-area-inset-left,0px)}
      }
      /* Poignée de la frontière : bande tactile à cheval sur le bord, trait visible au milieu */
      .pn-bord{position:absolute;z-index:2;touch-action:none;display:flex;align-items:center;justify-content:center;
        -webkit-tap-highlight-color:transparent}
      .pn-bord::after{content:'';border-radius:999px;background:var(--inactive-color);opacity:.55;transition:background .15s}
      .pn-bord.actif::after{background:var(--accent-color);opacity:1}
      @media (orientation:landscape){
        .pn-bord{top:0;bottom:0;width:1.8rem;cursor:col-resize}
        .pn-fin>.pn-bord{left:-.9rem}
        .pn-debut>.pn-bord{right:-.9rem}
        .pn-bord::after{width:5px;height:3.2rem}
      }
      @media (orientation:portrait){
        .pn-bord{left:0;right:0;height:1.8rem;cursor:row-resize}
        .pn-fin>.pn-bord{top:-.9rem}
        .pn-debut>.pn-bord{bottom:-.9rem}
        .pn-bord::after{height:5px;width:3.2rem}
      }
      .pn-tete{flex:none;display:flex;align-items:center;gap:.4em;padding:.6em .6em .5em;border-bottom:1px solid var(--border-color)}
      /* En-tête du panneau de début : à côté de la pastille de navigation, centré sur elle */
      .pn-debut>.pn-tete{min-height:2.75rem;padding:.6rem .6em .5em var(--pn-reserve,3.75rem)}
      .pn-onglets{flex:1;display:flex;gap:.3em;overflow-x:auto;scrollbar-width:none}
      .pn-entete{flex:none;display:flex;align-items:center;min-width:0}
      .pn-entete:empty{display:none}
      .pn-onglets button,.pn-fermer{flex:none;border:0;border-radius:999px;padding:.55em 1em;font:inherit;font-size:.9em;
        background:var(--background-color);color:var(--text-color);-webkit-tap-highlight-color:transparent}
      .pn-onglets button.on{background:var(--accent-color);color:#fff;font-weight:700}
      .pn-fermer{padding:.55em .85em}
      .pn-corps{flex:1;min-height:0;overflow-y:auto;overscroll-behavior:contain;padding:.4em .8em 1em;
        display:flex;flex-direction:column;gap:.15em}
      .pn-corps.pn-plein{padding:0 0 1em;gap:0}
    `;
    document.head.appendChild(st);
  }
}
PanneauOnglets.MIN = 200;              // taille minimale (px) réglée à la poignée, par défaut (option `min`)

window.PanneauOnglets = PanneauOnglets;
