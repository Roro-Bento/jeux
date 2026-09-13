/* Règles linguistiques — Mot de Passe coop
 *
 * Objectif : empêcher les indices « trop faciles » qui donnent le mot,
 * sans devenir tatillon.
 *
 * Ce qui est BLOQUÉ :
 *   - le mot lui-même, quelle que soit la casse et les accents (CHÂT = chat)
 *   - ses variantes de flexion : pluriels, féminins, -aux/-al, -eur/-euse…
 *     (chats, chatte, chevaux, danseuse pour danseur…)
 *   - les chiffres (pour ne pas coder le nombre de lettres)
 *   - un indice déjà donné pour le mot en cours
 *
 * Ce qui est AUTORISÉ (choix assumé, sinon le jeu devient injouable) :
 *   - les mots de la même racine mais différents : chaton pour chat,
 *     pommier pour pomme, sourire pour souris…
 */
(function (global) {
  'use strict';

  var STOPWORDS = {
    le: 1, la: 1, les: 1, un: 1, une: 1, des: 1, du: 1, de: 1, d: 1,
    a: 1, au: 1, aux: 1, en: 1, et: 1, l: 1, ou: 1, "y": 1
  };

  // Pluriels / formes irrégulières qu'un algorithme ne rattrape pas
  var IRREGULAR = {
    yeux: 'oeil', oeil: 'oeil',
    cieux: 'ciel', ciel: 'ciel',
    travaux: 'travail', travail: 'travail',
    chevaux: 'cheval', cheval: 'cheval',
    vieux: 'vieux', vieille: 'vieux',
    bijoux: 'bijou', cailloux: 'caillou', genoux: 'genou',
    hiboux: 'hibou', choux: 'chou', poux: 'pou',
    messieurs: 'monsieur', mesdames: 'madame',
    oeufs: 'oeuf', oeuf: 'oeuf',
    boeufs: 'boeuf', boeuf: 'boeuf'
  };

  /** minuscules, sans accents, sans ponctuation, espaces normalisés */
  function normalize(str) {
    return String(str == null ? '' : str)
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/œ/g, 'oe')
      .replace(/æ/g, 'ae')
      .replace(/[’'`´]/g, ' ')
      .replace(/[-–—_/.,;:!?"()\[\]]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  /** mots significatifs (articles retirés) */
  function tokens(str) {
    var parts = normalize(str).split(' ').filter(Boolean);
    var kept = parts.filter(function (t) { return !STOPWORDS[t]; });
    return kept.length ? kept : parts;
  }

  /** Racine de flexion : ne retire que les marques de nombre / genre. */
  function stem(word) {
    var w = normalize(word).replace(/ /g, '');
    if (!w) return '';
    if (IRREGULAR[w]) return IRREGULAR[w];

    // pluriels
    if (w.length > 4 && /eaux$/.test(w)) w = w.slice(0, -1);          // bateaux -> bateau
    else if (w.length > 4 && /aux$/.test(w)) w = w.slice(0, -3) + 'al'; // journaux -> journal
    else if (w.length > 3 && /[sx]$/.test(w)) w = w.slice(0, -1);      // chats -> chat

    // féminins courants
    if (w.length >= 7 && /euse$/.test(w)) w = w.slice(0, -4) + 'eur';   // danseuse -> danseur
    else if (w.length >= 7 && /trice$/.test(w)) w = w.slice(0, -5) + 'teur'; // actrice -> acteur
    else if (w.length >= 6 && /ere$/.test(w)) w = w.slice(0, -3) + 'er'; // boulangere -> boulanger
    else if (w.length > 3 && /e$/.test(w)) {
      var c = w.slice(0, -1);                                          // grande -> grand
      if (c.length > 3 && c[c.length - 1] === c[c.length - 2]) c = c.slice(0, -1); // chienne -> chien
      // on ne dégrade pas les mots courts : « mère » ne doit pas devenir « mer »
      if (c.length >= 4) w = c;
    }

    if (IRREGULAR[w]) return IRREGULAR[w];
    return w;
  }

  /** Deux mots appartiennent-ils à la même famille de flexion ? */
  function sameFamily(a, b) {
    var na = normalize(a).replace(/ /g, '');
    var nb = normalize(b).replace(/ /g, '');
    if (!na || !nb) return false;
    if (na === nb) return true;
    var sa = stem(na), sb = stem(nb);
    if (!sa || !sb) return false;
    if (sa.length < 3 || sb.length < 3) return sa === sb;
    return sa === sb;
  }

  /**
   * Valide un indice.
   * @returns {{ok:boolean, reason?:string, message?:string}}
   */
  function checkClue(clue, target, opts) {
    opts = opts || {};
    var previous = opts.previousClues || [];
    var raw = String(clue == null ? '' : clue).trim();

    if (!raw) return bad('empty', 'Écris un indice.');
    if (raw.length > 30) return bad('long', 'Indice trop long.');
    if (/\d/.test(raw)) return bad('digit', 'Pas de chiffres dans les indices.');

    var words = raw.split(/\s+/).filter(Boolean);
    if (opts.singleWord !== false && words.length > 1) {
      return bad('multi', 'Un seul mot par indice.');
    }
    if (words.length > 4) return bad('multi', 'Indice trop long.');

    var norm = normalize(raw);
    if (!norm) return bad('empty', 'Écris un indice.');

    for (var p = 0; p < previous.length; p++) {
      if (normalize(previous[p]) === norm) {
        return bad('repeat', 'Tu as déjà donné cet indice.');
      }
    }

    var clueTokens = tokens(raw);
    var targetTokens = tokens(target);
    for (var i = 0; i < clueTokens.length; i++) {
      for (var j = 0; j < targetTokens.length; j++) {
        if (sameFamily(clueTokens[i], targetTokens[j])) {
          return bad('family', 'Interdit : c’est le mot (ou une de ses formes).');
        }
      }
    }
    return { ok: true, value: raw };
  }

  function bad(reason, message) {
    return { ok: false, reason: reason, message: message };
  }

  /** La proposition correspond-elle au mot ? (tolérante aux accents / pluriel) */
  function checkGuess(guess, target) {
    var g = normalize(guess), t = normalize(target);
    if (!g) return false;
    if (g === t) return true;
    if (g.replace(/ /g, '') === t.replace(/ /g, '')) return true;

    var gt = tokens(guess), tt = tokens(target);
    if (gt.length === tt.length) {
      var all = true;
      for (var i = 0; i < gt.length; i++) {
        if (stem(gt[i]) !== stem(tt[i])) { all = false; break; }
      }
      if (all) return true;
    }
    return stem(g) === stem(t) && stem(t).length >= 3;
  }

  /** Indication du nombre de lettres : [{word:'sac', len:3}, …] */
  function letterHint(target) {
    return String(target).split(/[\s’'-]+/).filter(Boolean).map(function (w) {
      var n = normalize(w).replace(/ /g, '').length;
      return { word: w, len: n };
    });
  }

  var API = {
    normalize: normalize,
    tokens: tokens,
    stem: stem,
    sameFamily: sameFamily,
    checkClue: checkClue,
    checkGuess: checkGuess,
    letterHint: letterHint
  };

  global.Rules = API;
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
})(typeof window !== 'undefined' ? window : globalThis);
