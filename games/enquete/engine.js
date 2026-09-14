/* L'enquête — moteur.
 *
 * Chaque joueur reçoit LA MOITIÉ des indices, et rien d'autre : ni ceux de son
 * binôme, ni la solution. Le carnet (la grille qu'on remplit) est privé lui
 * aussi — c'est en se lisant ses indices à voix haute qu'on avance.
 *
 * Pour accuser, il faut être deux : l'un propose sa grille complète, l'autre
 * l'accepte ou la refuse. Seule une proposition acceptée est confrontée à la
 * vérité, et une erreur coûte une des tentatives.
 */
(function (global) {
  'use strict';

  var Puzzle = global.Puzzle || (typeof require === 'function' ? require('./puzzle.js') : null);
  var RNG = global.RNG || (typeof require === 'function' ? require('../../common/rng.js') : null);

  var CATS = ['p', 'i', 't'];

  var DEFAULT_CONFIG = {
    suspects: 4,     // 4 ou 5 suspects
    mistakes: 2,     // accusations ratées tolérées
    minutes: 12      // chrono (0 = sans chrono)
  };

  function sanitizeConfig(raw) {
    raw = raw || {};
    function num(v, def, min, max) {
      var n = parseInt(v, 10);
      return isNaN(n) ? def : Math.max(min, Math.min(max, n));
    }
    return {
      suspects: num(raw.suspects, DEFAULT_CONFIG.suspects, 4, 5),
      mistakes: num(raw.mistakes, DEFAULT_CONFIG.mistakes, 1, 5),
      minutes: num(raw.minutes, DEFAULT_CONFIG.minutes, 0, 45)
    };
  }

  function other(role) { return role === 'host' ? 'guest' : 'host'; }

  function emptyDraft(n) {
    var d = {};
    CATS.forEach(function (c) {
      d[c] = [];
      for (var i = 0; i < n; i++) d[c].push(null);
    });
    return d;
  }

  function copyDraft(d) {
    var out = {};
    CATS.forEach(function (c) { out[c] = d[c].slice(); });
    return out;
  }

  /** Une grille est recevable si chaque colonne est complète et sans doublon. */
  function draftComplete(d, n) {
    return CATS.every(function (c) {
      var seen = {};
      for (var i = 0; i < n; i++) {
        var v = d[c][i];
        if (v == null || seen[v]) return false;
        seen[v] = true;
      }
      return true;
    });
  }

  function sameAsSolution(d, sol) {
    return CATS.every(function (c) {
      return d[c].every(function (v, i) { return v === sol[c][i]; });
    });
  }

  function createEngine(opts) {
    var config = sanitizeConfig(opts.config);
    var names = opts.names || { host: 'Joueur 1', guest: 'Joueur 2' };
    var onUpdate = opts.onUpdate || function () {};
    var seed = opts.seed || null;

    var totalMs = config.minutes * 60000;
    var S = null;
    var timerHandle = null, tickHandle = null;

    function emit() { onUpdate(); }

    function clearTimers() {
      if (timerHandle) { clearInterval(timerHandle); timerHandle = null; }
      if (tickHandle) { clearInterval(tickHandle); tickHandle = null; }
    }

    function fresh() {
      var rng = RNG.rngFrom(seed == null ? RNG.randomSeed() : seed);
      var puz = Puzzle.generate(rng, { suspects: config.suspects });
      var st = {
        phase: 'playing',
        puzzle: puz,
        drafts: { host: emptyDraft(puz.n), guest: emptyDraft(puz.n) },
        proposal: null,
        strikes: 0,
        deadline: config.minutes ? Date.now() + totalMs : null,
        frozenLeft: totalMs,
        outcome: null,
        event: null,
        eventId: 0
      };
      if (config.minutes) runIntervals();
      return st;
    }

    // ----------------------------------------------------------------- chrono
    function runIntervals() {
      clearTimers();
      timerHandle = setInterval(function () {
        if (!S || S.phase !== 'playing' || S.deadline == null) return;
        if (timeLeftMs() <= 0) finish('timeout');
      }, 200);
      tickHandle = setInterval(function () { emit(); }, 1000);
    }

    function timeLeftMs() {
      if (!S || !config.minutes) return null;
      if (S.deadline != null) return Math.max(0, S.deadline - Date.now());
      return Math.max(0, S.frozenLeft);
    }

    function finish(outcome) {
      if (!S || S.phase !== 'playing') return;
      if (S.deadline != null) { S.frozenLeft = Math.max(0, S.deadline - Date.now()); S.deadline = null; }
      clearTimers();
      S.phase = 'over';
      S.outcome = outcome;
      S.proposal = null;
      S.event = { id: ++S.eventId, type: outcome };
      emit();
    }

    // --------------------------------------------------------------- actions
    function handleSet(role, a) {
      if (!S || S.phase !== 'playing') return;
      if (CATS.indexOf(a.cat) === -1) return;
      var s = parseInt(a.s, 10);
      if (isNaN(s) || s < 0 || s >= S.puzzle.n) return;
      var v = a.v == null || a.v === '' ? null : parseInt(a.v, 10);
      if (v != null && (isNaN(v) || v < 0 || v >= S.puzzle.n)) return;
      var col = S.drafts[role][a.cat];
      // une valeur ne peut servir qu'une fois : on la retire d'où elle était
      if (v != null) {
        for (var i = 0; i < col.length; i++) if (col[i] === v) col[i] = null;
      }
      col[s] = v;
      S.event = { id: ++S.eventId, type: 'draft', role: role };
      emit();
    }

    function handleClear(role) {
      if (!S || S.phase !== 'playing') return;
      S.drafts[role] = emptyDraft(S.puzzle.n);
      S.event = { id: ++S.eventId, type: 'draft', role: role };
      emit();
    }

    function handlePropose(role) {
      if (!S || S.phase !== 'playing' || S.proposal) return;
      var d = S.drafts[role];
      if (!draftComplete(d, S.puzzle.n)) {
        S.event = { id: ++S.eventId, type: 'incomplete', role: role };
        emit();
        return;
      }
      S.proposal = { by: role, grid: copyDraft(d) };
      S.event = { id: ++S.eventId, type: 'proposed', role: role };
      emit();
    }

    function handleWithdraw(role) {
      if (!S || !S.proposal || S.proposal.by !== role) return;
      S.proposal = null;
      S.event = { id: ++S.eventId, type: 'withdrawn', role: role };
      emit();
    }

    function handleRefuse(role) {
      if (!S || !S.proposal || S.proposal.by === role) return;
      S.proposal = null;
      S.event = { id: ++S.eventId, type: 'refused', role: role };
      emit();
    }

    /** L'accusation : elle n'a lieu que si les DEUX sont d'accord. */
    function handleAccept(role) {
      if (!S || S.phase !== 'playing' || !S.proposal) return;
      if (S.proposal.by === role) return;           // on ne se valide pas soi-même
      var grid = S.proposal.grid;
      S.proposal = null;
      if (sameAsSolution(grid, S.puzzle.solution)) {
        S.event = { id: ++S.eventId, type: 'solved' };
        finish('win');
        return;
      }
      S.strikes++;
      S.event = { id: ++S.eventId, type: 'wrong', left: Math.max(0, config.mistakes - S.strikes) };
      if (S.strikes >= config.mistakes) { finish('lost'); return; }
      emit();
    }

    function handleReplay() {
      clearTimers();
      S = fresh();
      emit();
    }

    // ------------------------------------------------------------------ vues
    function cluesFor(role) {
      var half = S.puzzle.halves[role === 'host' ? 0 : 1];
      return half.map(function (c) { return Puzzle.clueText(c); });
    }

    function viewFor(role) {
      if (!S) return null;
      var puz = S.puzzle;
      var mate = other(role);
      var view = {
        phase: S.phase,
        yourRole: role,
        names: names,
        config: config,
        n: puz.n,
        labels: puz.labels,
        crime: { place: puz.labels.p[puz.crime.p], time: puz.labels.t[puz.crime.t] },
        // ta moitié d'indices, et seulement elle
        clues: cluesFor(role),
        otherClueCount: puz.halves[role === 'host' ? 1 : 0].length,
        draft: copyDraft(S.drafts[role]),
        draftComplete: draftComplete(S.drafts[role], puz.n),
        strikes: S.strikes,
        mistakes: config.mistakes,
        triesLeft: Math.max(0, config.mistakes - S.strikes),
        timeLeftMs: timeLeftMs(),
        totalTimeMs: config.minutes ? totalMs : null,
        timerRunning: S.deadline != null,
        event: S.event
      };
      if (S.proposal) {
        view.proposal = {
          mine: S.proposal.by === role,
          from: names[S.proposal.by],
          grid: copyDraft(S.proposal.grid)
        };
      }
      if (S.phase === 'over') {
        view.outcome = S.outcome;
        view.solution = puz.solution;
        view.culprit = puz.culprit;
        view.allClues = {
          host: puz.halves[0].map(function (c) { return Puzzle.clueText(c); }),
          guest: puz.halves[1].map(function (c) { return Puzzle.clueText(c); })
        };
        view.publicClue = 'Le vol a eu lieu dans ' + puz.labels.p[puz.crime.p] + ', à ' + puz.labels.t[puz.crime.t] + '.';
        view.usedMs = config.minutes ? totalMs - (timeLeftMs() || 0) : null;
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
        if (a.t === 'set') handleSet(role, a);
        else if (a.t === 'clear') handleClear(role);
        else if (a.t === 'propose') handlePropose(role);
        else if (a.t === 'withdraw') handleWithdraw(role);
        else if (a.t === 'accept') handleAccept(role);
        else if (a.t === 'refuse') handleRefuse(role);
        else if (a.t === 'replay') handleReplay();
      },
      viewFor: viewFor,
      dispose: function () { clearTimers(); S = null; },
      _state: function () { return S; }
    };
  }

  var API = {
    createEngine: createEngine,
    sanitizeConfig: sanitizeConfig,
    draftComplete: draftComplete,
    CATS: CATS,
    DEFAULT_CONFIG: DEFAULT_CONFIG
  };
  global.EnqueteEngine = API;
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
})(typeof window !== 'undefined' ? window : globalThis);
