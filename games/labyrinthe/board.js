/* Labyrinthe — interfaces.
 * L'explorateur ne voit que sa case ; le guide ne voit que le plan.
 */
(function (global) {
  'use strict';

  var Engine = global.MazeEngine;
  var Maze = global.Maze;
  var api;

  var L = {
    view: null,
    timeBase: null,
    lastEventId: 0,
    pins: {},        // marques posées par le guide, purement locales
    mapSig: '',
    keysBound: false
  };

  function $(s) { return document.querySelector(s); }
  function $$(s) { return Array.prototype.slice.call(document.querySelectorAll(s)); }
  function esc(s) { return api.esc(s); }

  // ------------------------------------------------------------------ commun
  function hudHtml() {
    return '<div class="hud maze-hud">' +
        '<div class="mstat" id="m-moves"></div>' +
        api.timerHtml('m-timer') +
        '<div class="mstat right" id="m-traps"></div>' +
      '</div>';
  }

  function updateHud(v) {
    api.setHtml($('#m-moves'), '<b>' + v.moves + '</b><span>pas</span>');
    api.setHtml($('#m-traps'), '<b class="' + (v.trapsHit ? 'bad' : '') + '">' + v.trapsHit + '</b><span>pièges</span>');
    L.timeBase = { left: v.timeLeftMs, at: api.now(), running: !!v.timerRunning };
    var t = $('#m-timer');
    if (t) {
      t.classList.toggle('frozen', v.timerStarted && !v.timerRunning);
      api.renderTimer(t, v.timeLeftMs, v.totalTimeMs, !v.timerStarted);
    }
  }

  function roundBadge(v) {
    return '<div class="round-line">Manche <b>' + v.round + '</b> sur ' + v.roundCount + '</div>';
  }

  // ========================================================= ÉCRAN EXPLORATEUR
  function walkerHtml(v) {
    return hudHtml() +
      '<section class="panel" id="m-panel">' +
        roundBadge(v) +
        '<div class="role-line">Tu avances à l’aveugle — <b>' + esc(v.names[v.guide]) + '</b> a le plan</div>' +
        '<div class="vision" id="m-vision"></div>' +
        '<div class="say" id="m-say"></div>' +
        '<div class="dpad">' +
          '<button type="button" class="dp dp-n" data-act="move" data-d="n"><span>▲</span><i>nord</i></button>' +
          '<button type="button" class="dp dp-w" data-act="move" data-d="w"><span>◀</span><i>ouest</i></button>' +
          '<button type="button" class="dp dp-e" data-act="move" data-d="e"><span>▶</span><i>est</i></button>' +
          '<button type="button" class="dp dp-s" data-act="move" data-d="s"><span>▼</span><i>sud</i></button>' +
        '</div>' +
        '<p class="mod-hint">Décris ce que tu vois : les murs, les passages, et la balise sous tes pieds.</p>' +
      '</section>' +
      '<div class="center"><button class="linky" id="m-quit">quitter la partie</button></div>';
  }

  function updateWalker(v) {
    updateHud(v);
    var h = v.here || { walls: {}, nearExit: {}, beacon: null };

    var ARROW = { n: '▲', e: '▶', s: '▼', w: '◀' };
    var gates = Maze.DIRS.map(function (d) {
      var open = !h.walls[d];
      return '<div class="gate g-' + d + ' ' + (open ? 'open' : 'wall') +
        (h.nearExit[d] ? ' glow' : '') + '">' +
        (open ? '<span>' + ARROW[d] + '</span>' : '') + '</div>';
    }).join('');
    api.setHtml($('#m-vision'), gates +
      '<div class="vcenter">' +
        (h.beacon
          ? '<span class="beacon c-' + h.beacon.color + '">' + h.beacon.glyph + '</span>'
          : '<span class="vdot">·</span>') +
      '</div>');

    var walls = Maze.DIRS.filter(function (d) { return h.walls[d]; }).map(function (d) { return Maze.LABEL[d]; });
    var ways = Maze.DIRS.filter(function (d) { return !h.walls[d]; }).map(function (d) { return Maze.LABEL[d]; });
    var glow = Maze.DIRS.filter(function (d) { return h.nearExit[d]; }).map(function (d) { return Maze.LABEL[d]; });

    var say = '';
    if (h.beacon) say += '<div class="say-line beacon-line">Tu es sur le <b>' + esc(h.beacon.label) + '</b></div>';
    say += '<div class="say-line"><span class="k">Passages</span> ' +
      (ways.length ? ways.join(', ') : '<i>aucun</i>') + '</div>';
    say += '<div class="say-line dim"><span class="k">Murs</span> ' +
      (walls.length ? walls.join(', ') : '<i>aucun</i>') + '</div>';
    if (glow.length) say += '<div class="say-line exit-line">Une lueur au <b>' + glow.join(', ') + '</b> — la sortie !</div>';
    api.setHtml($('#m-say'), say);

    $$('.dp').forEach(function (el) {
      el.classList.toggle('blocked', !!h.walls[el.dataset.d]);
      el.classList.toggle('toexit', !!h.nearExit[el.dataset.d]);
    });

    fireEvent(v);
  }

  // ================================================================ ÉCRAN GUIDE
  function guideHtml(v) {
    return hudHtml() +
      '<section class="panel" id="m-panel">' +
        roundBadge(v) +
        '<div class="role-line"><b>' + esc(v.names[v.walker]) + '</b> avance à l’aveugle — toi, tu as le plan</div>' +
        '<div class="map-wrap"><div id="m-map"></div></div>' +
        '<div class="legend" id="m-legend"></div>' +
        '<div class="say" id="m-say"></div>' +
        '<div class="center"><button type="button" class="linky" id="m-clear" data-act="clear">effacer mes marques</button></div>' +
        '<p class="mod-hint">Tu ne sais pas où il est. Fais-lui décrire les murs et les balises, ' +
        'compte les cases grâce au quadrillage (colonnes A, B, C… lignes 1, 2, 3…), ' +
        'et clique sur une case pour noter ton hypothèse.</p>' +
      '</section>' +
      '<div class="center"><button class="linky" id="m-quit">quitter la partie</button></div>';
  }

  var COLS = 'ABCDEFGHIJKLMNO';

  function mazeHtml(m, opts) {
    opts = opts || {};
    var trap = {}, beacon = {};
    (m.traps || []).forEach(function (c) { trap[c] = true; });
    (m.beacons || []).forEach(function (b) { beacon[b.cell] = b; });
    var path = {};
    (opts.path || []).forEach(function (c, i) { path[c] = i; });

    var cells = '';
    for (var i = 0; i < m.w * m.h; i++) {
      var c = m.cells[i];
      var p = { x: i % m.w, y: Math.floor(i / m.w) };
      var cls = ['mcell'];
      if (c.n) cls.push('wn');
      if (c.w) cls.push('ww');
      if (p.x === m.w - 1 && c.e) cls.push('we');
      if (p.y === m.h - 1 && c.s) cls.push('ws');
      if (i === m.exit) cls.push('exit');
      if (trap[i]) cls.push('trap');
      if (opts.showStart && i === m.start) cls.push('start');
      if (path[i] != null) cls.push('onpath');
      if (opts.pos != null && i === opts.pos) cls.push('here');
      if (opts.pins && opts.pins[i]) cls.push('pinned');

      var inner = '';
      if (beacon[i]) inner = '<span class="beacon c-' + beacon[i].color + '">' + beacon[i].glyph + '</span>';
      else if (i === m.exit) inner = '<span class="exit-mark">◎</span>';
      else if (trap[i]) inner = '<span class="trap-mark">✖</span>';
      else if (opts.showStart && i === m.start) inner = '<span class="start-mark">◦</span>';
      cells += '<div class="' + cls.join(' ') + '" data-act="pin" data-i="' + i + '"' +
        ' title="' + COLS[p.x] + (p.y + 1) + '">' + inner + '</div>';
    }

    // repères de colonnes et de lignes : le guide peut compter les cases et
    // se dire « il est quelque part en D4 » sans se perdre dans le plan
    var cols = '', rows = '';
    for (var x = 0; x < m.w; x++) cols += '<span>' + COLS[x] + '</span>';
    for (var y = 0; y < m.h; y++) rows += '<span>' + (y + 1) + '</span>';

    return '<div class="map-frame' + (opts.clickable ? ' clickable' : '') + '"' +
      (opts.id ? ' id="' + opts.id + '"' : '') + ' style="--n:' + m.w + '">' +
      '<div class="mf-corner"></div>' +
      '<div class="mf-cols">' + cols + '</div>' +
      '<div class="mf-rows">' + rows + '</div>' +
      '<div class="maze">' + cells + '</div>' +
      '</div>';
  }

  function legendHtml(m) {
    return (m.beacons || []).map(function (b) {
      return '<span class="lg"><span class="beacon c-' + b.color + '">' + b.glyph + '</span>' + esc(b.label) + '</span>';
    }).join('') +
    '<span class="lg"><span class="exit-mark">◎</span>sortie</span>' +
    '<span class="lg"><span class="trap-mark">✖</span>piège</span>';
  }

  function updateGuide(v) {
    updateHud(v);
    var m = v.maze;
    if (!m) return;
    var sig = v.round + ':' + Object.keys(L.pins).join(',');
    if (sig !== L.mapSig) {
      L.mapSig = sig;
      $('#m-map').outerHTML = mazeHtml(m, { pins: L.pins, clickable: true, id: 'm-map' });
      $('#m-legend').innerHTML = legendHtml(m);
    }
    fireEvent(v);
  }

  /** Un seul point d'entrée pour tous les clics du jeu. */
  function onAct(el) {
    var v = L.view;
    if (!v) return;
    var what = el.dataset.act;
    if (what === 'move') { move(el.dataset.d); return; }
    if (what === 'clear') { L.pins = {}; L.mapSig = ''; updateGuide(v); return; }
    if (what === 'pin' && !v.isWalker && v.phase === 'playing') {
      var i = el.dataset.i;
      if (L.pins[i]) delete L.pins[i]; else L.pins[i] = true;
      L.mapSig = '';
      updateGuide(v);
    }
  }

  // ---------------------------------------------------------------- événements
  function fireEvent(v) {
    if (!v.event || v.event.id === L.lastEventId) return;
    L.lastEventId = v.event.id;
    var panel = $('#m-panel');
    if (!panel) return;
    if (v.event.type === 'bump') {
      shake(panel);
      say(v.isWalker ? 'Mur au ' + Maze.LABEL[v.event.dir] + ' !' : 'Il vient de taper un mur.', 'warn');
    } else if (v.event.type === 'trap') {
      shake(panel);
      say('Piège ! −' + v.event.penalty + ' s' + (v.isWalker ? ' — tu es repoussé en arrière.' : ''), 'bad');
    }
  }

  function say(text, kind) {
    var host = $('#m-panel');
    if (!host) return;
    var d = document.createElement('div');
    d.className = 'flyby ' + (kind || '');
    d.textContent = text;
    host.appendChild(d);
    setTimeout(function () { d.remove(); }, 1900);
  }

  function shake(panel) {
    panel.classList.remove('flash-bad');
    void panel.offsetWidth;
    panel.classList.add('flash-bad');
    setTimeout(function () { panel.classList.remove('flash-bad'); }, 800);
  }

  // -------------------------------------------------------------------- récaps
  function statsRow(entry, cfg) {
    return '<div class="settings-recap">' +
      '<div class="item"><b>' + (entry.finished ? 'Sortie' : 'Perdu') + '</b><span>issue</span></div>' +
      '<div class="item"><b>' + api.fmtClock(entry.timeMs) + '</b><span>temps</span></div>' +
      '<div class="item"><b>' + entry.moves + '</b><span>pas</span></div>' +
      '<div class="item"><b>' + entry.trapsHit + '</b><span>pièges</span></div>' +
      '</div>';
  }

  function roundRecapHtml(v) {
    var l = v.log[v.round] || { finished: false, timeMs: 0, moves: 0, trapsHit: 0 };
    var last = v.round >= v.roundCount;
    var nextWalkerIsMe = !last ? (v.walker !== v.yourRole) : false;
    var m = v.maze;
    m.start = m.start;
    return api.logoBlock(true) +
      '<section class="panel">' +
        '<h2 class="section-title">Manche ' + v.round + ' — ' +
          (l.finished ? 'sortie trouvée' : 'temps écoulé') + '</h2>' +
        statsRow(l, v.config) +
        '<div class="map-wrap recap-map">' + mazeHtml(m, { path: (v.reveal || {}).path, pos: (v.reveal || {}).pos, showStart: true }) + '</div>' +
        '<div class="legend">' + legendHtml(m) + '<span class="lg"><span class="path-mark"></span>trajet parcouru</span></div>' +
        '<div class="actions" style="margin-top:18px">' +
          '<button class="btn btn-primary btn-block btn-lg" id="next">' +
            (last ? 'Voir le résultat final'
                  : 'Manche ' + (v.round + 1) + ' — ' + (nextWalkerIsMe ? 'à toi d’explorer' : 'à toi de guider')) +
          '</button>' +
        '</div>' +
      '</section>' + api.footer();
  }

  function gameOverHtml(v) {
    var msg = v.solvedRounds === 2 ? 'Deux sorties sur deux. Belle équipe.'
      : v.solvedRounds === 1 ? 'Une sortie sur deux — la prochaine sera la bonne.'
      : 'Personne n’est sorti… on remet ça ?';
    return api.logoBlock(true) +
      '<section class="panel">' +
        '<h2 class="section-title">Résultat de l’équipe</h2>' +
        '<div class="score-big"><div class="n">' + v.solvedRounds + '<span class="over">/2</span></div>' +
        '<div class="lbl">sorties trouvées · ' + esc(msg) + '</div></div>' +
        '<div class="settings-recap">' +
          '<div class="item"><b>' + api.fmtClock(v.totalTimeMs) + '</b><span>au total</span></div>' +
          '<div class="item"><b>' + v.totalTrapsHit + '</b><span>pièges</span></div>' +
          '<div class="item"><b>' + v.config.size + '×' + v.config.size + '</b><span>taille</span></div>' +
        '</div>' +
        v.rounds.map(function (r) {
          var mz = r.maze; mz.start = r.start;
          return '<div class="recap-head">Manche ' + r.round + ' — ' + esc(v.names[r.walker] || '') +
            ' explorait · ' + (r.finished ? 'sortie en ' + api.fmtClock(r.timeMs) : 'temps écoulé') +
            ' · ' + r.moves + ' pas · ' + r.trapsHit + ' piège' + (r.trapsHit > 1 ? 's' : '') + '</div>' +
            '<div class="map-wrap recap-map small">' + mazeHtml(mz, { path: r.path, showStart: true }) + '</div>';
        }).join('') +
      '</section>' +
      '<section class="panel" style="padding:18px">' +
        '<div class="actions" style="margin:0">' +
          '<button class="btn btn-ghost" id="quit">Quitter</button>' +
          '<button class="btn btn-primary btn-lg" id="replay">Rejouer (nouveaux labyrinthes)</button>' +
        '</div>' +
      '</section>' + api.footer();
  }

  // -------------------------------------------------------------- déplacements
  function move(dir) { api.act({ t: 'move', dir: dir }); }

  var KEYS = {
    ArrowUp: 'n', ArrowRight: 'e', ArrowDown: 's', ArrowLeft: 'w',
    z: 'n', d: 'e', s: 's', q: 'w', w: 'n', a: 'w'
  };

  function bindKeys() {
    if (L.keysBound) return;
    L.keysBound = true;
    document.addEventListener('keydown', function (e) {
      var v = L.view;
      if (!v || !v.isWalker || v.phase !== 'playing') return;
      var dir = KEYS[e.key] || KEYS[String(e.key).toLowerCase()];
      if (!dir) return;
      e.preventDefault();
      move(dir);
    });
  }

  // --------------------------------------------------------------- définition
  api = global.Room.api;
  bindKeys();

  global.Room.init({
    id: 'labyrinthe',
    title: 'Labyrinthe',
    tagline: 'l’un avance à l’aveugle, l’autre a le plan',
    roles: { host: 'Explorateur', guest: 'Guide' },
    howto: [
      '<li>L’<b>explorateur</b> ne voit que sa case : les murs autour de lui, et la balise sur laquelle il se tient. Il ne sait pas où il est.</li>',
      '<li>Le <b>guide</b> voit tout le plan — murs, pièges, balises, sortie — mais <b>pas</b> où se trouve son binôme.</li>',
      '<li>Donc l’explorateur décrit, le guide déduit, puis dicte la route. Les balises sont ce qui permet de se localiser.</li>',
      '<li>Les pièges sont invisibles pour l’explorateur : marcher dessus coûte du temps et le repousse en arrière.</li>',
      '<li>Deux manches : chacun explore une fois. Le chrono démarre au premier pas.</li>'
    ],
    config: {
      defaults: Engine.DEFAULT_CONFIG,
      sanitize: Engine.sanitizeConfig,
      fields: [
        { key: 'size', id: 'c-size', label: 'Taille', min: 5, max: 15, suffix: 'cases de côté' },
        { key: 'seconds', id: 'c-secs', label: 'Temps par manche', min: 30, max: 900, step: 30, suffix: 'secondes' },
        { key: 'traps', id: 'c-traps', label: 'Pièges', min: 0, max: 20 },
        { key: 'beacons', id: 'c-beacons', label: 'Balises', min: 0, max: 6 }
      ],
      note: function (c) {
        return 'Labyrinthe de <b>' + c.size + '×' + c.size + '</b> (' + (c.size * c.size) + ' cases), <b>' +
          api.fmtDuration(c.seconds) + '</b> par manche, ' + c.beacons + ' balise' + (c.beacons > 1 ? 's' : '') +
          ' pour se repérer et ' + c.traps + ' piège' + (c.traps > 1 ? 's' : '') +
          ' à −' + c.trapPenalty + ' s.';
      },
      summary: function (c) {
        return [
          { value: c.size + '×' + c.size, label: 'labyrinthe' },
          { value: api.fmtDuration(c.seconds), label: 'par manche' },
          { value: c.traps, label: 'pièges' },
          { value: c.beacons, label: 'balises' }
        ];
      }
    },
    createEngine: function (config, names, onUpdate) {
      return Engine.createEngine({ config: config, names: names, onUpdate: onUpdate });
    },
    screenKey: function (v) {
      if (v.phase === 'playing') return v.isWalker ? 'walk' : 'guide';
      return v.phase;
    },
    build: function (key, v) {
      if (key === 'walk') return walkerHtml(v);
      if (key === 'guide') return guideHtml(v);
      if (key === 'roundRecap') return roundRecapHtml(v);
      return gameOverHtml(v);
    },
    bind: function (key, v) {
      L.lastEventId = v.event ? v.event.id : 0;
      if (key === 'walk' || key === 'guide') {
        L.mapSig = '';
        $('#m-quit').onclick = api.leave;
        api.onTap($('#m-panel'), onAct);
        api.onFrame(function () {
          var view = L.view, tb = L.timeBase;
          if (!view || !tb) return;
          var left = tb.running ? Math.max(0, tb.left - (api.now() - tb.at)) : tb.left;
          api.renderTimer($('#m-timer'), left, view.totalTimeMs, !view.timerStarted);
        });
      }
      if (key === 'guide') {
        L.pins = {};
      } else if (key === 'roundRecap') {
        $('#next').onclick = function () { api.act({ t: 'next' }); };
      } else if (key === 'gameOver') {
        $('#replay').onclick = function () { api.act({ t: 'replay' }); };
        $('#quit').onclick = api.leave;
      }
    },
    update: function (key, v) {
      L.view = v;
      if (key === 'walk') updateWalker(v);
      else if (key === 'guide') updateGuide(v);
    }
  });
})(typeof window !== 'undefined' ? window : globalThis);
