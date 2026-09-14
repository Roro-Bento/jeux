/* Les différences — génération des deux scènes.
 *
 * Deux grilles identiques, sauf en N cases. Chaque différence porte sur UN
 * SEUL attribut d'une seule case : autrement, on ne saurait plus la décrire
 * proprement à l'autre (« il est plus petit… et vert ? »).
 *
 * Deux garde-fous :
 *   - une case ne porte jamais deux différences ;
 *   - un changement de taille ne se fait qu'entre petit et grand, jamais vers
 *     « moyen » : à l'oral, « un peu plus petit » n'est pas une information.
 */
(function (global) {
  'use strict';

  var RNG = global.RNG || (typeof require === 'function' ? require('../../common/rng.js') : null);

  var SHAPES = ['rond', 'carre', 'triangle', 'etoile', 'losange', 'croix'];
  var COLORS = ['rouge', 'bleu', 'vert', 'jaune', 'violet', 'orange'];
  var SIZES = ['petit', 'moyen', 'grand'];
  var FILLS = ['plein', 'contour'];

  var LABELS = {
    sh: { rond: 'rond', carre: 'carré', triangle: 'triangle', etoile: 'étoile', losange: 'losange', croix: 'croix' },
    co: { rouge: 'rouge', bleu: 'bleu', vert: 'vert', jaune: 'jaune', violet: 'violet', orange: 'orange' },
    sz: { petit: 'petit', moyen: 'moyen', grand: 'grand' },
    fi: { plein: 'plein', contour: 'en contour' }
  };
  var ATTR_LABELS = { sh: 'la forme', co: 'la couleur', sz: 'la taille', fi: 'le remplissage' };

  var COLS = 'ABCDEFGH';

  /** Repère parlable d'une case : « C3 ». */
  function cellName(i, cols) {
    return COLS[i % cols] + (Math.floor(i / cols) + 1);
  }

  function cell(rng) {
    return {
      sh: RNG.pick(rng, SHAPES),
      co: RNG.pick(rng, COLORS),
      sz: RNG.pick(rng, SIZES),
      fi: RNG.pick(rng, FILLS)
    };
  }

  function copy(c) { return { sh: c.sh, co: c.co, sz: c.sz, fi: c.fi }; }

  /** Une autre valeur que celle en place, dans la liste donnée. */
  function otherValue(rng, list, current) {
    var choices = list.filter(function (v) { return v !== current; });
    return RNG.pick(rng, choices);
  }

  /* Applique la différence sur l'une des deux cases.
     Pour la taille, on cale d'abord les DEUX cases sur petit ou grand : une
     différence petit/moyen se voit à peine et ne se dit pas. */
  function mutate(rng, from, to, attr) {
    if (attr === 'sh') { to.sh = otherValue(rng, SHAPES, from.sh); return; }
    if (attr === 'co') { to.co = otherValue(rng, COLORS, from.co); return; }
    if (attr === 'fi') { to.fi = otherValue(rng, FILLS, from.fi); return; }
    if (attr === 'sz') {
      var base = from.sz === 'grand' ? 'grand' : from.sz === 'petit' ? 'petit' : RNG.pick(rng, ['petit', 'grand']);
      from.sz = base;
      to.sz = base === 'petit' ? 'grand' : 'petit';
    }
  }

  /**
   * @param {object} rng
   * @param {{cols:number, rows:number, diffs:number}} opts
   * @returns {{cols, rows, a:Array, b:Array, diffs:Array<{i, attr, cell}>}}
   */
  function generate(rng, opts) {
    var cols = Math.max(3, Math.min(8, opts.cols || 5));
    var rows = Math.max(3, Math.min(6, opts.rows || 4));
    var n = cols * rows;
    var want = Math.max(1, Math.min(n, opts.diffs || 6));

    var a = [];
    for (var i = 0; i < n; i++) a.push(cell(rng));

    // les cases qui porteront une différence, une seule chacune
    var spots = RNG.shuffle(rng, a.map(function (_, k) { return k; })).slice(0, want);

    var b = a.map(copy);
    var diffs = spots.map(function (i) {
      var attr = RNG.pick(rng, ['sh', 'co', 'sz', 'fi']);
      // la version modifiée tombe une fois sur deux chez l'un, une fois chez
      // l'autre : aucune des deux scènes n'est « l'originale »
      var onB = RNG.int(rng, 0, 1) === 1;
      mutate(rng, onB ? a[i] : b[i], onB ? b[i] : a[i], attr);
      return { i: i, attr: attr, cell: cellName(i, cols) };
    }).sort(function (x, y) { return x.i - y.i; });

    return { cols: cols, rows: rows, a: a, b: b, diffs: diffs };
  }

  /** Décrit une différence, pour le débriefing. */
  function describe(d, scene) {
    var A = scene.a[d.i], B = scene.b[d.i];
    var attr = d.attr;
    return ATTR_LABELS[attr] + ' — ' + LABELS[attr][A[attr]] + ' d’un côté, ' +
      LABELS[attr][B[attr]] + ' de l’autre';
  }

  var API = {
    generate: generate,
    describe: describe,
    cellName: cellName,
    SHAPES: SHAPES, COLORS: COLORS, SIZES: SIZES, FILLS: FILLS,
    LABELS: LABELS, ATTR_LABELS: ATTR_LABELS, COLS: COLS
  };
  global.Scene = API;
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
})(typeof window !== 'undefined' ? window : globalThis);
