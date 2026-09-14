/* Les différences — moteur.
 *
 * Les deux joueurs voient chacun leur scène et ne voient jamais celle de
 * l'autre. Une différence n'est validée que si les DEUX pointent la même case :
 * il faut donc se mettre d'accord à voix haute, et le repère (« C3 ») est là
 * pour ça. On ne montre pas non plus à l'un la case pointée par l'autre — sinon
 * il suffirait de suivre le curseur, et il n'y aurait plus rien à se dire.
 */
(function (global) {
  'use strict';

  var Scene = global.Scene || (typeof require === 'function' ? require('./scene.js') : null);
  var RNG = global.RNG || (typeof require === 'function' ? require('../../common/rng.js') : null);

  var DEFAULT_CONFIG = {
    cols: 5,        // colonnes de la grille
    rows: 4,        // lignes
    diffs: 6,       // différences à trouver
    seconds: 240,   // chrono de la partie
    penalty: 20     // secondes perdues sur un accord qui tombe à côté
  };

  function sanitizeConfig(raw) {
    raw = raw || {};
    function num(v, def, min, max) {
      var n = parseInt(v, 10);
      return isNaN(n) ? def : Math.max(min, Math.min(max, n));
    }
    var cols = num(raw.cols, DEFAULT_CONFIG.cols, 3, 8);
    var rows = num(raw.rows, DEFAULT_CONFIG.rows, 3, 6);
    return {
      cols: cols,
      rows: rows,
      // jamais plus d'une différence par case, ni plus de la moitié de la grille
      diffs: num(raw.diffs, DEFAULT_CONFIG.diffs, 2, Math.max(2, Math.floor(cols * rows / 2))),
      seconds: num(raw.seconds, DEFAULT_CONFIG.seconds, 60, 900),
      penalty: num(raw.penalty, DEFAULT_CONFIG.penalty, 0, 60)
    };
  }

  function createEngine(opts) {
    var config = sanitizeConfig(opts.config);
    var names = opts.names || { host: 'Joueur 1', guest: 'Joueur 2' };
    var onUpdate = opts.onUpdate || function () {};
    var seed = opts.seed || null;

    var totalMs = config.seconds * 1000;
    var S = null;
    var timerHandle = null, tickHandle = null;

    function emit() { onUpdate(); }

    function clearTimers() {
      if (timerHandle) { clearInterval(timerHandle); timerHandle = null; }
      if (tickHandle) { clearInterval(tickHandle); tickHandle = null; }
    }

    function fresh() {
      var rng = RNG.rngFrom(seed == null ? RNG.randomSeed() : seed);
      return {
        phase: 'playing',
        scene: Scene.generate(rng, config),
        found: [],
        flags: { host: null, guest: null },
        strikes: 0,
        lost: 0,               // secondes perdues en pénalités
        started: false,
        deadline: null,
        frozenLeft: totalMs,
        outcome: null,
        event: null,
        eventId: 0
      };
    }

    // ----------------------------------------------------------------- chrono
    function runIntervals() {
      clearTimers();
      timerHandle = setInterval(function () {
        if (!S || S.phase !== 'playing' || S.deadline == null) return;
        if (timeLeftMs() <= 0) finish('timeout');
      }, 140);
      tickHandle = setInterval(function () { emit(); }, 800);
    }

    function timeLeftMs() {
      if (!S || !S.started) return totalMs;
      if (S.deadline != null) return Math.max(0, S.deadline - Date.now());
      return Math.max(0, S.frozenLeft);
    }

    function startClock() {
      if (S.started) return;
      S.started = true;
      S.deadline = Date.now() + totalMs;
      runIntervals();
    }

    function finish(outcome) {
      if (!S || S.phase !== 'playing') return;
      if (S.deadline != null) { S.frozenLeft = Math.max(0, S.deadline - Date.now()); S.deadline = null; }
      clearTimers();
      S.phase = 'gameOver';
      S.outcome = outcome;
      S.flags = { host: null, guest: null };
      S.event = { id: ++S.eventId, type: outcome };
      emit();
    }

    // --------------------------------------------------------------- actions
    function isDiff(i) {
      return S.scene.diffs.some(function (d) { return d.i === i; });
    }

    function handleFlag(role, i) {
      if (!S || S.phase !== 'playing') return;
      i = parseInt(i, 10);
      if (isNaN(i) || i < 0 || i >= S.scene.cols * S.scene.rows) return;
      if (S.found.indexOf(i) !== -1) return;         // déjà trouvée
      // un clic qui arrive après la fin du chrono n'est plus un clic
      if (S.started && timeLeftMs() <= 0) { finish('timeout'); return; }
      startClock();

      if (S.flags[role] === i) {                     // on retire son doigt
        S.flags[role] = null;
        S.event = { id: ++S.eventId, type: 'unflag' };
        emit();
        return;
      }
      S.flags[role] = i;

      var other = role === 'host' ? 'guest' : 'host';
      if (S.flags[other] == null) {                  // on attend l'autre
        S.event = { id: ++S.eventId, type: 'flag', cell: i };
        emit();
        return;
      }
      if (S.flags[other] !== i) {                    // pas la même case
        S.flags = { host: null, guest: null };
        S.event = { id: ++S.eventId, type: 'mismatch' };
        emit();
        return;
      }

      // accord des deux joueurs
      S.flags = { host: null, guest: null };
      if (isDiff(i)) {
        S.found.push(i);
        S.event = { id: ++S.eventId, type: 'good', cell: i };
        if (S.found.length >= S.scene.diffs.length) { finish('win'); return; }
      } else {
        S.strikes++;
        S.lost += config.penalty;
        if (S.deadline != null) S.deadline -= config.penalty * 1000;
        S.event = { id: ++S.eventId, type: 'bad', cell: i };
        if (timeLeftMs() <= 0) { finish('timeout'); return; }
      }
      emit();
    }

    function handleReplay() {
      clearTimers();
      S = fresh();
      emit();
    }

    // ------------------------------------------------------------------ vues
    function viewFor(role) {
      if (!S) return null;
      var mine = role === 'host' ? S.scene.a : S.scene.b;
      var other = role === 'host' ? 'guest' : 'host';
      var view = {
        phase: S.phase,
        yourRole: role,
        names: names,
        config: config,
        cols: S.scene.cols,
        rows: S.scene.rows,
        grid: mine,
        found: S.found.slice(),
        diffsTotal: S.scene.diffs.length,
        yourFlag: S.flags[role],
        // on dit qu'il pointe quelque chose, jamais quoi
        otherWaiting: S.flags[other] != null,
        strikes: S.strikes,
        lostSeconds: S.lost,
        timeLeftMs: timeLeftMs(),
        totalTimeMs: totalMs,
        timerStarted: S.started,
        timerRunning: S.deadline != null,
        outcome: S.outcome,
        event: S.event
      };
      if (S.phase === 'gameOver') {
        // fini : les deux scènes et le détail de chaque différence
        view.both = { a: S.scene.a, b: S.scene.b };
        view.diffs = S.scene.diffs.map(function (d) {
          return {
            i: d.i,
            cell: d.cell,
            attr: d.attr,
            text: Scene.describe(d, S.scene),
            found: S.found.indexOf(d.i) !== -1
          };
        });
        view.usedMs = totalMs - timeLeftMs();
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
        if (a.t === 'flag') handleFlag(role, a.i);
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
    DEFAULT_CONFIG: DEFAULT_CONFIG
  };
  global.DiffEngine = API;
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
})(typeof window !== 'undefined' ? window : globalThis);
