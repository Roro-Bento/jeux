/* Morpion — moteur, en classique et en « super morpion ».
 *
 * Premier jeu du site où l'on joue l'un CONTRE l'autre : les deux joueurs
 * voient exactement le même plateau, et c'est le moteur (chez l'hôte) qui
 * garantit qu'on ne joue pas à la place de l'autre ni hors de son tour.
 */
(function (global) {
  'use strict';

  var LINES = [
    [0, 1, 2], [3, 4, 5], [6, 7, 8],
    [0, 3, 6], [1, 4, 7], [2, 5, 8],
    [0, 4, 8], [2, 4, 6]
  ];

  var DEFAULT_CONFIG = {
    rounds: 3,          // manches dans la série
    ultimate: false,    // super morpion : 9 grilles
    swapRoles: false    // false : l'hôte joue les croix
  };

  function sanitizeConfig(raw) {
    raw = raw || {};
    var n = parseInt(raw.rounds, 10);
    return {
      rounds: isNaN(n) ? DEFAULT_CONFIG.rounds : Math.max(1, Math.min(9, n)),
      ultimate: raw.ultimate === true,
      swapRoles: raw.swapRoles === true
    };
  }

  /** Gagnant d'une grille de 9 cases à partir de `off`, ou null. */
  function winnerOf(cells, off) {
    for (var i = 0; i < LINES.length; i++) {
      var L = LINES[i];
      var a = cells[off + L[0]];
      if (a && a !== 'draw' && a === cells[off + L[1]] && a === cells[off + L[2]]) {
        return { mark: a, line: [off + L[0], off + L[1], off + L[2]] };
      }
    }
    return null;
  }

  function full(cells, off) {
    for (var i = 0; i < 9; i++) if (!cells[off + i]) return false;
    return true;
  }

  function other(m) { return m === 'x' ? 'o' : 'x'; }

  function createEngine(opts) {
    var config = sanitizeConfig(opts.config);
    var names = opts.names || { host: 'Joueur 1', guest: 'Joueur 2' };
    var onUpdate = opts.onUpdate || function () {};

    var S = null;

    function emit() { onUpdate(); }
    function markOf(role) {
      var hostMark = config.swapRoles ? 'o' : 'x';
      return role === 'host' ? hostMark : other(hostMark);
    }
    function roleOf(mark) { return markOf('host') === mark ? 'host' : 'guest'; }

    function emptyBoard() {
      var n = config.ultimate ? 81 : 9;
      var cells = [];
      for (var i = 0; i < n; i++) cells.push(null);
      return cells;
    }

    function beginRound() {
      S.cells = emptyBoard();
      S.big = config.ultimate ? [null, null, null, null, null, null, null, null, null] : null;
      S.active = -1;                       // -1 : n'importe quelle grille
      S.turn = S.round % 2 === 1 ? 'x' : 'o';   // on alterne qui commence
      S.winner = null;
      S.line = null;
      S.event = null;
    }

    function fresh() {
      return {
        phase: 'playing',
        round: 1,
        rounds: config.rounds,
        cells: [], big: null, active: -1,
        turn: 'x', winner: null, line: null,
        scores: { x: 0, o: 0, draw: 0 },
        log: [],
        event: null,
        eventId: 0
      };
    }

    // ---------------------------------------------------------------- actions
    function handlePlay(role, b, c) {
      if (S.phase !== 'playing') return;
      var mark = markOf(role);
      if (mark !== S.turn) return;
      if (!(c >= 0 && c < 9)) return;

      var idx, board = 0;
      if (config.ultimate) {
        if (!(b >= 0 && b < 9)) return;
        if (S.active !== -1 && b !== S.active) return;   // mauvaise grille
        if (S.big[b]) return;                            // grille déjà décidée
        board = b;
        idx = b * 9 + c;
      } else {
        idx = c;
      }
      if (S.cells[idx]) return;                          // case occupée

      S.cells[idx] = mark;
      S.event = { id: ++S.eventId, type: 'place', mark: mark, idx: idx };

      if (config.ultimate) {
        var sub = winnerOf(S.cells, board * 9);
        if (sub) {
          S.big[board] = mark;
          S.event = { id: ++S.eventId, type: 'board', mark: mark, board: board };
        } else if (full(S.cells, board * 9)) {
          S.big[board] = 'draw';
        }
        var bw = winnerOf(S.big, 0);
        if (bw) { endRound(bw.mark, bw.line); return; }
        if (S.big.every(function (v) { return !!v; })) { endRound('draw', null); return; }
        // la case jouée désigne la prochaine grille, sauf si elle est close
        S.active = (S.big[c] || full(S.cells, c * 9)) ? -1 : c;
      } else {
        var w = winnerOf(S.cells, 0);
        if (w) { endRound(w.mark, w.line); return; }
        if (full(S.cells, 0)) { endRound('draw', null); return; }
      }

      S.turn = other(S.turn);
      emit();
    }

    function endRound(winner, line) {
      S.winner = winner;
      S.line = line;
      if (winner === 'draw') S.scores.draw++;
      else S.scores[winner]++;
      S.log.push({ round: S.round, winner: winner });
      S.event = { id: ++S.eventId, type: winner === 'draw' ? 'draw' : 'win', mark: winner };
      S.phase = 'roundRecap';
      emit();
    }

    function handleNext() {
      if (S.phase !== 'roundRecap') return;
      if (S.round >= config.rounds) { S.phase = 'gameOver'; emit(); return; }
      S.round++;
      S.phase = 'playing';
      beginRound();
      emit();
    }

    function handleReplay() {
      S = fresh();
      beginRound();
      emit();
    }

    // ------------------------------------------------------------------- vues
    function viewFor(role) {
      if (!S) return null;
      var mark = markOf(role);
      var total = S.scores.x + S.scores.o + S.scores.draw;
      return {
        phase: S.phase,
        round: S.round,
        rounds: config.rounds,
        yourRole: role,
        you: mark,
        opponent: other(mark),
        yourTurn: S.phase === 'playing' && S.turn === mark,
        turn: S.turn,
        names: names,
        marks: { x: names[roleOf('x')], o: names[roleOf('o')] },
        config: config,
        cells: S.cells.slice(),
        big: S.big ? S.big.slice() : null,
        active: S.active,
        winner: S.winner,
        line: S.line,
        scores: S.scores,
        log: S.log.slice(),
        played: total,
        event: S.event
      };
    }

    return {
      config: config,
      get names() { return names; },
      setName: function (r, n) {
        if (r !== 'host' && r !== 'guest') return;
        names[r] = String(n || '').slice(0, 20) || names[r];
        emit();
      },
      start: function () { S = fresh(); beginRound(); emit(); },
      started: function () { return !!S; },
      action: function (role, a) {
        if (!S || !a) return;
        if (a.t === 'play') handlePlay(role, a.b, a.c);
        else if (a.t === 'next') handleNext();
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
    winnerOf: winnerOf,
    LINES: LINES,
    DEFAULT_CONFIG: DEFAULT_CONFIG
  };
  global.MorpionEngine = API;
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
})(typeof window !== 'undefined' ? window : globalThis);
