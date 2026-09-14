/* Règle d'indice de Mot de Passe.
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
 *
 * Le reste (normalisation, familles de mots, comparaison des réponses) vit
 * dans common/french.js, partagé avec le Pendu et le Pictionary.
 */
(function (global) {
  'use strict';

  var Fr = global.Fr || (typeof require === 'function' ? require('../../common/french.js') : null);
  var normalize = Fr.normalize, tokens = Fr.tokens, sameFamily = Fr.sameFamily;

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

  var API = {
    normalize: Fr.normalize,
    tokens: Fr.tokens,
    stem: Fr.stem,
    sameFamily: Fr.sameFamily,
    checkGuess: Fr.checkGuess,
    letterHint: Fr.letterHint,
    checkClue: checkClue
  };

  global.Rules = API;
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
})(typeof window !== 'undefined' ? window : globalThis);
