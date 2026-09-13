/* Désamorçage — les modules.
 *
 * Chaque module expose :
 *   generate(rng, bomb)            → l'état PUBLIC (ce que voit le démineur)
 *   solve(state, bomb, ctx)        → la solution, dérivée de l'état public
 *                                    (c'est exactement ce que le manuel décrit)
 *   act(state, bomb, ctx, action)  → 'ok' | 'strike' | 'noop', et modifie l'état
 *
 * Les clés commençant par « $ » sont privées : le moteur les retire des vues.
 * Un seul module en a besoin (la bande du bouton, qui n'apparaît qu'une fois
 * le bouton maintenu).
 */
(function (global) {
  'use strict';

  var Bomb = global.Bomb || (typeof require === 'function' ? require('./bomb.js') : null);

  // ============================================================ 1. LES FILS
  var WIRE_COLORS = ['rouge', 'bleu', 'jaune', 'noir', 'blanc'];

  function wireCount(w, c) { return w.filter(function (x) { return x === c; }).length; }
  function lastIndexOfColor(w, c) { return w.lastIndexOf(c); }

  var filsModule = {
    id: 'fils',
    name: 'Les fils',
    emoji: '🔌',
    generate: function (rng, bomb) {
      var n = Bomb.int(rng, 3, 6);
      var wires = [];
      for (var i = 0; i < n; i++) wires.push(Bomb.pick(rng, WIRE_COLORS));
      return { wires: wires, cut: [] };
    },
    solve: function (state, bomb) {
      var w = state.wires, n = w.length, odd = Bomb.lastDigitOdd(bomb);
      var idx;
      if (n === 3) {
        if (wireCount(w, 'rouge') === 0) idx = 1;
        else if (w[n - 1] === 'blanc') idx = n - 1;
        else if (wireCount(w, 'bleu') > 1) idx = lastIndexOfColor(w, 'bleu');
        else idx = n - 1;
      } else if (n === 4) {
        if (wireCount(w, 'rouge') > 1 && odd) idx = lastIndexOfColor(w, 'rouge');
        else if (w[n - 1] === 'jaune' && wireCount(w, 'rouge') === 0) idx = 0;
        else if (wireCount(w, 'bleu') === 1) idx = 0;
        else if (wireCount(w, 'jaune') > 1) idx = n - 1;
        else idx = 1;
      } else if (n === 5) {
        if (w[n - 1] === 'noir' && odd) idx = 3;
        else if (wireCount(w, 'rouge') === 1 && wireCount(w, 'jaune') > 1) idx = 0;
        else if (wireCount(w, 'noir') === 0) idx = 1;
        else idx = 0;
      } else {
        if (wireCount(w, 'jaune') === 0 && odd) idx = 2;
        else if (wireCount(w, 'jaune') === 1 && wireCount(w, 'blanc') > 1) idx = 3;
        else if (wireCount(w, 'rouge') === 0) idx = n - 1;
        else idx = 3;
      }
      return { actions: [{ type: 'cut', i: idx }], answer: 'couper le fil n°' + (idx + 1) };
    },
    act: function (state, bomb, ctx, action) {
      if (action.type !== 'cut') return 'noop';
      var i = action.i;
      if (i < 0 || i >= state.wires.length || state.cut.indexOf(i) !== -1) return 'noop';
      state.cut.push(i);
      return i === this.solve(state, bomb, ctx).actions[0].i ? 'ok' : 'strike';
    }
  };

  // ========================================================== 2. LE BOUTON
  var BUTTON_COLORS = ['rouge', 'bleu', 'blanc', 'jaune'];
  var BUTTON_LABELS = ['APPUYER', 'MAINTENIR', 'DÉTONER', 'ABANDON'];
  var BANDS = ['bleu', 'blanc', 'jaune'];
  var BAND_DIGIT = { bleu: '4', blanc: '1', jaune: '5' };

  var boutonModule = {
    id: 'bouton',
    name: 'Le bouton',
    emoji: '🔘',
    generate: function (rng, bomb) {
      return {
        color: Bomb.pick(rng, BUTTON_COLORS),
        label: Bomb.pick(rng, BUTTON_LABELS),
        holding: false,
        band: null,
        $secret: { band: Bomb.pick(rng, BANDS) }
      };
    },
    solve: function (state, bomb) {
      var hold;
      if (state.color === 'bleu' && state.label === 'ABANDON') hold = true;
      else if (bomb.batteries > 2 && state.label === 'DÉTONER') hold = false;
      else if (state.color === 'blanc' && Bomb.lit(bomb, 'CAR')) hold = true;
      else if (bomb.batteries > 3 && Bomb.lit(bomb, 'FRK')) hold = false;
      else if (state.color === 'jaune') hold = true;
      else if (state.color === 'rouge' && state.label === 'MAINTENIR') hold = false;
      else hold = true;

      var band = (state.$secret && state.$secret.band) || state.band;
      var digit = band ? BAND_DIGIT[band] : null;
      return {
        hold: hold,
        digit: digit,
        actions: hold ? [{ type: 'down' }, { type: 'up', digit: digit }] : [{ type: 'down' }, { type: 'up', quick: true }],
        answer: hold ? 'maintenir, puis relâcher sur un ' + digit : 'appuyer et relâcher aussitôt'
      };
    },
    act: function (state, bomb, ctx, action) {
      if (action.type === 'down') {
        state.holding = true;
        state.band = (state.$secret && state.$secret.band) || null;
        return 'noop';
      }
      if (action.type !== 'up' || !state.holding) return 'noop';
      state.holding = false;
      var plan = this.solve(state, bomb, ctx);
      var quick = (ctx.heldMs || 0) < 900;
      state.band = null;
      if (quick) return plan.hold ? 'strike' : 'ok';
      if (!plan.hold) return 'strike';
      return clockDigits(ctx.timeLeftMs).indexOf(plan.digit) !== -1 ? 'ok' : 'strike';
    }
  };

  /** Les chiffres affichés par le chrono, au format m:ss (ex. 245 → « 4 » et « 5 »). */
  function clockDigits(ms) {
    var s = Math.max(0, Math.ceil(ms / 1000));
    var m = Math.floor(s / 60), r = s % 60;
    return String(m) + (r < 10 ? '0' : '') + String(r);
  }

  // ============================================== 3. LA SÉQUENCE LUMINEUSE
  var SEQ_COLORS = ['rouge', 'bleu', 'vert', 'jaune'];
  var SEQ_TABLES = {
    voyelle: [
      { rouge: 'bleu', bleu: 'rouge', vert: 'jaune', jaune: 'vert' },
      { rouge: 'jaune', bleu: 'vert', vert: 'bleu', jaune: 'rouge' },
      { rouge: 'vert', bleu: 'jaune', vert: 'rouge', jaune: 'bleu' }
    ],
    sans: [
      { rouge: 'rouge', bleu: 'vert', vert: 'jaune', jaune: 'bleu' },
      { rouge: 'bleu', bleu: 'jaune', vert: 'rouge', jaune: 'vert' },
      { rouge: 'jaune', bleu: 'rouge', vert: 'bleu', jaune: 'vert' }
    ]
  };

  function seqTable(bomb, strikes) {
    var rows = SEQ_TABLES[Bomb.hasVowel(bomb) ? 'voyelle' : 'sans'];
    return rows[Math.min(strikes || 0, rows.length - 1)];
  }

  var sequenceModule = {
    id: 'sequence',
    name: 'La séquence',
    emoji: '🚦',
    generate: function (rng) {
      var n = Bomb.int(rng, 3, 5);
      var seq = [];
      for (var i = 0; i < n; i++) seq.push(Bomb.pick(rng, SEQ_COLORS));
      return { seq: seq, pos: 0 };
    },
    solve: function (state, bomb, ctx) {
      var table = seqTable(bomb, ctx && ctx.strikes);
      var order = state.seq.map(function (c) { return table[c]; });
      return {
        order: order,
        actions: order.slice(state.pos).map(function (c) { return { type: 'press', color: c }; }),
        answer: order.join(' → ')
      };
    },
    act: function (state, bomb, ctx, action) {
      if (action.type !== 'press') return 'noop';
      var table = seqTable(bomb, ctx && ctx.strikes);
      var expected = table[state.seq[state.pos]];
      if (action.color !== expected) { state.pos = 0; return 'strike'; }
      state.pos++;
      return state.pos >= state.seq.length ? 'ok' : 'noop';
    }
  };

  // ============================================== 4. LE MOT DE PASSE (roues)
  var PASSWORDS = [
    'avion', 'bague', 'balai', 'barbe', 'blanc', 'botte', 'bruit', 'cadre',
    'canon', 'carte', 'chose', 'cible', 'corde', 'craie', 'digue', 'ecran',
    'ferme', 'fleur', 'fruit', 'glace', 'jaune', 'jeton', 'lampe', 'livre',
    'magie', 'monde', 'nuage', 'ombre', 'ovale', 'panda', 'perle', 'pluie',
    'poire', 'porte', 'radio', 'route', 'salle', 'singe', 'table', 'tigre',
    'verre', 'ville', 'voile', 'zebre'
  ];
  var ALPHABET = 'abcdefghijklmnopqrstuvwxyz'.split('');

  function formable(word, cols) {
    for (var i = 0; i < 5; i++) if (cols[i].indexOf(word[i]) === -1) return false;
    return true;
  }

  var passwordModule = {
    id: 'motdepasse',
    name: 'Le mot de passe',
    emoji: '🔠',
    generate: function (rng) {
      for (var tries = 0; tries < 60; tries++) {
        var word = Bomb.pick(rng, PASSWORDS);
        var cols = [];
        for (var i = 0; i < 5; i++) {
          var letters = [word[i]];
          while (letters.length < 6) {
            var l = Bomb.pick(rng, ALPHABET);
            if (letters.indexOf(l) === -1) letters.push(l);
          }
          cols.push(Bomb.shuffle(rng, letters));
        }
        var matches = PASSWORDS.filter(function (w) { return formable(w, cols); });
        if (matches.length === 1) {
          return { cols: cols, pos: [0, 0, 0, 0, 0] };
        }
      }
      // repli : très improbable, mais on ne rend jamais un module insoluble
      var w2 = PASSWORDS[0];
      var cols2 = w2.split('').map(function (ch) {
        var set = [ch];
        while (set.length < 6) {
          var l = ALPHABET[Math.floor(Math.random() * 26)];
          if (set.indexOf(l) === -1) set.push(l);
        }
        return set;
      });
      return { cols: cols2, pos: [0, 0, 0, 0, 0] };
    },
    solve: function (state) {
      var word = PASSWORDS.filter(function (w) { return formable(w, state.cols); })[0];
      var actions = [];
      for (var i = 0; i < 5; i++) {
        actions.push({ type: 'set', col: i, index: state.cols[i].indexOf(word[i]) });
      }
      actions.push({ type: 'submit' });
      return { word: word, actions: actions, answer: word };
    },
    act: function (state, bomb, ctx, action) {
      if (action.type === 'cycle') {
        var c = action.col;
        if (c < 0 || c > 4) return 'noop';
        state.pos[c] = (state.pos[c] + (action.dir > 0 ? 1 : -1) + 6) % 6;
        return 'noop';
      }
      if (action.type === 'set') {
        if (action.col < 0 || action.col > 4) return 'noop';
        state.pos[action.col] = ((action.index % 6) + 6) % 6;
        return 'noop';
      }
      if (action.type !== 'submit') return 'noop';
      var current = state.cols.map(function (col, i) { return col[state.pos[i]]; }).join('');
      return current === this.solve(state, bomb, ctx).word ? 'ok' : 'strike';
    }
  };

  // ================================================================ 5. MORSE
  var MORSE = {
    a: '.-', b: '-...', c: '-.-.', d: '-..', e: '.', f: '..-.', g: '--.',
    h: '....', i: '..', j: '.---', k: '-.-', l: '.-..', m: '--', n: '-.',
    o: '---', p: '.--.', q: '--.-', r: '.-.', s: '...', t: '-', u: '..-',
    v: '...-', w: '.--', x: '-..-', y: '-.--', z: '--..'
  };
  var MORSE_WORDS = [
    'bidon', 'carte', 'feutre', 'flamme', 'foudre', 'grille', 'moteur', 'niveau',
    'orage', 'piston', 'ruban', 'sable', 'tempo', 'ticket', 'tresse', 'vitre'
  ];
  var FREQS = MORSE_WORDS.map(function (w, i) { return (3.505 + i * 0.006).toFixed(3); });

  function toMorse(word) {
    return word.split('').map(function (c) { return MORSE[c] || ''; }).join(' ');
  }
  function fromMorse(sig) {
    var inv = {};
    Object.keys(MORSE).forEach(function (k) { inv[MORSE[k]] = k; });
    return sig.split(' ').map(function (m) { return inv[m] || '?'; }).join('');
  }

  var morseModule = {
    id: 'morse',
    name: 'Le morse',
    emoji: '📻',
    generate: function (rng) {
      var word = Bomb.pick(rng, MORSE_WORDS);
      return { signal: toMorse(word), freqs: FREQS.slice(), index: Bomb.int(rng, 0, FREQS.length - 1) };
    },
    solve: function (state) {
      var word = fromMorse(state.signal);
      var target = FREQS[MORSE_WORDS.indexOf(word)];
      var actions = [{ type: 'setFreq', index: state.freqs.indexOf(target) }, { type: 'send' }];
      return { word: word, freq: target, actions: actions, answer: target + ' MHz (' + word + ')' };
    },
    act: function (state, bomb, ctx, action) {
      if (action.type === 'freq') {
        state.index = (state.index + (action.dir > 0 ? 1 : -1) + state.freqs.length) % state.freqs.length;
        return 'noop';
      }
      if (action.type === 'setFreq') {
        state.index = ((action.index % state.freqs.length) + state.freqs.length) % state.freqs.length;
        return 'noop';
      }
      if (action.type !== 'send') return 'noop';
      return state.freqs[state.index] === this.solve(state, bomb, ctx).freq ? 'ok' : 'strike';
    }
  };

  // ============================================================ 6. SYMBOLES
  var SYMBOL_COLUMNS = [
    ['Ϙ', 'Ѧ', 'ƛ', 'Ϟ', 'Ѭ', 'ϗ', '¿'],
    ['Ӭ', 'Ϙ', 'Ͽ', 'Ҭ', '☆', 'ϗ', '¶'],
    ['©', 'Ѽ', 'Ҩ', '¤', 'ϗ', 'Ͼ', 'Ѯ'],
    ['♪', 'Ѥ', 'ϗ', 'Ϧ', 'Ѭ', 'Ϟ', '†'],
    ['Ψ', 'ټ', 'Ϭ', '祝', 'Ӭ', '§', 'Ѯ'],
    ['¶', 'Ѥ', 'Ѣ', 'Ѻ', '†', 'Ԇ', 'Ω']
  ];

  /** Les colonnes qui contiennent les 4 symboles affichés. */
  function symbolColumns(keys) {
    var out = [];
    for (var c = 0; c < SYMBOL_COLUMNS.length; c++) {
      var col = SYMBOL_COLUMNS[c];
      if (keys.every(function (k) { return col.indexOf(k) !== -1; })) out.push(c);
    }
    return out;
  }
  function symbolColumn(keys) {
    var cols = symbolColumns(keys);
    return cols.length ? cols[0] : -1;
  }

  var symbolsModule = {
    id: 'symboles',
    name: 'Le clavier',
    emoji: '🔣',
    generate: function (rng) {
      for (var tries = 0; tries < 40; tries++) {
        var c = Bomb.int(rng, 0, SYMBOL_COLUMNS.length - 1);
        var keys = Bomb.sample(rng, SYMBOL_COLUMNS[c], 4);
        // une seule colonne doit contenir les 4 symboles, sinon l'énigme est ambiguë
        if (symbolColumns(keys).length === 1) return { keys: keys, pressed: [] };
      }
      return { keys: SYMBOL_COLUMNS[0].slice(0, 4), pressed: [] };
    },
    solve: function (state) {
      var c = symbolColumn(state.keys);
      var col = SYMBOL_COLUMNS[c < 0 ? 0 : c];
      var order = state.keys.slice().sort(function (a, b) { return col.indexOf(a) - col.indexOf(b); });
      return {
        order: order,
        actions: order.slice(state.pressed.length).map(function (s) { return { type: 'key', sym: s }; }),
        answer: order.join(' ')
      };
    },
    act: function (state, bomb, ctx, action) {
      if (action.type !== 'key') return 'noop';
      var order = this.solve(state, bomb, ctx).order;
      if (action.sym !== order[state.pressed.length]) { state.pressed = []; return 'strike'; }
      state.pressed.push(action.sym);
      return state.pressed.length >= order.length ? 'ok' : 'noop';
    }
  };

  // ------------------------------------------------------------- registre
  var LIST = [filsModule, boutonModule, sequenceModule, passwordModule, morseModule, symbolsModule];

  var API = {
    list: LIST,
    ids: LIST.map(function (m) { return m.id; }),
    byId: function (id) {
      for (var i = 0; i < LIST.length; i++) if (LIST[i].id === id) return LIST[i];
      return null;
    },
    clockDigits: clockDigits,
    symbolColumns: symbolColumns,
    seqTable: seqTable,
    toMorse: toMorse,
    fromMorse: fromMorse,
    tables: {
      WIRE_COLORS: WIRE_COLORS,
      BUTTON_COLORS: BUTTON_COLORS,
      BUTTON_LABELS: BUTTON_LABELS,
      BANDS: BANDS,
      BAND_DIGIT: BAND_DIGIT,
      SEQ_COLORS: SEQ_COLORS,
      SEQ_TABLES: SEQ_TABLES,
      PASSWORDS: PASSWORDS,
      MORSE: MORSE,
      MORSE_WORDS: MORSE_WORDS,
      FREQS: FREQS,
      SYMBOL_COLUMNS: SYMBOL_COLUMNS
    }
  };

  global.Modules = API;
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
})(typeof window !== 'undefined' ? window : globalThis);
