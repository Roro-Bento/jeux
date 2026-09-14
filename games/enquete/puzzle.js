/* L'enquête — génération des énigmes, et solveur.
 *
 * Une énigme, c'est une grille : chaque suspect a UN lieu, UN objet et UNE
 * heure, et chaque lieu, objet et heure n'appartient qu'à un suspect. Les
 * indices sont des phrases vraies sur cette grille.
 *
 * Tout l'intérêt du jeu tient dans la façon de couper le paquet d'indices en
 * deux : il faut que chaque moitié, seule, laisse PLUSIEURS grilles possibles,
 * et que les deux réunies n'en laissent qu'UNE. On l'obtient sans bricolage :
 *
 *   1. on part de la vraie grille et on empile des indices vrais jusqu'à ce
 *      qu'elle soit la seule possible ;
 *   2. on retire un par un tous les indices superflus — on obtient un jeu
 *      MINIMAL : enlever n'importe lequel casse l'unicité ;
 *   3. on coupe ce jeu minimal en deux moitiés non vides.
 *
 * Une moitié est alors un sous-ensemble strict d'un jeu minimal : elle ne peut
 * pas suffire. Aucun des deux joueurs ne peut donc conclure seul, par
 * construction. (test/enquete.test.js le revérifie sur des centaines d'énigmes.)
 */
(function (global) {
  'use strict';

  var RNG = global.RNG || (typeof require === 'function' ? require('../../common/rng.js') : null);

  var SUSPECTS = ['le majordome', 'la comtesse', 'le jardinier', 'la cuisinière', 'le notaire'];
  var LIEUX = ['la bibliothèque', 'le salon', 'la cuisine', 'la véranda', 'la cave'];
  var OBJETS = ['un carnet noir', 'une lampe torche', 'un parapluie', 'un trousseau de clés', 'un appareil photo'];
  var HEURES = ['20 h', '21 h', '22 h', '23 h', 'minuit'];

  var CATS = ['p', 'i', 't'];       // lieu, objet, heure
  var LABELS = { s: SUSPECTS, p: LIEUX, i: OBJETS, t: HEURES };

  function cap(s) { return s.charAt(0).toUpperCase() + s.slice(1); }

  // ---------------------------------------------------------------- phrases
  /** Comment on désigne quelqu'un : par son nom, son lieu, son objet, son heure. */
  function descText(d) {
    if (d.by === 's') return SUSPECTS[d.v];
    if (d.by === 'p') return 'la personne qui était dans ' + article(LIEUX[d.v]);
    if (d.by === 'i') return 'la personne qui avait ' + OBJETS[d.v];
    return 'la personne de ' + HEURES[d.v];
  }

  /** « la bibliothèque » → « la bibliothèque » (on garde l'article tel quel). */
  function article(s) { return s; }

  function attrText(cat, v, neg) {
    if (cat === 'p') return (neg ? 'n’était pas dans ' : 'était dans ') + LIEUX[v];
    if (cat === 'i') return (neg ? 'n’avait pas ' : 'avait ') + OBJETS[v];
    return (neg ? 'n’était pas là à ' : 'était là à ') + HEURES[v];
  }

  function clueText(c) {
    if (c.k === 'is') return cap(descText(c.a)) + ' ' + attrText(c.cat, c.v, c.neg) + '.';
    if (c.k === 'before') {
      return cap(descText(c.a)) + ' était là ' + (c.adj ? 'juste avant ' : 'avant ') + descText(c.b) + '.';
    }
    return cap(descText(c.a)) + ' était là en ' + (c.first ? 'premier' : 'dernier') + '.';
  }

  // --------------------------------------------------------------- évaluation
  /** Quel suspect correspond à ce descripteur, dans cette grille ? */
  function resolve(sol, d) {
    if (d.by === 's') return d.v;
    var list = sol[d.by];
    for (var s = 0; s < list.length; s++) if (list[s] === d.v) return s;
    return -1;
  }

  function holds(c, sol) {
    var s = resolve(sol, c.a);
    if (s < 0) return false;
    if (c.k === 'is') {
      var val = sol[c.cat][s];
      return c.neg ? val !== c.v : val === c.v;
    }
    if (c.k === 'before') {
      var s2 = resolve(sol, c.b);
      if (s2 < 0 || s2 === s) return false;
      var t1 = sol.t[s], t2 = sol.t[s2];
      return c.adj ? t2 === t1 + 1 : t1 < t2;
    }
    return sol.t[s] === (c.first ? 0 : sol.t.length - 1);
  }

  /** De quelles catégories un indice a-t-il besoin pour être évalué ? */
  function needs(c) {
    var set = {};
    function add(d) { if (d && d.by !== 's') set[d.by] = true; }
    add(c.a);
    if (c.b) add(c.b);
    if (c.k === 'is') set[c.cat] = true;
    else set.t = true;            // before / edge parlent du temps
    return set;
  }

  // ----------------------------------------------------------------- solveur
  function permutations(n) {
    var out = [];
    (function build(cur, left) {
      if (!left.length) { out.push(cur.slice()); return; }
      for (var i = 0; i < left.length; i++) {
        cur.push(left[i]);
        build(cur, left.slice(0, i).concat(left.slice(i + 1)));
        cur.pop();
      }
    })([], Array.apply(null, { length: n }).map(function (_, i) { return i; }));
    return out;
  }

  var PERMS = {};
  function perms(n) { return PERMS[n] || (PERMS[n] = permutations(n)); }

  /**
   * Compte les grilles compatibles avec les indices, en s'arrêtant à `limit`.
   * On teste chaque catégorie dès qu'elle est connue : inutile d'essayer les
   * 120 ordres d'heures si le lieu ne colle déjà pas.
   */
  function solve(clues, n, limit) {
    limit = limit || 2;
    var P = perms(n);
    var byStage = { p: [], i: [], t: [] };
    clues.forEach(function (c) {
      var need = needs(c);
      var stage = need.t ? 't' : (need.i ? 'i' : 'p');
      byStage[stage].push(c);
    });

    var found = [];
    var sol = { p: null, i: null, t: null };
    function ok(list) {
      for (var k = 0; k < list.length; k++) if (!holds(list[k], sol)) return false;
      return true;
    }
    for (var a = 0; a < P.length && found.length < limit; a++) {
      sol.p = P[a];
      if (!ok(byStage.p)) continue;
      for (var b = 0; b < P.length && found.length < limit; b++) {
        sol.i = P[b];
        if (!ok(byStage.i)) continue;
        for (var c2 = 0; c2 < P.length && found.length < limit; c2++) {
          sol.t = P[c2];
          if (!ok(byStage.t)) continue;
          found.push({ p: sol.p.slice(), i: sol.i.slice(), t: sol.t.slice() });
        }
      }
    }
    return found;
  }

  function unique(clues, n) { return solve(clues, n, 2).length === 1; }

  // -------------------------------------------------------------- génération
  function randomSolution(rng, n) {
    return {
      p: RNG.shuffle(rng, perms(n)[0]),
      i: RNG.shuffle(rng, perms(n)[0]),
      t: RNG.shuffle(rng, perms(n)[0])
    };
  }

  /** Tous les indices vrais envisageables sur cette grille, mélangés. */
  function candidateClues(rng, sol, n) {
    var out = [];
    var ways = ['s', 'p', 'i', 't'];
    var s, cat, d, v;

    // « X était / n'était pas … »
    for (s = 0; s < n; s++) {
      for (var w = 0; w < ways.length; w++) {
        var by = ways[w];
        d = { by: by, v: by === 's' ? s : sol[by][s] };
        for (var ci = 0; ci < CATS.length; ci++) {
          cat = CATS[ci];
          if (cat === by) continue;                 // « la personne de la cave était dans la cave »
          out.push({ k: 'is', a: d, cat: cat, v: sol[cat][s], neg: false });
          for (v = 0; v < n; v++) {
            if (v !== sol[cat][s]) out.push({ k: 'is', a: d, cat: cat, v: v, neg: true });
          }
        }
      }
    }

    // « X était là (juste) avant Y »
    for (s = 0; s < n; s++) {
      for (var s2 = 0; s2 < n; s2++) {
        if (s === s2 || sol.t[s] >= sol.t[s2]) continue;
        var adj = sol.t[s2] === sol.t[s] + 1;
        ['s', 'p', 'i'].forEach(function (by1) {
          ['s', 'p', 'i'].forEach(function (by2) {
            var A = { by: by1, v: by1 === 's' ? s : sol[by1][s] };
            var B = { by: by2, v: by2 === 's' ? s2 : sol[by2][s2] };
            out.push({ k: 'before', a: A, b: B, adj: false });
            if (adj) out.push({ k: 'before', a: A, b: B, adj: true });
          });
        });
      }
    }

    // « X était là en premier / en dernier »
    for (s = 0; s < n; s++) {
      if (sol.t[s] !== 0 && sol.t[s] !== n - 1) continue;
      ['s', 'p', 'i'].forEach(function (by) {
        out.push({ k: 'edge', a: { by: by, v: by === 's' ? s : sol[by][s] }, first: sol.t[s] === 0 });
      });
    }

    return RNG.shuffle(rng, out);
  }

  function sameClue(a, b) { return JSON.stringify(a) === JSON.stringify(b); }

  /**
   * @returns {{n, solution, culprit, publicClue, clues, halves:[Array,Array]}}
   */
  function generate(rng, opts) {
    opts = opts || {};
    var n = Math.max(4, Math.min(5, opts.suspects || 4));

    for (var attempt = 0; attempt < 40; attempt++) {
      var sol = randomSolution(rng, n);
      var culprit = RNG.int(rng, 0, n - 1);
      // connu de tout le monde : le vol a eu lieu à tel endroit, à telle heure
      var pub = {
        k: 'is',
        a: { by: 'p', v: sol.p[culprit] },
        cat: 't', v: sol.t[culprit], neg: false,
        pub: true
      };

      var pool = candidateClues(rng, sol, n);
      var kept = [pub];
      var i;
      for (i = 0; i < pool.length && !unique(kept, n); i++) {
        if (!kept.some(function (c) { return sameClue(c, pool[i]); })) kept.push(pool[i]);
      }
      if (!unique(kept, n)) continue;

      // on retire tout ce qui ne sert pas : l'indice public, lui, reste
      var order = RNG.shuffle(rng, kept.map(function (_, k) { return k; }));
      for (i = 0; i < order.length; i++) {
        var idx = order[i];
        if (kept[idx] === pub || kept[idx] == null) continue;
        var without = kept.filter(function (c, k) { return k !== idx && c != null; });
        if (unique(without, n)) kept[idx] = null;
      }
      var priv = kept.filter(function (c) { return c && c !== pub; });
      if (priv.length < 5) continue;         // trop facile : on retire

      // coupe en deux moitiés non vides et de tailles proches
      var mixed = RNG.shuffle(rng, priv);
      var half = Math.ceil(mixed.length / 2);
      var halves = [mixed.slice(0, half), mixed.slice(half)];
      if (!halves[0].length || !halves[1].length) continue;

      return {
        n: n,
        solution: sol,
        culprit: culprit,
        // ce que tout le monde sait : où et quand le vol a eu lieu
        crime: { p: sol.p[culprit], t: sol.t[culprit] },
        publicClue: pub,
        clues: priv,
        halves: halves,
        labels: {
          s: SUSPECTS.slice(0, n), p: LIEUX.slice(0, n),
          i: OBJETS.slice(0, n), t: HEURES.slice(0, n)
        }
      };
    }
    return null;
  }

  var API = {
    generate: generate,
    solve: solve,
    unique: unique,
    holds: holds,
    clueText: clueText,
    cap: cap,
    SUSPECTS: SUSPECTS, LIEUX: LIEUX, OBJETS: OBJETS, HEURES: HEURES,
    CATS: CATS, LABELS: LABELS
  };
  global.Puzzle = API;
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
})(typeof window !== 'undefined' ? window : globalThis);
