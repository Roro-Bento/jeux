/* Désamorçage — la bombe elle-même : hasard reproductible, numéro de série,
 * piles et voyants. Ce sont les « repères » auxquels les règles des modules
 * font référence.
 */
(function (global) {
  'use strict';

  var RNG = global.RNG || (typeof require === 'function' ? require('../../common/rng.js') : null);

  // Le hasard reproductible vit dans common/rng.js ; on le réexporte ici pour
  // que les modules de la bombe n'aient qu'une seule dépendance.
  var rngFrom = RNG.rngFrom, pick = RNG.pick, int = RNG.int,
      shuffle = RNG.shuffle, sample = RNG.sample;

  var SERIAL_LETTERS = 'ABCDEFGHJKLMNPRSTUVWXZ';   // sans I, O, Q, Y
  var VOWELS = 'AEU';                               // voyelles présentes dans le jeu
  var INDICATOR_CODES = ['SND', 'CLR', 'CAR', 'FRK', 'MSA', 'TRN'];

  /** 6 caractères, le dernier est toujours un chiffre. */
  function makeSerial(rng) {
    var s = '';
    for (var i = 0; i < 5; i++) {
      s += rng() < 0.55 ? SERIAL_LETTERS[Math.floor(rng() * SERIAL_LETTERS.length)]
                        : String(int(rng, 0, 9));
    }
    return s + String(int(rng, 0, 9));
  }

  function makeWidgets(rng) {
    return {
      serial: makeSerial(rng),
      batteries: int(rng, 0, 5),
      indicators: sample(rng, INDICATOR_CODES, 3).map(function (code) {
        return { code: code, lit: rng() < 0.5 };
      })
    };
  }

  // --------------------------------------------------------- lecture des repères
  function lastDigit(bomb) {
    var m = String(bomb.serial).match(/(\d)(?!.*\d)/);
    return m ? parseInt(m[1], 10) : 0;
  }
  function lastDigitOdd(bomb) { return lastDigit(bomb) % 2 === 1; }
  function hasVowel(bomb) {
    return String(bomb.serial).toUpperCase().split('').some(function (c) {
      return VOWELS.indexOf(c) !== -1;
    });
  }
  function lit(bomb, code) {
    return (bomb.indicators || []).some(function (i) { return i.code === code && i.lit; });
  }

  var API = {
    rngFrom: rngFrom,
    pick: pick,
    int: int,
    shuffle: shuffle,
    sample: sample,
    makeWidgets: makeWidgets,
    lastDigit: lastDigit,
    lastDigitOdd: lastDigitOdd,
    hasVowel: hasVowel,
    lit: lit,
    INDICATOR_CODES: INDICATOR_CODES,
    VOWELS: VOWELS
  };

  global.Bomb = API;
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
})(typeof window !== 'undefined' ? window : globalThis);
