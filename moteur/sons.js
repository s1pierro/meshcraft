// moteur/sons.js — effets sonores par Web Audio : sons courts préchargés et décodés, joués sans latence,
// superposables. Les fichiers passent par fetch(), donc par le cache du service worker (hors ligne).
//
//   const sons = new Sons();                                  // ou moteur.sons
//   await sons.charger({ pas: 'sons/pas.ogg', porte: 'sons/porte.ogg' });
//   sons.jouer('coup');   sons.jouer('prise', { volume: 0.6, vitesse: 1.1, delai: 0.2 });
//   sons.actif = false;                                       // muet (les appels à jouer() sont ignorés)
//
// Les navigateurs n'autorisent le son qu'après un geste de l'utilisateur : le contexte audio, commun à toute
// l'application, est réveillé au premier toucher de la page. Sans Web Audio (ou hors navigateur), tout est muet.

class Sons {
  constructor({ volume = 1 } = {}) {
    this.actif = true;
    this.tampons = {};                 // nom → AudioBuffer décodé
    this.ac = Sons.contexte();
    if (!this.ac) return;
    this.sortie = this.ac.createGain();
    this.sortie.gain.value = volume;
    this.sortie.connect(this.ac.destination);
  }

  // Contexte audio partagé (un seul par page), réveillé au premier geste puis à chaque retour au premier plan
  static contexte() {
    if (Sons._ac !== undefined) return Sons._ac;
    const AC = window.AudioContext || window.webkitAudioContext;
    Sons._ac = AC ? new AC() : null;
    if (Sons._ac && typeof document !== 'undefined' && document.addEventListener) {
      const reveiller = () => { if (Sons._ac.state !== 'running') Sons._ac.resume().catch(() => {}); };
      for (const t of ['pointerdown', 'touchend', 'click']) document.addEventListener(t, reveiller, { capture: true, passive: true });
    }
    return Sons._ac;
  }

  get volume() { return this.sortie ? this.sortie.gain.value : 0; }
  set volume(v) { if (this.sortie) this.sortie.gain.value = v; }

  // Charge et décode { nom: url, … } (promesse). Un fichier illisible est signalé en console, sans bloquer les autres.
  charger(liste) {
    if (!this.ac) return Promise.resolve();
    return Promise.all(Object.entries(liste).map(([nom, url]) => fetch(url)
      .then(r => { if (!r.ok) throw new Error(url + ' : ' + r.status); return r.arrayBuffer(); })
      // forme à rappels : acceptée aussi par les anciens Safari
      .then(d => new Promise((ok, ko) => this.ac.decodeAudioData(d, ok, ko)))
      .then(b => { this.tampons[nom] = b; })
      .catch(e => console.warn('Sons : ' + nom, e))));
  }

  // Joue un son chargé ; `delai` en secondes. Renvoie la source (pour l'arrêter : source.stop()) ou null.
  jouer(nom, { volume = 1, vitesse = 1, delai = 0 } = {}) {
    const b = this.tampons[nom];
    if (!this.actif || !b || !this.ac || this.ac.state !== 'running') return null;
    const s = this.ac.createBufferSource();
    s.buffer = b;
    s.playbackRate.value = vitesse;
    let n = s;
    if (volume !== 1) {
      n = this.ac.createGain();
      n.gain.value = volume;
      s.connect(n);
    }
    n.connect(this.sortie);
    s.start(this.ac.currentTime + delai);
    return s;
  }
}

window.Sons = Sons;
