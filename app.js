// app.js — point d'entrée : contextes (un par onglet), menu de navigation déroulant, stockage local.
// Pour ajouter un onglet : écrire son contexte (voir contexts.js), l'enregistrer dans initContexts()
// et ajouter une entrée dans TABS (icône contour « off », icône pleine « on »).

const TAB_SVG = inner => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"
  stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${inner}</svg>`;
const TAB_CUT = 'var(--navbar-footer-color)';   // couleur des « découpes » dans les icônes pleines

const TABS = [{
  id: 'editeur',
  label: 'Éditeur',
  off: TAB_SVG(`<path d="M12 3l8 4.5v9L12 21l-8-4.5v-9z"/><circle cx="12" cy="3" r="1.6"/><circle cx="20" cy="7.5" r="1.6"/><circle cx="4" cy="16.5" r="1.6"/><path d="M4 7.5L20 16.5"/>`),
  on: TAB_SVG(`<path d="M12 3l8 4.5v9L12 21l-8-4.5v-9z" fill="currentColor"/><path d="M4.8 7.9l14.4 8.2" stroke="${TAB_CUT}"/><circle cx="12" cy="3" r="2"/><circle cx="20" cy="7.5" r="2"/><circle cx="4" cy="16.5" r="2"/>`)
}, {
  id: 'reglages',
  label: 'Réglages',
  off: TAB_SVG(`<path d="M4 7h10M18 7h2M4 17h2M10 17h10"/><circle cx="16" cy="7" r="2"/><circle cx="8" cy="17" r="2"/>`),
  on: TAB_SVG(`<path d="M4 7h10M18 7h2M4 17h2M10 17h10"/><circle cx="16" cy="7" r="2.6" fill="currentColor"/><circle cx="8" cy="17" r="2.6" fill="currentColor"/>`)
}];

class App {
  constructor() {
    this.config = self.APP;
    this.root = document.getElementById('app-content');
    this.initContexts();
    this.buildNavDock();
  }

  initContexts() {
    this.root.replaceChildren();
    this.contexts = new ContextManager(this, this.root);
    this.contexts.register(new EditeurContext(this, 'editeur'));
    this.contexts.register(new ReglagesContext(this, 'reglages'));
    // Pages superposées : register(new XxxPage(this, 'id'), { overlay: true }), ouvertes par app.contexts.open(id),
    // fermées par app.contexts.back()
  }

  // ----- Menu de navigation -------------------------------------------------------------------------
  // Pastille flottante dans le coin supérieur gauche : au repos, l'icône et le nom du contexte courant (qui
  // tiennent lieu de titre) et un chevron — l'icône seule si le contexte a `navMini` (classe nd-mini) ; un appui
  // la déroule verticalement sur la liste des contextes.
  buildNavDock() {
    const nav = document.getElementById('app-nav');
    if (!nav) return;
    this.nav = nav;
    this.navItems = {};
    this.navActive = null;
    const voile = document.createElement('div');          // capte l'appui hors du menu ouvert (le ferme)
    voile.className = 'nd-voile';
    voile.addEventListener('click', () => this.toggleNav(false));
    const boite = document.createElement('div');
    boite.className = 'nd-boite';
    const tete = this.navHead = document.createElement('button');
    tete.type = 'button';
    tete.className = 'nd-tete';
    tete.setAttribute('aria-haspopup', 'true');
    tete.setAttribute('aria-expanded', 'false');
    this.navHeadIcon = document.createElement('span');
    this.navHeadIcon.className = 'nd-icone';
    this.navHeadLabel = document.createElement('span');
    this.navHeadLabel.className = 'nd-label';
    tete.append(this.navHeadIcon, this.navHeadLabel);
    tete.insertAdjacentHTML('beforeend', TAB_SVG('<path d="M6 9l6 6 6-6"/>').replace('<svg ', '<svg class="nd-chevron" '));
    tete.addEventListener('click', () => this.toggleNav());
    const liste = document.createElement('div');
    liste.className = 'nd-liste';
    liste.setAttribute('role', 'menu');
    TABS.forEach(it => {
      const el = document.createElement('div');
      el.className = 'nd-item';
      el.dataset.id = it.id;
      el.setAttribute('role', 'menuitem');
      el.tabIndex = -1;
      const icon = document.createElement('span');
      icon.className = 'nd-icone';
      icon.innerHTML = it.off;
      const label = document.createElement('span');
      label.className = 'nd-label';
      label.textContent = it.label;
      el.append(icon, label);
      el.addEventListener('click', () => { this.toggleNav(false); this.selectNav(it.id); });
      el.addEventListener('keydown', ev => { if (ev.key === 'Enter') { this.toggleNav(false); this.selectNav(it.id); } });
      liste.appendChild(el);
      this.navItems[it.id] = { el, icon, def: it };
    });
    boite.append(tete, liste);
    nav.append(voile, boite);
    // Contexte initial : dernier utilisé, sinon APP.startTab
    const saved = this.loadFromLocal('nav-active');
    this.selectNav(this.navItems[saved] ? saved : (this.config.startTab || TABS[0].id));
  }

  // Déroule (true), replie (false) ou inverse (sans argument) le menu
  toggleNav(ouvrir) {
    if (!this.nav) return;
    const o = ouvrir === undefined ? !this.nav.classList.contains('nd-ouvert') : ouvrir;
    this.nav.classList.toggle('nd-ouvert', o);
    this.navHead.setAttribute('aria-expanded', String(o));
    for (const id in this.navItems) this.navItems[id].el.tabIndex = o ? 0 : -1;
  }

  // Affiche `id` comme contexte courant dans le menu
  _markNav(id) {
    for (const k in this.navItems) {
      const it = this.navItems[k], on = k === id;
      it.el.classList.toggle('nd-active', on);
      it.icon.innerHTML = on ? it.def.on : it.def.off;
    }
    const cur = this.navItems[id];
    if (!cur) return;
    // Pastille minimale au repos (l'icône seule) pour les contextes qui veulent toute la place (`navMini`)
    const ctx = this.contexts && this.contexts.map[id];
    this.nav.classList.toggle('nd-mini', !!(ctx && ctx.navMini));
    this.navHeadIcon.innerHTML = cur.def.on;
    this.navHeadLabel.textContent = cur.def.label;
  }

  selectNav(id) {
    if (!this.navItems[id]) return;
    if (id === this.navActive) { this.contexts.closeOverlay(); return; }   // second appui : ferme les pages superposées
    const before = this.navActive;
    this._markNav(id);
    this.navActive = id;
    try {
      this.contexts.show(id);
      this.saveToLocal('nav-active', id);
    } catch (err) {
      // L'ouverture a échoué : on revient au contexte précédent (sinon les appuis suivants seraient ignorés)
      console.error('Contexte ' + id + ' :', err);
      const ctx = this.contexts.map[id];
      if (ctx && !ctx.built) { try { ctx.el.replaceChildren(); } catch (e2) {} }
      this._markNav(before);
      this.navActive = before;
      this.toast('Impossible d’ouvrir « ' + id + ' » : ' + (err && err.message || err), 'err');
    }
  }

  // ----- Message bref --------------------------------------------------------------------------------
  toast(text, kind) {
    let t = document.getElementById('ui-toast');
    if (!t) {
      t = document.createElement('div');
      t.id = 'ui-toast';
      t.className = 'ui-toast';
      t.setAttribute('role', 'status');
      document.body.appendChild(t);
    }
    t.textContent = text;
    t.classList.toggle('err', kind === 'err');
    requestAnimationFrame(() => t.classList.add('in'));
    clearTimeout(this._toastT);
    this._toastT = setTimeout(() => t.classList.remove('in'), kind === 'err' ? 7000 : 3500);
  }

  // ----- Stockage local (préfixé par storage-ns.js) -------------------------------------------------
  saveToLocal(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); }
    catch (e) { console.error('Sauvegarde impossible (« ' + key + ' ») :', e); }
  }
  loadFromLocal(key) {
    try { const s = localStorage.getItem(key); return s === null ? null : JSON.parse(s); }
    catch (e) { console.error('Lecture impossible (« ' + key + ' ») :', e); return null; }
  }
  removeFromLocal(key) {
    try { localStorage.removeItem(key); } catch (e) { /* ignoré */ }
  }
}

window.App = App;
