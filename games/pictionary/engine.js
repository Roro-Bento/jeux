/* Pictionary — moteur.
 *
 * Le moteur ne sait rien du dessin : les traits passent en direct d'un
 * navigateur à l'autre (voir le canal « peer » de common/room.js). Ici on ne
 * gère que les mots, le chrono, les propositions et le score.
 */
(function (global) {
  'use strict';

  var Fr = global.Fr || (typeof require === 'function' ? require('../../common/french.js') : null);
  var RNG = global.RNG || (typeof require === 'function' ? require('../../common/rng.js') : null);

  var DEFAULT_CONFIG = {
    wordCount: 4,      // mots à faire deviner par manche
    seconds: 90,       // temps par mot
    roundsEach: 1,     // manches par joueur (total = le double)
    allowPass: true,   // le dessinateur peut passer un mot
    showLength: false, // afficher le nombre de lettres au devineur
    swapRoles: false   // false : l'hôte dessine en premier
  };

  function sanitizeConfig(raw) {
    raw = raw || {};
    function num(v, def, min, max) {
      var n = parseInt(v, 10);
      return isNaN(n) ? def : Math.max(min, Math.min(max, n));
    }
    return {
      wordCount: num(raw.wordCount, DEFAULT_CONFIG.wordCount, 1, 10),
      seconds: num(raw.seconds, DEFAULT_CONFIG.seconds, 30, 300),
      roundsEach: num(raw.roundsEach, DEFAULT_CONFIG.roundsEach, 1, 3),
      allowPass: raw.allowPass !== false,
      showLength: raw.showLength === true,
      swapRoles: raw.swapRoles === true
    };
  }

  function other(role) { return role === 'host' ? 'guest' : 'host'; }

  function createEngine(opts) {
    var config = sanitizeConfig(opts.config);
    var names = opts.names || { host: 'Joueur 1', guest: 'Joueur 2' };
    var onUpdate = opts.onUpdate || function () {};
    var bank = opts.words || global.PICTO_WORDS || [];

    var wordMs = config.seconds * 1000;
    var S = null;
    var timerHandle = null, tickHandle = null, advanceHandle = null;

    function emit() { onUpdate(); }
    function roundCount() { return config.roundsEach * 2; }
    function drawerRole() {
      var base = config.swapRoles ? 'guest' : 'host';
      return S.round % 2 === 1 ? base : other(base);
    }
    function guesserRole() { return other(drawerRole()); }

    function clearTimers() {
      if (timerHandle) { clearInterval(timerHandle); timerHandle = null; }
      if (tickHandle) { clearInterval(tickHandle); tickHandle = null; }
      if (advanceHandle) { clearTimeout(advanceHandle); advanceHandle = null; }
    }

    function pickWords(n) {
      var rng = RNG.rngFrom(RNG.randomSeed());
      var pool = RNG.shuffle(rng, bank);
      var out = [];
      while (out.length < n && pool.length) out = out.concat(pool.splice(0, n - out.length));
      return out.slice(0, n);
    }

    function fresh() {
      var words = {};
      for (var r = 1; r <= roundCount(); r++) words[r] = pickWords(config.wordCount);
      return {
        phase: 'playing',
        round: 1,
        words: words,
        idx: 0,
        guesses: [],
        deadline: null,
        frozenLeft: wordMs,
        started: false,
        paused: false,
        log: {},
        scores: {},
        event: null,
        eventId: 0
      };
    }

    function currentWord() {
      if (!S || S.phase !== 'playing') return null;
      var list = S.words[S.round];
      return list && S.idx < list.length ? list[S.idx] : null;
    }

    // ----------------------------------------------------------------- chrono
    function runIntervals() {
      clearInterval(timerHandle);
      timerHandle = setInterval(function () {
        if (!S || S.phase !== 'playing' || S.deadline == null) return;
        if (timeLeftMs() <= 0) resolve('timeout');
      }, 140);
      clearInterval(tickHandle);
      tickHandle = setInterval(function () { emit(); }, 800);
    }

    function freezeClock() {
      if (!S) return;
      if (S.deadline != null) {
        S.frozenLeft = Math.max(0, S.deadline - Date.now());
        S.deadline = null;
      }
      if (timerHandle) { clearInterval(timerHandle); timerHandle = null; }
      if (tickHandle) { clearInterval(tickHandle); tickHandle = null; }
    }

    function timeLeftMs() {
      if (!S || !S.started) return wordMs;
      if (S.deadline != null) return Math.max(0, S.deadline - Date.now());
      return Math.max(0, S.frozenLeft);
    }

    // --------------------------------------------------------------- actions
    function handleInk(role) {
      if (S.phase !== 'playing' || S.paused || role !== drawerRole()) return;
      if (S.started) return;
      S.started = true;
      S.frozenLeft = wordMs;
      S.deadline = Date.now() + wordMs;
      runIntervals();
      emit();
    }

    function handleGuess(role, text) {
      if (S.phase !== 'playing' || S.paused || role !== guesserRole()) return;
      var raw = String(text == null ? '' : text).trim();
      if (!raw) return;
      var word = currentWord();
      var good = Fr.checkGuess(raw, word);
      S.guesses.push({ text: raw, ok: good });
      if (good) { resolve('ok'); return; }
      S.event = { id: ++S.eventId, type: 'wrong' };
      emit();
    }

    function handleFound(role) {
      if (S.phase !== 'playing' || S.paused || role !== drawerRole()) return;
      resolve('ok', true);
    }

    function handlePass(role) {
      if (S.phase !== 'playing' || S.paused || role !== drawerRole()) return;
      if (!config.allowPass) return;
      resolve('pass');
    }

    function resolve(status, byDrawer) {
      if (!S || S.paused || S.phase !== 'playing') return;
      var word = currentWord();
      if (word == null) return;
      freezeClock();
      if (!S.log[S.round]) S.log[S.round] = [];
      S.log[S.round].push({
        word: word,
        status: status,
        byDrawer: !!byDrawer,
        guesses: S.guesses.map(function (g) { return g.text; }),
        timeMs: wordMs - timeLeftMs()
      });
      if (status === 'ok') S.scores[S.round] = (S.scores[S.round] || 0) + 1;
      S.event = { id: ++S.eventId, type: status, word: word };
      S.paused = true;
      emit();
      clearTimeout(advanceHandle);
      advanceHandle = setTimeout(nextWord, status === 'ok' ? 1500 : 2000);
    }

    function nextWord() {
      if (!S) return;
      advanceHandle = null;
      S.paused = false;
      S.idx++;
      S.guesses = [];
      S.started = false;
      S.deadline = null;
      S.frozenLeft = wordMs;
      if (S.idx >= S.words[S.round].length) { S.phase = 'roundRecap'; emit(); return; }
      S.event = { id: ++S.eventId, type: 'newword' };
      emit();
    }

    function handleNext() {
      if (S.phase !== 'roundRecap') return;
      if (S.round >= roundCount()) { S.phase = 'gameOver'; emit(); return; }
      S.round++;
      S.phase = 'playing';
      S.idx = 0;
      S.guesses = [];
      S.started = false;
      S.deadline = null;
      S.frozenLeft = wordMs;
      S.paused = false;
      S.event = { id: ++S.eventId, type: 'newword' };
      emit();
    }

    function handleReplay() {
      clearTimers();
      S = fresh();
      emit();
    }

    // ------------------------------------------------------------------- vues
    function viewFor(role) {
      if (!S) return null;
      var isDrawer = role === drawerRole();
      var word = currentWord();
      var list = S.words[S.round] || [];
      var total = 0;
      Object.keys(S.scores).forEach(function (r) { total += S.scores[r]; });

      var view = {
        phase: S.phase,
        round: S.round,
        roundCount: roundCount(),
        yourRole: role,
        isDrawer: isDrawer,
        drawer: drawerRole(),
        guesser: guesserRole(),
        names: names,
        config: config,
        wordIndex: S.idx,
        wordTotal: list.length,
        word: isDrawer ? word : null,
        hint: (!isDrawer && config.showLength && word) ? Fr.letterHint(word) : null,
        guesses: S.guesses.slice(),
        timeLeftMs: timeLeftMs(),
        totalTimeMs: wordMs,
        timerStarted: S.started,
        timerRunning: S.deadline != null,
        paused: S.paused,
        event: S.event,
        scores: S.scores,
        roundScore: S.scores[S.round] || 0,
        total: total,
        maxTotal: config.wordCount * roundCount(),
        log: S.log
      };
      if (S.paused && S.event && S.event.word) view.revealWord = S.event.word;
      if (S.phase !== 'playing') {
        view.revealWord = null;
        view.rounds = [];
        for (var r = 1; r <= roundCount(); r++) {
          view.rounds.push({
            round: r,
            drawer: (config.swapRoles ? (r % 2 === 1 ? 'guest' : 'host') : (r % 2 === 1 ? 'host' : 'guest')),
            score: S.scores[r] || 0,
            entries: S.log[r] || []
          });
        }
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
        if (a.t === 'ink') handleInk(role);
        else if (a.t === 'guess') handleGuess(role, a.text);
        else if (a.t === 'found') handleFound(role);
        else if (a.t === 'pass') handlePass(role);
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
  global.PictoEngine = API;
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
})(typeof window !== 'undefined' ? window : globalThis);
