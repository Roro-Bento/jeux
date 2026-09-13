/* Désamorçage — moteur.
 *
 * L'hôte fait autorité : il tire la bombe, garde l'état des modules, valide
 * chaque geste du démineur, compte les erreurs et tient le chrono.
 * L'expert ne reçoit jamais l'état des modules — seulement le chrono, les
 * erreurs et l'avancement. C'est ça, le jeu.
 */
(function (global) {
  'use strict';

  var Bomb = global.Bomb || (typeof require === 'function' ? require('./bomb.js') : null);
  var Modules = global.Modules || (typeof require === 'function' ? require('./modules.js') : null);

  var DEFAULT_CONFIG = {
    moduleCount: 4,   // modules sur la bombe
    minutes: 5,       // durée du chrono
    maxStrikes: 3,    // erreurs avant explosion
    speedUp: true,    // le chrono accélère à chaque erreur
    swapRoles: false  // false : l'hôte est démineur
  };

  function sanitizeConfig(raw) {
    raw = raw || {};
    function num(v, def, min, max) {
      var n = parseInt(v, 10);
      return isNaN(n) ? def : Math.max(min, Math.min(max, n));
    }
    return {
      moduleCount: num(raw.moduleCount, DEFAULT_CONFIG.moduleCount, 1, 6),
      minutes: num(raw.minutes, DEFAULT_CONFIG.minutes, 1, 15),
      maxStrikes: num(raw.maxStrikes, DEFAULT_CONFIG.maxStrikes, 1, 5),
      speedUp: raw.speedUp !== false,
      swapRoles: raw.swapRoles === true,
      // liste de modules imposée (tests et mise au point) — jamais renseignée en jeu normal
      onlyModules: Array.isArray(raw.onlyModules) && raw.onlyModules.length ? raw.onlyModules.slice() : null
    };
  }

  /** Retire les clés privées ($…) avant d'envoyer un état au démineur. */
  function publicState(obj) {
    if (obj == null || typeof obj !== 'object') return obj;
    if (Array.isArray(obj)) return obj.map(publicState);
    var out = {};
    Object.keys(obj).forEach(function (k) {
      if (k.charAt(0) !== '$') out[k] = publicState(obj[k]);
    });
    return out;
  }

  function createEngine(opts) {
    var config = sanitizeConfig(opts.config);
    var names = opts.names || { host: 'Joueur 1', guest: 'Joueur 2' };
    var onUpdate = opts.onUpdate || function () {};
    var seedOf = opts.seed;
    var onBomb = opts.onBomb || function () {};
    // modules de la partie précédente : on les évite en priorité pour que deux
    // bombes de suite ne se ressemblent pas
    var lastModuleIds = Array.isArray(opts.lastModules) ? opts.lastModules.slice() : [];

    var totalMs = config.minutes * 60 * 1000;
    var S = null;
    var timerHandle = null, tickHandle = null;

    function emit() { onUpdate(); }
    function defuserRole() { return config.swapRoles ? 'guest' : 'host'; }

    function clearTimers() {
      if (timerHandle) { clearInterval(timerHandle); timerHandle = null; }
      if (tickHandle) { clearInterval(tickHandle); tickHandle = null; }
    }

    /* On pioche d'abord parmi les modules absents de la bombe précédente, puis
     * on complète au hasard : avec 4 modules sur 6, au moins deux changent à
     * chaque partie, et lesquels restent est aléatoire. */
    function pickModules(rng) {
      var fresh = [], seen = [];
      Modules.list.forEach(function (m) {
        (lastModuleIds.indexOf(m.id) === -1 ? fresh : seen).push(m);
      });
      var ordered = Bomb.shuffle(rng, fresh).concat(Bomb.shuffle(rng, seen));
      var chosen = ordered.slice(0, Math.min(config.moduleCount, ordered.length));
      return Bomb.shuffle(rng, chosen);   // l'ordre d'affichage reste aléatoire
    }

    function buildBomb(seed) {
      var rng = Bomb.rngFrom(seed);
      var bomb = Bomb.makeWidgets(rng);
      var pool = config.onlyModules
        ? config.onlyModules.map(function (id) { return Modules.byId(id); }).filter(Boolean)
        : pickModules(rng);
      if (!pool.length) pool = Bomb.shuffle(rng, Modules.list);
      var mods = [];
      for (var i = 0; i < config.moduleCount; i++) {
        var def = pool[i % pool.length];
        mods.push({
          id: def.id,
          name: def.name,
          emoji: def.emoji,
          state: def.generate(rng, bomb),
          solved: false
        });
      }
      bomb.modules = mods;
      lastModuleIds = mods.map(function (m) { return m.id; });
      onBomb(lastModuleIds.slice());
      return bomb;
    }

    function fresh() {
      var seed = seedOf != null ? seedOf : Math.floor(Math.random() * 0xffffffff);
      var bomb = buildBomb(seed);
      return {
        phase: 'playing',
        outcome: null,
        reason: null,
        seed: seed,
        bomb: bomb,
        modules: bomb.modules,
        strikes: 0,
        rate: 1,
        endsAt: Date.now() + totalMs,
        holdAt: null,
        finishedLeftMs: 0,
        event: null,
        eventId: 0
      };
    }

    // ----------------------------------------------------------------- chrono
    function timeLeftMs() {
      if (!S) return totalMs;
      if (S.phase !== 'playing') return S.finishedLeftMs;
      return Math.max(0, (S.endsAt - Date.now()) * S.rate);
    }

    function runTimer() {
      clearTimers();
      timerHandle = setInterval(function () {
        if (!S || S.phase !== 'playing') return;
        if (timeLeftMs() <= 0) finish('lost', 'time');
      }, 120);
      tickHandle = setInterval(function () { emit(); }, 700);
    }

    function finish(outcome, reason) {
      if (!S || S.phase !== 'playing') return;
      S.finishedLeftMs = Math.max(0, timeLeftMs());
      S.phase = 'over';
      S.outcome = outcome;
      S.reason = reason || null;
      S.event = { id: ++S.eventId, type: outcome === 'won' ? 'defused' : 'boom' };
      clearTimers();
      emit();
    }

    function addStrike(moduleId) {
      var left = timeLeftMs();
      S.strikes++;
      S.event = { id: ++S.eventId, type: 'strike', module: moduleId };
      if (S.strikes >= config.maxStrikes) { finish('lost', 'strikes'); return; }
      if (config.speedUp) S.rate = 1 + 0.25 * S.strikes;
      S.endsAt = Date.now() + left / S.rate;
      emit();
    }

    // ---------------------------------------------------------------- actions
    function handleModule(role, msg) {
      if (S.phase !== 'playing') return;
      if (role !== defuserRole()) return;
      var m = S.modules[msg.i];
      if (!m || m.solved) return;
      var def = Modules.byId(m.id);
      if (!def) return;

      var action = msg.a || {};
      if (action.type === 'down') S.holdAt = Date.now();
      var heldMs = action.type === 'up' && S.holdAt ? Date.now() - S.holdAt : 0;
      if (action.type === 'up') S.holdAt = null;

      var ctx = { strikes: S.strikes, timeLeftMs: timeLeftMs(), heldMs: heldMs };
      var res = def.act(m.state, S.bomb, ctx, action);

      if (res === 'strike') { addStrike(m.id); return; }
      if (res === 'ok') {
        m.solved = true;
        S.event = { id: ++S.eventId, type: 'solved', module: m.id };
        if (S.modules.every(function (x) { return x.solved; })) { finish('won', null); return; }
      }
      emit();
    }

    function handleReplay(msg) {
      clearTimers();
      if (msg && msg.swap) config.swapRoles = !config.swapRoles;
      seedOf = null;
      S = fresh();
      runTimer();
      emit();
    }

    // ------------------------------------------------------------------- vues
    function moduleRecap() {
      return S.modules.map(function (m) {
        var def = Modules.byId(m.id);
        var plan = null;
        // au débriefing on a le droit de tout savoir : on garde l'état complet
        try { plan = def.solve(m.state, S.bomb, { strikes: S.strikes, timeLeftMs: timeLeftMs() }); }
        catch (e) { plan = null; }
        return {
          id: m.id, name: m.name, emoji: m.emoji, solved: m.solved,
          answer: plan ? plan.answer : null
        };
      });
    }

    function viewFor(role) {
      if (!S) return null;
      var isDefuser = role === defuserRole();
      var solved = S.modules.filter(function (m) { return m.solved; }).length;
      var over = S.phase === 'over';

      var view = {
        phase: S.phase,
        outcome: S.outcome,
        reason: S.reason,
        yourRole: role,
        isDefuser: isDefuser,
        defuser: defuserRole(),
        names: names,
        config: config,
        strikes: S.strikes,
        maxStrikes: config.maxStrikes,
        timeLeftMs: timeLeftMs(),
        totalTimeMs: totalMs,
        rate: S.rate,
        solvedCount: solved,
        moduleCount: S.modules.length,
        event: S.event
      };

      if (isDefuser || over) {
        view.bomb = {
          serial: S.bomb.serial,
          batteries: S.bomb.batteries,
          indicators: S.bomb.indicators
        };
      }
      if (isDefuser && !over) {
        view.modules = S.modules.map(function (m) {
          return { id: m.id, name: m.name, emoji: m.emoji, solved: m.solved, state: publicState(m.state) };
        });
      }
      if (over) view.recap = moduleRecap();
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
      start: function () { S = fresh(); runTimer(); emit(); },
      started: function () { return !!S; },
      action: function (role, a) {
        if (!S || !a) return;
        if (a.t === 'module') handleModule(role, a);
        else if (a.t === 'replay') handleReplay(a);
      },
      viewFor: viewFor,
      dispose: function () { clearTimers(); S = null; },
      // exposé pour les tests
      _state: function () { return S; }
    };
  }

  var API = {
    createEngine: createEngine,
    sanitizeConfig: sanitizeConfig,
    publicState: publicState,
    DEFAULT_CONFIG: DEFAULT_CONFIG
  };

  global.BombEngine = API;
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
})(typeof window !== 'undefined' ? window : globalThis);
