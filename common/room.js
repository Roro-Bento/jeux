/* Salon partagé — infrastructure commune à tous les jeux du hub.
 *
 * Room s'occupe de tout ce qui n'est pas le jeu lui-même : l'accueil, l'écran
 * de réglages, le code de room, la connexion P2P, le lobby, et la boucle
 * hôte-fait-autorité (le moteur vit chez l'hôte, chaque joueur reçoit une vue).
 *
 * Un jeu se décrit ainsi :
 *
 *   Room.init({
 *     id, title, tagline, howto: [ '<li>…</li>' ],
 *     roles: { host: 'Démineur', guest: 'Expert' },   // optionnel → bouton d'échange
 *     config: { defaults, sanitize, fields: [...], summary(c), note(c) },
 *     createEngine(config, names, onUpdate) -> engine,
 *     screenKey(view) -> 'playing' | 'recap' | …,
 *     build(key, view, api) -> html,
 *     bind(key, view, api),
 *     update(key, view, api)
 *   })
 */
(function (global) {
  'use strict';

  var app, def;
  var RING = 2 * Math.PI * 52;

  var A = {
    screenKey: '',
    gameScreenKey: '',
    role: null,
    conn: null,
    engine: null,
    view: null,
    name: '',
    peerName: '',
    code: '',
    config: null,
    swapRoles: false,
    peerJoined: false,
    netReady: false,
    error: '',
    disconnected: false,
    frameFn: null
  };

  // ------------------------------------------------------------ utilitaires
  function $(sel, root) { return (root || document).querySelector(sel); }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function loadName() { try { return localStorage.getItem('coop-name') || ''; } catch (e) { return ''; } }
  function saveName(n) { try { localStorage.setItem('coop-name', n); } catch (e) {} }
  function myName() { return A.name || (A.role === 'guest' ? 'Joueur 2' : 'Joueur 1'); }
  function names() {
    if (A.view && A.view.names) return A.view.names;
    return A.role === 'host'
      ? { host: myName(), guest: A.peerName || 'Joueur 2' }
      : { host: A.peerName || 'Joueur 1', guest: myName() };
  }
  function otherName() {
    var n = names();
    return A.role === 'host' ? n.guest : n.host;
  }
  function fmtDuration(sec) {
    sec = Math.round(sec);
    if (sec < 60) return sec + ' s';
    var m = Math.floor(sec / 60), r = sec % 60;
    return m + ' min' + (r ? ' ' + (r < 10 ? '0' : '') + r : '');
  }
  function fmtClock(ms) {
    var s = Math.max(0, Math.ceil(ms / 1000));
    if (s < 60) return String(s);
    return Math.floor(s / 60) + ':' + (s % 60 < 10 ? '0' : '') + (s % 60);
  }
  function plural(n, s, p) { return n + ' ' + (n > 1 ? (p || s + 's') : s); }

  /** N'écrit dans le DOM que si le contenu a réellement changé. */
  function setHtml(el, html) {
    if (!el || el.__h === html) return;
    el.__h = html;
    el.innerHTML = html;
  }
  function setText(el, txt) {
    if (!el || el.__t === txt) return;
    el.__t = txt;
    el.textContent = txt;
  }
  function now() { return (global.performance && performance.now) ? performance.now() : Date.now(); }

  // ------------------------------------------------------------------ décor
  function logoBlock(small) {
    return '<div class="logo">' +
      '<h1' + (small ? ' class="sm"' : '') + '>' + esc(def.title) + '</h1>' +
      (small ? '' : '<p>' + esc(def.tagline || '') + '</p>') +
      '</div>';
  }
  function banner() {
    if (!A.disconnected) return '';
    return '<div class="panel warn-panel">Connexion perdue avec l’autre joueur.</div>';
  }
  function footer() {
    return '<div class="footer-note">' +
      '<a href="../../index.html">← tous les jeux</a> · ' +
      'aucun serveur, aucune donnée stockée — la partie vit entre vos deux navigateurs.</div>';
  }

  // ============================================================== ÉCRAN HOME
  function screenHome() {
    setScreen('home',
      logoBlock() +
      '<section class="panel">' +
        '<label class="field"><span class="lab">Ton pseudo</span>' +
          '<input id="f-name" type="text" maxlength="20" placeholder="Ton prénom" value="' + esc(A.name) + '"></label>' +
        '<div class="actions">' +
          '<button class="btn btn-primary btn-lg" id="go-create">Créer une room</button>' +
          '<button class="btn btn-ghost btn-lg" id="go-join">Rejoindre une room</button>' +
        '</div>' +
        (def.howto && def.howto.length
          ? '<details class="howto"><summary>Comment on joue ?</summary><ul class="rules-list">' +
            def.howto.join('') + '</ul></details>'
          : '') +
      '</section>' +
      footer()
    );
    $('#f-name').addEventListener('input', function (e) { A.name = e.target.value.trim(); saveName(A.name); });
    $('#go-create').onclick = screenCreate;
    $('#go-join').onclick = function () { screenJoin(''); };
  }

  // ============================================================ ÉCRAN RÉGLAGES
  function fieldHtml(f, value) {
    if (f.type === 'toggle') {
      return '<label class="toggle"><span class="txt">' + f.label + '</span>' +
        '<input type="checkbox" id="' + f.id + '"' + (value ? ' checked' : '') + '><span class="sw"></span></label>';
    }
    return '<label class="field"><span class="lab">' + esc(f.label) + '</span>' +
      '<div class="stepper">' +
        '<button type="button" data-step="-' + (f.step || 1) + '" data-for="' + f.id + '">−</button>' +
        '<input type="number" id="' + f.id + '" value="' + value + '" min="' + f.min + '" max="' + f.max +
          '" step="' + (f.step || 1) + '" inputmode="numeric">' +
        '<button type="button" data-step="' + (f.step || 1) + '" data-for="' + f.id + '">+</button>' +
      '</div>' +
      (f.suffix ? '<div class="small muted center" style="margin-top:4px">' + esc(f.suffix) + '</div>' : '') +
      '</label>';
  }

  function screenCreate() {
    var c = A.config, cf = def.config;
    var numbers = cf.fields.filter(function (f) { return f.type !== 'toggle'; });
    var toggles = cf.fields.filter(function (f) { return f.type === 'toggle'; });
    setScreen('create',
      logoBlock(true) +
      '<section class="panel">' +
        '<h2 class="section-title">Réglages de la room</h2>' +
        '<div class="row">' + numbers.map(function (f) { return fieldHtml(f, c[f.key]); }).join('') + '</div>' +
        (cf.note ? '<div class="calc" id="c-calc"></div>' : '') +
        toggles.map(function (f) { return fieldHtml(f, c[f.key]); }).join('') +
        '<div class="actions">' +
          '<button class="btn btn-ghost" id="back">Retour</button>' +
          '<button class="btn btn-primary btn-lg" id="create">Créer la room</button>' +
        '</div>' +
      '</section>' +
      footer()
    );

    function readForm() {
      var out = {};
      cf.fields.forEach(function (f) {
        var el = document.getElementById(f.id);
        out[f.key] = f.type === 'toggle' ? el.checked : el.value;
      });
      return cf.sanitize(out);
    }
    function refreshNote() {
      if (!cf.note) return;
      $('#c-calc').innerHTML = cf.note(readForm());
    }
    cf.fields.forEach(function (f) {
      var el = document.getElementById(f.id);
      if (el) el.addEventListener('input', refreshNote);
    });
    refreshNote();
    $('#back').onclick = screenHome;
    $('#create').onclick = function () { A.config = readForm(); startHost(); };
  }

  function onStepperClick(e) {
    var b = e.target.closest('button[data-step]');
    if (!b) return;
    var input = document.getElementById(b.getAttribute('data-for'));
    if (!input) return;
    var v = parseInt(input.value, 10) || 0;
    var min = parseInt(input.min, 10), max = parseInt(input.max, 10);
    v += parseInt(b.getAttribute('data-step'), 10);
    input.value = Math.max(min, Math.min(max, v));
    input.dispatchEvent(new Event('input', { bubbles: true }));
  }

  // ============================================================== ÉCRAN JOIN
  function screenJoin(prefill) {
    setScreen('join',
      logoBlock(true) +
      '<section class="panel">' +
        '<h2 class="section-title">Rejoindre une room</h2>' +
        '<label class="field"><span class="lab">Ton pseudo</span>' +
          '<input id="j-name" type="text" maxlength="20" placeholder="Ton prénom" value="' + esc(A.name) + '"></label>' +
        '<label class="field"><span class="lab">Code de la room</span>' +
          '<input id="join-code" type="text" maxlength="6" autocomplete="off" autocapitalize="characters" spellcheck="false" placeholder="ABCD" value="' + esc(prefill || '') + '"></label>' +
        '<div class="entry-msg" id="j-msg"></div>' +
        '<div class="actions">' +
          '<button class="btn btn-ghost" id="back">Retour</button>' +
          '<button class="btn btn-primary btn-lg" id="join">Rejoindre</button>' +
        '</div>' +
      '</section>' +
      footer()
    );
    var code = $('#join-code');
    code.addEventListener('input', function () { code.value = global.Net.normalizeCode(code.value); });
    code.addEventListener('keydown', function (e) { if (e.key === 'Enter') $('#join').click(); });
    $('#j-name').addEventListener('input', function (e) { A.name = e.target.value.trim(); saveName(A.name); });
    $('#back').onclick = screenHome;
    $('#join').onclick = function () {
      var c = global.Net.normalizeCode(code.value);
      if (c.length < 4) { $('#j-msg').textContent = 'Entre le code à 4 caractères.'; return; }
      startGuest(c);
    };
    setTimeout(function () { (prefill ? $('#join') : code).focus(); }, 60);
  }

  // ============================================================== ÉCRAN LOBBY
  function roleLabel(role) {
    if (!def.roles) return null;
    var assigned = A.swapRoles ? (role === 'host' ? 'guest' : 'host') : role;
    return def.roles[assigned];
  }

  function screenLobby() {
    var isHost = A.role === 'host';
    var link = location.origin + location.pathname + '?room=' + A.code +
      (global.Net.isLocalMode() ? '&local=1' : '');
    var summary = (def.config.summary ? def.config.summary(A.config) : []).map(function (it) {
      return '<div class="item"><b>' + esc(it.value) + '</b><span>' + esc(it.label) + '</span></div>';
    }).join('');

    setScreen('lobby',
      logoBlock(true) + banner() +
      '<section class="panel">' +
        '<div class="code-display">' +
          '<div class="lab-mini">' + (isHost ? 'Code de la room' : 'Room') + '</div>' +
          '<div class="code" id="the-code">' + esc(A.code || '····') + '</div>' +
          (isHost ? '<button class="linky" id="copy-link">copier le lien d’invitation</button>' : '') +
        '</div>' +
        '<div class="status-line" id="lobby-status"></div>' +
        (def.roles ? '<div class="roles-box" id="roles-box"></div>' : '') +
        '<div class="settings-recap">' + summary + '</div>' +
        '<div class="actions">' +
          '<button class="btn btn-ghost" id="quit">Quitter</button>' +
          (isHost ? '<button class="btn btn-primary btn-lg" id="start">Commencer la partie</button>' : '') +
        '</div>' +
      '</section>' +
      footer()
    );
    $('#quit').onclick = leave;
    if (isHost) {
      $('#start').onclick = function () { if (A.peerJoined) startGame(); };
      var cp = $('#copy-link');
      if (cp) cp.onclick = function () {
        try {
          navigator.clipboard.writeText(link).then(function () {
            cp.textContent = 'lien copié ✓';
            setTimeout(function () { cp.textContent = 'copier le lien d’invitation'; }, 1800);
          });
        } catch (e) { cp.textContent = link; }
      };
    }
    updateLobby();
  }

  function updateLobby() {
    if (A.screenKey !== 'lobby') return;
    var codeEl = $('#the-code');
    if (codeEl) codeEl.textContent = A.code || '····';

    var st = $('#lobby-status');
    if (st) {
      var cls, txt;
      if (A.error) { cls = 'err'; txt = A.error; }
      else if (!A.netReady) { cls = 'wait'; txt = 'Ouverture de la room…'; }
      else if (!A.peerJoined) {
        cls = 'wait';
        txt = A.role === 'host' ? 'En attente du 2ᵉ joueur…' : 'Connexion à la room…';
      } else {
        cls = 'on';
        txt = A.role === 'host'
          ? (otherName() || 'Joueur 2') + ' a rejoint — vous pouvez commencer'
          : 'Connecté ! En attente du lancement par ' + (otherName() || 'l’hôte');
      }
      st.innerHTML = '<span class="dot ' + cls + '"></span><span>' + esc(txt) + '</span>';
    }

    var rb = $('#roles-box');
    if (rb) {
      var n = names();
      rb.innerHTML =
        '<div class="role-chip"><b>' + esc(roleLabel('host')) + '</b><span>' + esc(n.host) + '</span></div>' +
        '<div class="role-chip"><b>' + esc(roleLabel('guest')) + '</b><span>' + esc(n.guest) + '</span></div>' +
        (A.role === 'host' ? '<button class="linky" id="swap-roles">échanger les rôles</button>' : '');
      var sw = $('#swap-roles');
      if (sw) sw.onclick = function () {
        A.swapRoles = !A.swapRoles;
        A.config = def.config.sanitize(Object.assign({}, A.config, { swapRoles: A.swapRoles }));
        sendLobby();
        updateLobby();
      };
    }

    var start = $('#start');
    if (start) start.disabled = !A.peerJoined;
  }

  // ================================================================== RENDU
  function setScreen(key, html) {
    A.screenKey = key;
    setFrameFn(null);
    app.innerHTML = html;
    global.scrollTo(0, 0);
  }

  function render() {
    var v = A.view;
    if (!v) {
      if (A.screenKey !== 'lobby') screenLobby(); else updateLobby();
      return;
    }
    var key = def.screenKey(v);
    if (key !== A.gameScreenKey || A.screenKey !== 'game:' + key) {
      A.gameScreenKey = key;
      setScreen('game:' + key, banner() + def.build(key, v, api));
      if (def.bind) def.bind(key, v, api);
    }
    if (def.update) def.update(key, v, api);
  }

  /* Boucle d'animation : elle ne tourne QUE si un écran en a besoin, et à
   * 12 images par seconde — le chrono n'affiche que des secondes, et les
   * clignotements les plus rapides du jeu durent 280 ms. Sans accélération
   * matérielle, une boucle à 60 i/s coûte cher pour rien. */
  var FRAME_MS = 80;
  var rafId = null, lastTick = 0;

  function frameLoop(ts) {
    if (!A.frameFn) { rafId = null; return; }
    rafId = requestAnimationFrame(frameLoop);
    if (ts - lastTick < FRAME_MS) return;
    lastTick = ts;
    try { A.frameFn(); } catch (e) {}
  }

  function setFrameFn(fn) {
    A.frameFn = fn || null;
    if (A.frameFn && rafId === null) {
      lastTick = 0;
      rafId = requestAnimationFrame(frameLoop);
    }
  }

  // ================================================================ RÉSEAU
  function netHandlers(role) {
    return {
      onReady: function (code) {
        A.netReady = true;
        A.code = code;
        A.error = '';
        if (A.screenKey === 'lobby') screenLobby();
      },
      onPeerJoin: function () {
        A.peerJoined = true;
        A.disconnected = false;
        A.error = '';
        if (role === 'guest') A.conn.send({ t: 'hello', name: myName() });
        else { sendLobby(); if (A.engine && A.engine.started()) pushViews(); }
        if (A.screenKey === 'lobby') updateLobby();
      },
      onPeerLeave: function () {
        A.peerJoined = false;
        A.disconnected = true;
        A.gameScreenKey = '';
        render();
        if (A.screenKey === 'lobby') updateLobby();
      },
      onData: function (m) { onMessage(role, m); },
      onError: function (msg) {
        A.error = msg;
        if (A.screenKey === 'lobby') updateLobby();
      }
    };
  }

  function onMessage(role, m) {
    if (!m || !m.t) return;
    if (role === 'host') {
      if (m.t === 'hello') {
        A.peerName = m.name || 'Joueur 2';
        if (A.engine) A.engine.setName('guest', A.peerName);
        sendLobby();
        if (A.screenKey === 'lobby') updateLobby();
      } else if (m.t === 'action' && A.engine) {
        A.engine.action('guest', m.a);
      }
    } else {
      if (m.t === 'lobby') {
        A.config = m.config;
        A.swapRoles = !!m.config.swapRoles;
        A.peerName = (m.names && m.names.host) || 'Joueur 1';
        if (A.screenKey === 'lobby') screenLobby();
      } else if (m.t === 'view') {
        A.view = m.view;
        render();
      }
    }
  }

  function sendLobby() {
    if (A.role !== 'host' || !A.conn) return;
    A.conn.send({ t: 'lobby', config: A.config, names: { host: myName(), guest: A.peerName || 'Joueur 2' } });
  }

  function startHost() {
    A.role = 'host';
    A.view = null; A.engine = null;
    A.peerJoined = false; A.netReady = false;
    A.code = global.Net.makeCode(4);
    A.conn = global.Net.host(A.code, netHandlers('host'));
    screenLobby();
  }

  function startGuest(code) {
    A.role = 'guest';
    A.view = null;
    A.peerJoined = false; A.netReady = false;
    A.code = code;
    A.conn = global.Net.join(code, netHandlers('guest'));
    screenLobby();
  }

  function startGame() {
    A.gameScreenKey = '';
    A.engine = def.createEngine(A.config,
      { host: myName(), guest: A.peerName || 'Joueur 2' }, pushViews);
    A.engine.start();
  }

  function pushViews() {
    if (!A.engine || !A.engine.started()) return;
    A.view = A.engine.viewFor('host');
    if (A.conn) A.conn.send({ t: 'view', view: A.engine.viewFor('guest') });
    render();
  }

  function act(a) {
    if (A.role === 'host') { if (A.engine) A.engine.action('host', a); }
    else if (A.conn) A.conn.send({ t: 'action', a: a });
  }

  function leave() {
    try { A.conn && A.conn.close(); } catch (e) {}
    if (A.engine) A.engine.dispose();
    A.conn = null; A.engine = null; A.view = null; A.role = null;
    A.peerJoined = false; A.netReady = false;
    A.disconnected = false; A.error = ''; A.gameScreenKey = '';
    history.replaceState(null, '', location.pathname + (global.Net.isLocalMode() ? '?local=1' : ''));
    screenHome();
  }

  // ---------------------------------------------------- chrono circulaire
  function timerHtml(id) {
    return '<div class="timer idle" id="' + id + '">' +
      '<svg viewBox="0 0 120 120" aria-hidden="true">' +
        '<circle class="tr-bg" cx="60" cy="60" r="52"></circle>' +
        '<circle class="tr-fg" cx="60" cy="60" r="52"></circle>' +
      '</svg><div class="num" id="' + id + '-num"></div></div>';
  }

  function renderTimer(box, left, total, idle) {
    if (!box) return;
    var numEl = box.querySelector('.num');
    var ring = box.querySelector('.tr-fg');
    if (!numEl || !ring) return;
    var shown = idle ? total : left;
    var frac = total > 0 ? Math.max(0, Math.min(1, left / total)) : 0;
    setText(numEl, fmtClock(shown));
    numEl.classList.toggle('mmss', shown >= 60000);
    var offset = (RING * (1 - frac)).toFixed(1);
    if (ring.__o !== offset) { ring.__o = offset; ring.style.strokeDashoffset = offset; }
    box.classList.toggle('idle', !!idle);
    box.classList.toggle('warn', !idle && frac <= 0.45 && frac > 0.2);
    box.classList.toggle('danger', !idle && frac <= 0.2);
  }

  // -------------------------------------------------------------------- API
  var api = {
    act: act,
    leave: leave,
    esc: esc,
    $: $,
    names: names,
    otherName: otherName,
    fmtDuration: fmtDuration,
    fmtClock: fmtClock,
    setText: setText,
    plural: plural,
    now: now,
    timerHtml: timerHtml,
    renderTimer: renderTimer,
    footer: footer,
    logoBlock: logoBlock,
    onFrame: setFrameFn,
    setHtml: setHtml,
    get role() { return A.role; }
  };

  /** Accès à l'état, uniquement avec ?local=1 ou ?debug=1 : sert aux tests
   *  d'interface, jamais à une partie normale. */
  function exposeDebug() {
    try {
      var q = new URLSearchParams(location.search);
      if (q.get('local') !== '1' && q.get('debug') !== '1') return;
      global.__room = {
        engine: function () { return A.engine; },
        view: function () { return A.view; },
        role: function () { return A.role; }
      };
    } catch (e) {}
  }

  global.Room = {
    init: function (gameDef) {
      def = gameDef;
      app = document.getElementById('app');
      A.name = loadName();
      A.config = def.config.sanitize(Object.assign({}, def.config.defaults));
      app.addEventListener('click', onStepperClick);
      exposeDebug();
      var params = new URLSearchParams(location.search);
      var room = global.Net.normalizeCode(params.get('room') || '');
      if (room.length >= 4) screenJoin(room); else screenHome();
      global.addEventListener('beforeunload', function () {
        try { A.conn && A.conn.close(); } catch (e) {}
      });
    },
    api: api
  };
})(typeof window !== 'undefined' ? window : globalThis);
