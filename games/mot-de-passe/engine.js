/* Moteur de jeu — Mot de Passe coop
 *
 * L'hôte (celui qui crée la room) fait autorité : il possède l'état complet,
 * choisit les mots, valide les indices et les propositions, gère le chrono.
 * Chaque joueur reçoit une « vue » de l'état d'où le mot secret est retiré
 * s'il n'est pas censé le voir.
 */
(function (global) {
  'use strict';

  var Rules = global.Rules || (typeof require === 'function' ? require('./rules.js') : null);

  var DEFAULT_CONFIG = {
    wordCount: 5,      // mots par manche
    timePerWord: 18,   // secondes par mot, CUMULÉES sur la manche
                       // (5 mots × 18 s = 1 min 30 de chrono pour la manche entière)
    attempts: 3,       // propositions par mot
    showLength: true,  // afficher le nombre de lettres au devineur
    singleWordClue: true
  };

  var ROLES = ['host', 'guest'];

  function sanitizeConfig(raw) {
    raw = raw || {};
    function num(v, def, min, max) {
      var n = parseInt(v, 10);
      if (isNaN(n)) return def;
      return Math.max(min, Math.min(max, n));
    }
    return {
      wordCount: num(raw.wordCount, DEFAULT_CONFIG.wordCount, 1, 20),
      timePerWord: num(raw.timePerWord, DEFAULT_CONFIG.timePerWord, 5, 120),
      attempts: num(raw.attempts, DEFAULT_CONFIG.attempts, 1, 10),
      showLength: raw.showLength !== false,
      singleWordClue: raw.singleWordClue !== false
    };
  }

  function shuffled(list) {
    var a = list.slice();
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }

  function other(role) { return role === 'host' ? 'guest' : 'host'; }

  /**
   * @param {object} opts { config, names:{host,guest}, words, onUpdate }
   */
  function createEngine(opts) {
    var config = sanitizeConfig(opts.config);
    var wordPool = opts.words || global.WORDS || [];
    var onUpdate = opts.onUpdate || function () {};
    var names = opts.names || { host: 'Joueur 1', guest: 'Joueur 2' };

    var roundMs = config.wordCount * config.timePerWord * 1000;

    var S = null;
    var timerHandle = null;
    var advanceHandle = null;
    var tickHandle = null;

    function emit() { onUpdate(); }

    function clearTimers() {
      if (timerHandle) { clearInterval(timerHandle); timerHandle = null; }
      if (advanceHandle) { clearTimeout(advanceHandle); advanceHandle = null; }
      if (tickHandle) { clearInterval(tickHandle); tickHandle = null; }
    }

    function pickWords() {
      var need = config.wordCount * 2;
      var pool = shuffled(wordPool);
      var picked = [];
      while (picked.length < need) {
        picked = picked.concat(pool.slice(0, Math.min(need - picked.length, pool.length)));
        if (pool.length === 0) break;
      }
      return picked.slice(0, need);
    }

    function fresh() {
      var w = pickWords();
      return {
        phase: 'playing',
        round: 1,
        roundCount: 2,
        giver: 'host',
        roundWords: { 1: w.slice(0, config.wordCount), 2: w.slice(config.wordCount) },
        idx: 0,
        clues: [],
        guesses: [],
        attemptsLeft: config.attempts,
        deadline: null,      // échéance du chrono de manche (null = gelé)
        frozenLeft: roundMs, // temps restant quand le chrono est gelé
        roundStarted: false, // le chrono démarre au 1er indice de la manche
        roundExpired: false,
        paused: false,
        turn: 'giver',
        log: { 1: [], 2: [] },
        scores: { 1: 0, 2: 0 },
        event: null,
        eventId: 0,
        messages: { host: null, guest: null },
        messageId: 0
      };
    }

    function currentWord() {
      if (!S || S.phase !== 'playing') return null;
      var list = S.roundWords[S.round];
      return S.idx < list.length ? list[S.idx] : null;
    }

    function guesserRole() { return other(S.giver); }

    function message(role, text) {
      S.messages[role] = { text: text, id: ++S.messageId };
    }

    // ---------------------------------------------------------------- chrono
    // Le chrono est GLOBAL à la manche : wordCount × timePerWord secondes.
    // Il démarre au premier indice de la manche, court d'un mot à l'autre,
    // et se met en pause pendant la révélation entre deux mots.
    function runIntervals() {
      clearInterval(timerHandle);
      timerHandle = setInterval(function () {
        if (!S || S.deadline == null) return;
        if (Date.now() >= S.deadline) expireRound();
      }, 150);
      clearInterval(tickHandle);
      tickHandle = setInterval(function () { emit(); }, 900);
    }

    function stopIntervals() {
      if (timerHandle) { clearInterval(timerHandle); timerHandle = null; }
      if (tickHandle) { clearInterval(tickHandle); tickHandle = null; }
    }

    function freezeClock() {
      if (!S) return;
      if (S.deadline != null) {
        S.frozenLeft = Math.max(0, S.deadline - Date.now());
        S.deadline = null;
      }
      stopIntervals();
    }

    function resumeClock() {
      if (!S || !S.roundStarted || S.roundExpired) return;
      if (S.frozenLeft <= 0) { expireRound(); return; }
      S.deadline = Date.now() + S.frozenLeft;
      runIntervals();
    }

    function expireRound() {
      if (!S || S.roundExpired) return;
      S.roundExpired = true;
      S.frozenLeft = 0;
      S.deadline = null;
      stopIntervals();
      resolveWord('timeout');
    }

    function timeLeftMs() {
      if (!S || !S.roundStarted) return roundMs;
      if (S.deadline != null) return Math.max(0, S.deadline - Date.now());
      return Math.max(0, S.frozenLeft);
    }

    // ------------------------------------------------------------ résolution
    function resolveWord(status) {
      if (!S || S.paused || S.phase !== 'playing') return;
      var word = currentWord();
      if (word == null) return;
      freezeClock();
      S.log[S.round].push({
        word: word,
        status: status,
        clues: S.clues.slice(),
        guesses: S.guesses.slice()
      });
      if (status === 'ok') S.scores[S.round]++;
      S.event = { type: status, word: word, id: ++S.eventId };
      S.paused = true;
      emit();
      clearTimeout(advanceHandle);
      advanceHandle = setTimeout(nextWord, status === 'ok' ? 1400 : 2100);
    }

    function nextWord() {
      if (!S) return;
      advanceHandle = null;
      S.paused = false;
      S.idx++;
      S.clues = [];
      S.guesses = [];
      S.attemptsLeft = config.attempts;
      S.turn = 'giver';
      S.messages.host = null;
      S.messages.guest = null;

      var list = S.roundWords[S.round];
      // temps écoulé : les mots non joués sont comptés comme ratés
      if (S.roundExpired) {
        while (S.idx < list.length) {
          S.log[S.round].push({ word: list[S.idx], status: 'timeout', clues: [], guesses: [] });
          S.idx++;
        }
      }
      if (S.idx >= list.length) {
        S.phase = 'roundRecap';
        emit();
        return;
      }
      resumeClock();
      emit();
    }

    // --------------------------------------------------------------- actions
    function handleClue(role, text) {
      if (S.phase !== 'playing' || S.paused) return;
      if (role !== S.giver || S.turn !== 'giver') return;
      var word = currentWord();
      var res = Rules.checkClue(text, word, {
        singleWord: config.singleWordClue,
        previousClues: S.clues
      });
      if (!res.ok) { message(role, res.message); emit(); return; }

      S.clues.push(res.value);
      S.messages[role] = null;
      if (!S.roundStarted) {
        S.roundStarted = true;
        S.frozenLeft = roundMs;
      }
      if (S.deadline == null) resumeClock();
      S.turn = 'guesser';
      emit();
    }

    function handleGuess(role, text) {
      if (S.phase !== 'playing' || S.paused) return;
      if (role !== guesserRole() || S.turn !== 'guesser') return;
      var raw = String(text == null ? '' : text).trim();
      if (!raw) return;
      var word = currentWord();
      S.guesses.push(raw);
      S.messages[role] = null;

      if (Rules.checkGuess(raw, word)) {
        resolveWord('ok');
        return;
      }
      S.attemptsLeft--;
      if (S.attemptsLeft <= 0) {
        resolveWord('fail');
        return;
      }
      S.event = { type: 'wrong', id: ++S.eventId };
      S.turn = 'giver';
      emit();
    }

    function handlePass(role) {
      if (S.phase !== 'playing' || S.paused) return;
      if (role !== S.giver) return;
      resolveWord('pass');
    }

    function handleNext() {
      if (S.phase !== 'roundRecap') return;
      if (S.round >= S.roundCount) {
        S.phase = 'gameOver';
        emit();
        return;
      }
      S.round++;
      S.giver = other(S.giver);
      S.idx = 0;
      S.clues = [];
      S.guesses = [];
      S.attemptsLeft = config.attempts;
      S.deadline = null;
      S.frozenLeft = roundMs;
      S.roundStarted = false;
      S.roundExpired = false;
      S.paused = false;
      S.turn = 'giver';
      S.event = null;
      S.messages.host = null;
      S.messages.guest = null;
      S.phase = 'playing';
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
      var isGiver = S.giver === role;
      var word = currentWord();
      var view = {
        phase: S.phase,
        round: S.round,
        roundCount: S.roundCount,
        yourRole: role,
        giver: S.giver,
        isGiver: isGiver,
        names: names,
        config: config,
        wordIndex: S.idx,
        wordTotal: S.roundWords[S.round] ? S.roundWords[S.round].length : config.wordCount,
        word: isGiver ? word : null,
        hint: (!isGiver && config.showLength && word) ? Rules.letterHint(word) : null,
        clues: S.clues.slice(),
        guesses: S.guesses.slice(),
        attemptsLeft: S.attemptsLeft,
        maxAttempts: config.attempts,
        turn: S.turn,
        paused: S.paused,
        timeLeftMs: timeLeftMs(),
        totalTimeMs: roundMs,
        timerStarted: S.roundStarted,
        timerRunning: S.deadline != null,
        event: S.event,
        message: S.messages[role],
        scores: S.scores,
        log: S.log,
        total: S.scores[1] + S.scores[2],
        maxTotal: config.wordCount * 2
      };
      // Pendant la pause de révélation, tout le monde voit le mot
      if (S.paused && S.event && S.event.word) view.revealWord = S.event.word;
      if (S.phase !== 'playing') view.revealWord = null;
      return view;
    }

    return {
      config: config,
      get names() { return names; },
      setName: function (role, name) {
        if (ROLES.indexOf(role) === -1) return;
        names[role] = String(name || '').slice(0, 20) || names[role];
        emit();
      },
      start: function () { S = fresh(); emit(); },
      started: function () { return !!S; },
      action: function (role, a) {
        if (!S || !a) return;
        switch (a.t) {
          case 'clue': handleClue(role, a.text); break;
          case 'guess': handleGuess(role, a.text); break;
          case 'pass': handlePass(role); break;
          case 'next': handleNext(); break;
          case 'replay': handleReplay(); break;
        }
      },
      viewFor: viewFor,
      dispose: function () { clearTimers(); S = null; }
    };
  }

  var API = {
    createEngine: createEngine,
    sanitizeConfig: sanitizeConfig,
    DEFAULT_CONFIG: DEFAULT_CONFIG
  };
  global.Engine = API;
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
})(typeof window !== 'undefined' ? window : globalThis);
