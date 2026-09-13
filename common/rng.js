/* Hasard reproductible — partagé par les jeux.
 * À graine égale, même partie : c'est ce qui rend les tests possibles.
 */
(function (global) {
  'use strict';

  /** mulberry32 */
  function rngFrom(seed) {
    var a = seed >>> 0;
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function randomSeed() { return Math.floor(Math.random() * 0xffffffff); }
  function pick(rng, list) { return list[Math.floor(rng() * list.length)]; }
  function int(rng, min, max) { return min + Math.floor(rng() * (max - min + 1)); }
  function shuffle(rng, list) {
    var a = list.slice();
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(rng() * (i + 1));
      var t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }
  function sample(rng, list, n) { return shuffle(rng, list).slice(0, n); }

  var API = {
    rngFrom: rngFrom,
    randomSeed: randomSeed,
    pick: pick,
    int: int,
    shuffle: shuffle,
    sample: sample
  };

  global.RNG = API;
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
})(typeof window !== 'undefined' ? window : globalThis);
