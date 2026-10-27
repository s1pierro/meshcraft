// visserie.js — visserie métrique ISO (filet à 60°, pas gros, à droite) en maillages fermés (`Maillage`),
// 1 unité = 1 mm, axe Y : vis / boulon (tête hexagonale ISO 4017, cylindrique à six pans creux ISO 4762, fraisée à six
// pans creux ISO 10642), écrou hexagonal (ISO 4032), rondelle plate (ISO 7089), tige filetée. Cotes : `Visserie.TAILLES`.
// Réglages détaillés (`detail: true`, impression 3D : jeu, filet adouci…) : diamètre, pas, profondeur du filet,
// épaisseur de son sommet et de sa gorge (fond), longueurs filetée et lisse ; voir `parametres` ; la tête garde les
// cotes de la taille. `probleme(piece, o)` dit pourquoi une pièce est impossible (les constructeurs lèvent alors).
// Le filet est une vraie hélice, échantillonnée par anneaux plans : `segments` sommets par tour (multiple de 6, pour
// tomber sur les angles des pans), `rangs` anneaux par pas. Écrou et vis d'une même taille se vissent l'un sur l'autre
// (même hélice, sans jeu).
// Chaque pièce est une suite d'anneaux de `segments` sommets parcourant le profil de la pièce dans le plan (rayon,
// hauteur), dans le sens trigonométrique — montée par l'extérieur, retour par le dessus et l'intérieur — ce qui
// oriente toutes les faces vers l'extérieur ; une extrémité sur l'axe donne un éventail de triangles.
// Méthode « soustraction » (`methode: 'soustraction'`) : un corps lisse chanfreiné, moins un outil de coupe d'un seul
// tenant (`outil`) : le profil du creux entre deux filets (trapèze, triangle si la gorge est nulle), incliné de l'angle
// d'hélice au diamètre moyen pour être perpendiculaire à sa trajectoire, recopié `segments` fois par tour en hélice ;
// une seule différence par Manifold (moteur/booleens.js, `Booleens.charger()` fait avant). Vis : sortie de filet sur
// le dernier tour sous la tête (l'outil s'écarte de l'axe jusqu'à ne plus mordre). Écrou : prisme chanfreiné moins
// une tige lisse elle-même filetée par l'outil (deux différences).
// Vis : la face d'appui de la tête est en y = 0, la tige descend jusqu'à y = −longueur (la tête fraisée est comprise
// dans la longueur, son dessus en y = 0) ; écrou et rondelle posés sur y = 0 ; tige filetée centrée.

class Visserie {
  // Rayon de la surface filetée selon la phase u ∈ [0, p) : sommet plat (épaisseur c), flanc, gorge plate
  // (épaisseur g), flanc ; profondeur h. ISO : c = p/8, g = p/4, h = 5H/8 (H = 0,866 p)
  static profil(u, p, rmaj, h = 0.54127 * p, c = p / 8, g = p / 4) {
    const f = (p - c - g) / 2;
    if (u < c) return rmaj;
    if (u < c + f) return rmaj - h * (u - c) / f;
    if (u < c + f + g) return rmaj - h;
    return rmaj - h + h * (u - c - f - g) / f;
  }

  // Anneau fileté à la hauteur y : un rayon par sommet ; `P` : paramètres (d, p, profondeur, sommet, gorge) ;
  // `borne(r)` applique un chanfrein
  static _filet(y, P, n, borne) {
    const p = P.p;
    return Array.from({ length: n }, (_, k) =>
      borne(Visserie.profil(((y + p * k / n) % p + p) % p, p, P.d / 2, P.profondeur, P.sommet, P.gorge)));
  }

  // Paramètres d'une pièce : ceux de la taille ISO (`o.taille`, `o.longueur`, `o.filetage`, `o.tete`), ou les
  // réglages de `o` si `o.detail`. Vis, tige, écrou : d, p, profondeur, sommet, gorge ; vis : filetee, lisse (sous
  // la tête) ; écrou : hauteur, plats ; rondelle : interieur, exterieur, epaisseur
  static parametres(piece, o) {
    const T = Visserie._taille(o.taille);
    let P;
    if (piece === 'rondelle') P = { interieur: T.d1, exterieur: T.d2, epaisseur: T.h };
    else {
      P = { d: T.d, p: T.p, profondeur: Math.round(0.54127 * T.p * 1e4) / 1e4, sommet: T.p / 8, gorge: T.p / 4 };
      if (piece === 'vis') {
        const utile = o.longueur - (o.tete === 'fraisee' ? Visserie._fraisee(T) : 0);
        P.filetee = o.filetage === 'partiel' ? Math.min(utile, 2 * T.d + 6) : utile;
        P.lisse = Math.round((utile - P.filetee) * 1e4) / 1e4;
      }
      if (piece === 'ecrou') Object.assign(P, { hauteur: T.m, plats: T.s });
    }
    if (o.detail) for (const k in P) if (typeof o[k] === 'number' && isFinite(o[k])) P[k] = o[k];
    return P;
  }

  // Outil de coupe du filet (méthode soustraction) : ruban hélicoïdal fermé du creux entre deux filets, du centre
  // de gorge `y0` (ou en dessous) jusqu'à ce que le profil atteigne `y1` ; n copies du profil par tour ; `sortie` :
  // sur le dernier tour, le profil s'écarte de l'axe jusqu'à un peu plus que la profondeur (sortie de filet).
  // Profil dans le plan axial (rayon ρ, hauteur) : gorge (largeur g) au rayon du fond, flancs jusqu'un peu au-delà du
  // rayon extérieur (largeur p − sommet au rayon extérieur), puis côtés parallèles : deux spires voisines ne se
  // touchent jamais (sommet nul : 2 % du pas gardés). Chaque point glisse le long de sa propre hélice jusqu'au plan
  // normal à l'hélice du diamètre moyen : le volume balayé garde le profil exact vu dans le plan axial
  static outil(P, n, y0, y1, sortie = false) {
    const p = P.p, R = P.d / 2, h = P.profondeur, rf = R - h, g = P.gorge, pente = (p - P.sommet - g) / 2 / h;
    const wmax = Math.min((p - P.sommet) / 2 + pente * 0.15 * h, 0.49 * p);
    const w1 = Math.max(wmax, g / 2), r1 = rf + (w1 - g / 2) / pente, r2 = Math.max(R, r1) + 0.5 * h;
    const axial = [[rf, -g / 2], [r1, -w1], [r2, -w1], [r2, w1], [r1, w1], [rf, g / 2]].filter((q, k, l) => k < 5 || g > 0);
    // Glissement le long de l'hélice (angle φ, hauteur −pφ/2π) jusqu'au plan normal à l'hélice de rayon moyen rm
    const rm = R - h / 2, a = p / (2 * Math.PI);
    const profil = axial.map(([r, y]) => {
      let f = 0;
      for (let k = 0; k < 8; k++) f -= (rm * r * Math.sin(f) - a * (y - a * f)) / (rm * r * Math.cos(f) + a * a);
      return [r, f, y - a * f];
    });
    // Centres de gorge : y = (p + sommet)/2 − pθ/2π (mod p), même hélice que la méthode par anneaux ; θ = −2πk/n
    const haut = Math.max(...profil.map(q => q[2]));
    const c0 = (p + P.sommet) / 2 + Math.floor((y0 - (p + P.sommet) / 2) / p) * p;
    const K = Math.max(1, Math.floor((y1 - haut - c0) * n / p));
    const m = profil.length, s = [], f = [], tour = sortie ? Math.min(n, K) : 0;
    for (let k = 0; k <= K; k++) {
      const t = -2 * Math.PI * k / n, d = tour && k > K - tour ? 1.08 * h * (k - K + tour) / tour : 0;
      for (const [r, phi, y] of profil) s.push([(r + d) * Math.cos(phi + t), c0 + y - a * t, (r + d) * Math.sin(phi + t)]);
    }
    for (let k = 0; k < K; k++) for (let i = 0; i < m; i++) {
      const A = k * m + i, B = k * m + (i + 1) % m, C = B + m, D = A + m;
      f.push({ s: [A, B, C], m: 'defaut' }, { s: [A, C, D], m: 'defaut' });
    }
    f.push({ s: profil.map((q, i) => i).reverse(), m: 'defaut' }, { s: profil.map((q, i) => K * m + i), m: 'defaut' });
    const outil = new Maillage(s, f);
    if (Visserie._volume(outil) < 0) for (const x of f) x.s.reverse();
    return outil;
  }

  // Volume signé (positif : faces vers l'extérieur)
  static _volume(mm) {
    let v = 0;
    for (const { s } of mm.faces) for (let k = 1; k + 1 < s.length; k++) {
      const [a, b, c] = [mm.sommets[s[0]], mm.sommets[s[k]], mm.sommets[s[k + 1]]];
      v += a[0] * (b[1] * c[2] - b[2] * c[1]) - a[1] * (b[0] * c[2] - b[2] * c[0]) + a[2] * (b[0] * c[1] - b[1] * c[0]);
    }
    return v / 6;
  }

  // Corps lisse − outil de coupe (Manifold doit être chargé)
  static _tarauder(corps, P, n, y0, y1, sortie) {
    if (!window.Booleens || !Booleens.pret) throw new Error('Manifold n’est pas encore chargé');
    return Booleens.operation(corps, Visserie.outil(P, n, y0, y1, sortie), 'difference');
  }

  // Rayon du bout chanfreiné (méthode soustraction) : un peu sous le fond du filet, pour que l'outil n'y affleure pas
  static _pointe(P) { return P.d / 2 - 1.05 * P.profondeur; }

  // Hauteur d'une tête fraisée à 90°
  static _fraisee(T) { return (T.dkF - T.d) / 2; }

  // Pourquoi la pièce est impossible (texte), ou ''
  static probleme(piece, o) {
    const T = Visserie._taille(o.taille), P = Visserie.parametres(piece, o);
    if (piece === 'rondelle') return P.interieur > 0 && P.exterieur > P.interieur && P.epaisseur > 0 ? '' : 'diamètre intérieur à garder sous l’extérieur';
    if (!(P.d > 0 && P.p > 0 && P.profondeur > 0 && P.sommet >= 0 && P.gorge >= 0)) return 'réglages invalides';
    if (P.sommet + P.gorge >= P.p) return 'sommet + gorge doivent rester sous le pas';
    if (P.profondeur >= P.d / 2) return 'filet plus profond que le rayon';
    if (piece === 'vis') {
      if (!(P.filetee > 0)) return o.detail ? 'longueur filetée nulle' : o.tete === 'fraisee' ? 'plus courte que sa tête fraisée' : 'longueur nulle';
      if (!(P.lisse >= 0)) return 'longueur lisse négative';
      const tete = o.tete === 'fraisee' ? T.dkF / 2 : o.tete === 'cylindrique' ? T.dkC / 2 : T.s / 2;
      if (P.d / 2 >= tete) return 'diamètre plus grand que la tête de la taille ' + o.taille;
      if (o.tete === 'fraisee' && T.sF / Math.sqrt(3) >= P.d / 2) return 'six pans creux plus large que la tige';
      if (o.methode === 'soustraction' && P.filetee + P.lisse <= 1.1 * P.profondeur) return 'trop courte pour son chanfrein';
    }
    if (piece === 'tige' && o.methode === 'soustraction' && o.longueur <= 2.2 * P.profondeur) return 'trop courte pour ses chanfreins';
    if (piece === 'ecrou' && !(P.d / 2 < P.plats / 2 && P.hauteur > 0)) return 'taraudage plus large que l’écrou';
    if (piece === 'ecrou' && o.methode === 'soustraction' && P.hauteur <= 2.3 * P.profondeur) return 'trop mince pour ses chanfreins';
    return '';
  }

  static _verifier(piece, o) {
    const e = Visserie.probleme(piece, o);
    if (e) throw new Error(e);
    return Visserie.parametres(piece, o);
  }

  // Rayon d'un hexagone de `s` sur plats, angles sur les angles multiples de 60°
  static _hexagone(s) { return t => s / 2 / Math.cos(((t % (Math.PI / 3)) + Math.PI / 3) % (Math.PI / 3) - Math.PI / 6); }

  // Anneaux à pas réguliers de y0 vers y1 (y1 compris), dans un sens ou dans l'autre
  static _hauteurs(y0, y1, dy) {
    const l = [], n = Math.max(1, Math.ceil(Math.abs(y1 - y0) / dy - 1e-9));
    for (let j = 0; j <= n; j++) l.push(y0 + (y1 - y0) * j / n);
    return l;
  }

  // Maillage d'une suite d'anneaux : { y, r } (r : nombre, fonction de l'angle ou tableau de n rayons) ou { y, axe } ;
  // `cyclique` : le dernier anneau rejoint le premier (pièce percée)
  static construire(anneaux, n, cyclique = false) {
    const s = [], f = [], idx = anneaux.map(a => {
      if (a.axe) { const c = s.push([0, a.y, 0]) - 1; return () => c; }
      const d = s.length;
      for (let k = 0; k < n; k++) {
        const t = 2 * Math.PI * k / n, r = Array.isArray(a.r) ? a.r[k] : typeof a.r === 'function' ? a.r(t) : a.r;
        s.push([r * Math.cos(t), a.y, r * Math.sin(t)]);
      }
      return k => d + k % n;
    });
    const m = anneaux.length;
    for (let i = 0; i < (cyclique ? m : m - 1); i++) {
      const a = idx[i], b = idx[(i + 1) % m];
      for (let k = 0; k < n; k++) {
        const q = [a(k), b(k), b(k + 1), a(k + 1)];
        f.push({ s: q.filter((v, j) => v !== q[(j + 1) % 4]), m: 'defaut' });   // sur l'axe : triangle
      }
    }
    return new Maillage(s, f);
  }

  static _taille(taille) {
    const T = Visserie.TAILLES[taille];
    if (!T) throw new Error('taille inconnue : ' + taille);
    return T;
  }

  // Nombre de sommets, pour prévenir avant de construire une pièce trop lourde
  static sommets(piece, o) {
    const P = Visserie.parametres(piece, o), n = o.segments;
    if (piece === 'rondelle') return 4 * n;
    const dy = P.p / o.rangs;
    if (piece === 'ecrou') return (2 + Math.ceil(P.hauteur / dy) + 1) * n;
    // Soustraction : environ huit sommets par copie du profil de l'outil
    if (o.methode === 'soustraction') return Math.ceil((piece === 'tige' ? o.longueur : piece === 'ecrou' ? P.hauteur + 2 * P.p : P.filetee) / P.p * n) * 8 + 4 * n;
    if (piece === 'tige') return (Math.ceil(o.longueur / dy) + 1) * n + 2;
    return (Math.ceil(P.filetee / dy) + 8) * n + 2;
  }

  // Vis ou boulon : tete 'hexagonale' | 'cylindrique' | 'fraisee' ; filetage 'total' | 'partiel' (ou `detail`) ;
  // methode 'anneaux' | 'soustraction'
  static vis(o = {}) {
    o = Object.assign({ taille: 'M8', tete: 'hexagonale', longueur: 20, filetage: 'total', segments: 24, rangs: 8 }, o);
    const { tete, segments: n, rangs } = o, T = Visserie._taille(o.taille), P = Visserie._verifier('vis', o);
    const p = P.p, R = P.d / 2, rf = R - P.profondeur;
    const kF = Visserie._fraisee(T);
    const haut = tete === 'fraisee' ? -kF : 0;   // haut de la tige
    const longueur = -haut + P.lisse + P.filetee, fin = -longueur + P.filetee;
    const anneaux = [{ y: -longueur, axe: true }], coupe = o.methode === 'soustraction';
    if (coupe) {   // corps lisse chanfreiné à 45°, fileté ensuite
      const r0 = Visserie._pointe(P);
      anneaux.push({ y: -longueur, r: r0 }, { y: -longueur + R - r0, r: R }, { y: haut, r: R });
    } else {
    // Filet, chanfreiné à 45° en bout depuis le fond du filet
    for (const y of Visserie._hauteurs(-longueur, fin, p / rangs))
      anneaux.push({ y, r: Visserie._filet(y, P, n, r => Math.min(r, rf + (y + longueur))) });
    if (fin < haut - 1e-9) {   // partie lisse
      const y = Math.min(fin + p / rangs, haut);
      anneaux.push({ y, r: R });
      if (y < haut - 1e-9) anneaux.push({ y: haut, r: R });
    }
    }
    if (tete === 'hexagonale') {
      const hex = Visserie._hexagone(T.s);
      anneaux.push({ y: 0, r: hex }, { y: T.k, r: hex }, { y: T.k, axe: true });
    } else if (tete === 'cylindrique') {
      const creux = Visserie._hexagone(T.sC), t = T.kC / 2;
      anneaux.push({ y: 0, r: T.dkC / 2 }, { y: T.kC, r: T.dkC / 2 }, { y: T.kC, r: creux }, { y: T.kC - t, r: creux }, { y: T.kC - t, axe: true });
    } else {
      const creux = Visserie._hexagone(T.sF), t = 0.6 * kF;
      anneaux.push({ y: 0, r: T.dkF / 2 }, { y: 0, r: creux }, { y: -t, r: creux }, { y: -t, axe: true });
    }
    const corps = Visserie.construire(anneaux, n);
    return coupe ? Visserie._tarauder(corps, P, n, -longueur - p, fin, true) : corps;
  }

  // Écrou hexagonal, posé sur y = 0 : taraudage chanfreiné à 45° sur ses deux faces ; methode 'anneaux' | 'soustraction'
  static ecrou(o = {}) {
    o = Object.assign({ taille: 'M8', segments: 24, rangs: 8 }, o);
    const P = Visserie._verifier('ecrou', o), R = P.d / 2, m = P.hauteur, hex = Visserie._hexagone(P.plats);
    if (o.methode === 'soustraction') {
      // Prisme aux chanfreins coniques (du rayon extérieur au fond du filet, un peu au-delà des deux), plein au
      // centre ; moins une tige lisse plus longue que l'écrou, filetée par l'outil : même hélice que la vis
      const n = o.segments, h = P.profondeur, a = R + 0.05 * h, b = R - 1.05 * h, c = a - b, p = P.p;
      const corps = Visserie.construire([{ y: c, axe: true }, { y: c, r: b }, { y: 0, r: a }, { y: 0, r: hex }, { y: m, r: hex },
        { y: m, r: a }, { y: m - c, r: b }, { y: m - c, axe: true }], n);
      const tige = Visserie._tarauder(Visserie.construire([{ y: -p, axe: true }, { y: -p, r: R }, { y: m + p, r: R },
        { y: m + p, axe: true }], n), P, n, -2 * p, m + 2 * p);
      return Booleens.operation(corps, tige, 'difference');
    }
    const anneaux = [{ y: 0, r: hex }, { y: m, r: hex }];
    for (const y of Visserie._hauteurs(m, 0, P.p / o.rangs))
      anneaux.push({ y, r: Visserie._filet(y, P, o.segments, r => Math.max(r, R - Math.min(y, m - y))) });
    return Visserie.construire(anneaux, o.segments, true);
  }

  // Rondelle plate, posée sur y = 0
  static rondelle(o = {}) {
    o = Object.assign({ taille: 'M8', segments: 32 }, o);
    const P = Visserie._verifier('rondelle', o), a = P.interieur / 2, b = P.exterieur / 2, h = P.epaisseur;
    return Visserie.construire([{ y: 0, r: b }, { y: h, r: b }, { y: h, r: a }, { y: 0, r: a }], o.segments, true);
  }

  // Tige filetée centrée sur l'origine, chanfreinée aux deux bouts ; methode 'anneaux' | 'soustraction'
  static tige(o = {}) {
    o = Object.assign({ taille: 'M8', longueur: 50, segments: 24, rangs: 8 }, o);
    const P = Visserie._verifier('tige', o), segments = o.segments, rf = P.d / 2 - P.profondeur, l = o.longueur / 2;
    if (o.methode === 'soustraction') {
      const R = P.d / 2, r0 = Visserie._pointe(P), c = R - r0;
      const corps = Visserie.construire([{ y: -l, axe: true }, { y: -l, r: r0 }, { y: -l + c, r: R }, { y: l - c, r: R },
        { y: l, r: r0 }, { y: l, axe: true }], segments);
      return Visserie._tarauder(corps, P, segments, -l - P.p, l + P.p);
    }
    const anneaux = [{ y: -l, axe: true }];
    for (const y of Visserie._hauteurs(-l, l, P.p / o.rangs))
      anneaux.push({ y, r: Visserie._filet(y, P, segments, r => Math.min(r, rf + Math.min(y + l, l - y))) });
    anneaux.push({ y: l, axe: true });
    return Visserie.construire(anneaux, segments);
  }
}

// Cotes en mm par taille : d diamètre, p pas gros ; s sur plats (tête H et écrou), k hauteur de tête H (ISO 4017),
// m hauteur d'écrou (ISO 4032) ; dkC, kC, sC tête cylindrique et son six pans creux (ISO 4762) ; dkF, sF tête
// fraisée et son six pans creux (ISO 10642, prolongée pour M2, M2,5 et M24) ; d1, d2, h rondelle (ISO 7089)
Visserie.TAILLES = {
  'M2':   { d: 2,   p: 0.4,  s: 4,   k: 1.4,  m: 1.6,  dkC: 3.8, kC: 2,   sC: 1.5, dkF: 4.4,   sF: 1.3, d1: 2.2,  d2: 5,  h: 0.3 },
  'M2,5': { d: 2.5, p: 0.45, s: 5,   k: 1.7,  m: 2,    dkC: 4.5, kC: 2.5, sC: 2,   dkF: 5.5,   sF: 1.5, d1: 2.7,  d2: 6,  h: 0.5 },
  'M3':   { d: 3,   p: 0.5,  s: 5.5, k: 2,    m: 2.4,  dkC: 5.5, kC: 3,   sC: 2.5, dkF: 6.72,  sF: 2,   d1: 3.2,  d2: 7,  h: 0.5 },
  'M4':   { d: 4,   p: 0.7,  s: 7,   k: 2.8,  m: 3.2,  dkC: 7,   kC: 4,   sC: 3,   dkF: 8.96,  sF: 2.5, d1: 4.3,  d2: 9,  h: 0.8 },
  'M5':   { d: 5,   p: 0.8,  s: 8,   k: 3.5,  m: 4.7,  dkC: 8.5, kC: 5,   sC: 4,   dkF: 11.2,  sF: 3,   d1: 5.3,  d2: 10, h: 1 },
  'M6':   { d: 6,   p: 1,    s: 10,  k: 4,    m: 5.2,  dkC: 10,  kC: 6,   sC: 5,   dkF: 13.44, sF: 4,   d1: 6.4,  d2: 12, h: 1.6 },
  'M8':   { d: 8,   p: 1.25, s: 13,  k: 5.3,  m: 6.8,  dkC: 13,  kC: 8,   sC: 6,   dkF: 17.92, sF: 5,   d1: 8.4,  d2: 16, h: 1.6 },
  'M10':  { d: 10,  p: 1.5,  s: 16,  k: 6.4,  m: 8.4,  dkC: 16,  kC: 10,  sC: 8,   dkF: 22.4,  sF: 6,   d1: 10.5, d2: 20, h: 2 },
  'M12':  { d: 12,  p: 1.75, s: 18,  k: 7.5,  m: 10.8, dkC: 18,  kC: 12,  sC: 10,  dkF: 26.88, sF: 8,   d1: 13,   d2: 24, h: 2.5 },
  'M16':  { d: 16,  p: 2,    s: 24,  k: 10,   m: 14.8, dkC: 24,  kC: 16,  sC: 14,  dkF: 33.6,  sF: 10,  d1: 17,   d2: 30, h: 3 },
  'M20':  { d: 20,  p: 2.5,  s: 30,  k: 12.5, m: 18,   dkC: 30,  kC: 20,  sC: 17,  dkF: 40.32, sF: 12,  d1: 21,   d2: 37, h: 3 },
  'M24':  { d: 24,  p: 3,    s: 36,  k: 15,   m: 21.5, dkC: 36,  kC: 24,  sC: 19,  dkF: 48,    sF: 14,  d1: 25,   d2: 44, h: 4 }
};

window.Visserie = Visserie;
