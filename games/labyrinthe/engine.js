/* Labyrinthe — moteur.
 *
 * L'explorateur ne reçoit que sa case : les quatre murs, la balise sur laquelle
 * il se tient, et une lueur si la sortie est juste à côté. Jamais le plan,
 * jamais sa position.
 * Le guide reçoit le plan complet — murs, pièges, balises, sortie — mais
 * jamais la position de l'explorateur. D'où la nécessité de se parler.
 */
(function (global) {
  'use strict';

  var RNG = global.RNG || (typeof require === 'function' ? require('../../common/rng.js') : null);
  var Maze = global.Maze || (typeof require === 'function' ? require('./maze.js') : null);

  var DEFAULT_CONFIG = {
    size: 9,           // côté du labyrinthe
    traps: 6,          // pièges posés par le générateur
    beacons: 4,        // balises pour se repérer
    seconds: 240,      // chrono par manche
    trapPenalty: 15,   // secondes perdues par piège
    swapRoles: false   // false : l'hôte explore en manche 1
  };

  function sanitizeConfig(raw) {
    raw = raw || {};
    function num(v, def, min, max) {
      var n = parseInt(v, 10);
      return isNaN(n) ? def : Math.max(min, Math.min(max, n));
    }
    return {
      size: num(raw.size, DEFAULT_CONFIG.size, 5, 15),
      traps: num(raw.traps, DEFAULT_CONFIG.traps, 0, 20),
      beacons: num(raw.beacons, DEFAULT_CONFIG.beacons, 0, 6),
      seconds: num(raw.seconds, DEFAULT_CONFIG.seconds, 30, 900),
      trapPenalty: num(raw.trapPenalty, DEFAULT_CONFIG.trapPenalty, 0, 60),
      swapRoles: raw.swapRoles === true
    };
  }

  function other(role) { return role === 'host' ? 'guest' : 'host'; }

  function createEngine(opts) {
    var config = sanitizeConfig(opts.config);
    var names = opts.names || { host: 'Joueur 1', guest: 'Joueur 2' };
    var onUpdate = opts.onUpdate || function () {};
    var seedOf = opts.seed;

    var roundMs = config.seconds * 1000;
    var S = null;
    var timerHandle = null, tickHandle = null;

    function emit() { onUpdate(); }
    function walkerRole() {
      var base = config.swapRoles ? 'guest' : 'host';
      return S && S.round === 2 ? other(base) : base;
    }
    function guideRole() { return other(walkerRole()); }

    function clearTimers() {
      if (timerHandle) { clearInterval(timerHandle); timerHandle = null; }
      if (tickHandle) { clearInterval(tickHandle); tickHandle = null; }
    }

    function newMaze(rng) {
      return Maze.create(rng, { size: config.size, traps: config.traps, beacons: config.beacons });
    }

    function fresh() {
      var seed = seedOf != null ? seedOf : RNG.randomSeed();
      var rng = RNG.rngFrom(seed);
      return {
        phase: 'playing',
        round: 1,
        roundCount: 2,
        seed: seed,
        mazes: { 1: newMaze(rng), 2: newMaze(rng) },
        pos: 0,
        path: [],
        moves: 0,
        trapsHit: 0,
        deadline: null,
        frozenLeft: roundMs,
        started: false,
        expired: false,
        log: { 1: null, 2: null },
        event: null,
        eventId: 0
      };
    }

    function beginRound() {
      var m = S.mazes[S.round];
      S.pos = m.start;
      S.path = [m.start];
      S.moves = 0;
      S.trapsHit = 0;
      S.deadline = null;
      S.frozenLeft = roundMs;
      S.started = false;
      S.expired = false;
      S.event = null;
    }

    // ----------------------------------------------------------------- chrono
    function runIntervals() {
      clearTimers();
      timerHandle = setInterval(function () {
        if (!S || S.phase !== 'playing' || S.deadline == null) return;
        if (timeLeftMs() <= 0) endRound(false, 'time');
      }, 140);
      tickHandle = setInterval(function () { emit(); }, 800);
    }

    function freezeClock() {
      if (!S) return;
      if (S.deadline != null) {
        S.frozenLeft = Math.max(0, S.deadline - Date.now());
        S.deadline = null;
      }
      clearTimers();
    }

    function startClock() {
      if (!S || S.expired) return;
      S.started = true;
      S.deadline = Date.now() + S.frozenLeft;
      runIntervals();
    }

    function timeLeftMs() {
      if (!S || !S.started) return roundMs;
      if (S.deadline != null) return Math.max(0, S.deadline - Date.now());
      return Math.max(0, S.frozenLeft);
    }

    function penalise(seconds) {
      if (!S || !S.started) return;
      var left = Math.max(0, timeLeftMs() - seconds * 1000);
      if (S.deadline != null) S.deadline = Date.now() + left;
      else S.frozenLeft = left;
      if (left <= 0) endRound(false, 'time');
    }

    // ---------------------------------------------------------------- actions
    function handleMove(role, dir) {
      if (S.phase !== 'playing' || role !== walkerRole()) return;
      if (Maze.DIRS.indexOf(dir) === -1) return;
      var m = S.mazes[S.round];

      if (!S.started) startClock();

      if (!Maze.open(m, S.pos, dir)) {
        S.event = { id: ++S.eventId, type: 'bump', dir: dir };
        emit();
        return;
      }

      var next = Maze.neighbour(m, S.pos, dir);
      S.moves++;

      if (m.traps.indexOf(next) !== -1) {
        S.trapsHit++;
        S.event = { id: ++S.eventId, type: 'trap', dir: dir, penalty: config.trapPenalty };
        S.path.push(next);
        S.path.push(S.pos);               // on est repoussé sur la case précédente
        penalise(config.trapPenalty);
        emit();
        return;
      }

      S.pos = next;
      S.path.push(next);

      if (next === m.exit) { endRound(true, null); return; }

      S.event = { id: ++S.eventId, type: 'move', dir: dir };
      emit();
    }

    function endRound(finished, reason) {
      if (!S || S.phase !== 'playing') return;
      freezeClock();
      S.expired = !finished;
      S.log[S.round] = {
        finished: finished,
        reason: reason || null,
        timeMs: roundMs - timeLeftMs(),
        leftMs: timeLeftMs(),
        moves: S.moves,
        trapsHit: S.trapsHit,
        path: S.path.slice(),
        walker: walkerRole()
      };
      S.event = { id: ++S.eventId, type: finished ? 'exit' : 'timeout' };
      S.phase = 'roundRecap';
      emit();
    }

    function handleNext() {
      if (S.phase !== 'roundRecap') return;
      if (S.round >= S.roundCount) { S.phase = 'gameOver'; emit(); return; }
      S.round++;
      S.phase = 'playing';
      beginRound();
      emit();
    }

    function handleReplay() {
      clearTimers();
      seedOf = null;
      S = fresh();
      beginRound();
      emit();
    }

    // ------------------------------------------------------------------- vues
    function mazeForGuide(m) {
      return {
        w: m.w, h: m.h, size: m.size,
        cells: m.cells,
        exit: m.exit,
        traps: m.traps.slice(),
        beacons: m.beacons.map(function (b) {
          return { cell: b.cell, glyph: b.glyph, color: b.color, label: b.label };
        })
        // ni start ni position : le guide doit les déduire
      };
    }

    function viewFor(role) {
      if (!S) return null;
      var m = S.mazes[S.round];
      var isWalker = role === walkerRole();
      var over = S.phase !== 'playing';

      var view = {
        phase: S.phase,
        round: S.round,
        roundCount: S.roundCount,
        yourRole: role,
        isWalker: isWalker,
        walker: walkerRole(),
        guide: guideRole(),
        names: names,
        config: config,
        moves: S.moves,
        trapsHit: S.trapsHit,
        timeLeftMs: timeLeftMs(),
        totalTimeMs: roundMs,
        timerStarted: S.started,
        timerRunning: S.deadline != null,
        event: S.event,
        log: S.log,
        size: config.size
      };

      if (S.phase === 'playing') {
        if (isWalker) view.here = Maze.look(m, S.pos);
        else view.maze = mazeForGuide(m);
      } else {
        // débriefing : tout le monde voit le plan et le trajet parcouru
        view.maze = mazeForGuide(m);
        view.maze.start = m.start;
        view.reveal = {
          path: (S.log[S.round] || {}).path || S.path.slice(),
          pos: S.pos
        };
      }
      if (S.phase === 'gameOver') {
        view.rounds = [1, 2].map(function (r) {
          var l = S.log[r];
          var mz = S.mazes[r];
          return {
            round: r,
            finished: !!(l && l.finished),
            timeMs: l ? l.timeMs : 0,
            moves: l ? l.moves : 0,
            trapsHit: l ? l.trapsHit : 0,
            walker: l ? l.walker : null,
            maze: mazeForGuide(mz),
            start: mz.start,
            path: l ? l.path : []
          };
        });
        view.solvedRounds = view.rounds.filter(function (r) { return r.finished; }).length;
        view.totalTrapsHit = view.rounds.reduce(function (a, r) { return a + r.trapsHit; }, 0);
        view.totalTimeMs = view.rounds.reduce(function (a, r) { return a + r.timeMs; }, 0);
      }
      return view;
    }

    return {
      config: config,
      get names() { return names; },
      setName: function (role, name) {
        if (role !== 'host' && role !== 'guest') return;
        names[role] = String(name || '').slice(0, 20) || names[role];
        emit();
      },
      start: function () { S = fresh(); beginRound(); emit(); },
      started: function () { return !!S; },
      action: function (role, a) {
        if (!S || !a) return;
        if (a.t === 'move') handleMove(role, a.dir);
        else if (a.t === 'next') handleNext();
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

  global.MazeEngine = API;
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
})(typeof window !== 'undefined' ? window : globalThis);
