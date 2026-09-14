/* Motus en duo — moteur.
 *
 * Deux mots, deux tableaux. Chacun commence sur le sien et propose un mot ;
 * quand les deux ont joué, LES TABLEAUX S'ÉCHANGENT. On travaille donc à tour
 * de rôle sur le mot de l'autre, avec l'historique qu'il a laissé — d'où
 * l'intérêt de se parler : « j'ai mis TRAIN, le R est jaune ».
 *
 * Dès qu'un mot tombe, le tableau restant devient commun et les deux joueurs
 * y proposent chacun leur tour jusqu'à ce qu'il tombe aussi… ou que les essais
 * soient épuisés.
 */
(function (global) {
  'use strict';

  var RNG = global.RNG || (typeof require === 'function' ? require('../../common/rng.js') : null);
  var BANK = global.MOTUS_WORDS || (typeof require === 'function' ? require('./words.js').WORDS : null);

  var DEFAULT_CONFIG = {
    length: 6,          // longueur des mots
    tries: 6,           // essais par tableau, partagés par les deux joueurs
    firstLetter: true,  // première lettre donnée, comme à la télé
    bankOnly: false     // n'accepter que les mots de la banque
  };

  function sanitizeConfig(raw) {
    raw = raw || {};
    function num(v, def, min, max) {
      var n = parseInt(v, 10);
      return isNaN(n) ? def : Math.max(min, Math.min(max, n));
    }
    return {
      length: num(raw.length, DEFAULT_CONFIG.length, 4, 7),
      tries: num(raw.tries, DEFAULT_CONFIG.tries, 4, 10),
      firstLetter: raw.firstLetter !== false,
      bankOnly: raw.bankOnly === true
    };
  }

  function other(role) { return role === 'host' ? 'guest' : 'host'; }

  /** Lettres nues : majuscules, sans accent ni signe. FORÊT devient FORET. */
  function normalize(s) {
    var t = String(s == null ? '' : s);
    if (t.normalize) t = t.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    return t.toUpperCase().replace(/[^A-Z]/g, '');
  }

  /**
   * Couleurs d'un essai, à la Wordle — avec la vraie gestion des doublons :
   * une lettre en double dans la proposition n'est « présente » que s'il en
   * reste une non consommée dans le mot.
   * @returns {Array<'ok'|'pos'|'no'>}
   */
  function score(guess, word) {
    var g = guess.split(''), w = word.split('');
    var marks = new Array(g.length);
    var left = {};
    var i;
    for (i = 0; i < g.length; i++) {
      if (g[i] === w[i]) marks[i] = 'ok';
      else left[w[i]] = (left[w[i]] || 0) + 1;
    }
    for (i = 0; i < g.length; i++) {
      if (marks[i]) continue;
      if (left[g[i]] > 0) { marks[i] = 'pos'; left[g[i]]--; }
      else marks[i] = 'no';
    }
    return marks;
  }

  /** Ce que l'on sait de chaque lettre de l'alphabet, pour colorer le clavier. */
  function keyStates(rows) {
    var st = {};
    var rank = { no: 1, pos: 2, ok: 3 };
    rows.forEach(function (r) {
      r.w.split('').forEach(function (ch, i) {
        var m = r.marks[i];
        if (!st[ch] || rank[m] > rank[st[ch]]) st[ch] = m;
      });
    });
    return st;
  }

  function createEngine(opts) {
    var config = sanitizeConfig(opts.config);
    var names = opts.names || { host: 'Joueur 1', guest: 'Joueur 2' };
    var onUpdate = opts.onUpdate || function () {};
    var bank = (opts.words || BANK)[config.length] || [];
    var seed = opts.seed || null;

    var S = null;

    function emit() { onUpdate(); }

    function pickWords() {
      var rng = RNG.rngFrom(seed == null ? RNG.randomSeed() : seed);
      var two = RNG.sample ? RNG.sample(rng, bank, 2) : RNG.shuffle(rng, bank).slice(0, 2);
      if (two.length < 2) two = [bank[0], bank[bank.length - 1]];
      return two;
    }

    function fresh() {
      var words = pickWords();
      return {
        phase: 'duo',
        words: words,
        boards: [newBoard(), newBoard()],
        at: { host: 0, guest: 1 },
        pending: { host: false, guest: false },
        turn: null,
        soloBoard: null,
        startedAt: null,
        endedAt: null,
        event: null,
        eventId: 0
      };
    }

    function newBoard() { return { rows: [], solved: false, lost: false }; }
    function resolved(b) { return b.solved || b.lost; }

    // --------------------------------------------------------------- essais
    /** Le mot proposé est-il recevable ? */
    function checkGuess(raw) {
      var w = normalize(raw);
      if (w.length !== config.length) {
        return { ok: false, reason: 'Il faut ' + config.length + ' lettres.' };
      }
      if (config.bankOnly && bank.indexOf(w) === -1) {
        return { ok: false, reason: 'Ce mot n’est pas dans la banque.' };
      }
      return { ok: true, word: w };
    }

    function boardOf(role) {
      return S.phase === 'solo' ? S.soloBoard : S.at[role];
    }

    function mayPlay(role) {
      if (!S || S.phase === 'over') return false;
      var b = S.boards[boardOf(role)];
      if (resolved(b)) return false;
      if (S.phase === 'solo') return S.turn === role;
      return !S.pending[role];
    }

    function handleGuess(role, raw) {
      if (!S || !mayPlay(role)) return;
      var check = checkGuess(raw);
      if (!check.ok) {
        S.event = { id: ++S.eventId, type: 'reject', role: role, reason: check.reason };
        emit();
        return;
      }
      var bi = boardOf(role);
      var board = S.boards[bi];
      var word = S.words[bi];
      var marks = score(check.word, word);
      board.rows.push({ w: check.word, marks: marks, by: role });
      if (S.startedAt == null) S.startedAt = Date.now();

      if (check.word === word) board.solved = true;
      else if (board.rows.length >= config.tries) board.lost = true;

      S.event = {
        id: ++S.eventId,
        type: board.solved ? 'solved' : board.lost ? 'lost' : 'guess',
        role: role,
        board: bi
      };

      if (S.phase === 'solo') {
        if (resolved(board)) { finish(); return; }
        S.turn = other(role);
        emit();
        return;
      }

      S.pending[role] = true;
      // le tour n'est fini que quand les deux ont joué — ou quand l'autre n'a
      // plus rien à jouer, son tableau étant déjà réglé
      var mate = other(role);
      if (S.pending[mate] || resolved(S.boards[S.at[mate]])) endRound();
      emit();
    }

    /** Fin de tour : on échange les tableaux, ou on bascule à deux sur le dernier. */
    function endRound() {
      S.pending = { host: false, guest: false };
      var open = [0, 1].filter(function (i) { return !resolved(S.boards[i]); });
      if (open.length === 0) { finish(); return; }
      if (open.length === 1) {
        S.phase = 'solo';
        S.soloBoard = open[0];
        // la main passe à celui qui n'était pas dessus : il arrive avec un œil neuf
        S.turn = S.at.host === open[0] ? 'guest' : 'host';
        S.event = { id: ++S.eventId, type: 'shared', board: open[0] };
        return;
      }
      var h = S.at.host;
      S.at.host = S.at.guest;
      S.at.guest = h;
      S.event = { id: ++S.eventId, type: 'swap' };
    }

    function finish() {
      S.phase = 'over';
      S.endedAt = Date.now();
      S.turn = null;
      S.event = { id: ++S.eventId, type: 'over' };
      emit();
    }

    function handleReplay() { S = fresh(); emit(); }

    // ------------------------------------------------------------------ vues
    function boardView(i, forRole) {
      var b = S.boards[i];
      return {
        index: i,
        rows: b.rows.map(function (r) {
          return { w: r.w, marks: r.marks, mine: r.by === forRole };
        }),
        solved: b.solved,
        lost: b.lost,
        triesLeft: Math.max(0, config.tries - b.rows.length),
        keys: keyStates(b.rows)
      };
    }

    function viewFor(role) {
      if (!S) return null;
      var bi = boardOf(role);
      var mateRole = other(role);
      var view = {
        phase: S.phase,
        yourRole: role,
        names: names,
        config: config,
        length: config.length,
        tries: config.tries,
        boardIndex: bi,
        board: boardView(bi, role),
        // la première lettre est donnée : c'est la règle du jeu, pas une fuite
        firstLetter: config.firstLetter ? S.words[bi][0] : null,
        yourTurn: mayPlay(role),
        waiting: S.phase === 'duo' ? S.pending[role] : (S.phase === 'solo' && S.turn !== role),
        shared: S.phase === 'solo',
        event: S.event
      };
      if (S.phase === 'duo') {
        var mb = S.boards[S.at[mateRole]];
        // on dit où en est l'autre, jamais ce qu'il a écrit
        view.otherBoard = {
          tries: mb.rows.length,
          triesLeft: Math.max(0, config.tries - mb.rows.length),
          solved: mb.solved,
          played: S.pending[mateRole]
        };
      }
      if (S.phase === 'over') {
        view.results = [0, 1].map(function (i) {
          return {
            index: i,
            word: S.words[i],
            solved: S.boards[i].solved,
            tries: S.boards[i].rows.length,
            rows: S.boards[i].rows.map(function (r) {
              return { w: r.w, marks: r.marks, by: r.by, name: names[r.by] };
            })
          };
        });
        view.solvedCount = S.boards.filter(function (b) { return b.solved; }).length;
        view.totalTries = S.boards[0].rows.length + S.boards[1].rows.length;
        view.durationMs = S.startedAt ? (S.endedAt || Date.now()) - S.startedAt : 0;
      }
      return view;
    }

    return {
      config: config,
      get names() { return names; },
      setName: function (r, n) {
        if (r !== 'host' && r !== 'guest') return;
        names[r] = String(n || '').slice(0, 20) || names[r];
        emit();
      },
      start: function () { S = fresh(); emit(); },
      started: function () { return !!S; },
      action: function (role, a) {
        if (!S || !a) return;
        if (a.t === 'guess') handleGuess(role, a.text);
        else if (a.t === 'replay') handleReplay();
      },
      viewFor: viewFor,
      dispose: function () { S = null; },
      _state: function () { return S; }
    };
  }

  var API = {
    createEngine: createEngine,
    sanitizeConfig: sanitizeConfig,
    score: score,
    keyStates: keyStates,
    normalize: normalize,
    DEFAULT_CONFIG: DEFAULT_CONFIG
  };
  global.MotusEngine = API;
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
})(typeof window !== 'undefined' ? window : globalThis);
