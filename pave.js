// pave.js — pavé numérique flottant de l'application (`PaveNumerique`, instance `window.pave`) : remplace le clavier
// du système sur les champs numériques (inputMode « decimal » ou « numeric »), sans rien changer à leur code.
// Un appui sur un tel champ ouvre le pavé, rattaché à lui ; la saisie reste dans le pavé (calcul permis : 2×3+0,5),
// OK l'applique au champ (événements input puis change, comme une saisie au clavier), Suivant l'applique et passe au
// champ numérique suivant du même groupe (ancêtre [data-pave-groupe], sinon le document) ; un appui ailleurs referme
// sans rien changer ; une saisie vide vide le champ. ⌨ rend la main au clavier du système pour ce champ, jusqu'à ce qu'il perde le focus.
// Le pavé se déplace par sa barre ; activation et position gardées dans localStorage (« pave »).
// Champ exclu : data-pave="non". Le clavier du système est écarté par inputMode « none », posé à l'appui (mode
// d'origine gardé dans data-pave-mode) ; Android l'ignore sur un champ type « number » : un tel champ servi passe
// en type « text » (préférer « text » + inputMode dès sa création).

class PaveNumerique {
  constructor() {
    this.cible = null;     // champ rattaché
    this.expr = '';        // saisie en cours (affichage : virgule, ×, ÷, −)
    this.neuf = true;      // valeur du champ tout juste reprise : un chiffre la remplace, un opérateur la prolonge
    this.el = null;        // construit à la première ouverture
    this._appuiPave = false;
    let p = {};
    try { p = JSON.parse(localStorage.getItem('pave')) || {}; } catch (e) { p = {}; }
    this.actif = p.actif !== false;
    this.position = Array.isArray(p.position) && p.position.length === 2 && p.position.every(isFinite) ? p.position : null;
    document.addEventListener('pointerdown', ev => this._appui(ev), true);
    document.addEventListener('focusin', ev => this._focus(ev.target));
    document.addEventListener('focusout', ev => this._perte(ev));
    window.addEventListener('resize', () => { if (this.cible) this._placer(); });
  }

  // Activer ou non le pavé (réglage de l'application)
  activer(oui) {
    this.actif = !!oui;
    if (!this.actif) this.fermer();
    this._garder();
  }

  _garder() {
    try { localStorage.setItem('pave', JSON.stringify({ actif: this.actif, position: this.position })); } catch (e) { /* stockage plein ou refusé */ }
  }

  // Champ servi par le pavé
  // Écarte (ou rend, `rendre`) le clavier du système de ce champ servi
  _sansClavier(i, rendre) {
    if (!i.dataset.paveMode) i.dataset.paveMode = i.inputMode;
    if (i.type === 'number') i.type = 'text';
    i.inputMode = rendre ? i.dataset.paveMode : 'none';
  }

  _eligible(i) {
    return !!i && i.tagName === 'INPUT' && !i.disabled && !i.readOnly && (i.dataset || {}).pave !== 'non'
      && /^(decimal|numeric)$/.test(i.dataset.paveMode || i.inputMode);
  }

  // Appui (capture, avant le focus) : écarte le clavier du système d'un champ servi, ou le lui rend ; un appui hors
  // du pavé et de son champ le referme
  _appui(ev) {
    const t = ev.target;
    this._appuiPave = !!(this.el && this.el.contains(t));
    if (this._appuiPave) return;
    if (this._eligible(t)) {
      this._sansClavier(t, !this.actif || !!t.dataset.paveClavier);
      if (t === this.cible) return;
      if (this.actif && !t.dataset.paveClavier && document.activeElement === t) this.ouvrir(t);   // déjà focalisé : pas de focusin
      return;
    }
    if (this.cible) this.fermer();
  }

  _focus(t) {
    if (!this.actif || !this._eligible(t) || t.dataset.paveClavier) return;
    this._sansClavier(t);
    this.ouvrir(t);
  }

  // Le champ perd le focus : rien si c'est au profit du pavé ou d'un autre champ servi (Suivant), sinon fermer
  _perte(ev) {
    const t = ev.target;
    if (t && t.dataset && t.dataset.paveClavier) delete t.dataset.paveClavier;
    if (t !== this.cible || this._appuiPave) return;
    if (this.el && ev.relatedTarget && this.el.contains(ev.relatedTarget)) return;
    if (this._eligible(ev.relatedTarget)) return;
    this.fermer();
  }

  ouvrir(i) {
    if (i === this.cible && this.el && !this.el.hidden) return;
    if (!this.el) this._construire();
    if (this.cible) this.cible.classList.remove('pv-cible');
    this.cible = i;
    i.classList.add('pv-cible');
    this.depart = String(i.value);
    this.expr = this.depart.replace('.', ',').replace('-', '−');
    this.neuf = true;
    const l = i.closest && i.closest('label');
    this.nom.textContent = i.getAttribute('aria-label') || (l ? l.textContent.trim() : '');
    this.el.hidden = false;
    this._afficher();
    this._placer();
  }

  fermer() {
    if (this.cible) this.cible.classList.remove('pv-cible');
    this.cible = null;
    if (this.el) this.el.hidden = true;
  }

  // ─── Saisie ───

  touche(k) {
    const ops = '+−×÷', fin = this.expr.slice(-1), num = /[\d,]/;
    if (/^[\d,]$/.test(k)) {
      if (this.neuf) this.expr = '';
      this.neuf = false;
      if (k === ',') {
        const nombre = (this.expr.match(/[\d,]*$/) || [''])[0];
        if (nombre.includes(',')) return this._afficher();
        if (!nombre) this.expr += '0';
      }
      if (fin === ')') this.expr += '×';
      this.expr += k;
    } else if (ops.includes(k)) {
      this.neuf = false;
      if (ops.includes(fin) && this.expr.length > 1) this.expr = this.expr.slice(0, -1) + k;
      else if (this.expr === '' || fin === '(') { if (k === '−') this.expr += k; }
      else if (!ops.includes(fin)) this.expr += k;
    } else if (k === '(') {
      if (this.neuf) this.expr = '';
      this.neuf = false;
      this.expr += num.test(fin) || fin === ')' ? '×(' : '(';
    } else if (k === ')') {
      this.neuf = false;
      const ouvertes = (this.expr.match(/\(/g) || []).length - (this.expr.match(/\)/g) || []).length;
      if (ouvertes > 0 && (num.test(fin) || fin === ')')) this.expr += ')';
    } else if (k === '⌫') {
      this.neuf = false;
      this.expr = this.expr.slice(0, -1);
    } else if (k === 'C') {
      this.neuf = false;
      this.expr = '';
    } else if (k === '±') {
      this.neuf = false;
      if (/^−?[\d,]+$/.test(this.expr)) this.expr = this.expr[0] === '−' ? this.expr.slice(1) : '−' + this.expr;
      else if (/^−\(.*\)$/.test(this.expr) && PaveNumerique.evaluer(this.expr.slice(2, -1)) !== null) this.expr = this.expr.slice(2, -1);
      else if (this.expr) this.expr = '−(' + this.expr + ')';
    } else if (k === 'OK') {
      if (this.appliquer()) this._quitter();
      return;
    } else if (k === 'Suivant') {
      return this.suivant();
    } else if (k === '⌨') {
      return this.clavier();
    }
    this._afficher();
  }

  // Écrit la valeur calculée dans le champ ; faux si la saisie ne donne pas un nombre (le pavé reste ouvert)
  appliquer() {
    const i = this.cible;
    if (!i) return false;
    // Saisie vide : champ vidé, comme au clavier (le champ décide de son sens)
    const v = this.expr === '' ? '' : PaveNumerique.evaluer(this.expr);
    if (v === null) { this.ecran.classList.add('pv-faux'); return false; }
    const texte = v === '' ? '' : String(Math.round(v * 1e6) / 1e6 + 0);
    if (texte !== this.depart) {
      i.value = texte;
      i.dispatchEvent(new Event('input', { bubbles: true }));
      i.dispatchEvent(new Event('change', { bubbles: true }));
    }
    return true;
  }

  // Champs servis et visibles du groupe de `i`, dans l'ordre du document
  _groupe(i) {
    const racine = (i.closest && i.closest('[data-pave-groupe]')) || document;
    return { racine, champs: Array.from(racine.querySelectorAll('input')).filter(x => this._eligible(x) && x.getClientRects().length) };
  }

  // Applique puis passe au champ suivant du groupe (le dernier referme) ; l'application peut reconstruire les
  // champs : le suivant est cherché après, à la même place
  suivant() {
    const i = this.cible;
    if (!i) return;
    const avant = this._groupe(i), rang = avant.champs.indexOf(i);
    if (!this.appliquer()) return;
    const apres = avant.racine === document || avant.racine.isConnected ? this._groupe(i.isConnected ? i : avant.racine).champs : [];
    const k = apres.indexOf(i), prochain = apres[(k >= 0 ? k : rang) + 1];
    if (!prochain) { this._quitter(); return; }
    this._sansClavier(prochain);
    this.ouvrir(prochain);
    prochain.focus();
  }

  // Ferme et retire le focus du champ (OK, dernier Suivant)
  _quitter() {
    const i = this.cible;
    this.fermer();
    if (i && document.activeElement === i) i.blur();
  }

  // Rend ce champ au clavier du système
  clavier() {
    const i = this.cible;
    if (!i) return;
    this.fermer();
    i.blur();
    i.dataset.paveClavier = '1';
    this._sansClavier(i, true);
    i.focus();
  }

  // Calcul de la saisie : nombres (virgule ou point), + − × ÷ (ou + - * /), parenthèses (celles qui manquent à la
  // fin sont refermées), signe devant un nombre ou une parenthèse ; null si invalide ou non fini
  static evaluer(texte) {
    const s = String(texte).replace(/,/g, '.').replace(/×/g, '*').replace(/÷/g, '/').replace(/[−–]/g, '-').replace(/\s+/g, '');
    if (!s) return null;
    let k = 0;
    const lex = () => s[k];
    const somme = () => {
      let v = produit();
      while (v !== null && (lex() === '+' || lex() === '-')) {
        const op = s[k++], w = produit();
        v = w === null ? null : op === '+' ? v + w : v - w;
      }
      return v;
    };
    const produit = () => {
      let v = facteur();
      while (v !== null && (lex() === '*' || lex() === '/')) {
        const op = s[k++], w = facteur();
        v = w === null ? null : op === '*' ? v * w : v / w;
      }
      return v;
    };
    const facteur = () => {
      if (lex() === '-' || lex() === '+') { const op = s[k++], v = facteur(); return v === null ? null : op === '-' ? -v : v; }
      if (lex() === '(') {
        k++;
        const v = somme();
        if (lex() === ')') k++;
        else if (k < s.length) return null;
        return v;
      }
      const m = /^(\d+\.?\d*|\.\d+)/.exec(s.slice(k));
      if (!m) return null;
      k += m[0].length;
      return parseFloat(m[0]);
    };
    const v = somme();
    return v !== null && k === s.length && isFinite(v) ? v : null;
  }

  // ─── Affichage ───

  _afficher() {
    this.expr_.textContent = this.expr;
    this.expr_.classList.toggle('pv-neuf', this.neuf && this.expr !== '');
    this.ecran.classList.remove('pv-faux');
    const v = /[+−×÷()]/.test(this.expr.replace(/^−/, '')) ? PaveNumerique.evaluer(this.expr) : null;
    this.res.textContent = v === null ? '' : '= ' + String(Math.round(v * 1e6) / 1e6 + 0).replace('.', ',').replace('-', '−');
  }

  _construire() {
    PaveNumerique._style();
    const el = this.el = document.createElement('div');
    el.className = 'pv-pave';
    el.hidden = true;
    // Garder le focus sur le champ pendant la saisie
    for (const t of ['pointerdown', 'mousedown']) el.addEventListener(t, ev => ev.preventDefault());
    const barre = document.createElement('div');
    barre.className = 'pv-barre';
    const prise = document.createElement('span');
    prise.className = 'pv-prise';
    prise.textContent = '⠿';
    this.nom = document.createElement('span');
    this.nom.className = 'pv-nom';
    barre.append(prise, this.nom);
    this._glisser(barre);
    this.ecran = document.createElement('div');
    this.ecran.className = 'pv-ecran';
    this.expr_ = document.createElement('span');
    this.expr_.className = 'pv-expr';
    this.res = document.createElement('span');
    this.res.className = 'pv-res';
    this.ecran.append(this.expr_, this.res);
    const touches = document.createElement('div');
    touches.className = 'pv-touches';
    for (const k of ['7', '8', '9', '÷', '4', '5', '6', '×', '1', '2', '3', '−', '0', ',', '±', '+', '(', ')', '⌫', 'C', '⌨', 'Suivant', 'OK']) {
      const b = document.createElement('button');
      b.type = 'button';
      b.tabIndex = -1;
      b.textContent = k;
      b.className = /^[\d,]$/.test(k) ? 'pv-chiffre' : k === 'OK' ? 'pv-ok' : k === 'Suivant' ? 'pv-suivant' : 'pv-op';
      if (k === '⌨') b.setAttribute('aria-label', 'Clavier du système');
      b.addEventListener('click', () => this.touche(k));
      touches.appendChild(b);
    }
    el.append(barre, this.ecran, touches);
    document.body.appendChild(el);
  }

  // Déplacement par la barre ; la position est gardée
  _glisser(barre) {
    let depart = null;
    barre.addEventListener('pointerdown', ev => {
      const r = this.el.getBoundingClientRect();
      depart = { x: ev.clientX - r.left, y: ev.clientY - r.top, id: ev.pointerId };
      barre.setPointerCapture(ev.pointerId);
    });
    barre.addEventListener('pointermove', ev => {
      if (!depart || ev.pointerId !== depart.id) return;
      this._poser(ev.clientX - depart.x, ev.clientY - depart.y);
    });
    const fin = () => {
      if (!depart) return;
      depart = null;
      const r = this.el.getBoundingClientRect();
      this.position = [r.left, r.top];
      this._garder();
    };
    barre.addEventListener('pointerup', fin);
    barre.addEventListener('pointercancel', fin);
  }

  _poser(x, y) {
    const r = this.el.getBoundingClientRect(), m = 8;
    this.el.style.left = Math.max(m, Math.min(x, innerWidth - r.width - m)) + 'px';
    this.el.style.top = Math.max(m, Math.min(y, innerHeight - r.height - m)) + 'px';
  }

  // Position gardée si elle ne cache pas le champ, sinon à côté de lui : à droite, à gauche, dessous ou dessus
  _placer() {
    const p = this.el.getBoundingClientRect(), c = this.cible.getBoundingClientRect(), m = 12;
    const couvre = (x, y) => x < c.right && x + p.width > c.left && y < c.bottom && y + p.height > c.top;
    if (this.position && !couvre(...this.position)) { this._poser(...this.position); return; }
    const milieu = c.top + c.height / 2 - p.height / 2;
    if (c.right + m + p.width <= innerWidth - 8) this._poser(c.right + m, milieu);
    else if (c.left - m - p.width >= 8) this._poser(c.left - m - p.width, milieu);
    else if (c.bottom + m + p.height <= innerHeight - 8) this._poser(c.left, c.bottom + m);
    else this._poser(c.left, c.top - m - p.height);
  }

  static _style() {
    if (document.getElementById('pv-style')) return;
    const st = document.createElement('style');
    st.id = 'pv-style';
    st.textContent = `
      .pv-pave{position:fixed;left:0;top:0;z-index:1000;width:15.5rem;background:var(--surface-color);color:var(--text-color);
        border-radius:var(--radius);box-shadow:0 6px 24px rgba(0,0,0,.28);padding:0 .5rem .5rem;user-select:none;-webkit-user-select:none;
        touch-action:none}
      .pv-pave[hidden]{display:none}
      .pv-barre{display:flex;align-items:center;gap:.4rem;padding:.45rem .2rem;cursor:grab}
      .pv-prise{color:var(--inactive-color);font-size:1.1rem;line-height:1}
      .pv-nom{flex:1;min-width:0;font-size:.8rem;color:var(--inactive-color);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
      .pv-ecran{display:flex;flex-direction:column;align-items:flex-end;background:var(--background-color);border-radius:10px;
        padding:.35rem .6rem;margin-bottom:.4rem;min-height:3.1rem;border:1px solid transparent;overflow:hidden}
      .pv-ecran.pv-faux{border-color:var(--hot-color)}
      .pv-expr{font-size:1.3rem;font-weight:600;white-space:nowrap;min-height:1.6rem}
      .pv-expr.pv-neuf{background:var(--accent-color);color:#fff;border-radius:5px;padding:0 .25rem}
      .pv-res{font-size:.85rem;color:var(--inactive-color);min-height:1.1rem}
      .pv-touches{display:grid;grid-template-columns:repeat(4,1fr);gap:.3rem}
      .pv-touches button{border:0;border-radius:10px;min-height:2.9rem;font:inherit;font-size:1.15rem;background:var(--background-color);
        color:var(--text-color)}
      .pv-touches .pv-op{color:var(--accent-color);font-weight:700}
      .pv-touches .pv-suivant{grid-column:span 2;font-size:.95rem;font-weight:700;color:var(--accent-color)}
      .pv-touches .pv-ok{background:var(--accent-color);color:#fff;font-weight:700;font-size:1rem}
      .pv-touches button:active{filter:brightness(.9)}
      input.pv-cible{outline:2px solid var(--accent-color);outline-offset:1px}
    `;
    document.head.appendChild(st);
  }
}

window.PaveNumerique = PaveNumerique;
window.pave = new PaveNumerique();
