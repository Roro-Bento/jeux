/* Pendu — moteur.
 *
 * Un joueur choisit le mot (il le tape, ou le pioche d'un clic), l'autre le
 * devine lettre par lettre ; puis on inverse. Le devineur ne reçoit jamais le
 * mot : il ne voit que les lettres déjà découvertes.
 */
(function (global) {
  'use strict';

  var Fr = global.Fr || (typeof require === 'function' ? require('../../common/french.js') : null);
  var RNG = global.RNG || (typeof require === 'function' ? require('../../common/rng.js') : null);

  var DEFAULT_CONFIG = {
    lives: 8,          // erreurs autorisées
    roundsEach: 1,     // manches par joueur (le total est le double)
    allowWord: true,   // le devineur peut tenter le mot entier
    swapRoles: false   // false : l'hôte choisit le premier mot
  };

  function sanitizeConfig(raw) {
    raw = raw || {};
    function num(v, def, min, max) {
      var n = parseInt(v, 10);
      return isNaN(n) ? def : Math.max(min, Math.min(max, n));
    }
    return {
      lives: num(raw.lives, DEFAULT_CONFIG.lives, 3, 12),
      roundsEach: num(raw.roundsEach, DEFAULT_CONFIG.roundsEach, 1, 3),
      allowWord: raw.allowWord !== false,
      swapRoles: raw.swapRoles === true
    };
  }

  function other(role) { return role === 'host' ? 'guest' : 'host'; }

  /** Découpe un mot en positions : lettre à trouver, ou séparateur visible. */
  function slotsOf(word) {
    return String(word).split('').map(function (ch) {
      var k = Fr.normalize(ch);
      return /^[a-z]$/.test(k) ? { k: k, ch: ch } : { k: null, ch: ch };
    });
  }

  /** Contrôle du mot proposé par celui qui fait deviner. */
  function checkWord(raw) {
    var w = String(raw == null ? '' : raw).trim().replace(/\s+/g, ' ');
    if (w.length < 3) return { ok: false, message: 'Au moins 3 caractères.' };
    if (w.length > 24) return { ok: false, message: 'Maximum 24 caractères.' };
    if (/\d/.test(w)) return { ok: false, message: 'Pas de chiffres.' };
    if (!/^[a-zà-öø-ÿœæ' -]+$/i.test(w)) return { ok: false, message: 'Lettres, espaces et traits d’union seulement.' };
    var letters = slotsOf(w).filter(function (s) { return s.k; });
    if (letters.length < 3) return { ok: false, message: 'Au moins 3 lettres.' };
    var distinct = {};
    letters.forEach(function (s) { distinct[s.k] = true; });
    if (Object.keys(distinct).length < 2) return { ok: false, message: 'Il faut au moins deux lettres différentes.' };
    return { ok: true, value: w };
  }

  function createEngine(opts) {
    var config = sanitizeConfig(opts.config);
    var names = opts.names || { host: 'Joueur 1', guest: 'Joueur 2' };
    var onUpdate = opts.onUpdate || function () {};
    var bank = (opts.words || global.WORDS || []).filter(function (w) {
      return Fr.normalize(w).replace(/[^a-z]/g, '').length >= 5;
    });

    var S = null;
    function emit() { onUpdate(); }

    function chooserRole() {
      var base = config.swapRoles ? 'guest' : 'host';
      return S.round % 2 === 1 ? base : other(base);
    }
    function guesserRole() { return other(chooserRole()); }

    function roundCount() { return config.roundsEach * 2; }

    function beginRound() {
      S.phase = 'choosing';
      S.word = null;
      S.slots = [];
      S.found = {};
      S.wrong = [];
      S.livesLeft = config.lives;
      S.event = null;
      S.messages = { host: null, guest: null };
    }

    function fresh() {
      return {
        phase: 'choosing',
        round: 1,
        word: null, slots: [], found: {}, wrong: [], livesLeft: config.lives,
        log: [],
        event: null, eventId: 0,
        messages: { host: null, guest: null }, messageId: 0
      };
    }

    function message(role, text) {
      S.messages[role] = { text: text, id: ++S.messageId };
    }

    // ---------------------------------------------------------------- actions
    function handleSetWord(role, text) {
      if (S.phase !== 'choosing' || role !== chooserRole()) return;
      var res = checkWord(text);
      if (!res.ok) { message(role, res.message); emit(); return; }
      S.word = res.value;
      S.slots = slotsOf(res.value);
      S.phase = 'playing';
      S.messages[role] = null;
      S.event = { id: ++S.eventId, type: 'start' };
      emit();
    }

    function handleDraw(role) {
      if (S.phase !== 'choosing' || role !== chooserRole()) return;
      if (!bank.length) return;
      var pick = RNG.pick(RNG.rngFrom(RNG.randomSeed()), bank);
      message(role, null);
      S.messages[role] = null;
      S.drawn = pick;                       // proposé dans le champ, pas encore validé
      S.event = { id: ++S.eventId, type: 'drawn' };
      emit();
    }

    function remaining() {
      return S.slots.filter(function (s) { return s.k && !S.found[s.k]; }).length;
    }

    function handleLetter(role, letter) {
      if (S.phase !== 'playing' || role !== guesserRole()) return;
      var l = Fr.normalize(letter);
      if (!/^[a-z]$/.test(l)) return;
      if (S.found[l] || S.wrong.indexOf(l) !== -1) return;   // déjà proposée

      var hit = S.slots.some(function (s) { return s.k === l; });
      if (hit) {
        S.found[l] = true;
        S.event = { id: ++S.eventId, type: 'hit', letter: l };
        if (remaining() === 0) { endRound(true); return; }
      } else {
        S.wrong.push(l);
        S.livesLeft--;
        S.event = { id: ++S.eventId, type: 'miss', letter: l };
        if (S.livesLeft <= 0) { endRound(false); return; }
      }
      emit();
    }

    function handleWordGuess(role, text) {
      if (S.phase !== 'playing' || role !== guesserRole() || !config.allowWord) return;
      var raw = String(text == null ? '' : text).trim();
      if (raw.length < 2) return;
      if (Fr.checkGuess(raw, S.word)) {
        S.slots.forEach(function (s) { if (s.k) S.found[s.k] = true; });
        endRound(true);
        return;
      }
      S.livesLeft--;
      S.event = { id: ++S.eventId, type: 'miss', word: raw };
      message(role, '« ' + raw +' » : raté.');
      if (S.livesLeft <= 0) { endRound(false); return; }
      emit();
    }

    function endRound(found) {
      S.phase = 'roundRecap';
      S.log.push({
        round: S.round,
        word: S.word,
        found: found,
        chooser: chooserRole(),
        guesser: guesserRole(),
        wrong: S.wrong.slice(),
        livesLeft: Math.max(0, S.livesLeft)
      });
      S.event = { id: ++S.eventId, type: found ? 'won' : 'lost' };
      emit();
    }

    function handleNext() {
      if (S.phase !== 'roundRecap') return;
      if (S.round >= roundCount()) { S.phase = 'gameOver'; emit(); return; }
      S.round++;
      beginRound();
      emit();
    }

    function handleReplay() {
      S = fresh();
      beginRound();
      emit();
    }

    // ------------------------------------------------------------------- vues
    function maskedSlots(reveal) {
      return S.slots.map(function (s) {
        if (!s.k) return { sep: s.ch };
        return { ch: (reveal || S.found[s.k]) ? s.ch : null };
      });
    }

    function viewFor(role) {
      if (!S) return null;
      var isChooser = role === chooserRole();
      var over = S.phase === 'roundRecap' || S.phase === 'gameOver';
      var view = {
        phase: S.phase,
        round: S.round,
        roundCount: roundCount(),
        yourRole: role,
        isChooser: isChooser,
        chooser: chooserRole(),
        guesser: guesserRole(),
        names: names,
        config: config,
        lives: config.lives,
        livesLeft: Math.max(0, S.livesLeft),
        wrong: S.wrong.slice(),
        found: Object.keys(S.found),
        slots: S.phase === 'choosing' ? [] : maskedSlots(isChooser || over),
        letterCount: S.slots.filter(function (s) { return s.k; }).length,
        event: S.event,
        message: S.messages[role],
        log: S.log.slice()
      };
      if (isChooser && S.phase === 'choosing' && S.drawn) view.drawn = S.drawn;
      if (isChooser || over) view.word = S.word;
      if (S.phase === 'gameOver') {
        view.solved = S.log.filter(function (l) { return l.found; }).length;
        view.total = S.log.length;
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
      start: function () { S = fresh(); beginRound(); emit(); },
      started: function () { return !!S; },
      action: function (role, a) {
        if (!S || !a) return;
        if (a.t === 'setWord') handleSetWord(role, a.text);
        else if (a.t === 'draw') handleDraw(role);
        else if (a.t === 'letter') handleLetter(role, a.l);
        else if (a.t === 'word') handleWordGuess(role, a.text);
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
    checkWord: checkWord,
    slotsOf: slotsOf,
    DEFAULT_CONFIG: DEFAULT_CONFIG
  };
  global.PenduEngine = API;
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
})(typeof window !== 'undefined' ? window : globalThis);
