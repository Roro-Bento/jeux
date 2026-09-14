/* Français — normalisation, familles de mots et comparaison de réponses.
 * Partagé par Mot de Passe, le Pendu et le Pictionary.
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
  /* Forme du mot pour celui qui devine : uniquement des longueurs.
     Surtout pas le mot lui-même — cette valeur part dans sa vue. */
  function letterHint(target) {
    return String(target).split(/[\s’'-]+/).filter(Boolean).map(function (w) {
      return { len: normalize(w).replace(/ /g, '').length };
    });
  }

  var API = {
    normalize: normalize,
    tokens: tokens,
    stem: stem,
    sameFamily: sameFamily,
    checkGuess: checkGuess,
    letterHint: letterHint
  };

  global.Fr = API;
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
})(typeof window !== 'undefined' ? window : globalThis);
