/* Les différences — interface.
 *
 * Chaque joueur voit SA grille. Le seul moyen de valider une case est que les
 * deux la pointent : d'où les repères de colonnes et de lignes, qui existent
 * pour être lus à voix haute.
 */
(function (global) {
  'use strict';

  var Engine = global.DiffEngine;
  var Scene = global.Scene;
  var api;

  var HEX = {
    rouge: '#ff5f5f', bleu: '#57b6ff', vert: '#5fe08a',
    jaune: '#ffd452', violet: '#c08bff', orange: '#ff9a4d'
  };
  var SCALE = { petit: 0.5, moyen: 0.72, grand: 0.96 };

  var D = { view: null, lastEventId: 0, timeBase: null, msg: null, msgTimer: null };

  function $(s) { return document.querySelector(s); }
  function esc(s) { return api.esc(s); }

  // ================================================================= dessins
  var STAR = (function () {
    var pts = [];
    for (var k = 0; k < 10; k++) {
      var r = k % 2 === 0 ? 44 : 18;
      var ang = -Math.PI / 2 + k * Math.PI / 5;
      pts.push((50 + r * Math.cos(ang)).toFixed(1) + ',' + (50 + r * Math.sin(ang)).toFixed(1));
    }
    return pts.join(' ');
  })();

  var CROSS = '38,12 62,12 62,38 88,38 88,62 62,62 62,88 38,88 38,62 12,62 12,38 38,38';

  function shapeSvg(c) {
    var col = HEX[c.co] || '#fff';
    var paint = c.fi === 'plein'
      ? 'fill="' + col + '" stroke="none"'
      : 'fill="none" stroke="' + col + '" stroke-width="9" stroke-linejoin="round"';
    var body;
    if (c.sh === 'rond') body = '<circle cx="50" cy="50" r="40" ' + paint + '/>';
    else if (c.sh === 'carre') body = '<rect x="12" y="12" width="76" height="76" rx="10" ' + paint + '/>';
    else if (c.sh === 'triangle') body = '<polygon points="50,10 90,86 10,86" ' + paint + '/>';
    else if (c.sh === 'etoile') body = '<polygon points="' + STAR + '" ' + paint + '/>';
    else if (c.sh === 'losange') body = '<polygon points="50,6 94,50 50,94 6,50" ' + paint + '/>';
    else body = '<polygon points="' + CROSS + '" ' + paint + '/>';
    var s = SCALE[c.sz] || 0.72;
    return '<svg viewBox="0 0 100 100" aria-hidden="true">' +
      '<g transform="translate(50 50) scale(' + s + ') translate(-50 -50)">' + body + '</g></svg>';
  }

  /** Nom parlé d'une case, pour les aides et le débriefing. */
  function cellName(i, cols) { return Scene.cellName(i, cols); }

  function gridHtml(v, cells, opts) {
    opts = opts || {};
    var cols = v.cols, rows = v.rows;
    var head = '<div class="gd-cols">';
    for (var c = 0; c < cols; c++) head += '<span>' + Scene.COLS[c] + '</span>';
    head += '</div>';
    var side = '<div class="gd-rows">';
    for (var r = 0; r < rows; r++) side += '<span>' + (r + 1) + '</span>';
    side += '</div>';

    var body = '<div class="gd-cells" style="--n:' + cols + '"' + (opts.id ? ' id="' + opts.id + '"' : '') + '>';
    for (var i = 0; i < cells.length; i++) {
      var cls = 'cell';
      if (opts.found && opts.found.indexOf(i) !== -1) cls += ' found';
      if (opts.missed && opts.missed.indexOf(i) !== -1) cls += ' missed';
      body += '<button type="button" class="' + cls + '" data-act="cell" data-i="' + i + '"' +
        (opts.static ? ' tabindex="-1"' : '') +
        ' aria-label="case ' + cellName(i, cols) + '">' +
        shapeSvg(cells[i]) + '<i class="tag">' + cellName(i, cols) + '</i></button>';
    }
    body += '</div>';

    return '<div class="gd-frame' + (opts.small ? ' small' : '') + '">' + head +
      '<div class="gd-main">' + side + body + '</div></div>';
  }

  // ==================================================================== jeu
  function boardHtml(v) {
    return '<div class="hud diff-hud">' +
        '<span class="badge gold" id="d-found"></span>' +
        api.timerHtml('d-timer') +
        '<span class="badge" id="d-strikes"></span>' +
      '</div>' +
      '<section class="panel" id="d-panel">' +
        '<p class="lead">Vos deux images ne sont pas tout à fait les mêmes. Décrivez-vous ce que vous voyez, ' +
          'et <b>cliquez la même case tous les deux</b> pour valider une différence.</p>' +
        gridHtml(v, v.grid, { id: 'd-grid', found: v.found }) +
        '<div class="status" id="d-status"></div>' +
        '<p class="mod-hint">Les colonnes A à ' + Scene.COLS[v.cols - 1] + ' et les lignes 1 à ' + v.rows +
          ' sont là pour être dites à voix haute.</p>' +
      '</section>' +
      '<div class="center"><button class="linky" id="d-quit">quitter la partie</button></div>';
  }

  function statusHtml(v) {
    // un message d'événement (accord raté, différence trouvée…) tient le haut
    // du pavé quelques secondes, sinon on retombe sur l'état courant
    if (D.msg && Date.now() < D.msg.until) {
      return '<span class="st ' + D.msg.cls + '">' + D.msg.text + '</span>';
    }
    if (v.yourFlag != null && v.otherWaiting) {
      return '<span class="st wait">Vous pointez deux cases différentes… dites-la à voix haute.</span>';
    }
    if (v.yourFlag != null) {
      return '<span class="st mine">Tu pointes <b>' + cellName(v.yourFlag, v.cols) + '</b> — ' +
        esc(v.names[v.yourRole === 'host' ? 'guest' : 'host']) + ' doit cliquer la même case.</span>';
    }
    if (v.otherWaiting) {
      return '<span class="st other">' + esc(v.names[v.yourRole === 'host' ? 'guest' : 'host']) +
        ' pointe une case. Laquelle ?</span>';
    }
    return '<span class="st idle">' + v.found.length + ' différence' + (v.found.length > 1 ? 's' : '') +
      ' sur ' + v.diffsTotal + ' — au suivant.</span>';
  }

  function updateBoard(v) {
    D.view = v;
    api.setText($('#d-found'), v.found.length + '/' + v.diffsTotal + ' trouvées');
    api.setText($('#d-strikes'), v.strikes
      ? v.strikes + ' erreur' + (v.strikes > 1 ? 's' : '') + ' · −' + v.lostSeconds + ' s'
      : 'aucune erreur');

    var t = $('#d-timer');
    D.timeBase = { left: v.timeLeftMs, at: api.now(), running: !!v.timerRunning };
    api.renderTimer(t, v.timeLeftMs, v.totalTimeMs, !v.timerStarted);

    // état des cases : trouvée, ou pointée par soi
    var grid = $('#d-grid');
    if (grid) {
      for (var i = 0; i < grid.children.length; i++) {
        var el = grid.children[i];
        var idx = parseInt(el.dataset.i, 10);
        el.classList.toggle('found', v.found.indexOf(idx) !== -1);
        el.classList.toggle('flag', v.yourFlag === idx);
      }
    }
    api.setHtml($('#d-status'), statusHtml(v));

    if (v.event && v.event.id !== D.lastEventId) {
      D.lastEventId = v.event.id;
      var panel = $('#d-panel');
      if (v.event.type === 'good') {
        flash(panel, 'ok');
        say('Différence trouvée en <b>' + cellName(v.event.cell, v.cols) + '</b> !', 'good', 2200);
      } else if (v.event.type === 'bad') {
        flash(panel, 'ko');
        say('<b>' + cellName(v.event.cell, v.cols) + '</b> est identique chez vous deux — ' +
          v.config.penalty + ' s en moins.', 'wait', 2600);
      } else if (v.event.type === 'mismatch') {
        flash($('#d-status'), 'nudge');
        say('Vous avez cliqué deux cases <b>différentes</b>. Redites-la à voix haute.', 'wait', 2600);
      }
    }
  }

  /** Message passager dans l'ardoise. */
  function say(text, cls, ms) {
    D.msg = { text: text, cls: cls, until: Date.now() + ms };
    api.setHtml($('#d-status'), statusHtml(D.view));
    clearTimeout(D.msgTimer);
    D.msgTimer = setTimeout(function () {
      D.msg = null;
      if (D.view && D.view.phase === 'playing') api.setHtml($('#d-status'), statusHtml(D.view));
    }, ms + 30);
  }

  function flash(el, cls) {
    if (!el) return;
    el.classList.remove(cls);
    void el.offsetWidth;
    el.classList.add(cls);
    setTimeout(function () { el.classList.remove(cls); }, 700);
  }

  // ------------------------------------------------------------- débriefing
  function gameOverHtml(v) {
    var mineIsA = v.yourRole === 'host';
    var mine = mineIsA ? v.both.a : v.both.b;
    var theirs = mineIsA ? v.both.b : v.both.a;
    var otherName = v.names[mineIsA ? 'guest' : 'host'];
    var missed = v.diffs.filter(function (d) { return !d.found; }).map(function (d) { return d.i; });
    var all = v.diffs.map(function (d) { return d.i; });
    var win = v.outcome === 'win';

    return api.logoBlock(true) +
      '<section class="panel">' +
        '<h2 class="section-title">' + (win ? 'Toutes trouvées !' : 'Le temps est écoulé') + '</h2>' +
        '<div class="score-big"><div class="n">' + v.found.length + '<span class="over">/' + v.diffsTotal + '</span></div>' +
        '<div class="lbl">différences · ' + api.fmtDuration(Math.round(v.usedMs / 1000)) +
        (v.strikes ? ' · ' + v.strikes + ' erreur' + (v.strikes > 1 ? 's' : '') : '') + '</div></div>' +
        '<div class="compare">' +
          '<div class="side"><h3>Ta grille</h3>' +
            gridHtml(v, mine, { found: all, missed: missed, small: true, static: true }) + '</div>' +
          '<div class="side"><h3>Celle de ' + esc(otherName) + '</h3>' +
            gridHtml(v, theirs, { found: all, missed: missed, small: true, static: true }) + '</div>' +
        '</div>' +
        '<ul class="recap-list">' + v.diffs.map(function (d) {
          return '<li class="' + (d.found ? 'ok' : 'miss') + '">' +
            '<span class="mark">' + (d.found ? '✅' : '❌') + '</span>' +
            '<span class="w">' + d.cell + '</span>' +
            '<span class="meta">' + esc(d.text) + '</span></li>';
        }).join('') + '</ul>' +
      '</section>' +
      '<section class="panel" style="padding:18px">' +
        '<div class="actions" style="margin:0">' +
          '<button class="btn btn-ghost" id="quit">Quitter</button>' +
          '<button class="btn btn-primary btn-lg" id="replay">Nouvelle image</button>' +
        '</div>' +
      '</section>' + api.footer();
  }

  // --------------------------------------------------------------- définition
  api = global.Room.api;

  global.Room.init({
    id: 'differences',
    title: 'Les différences',
    tagline: 'deux images presque identiques',
    howto: [
      '<li>Vous avez chacun une grille de formes. Elles sont identiques… à quelques cases près.</li>',
      '<li>Personne ne voit l’écran de l’autre : il faut <b>décrire</b> — « en C3, j’ai un grand losange violet ».</li>',
      '<li>Une différence n’est validée que si <b>vous cliquez la même case tous les deux</b>. On ne vous montre pas la case pointée par l’autre : c’est à vous de vous mettre d’accord.</li>',
      '<li>Se tromper de case ne coûte rien. Tomber d’accord sur une case identique, si : le chrono recule.</li>',
      '<li>Le chrono démarre au premier clic.</li>'
    ],
    config: {
      defaults: Engine.DEFAULT_CONFIG,
      sanitize: Engine.sanitizeConfig,
      fields: [
        { key: 'cols', id: 'c-cols', label: 'Colonnes', min: 3, max: 8 },
        { key: 'rows', id: 'c-rows', label: 'Lignes', min: 3, max: 6 },
        { key: 'diffs', id: 'c-diffs', label: 'Différences', min: 2, max: 24 },
        { key: 'seconds', id: 'c-secs', label: 'Chrono', min: 60, max: 900, step: 30, suffix: 'secondes' },
        { key: 'penalty', id: 'c-pen', label: 'Pénalité', min: 0, max: 60, step: 5, suffix: 'secondes par erreur' }
      ],
      note: function (c) {
        return '<b>' + c.diffs + ' différences</b> cachées dans une grille de ' + (c.cols * c.rows) +
          ' cases, <b>' + api.fmtDuration(c.seconds) + '</b> au chrono.' +
          (c.penalty ? ' Un accord qui tombe à côté coûte ' + c.penalty + ' s.' : ' Aucune pénalité.');
      },
      summary: function (c) {
        return [
          { value: c.diffs, label: 'différences' },
          { value: c.cols + '×' + c.rows, label: 'grille' },
          { value: api.fmtDuration(c.seconds), label: 'chrono' },
          { value: c.penalty ? '−' + c.penalty + ' s' : 'aucune', label: 'pénalité' }
        ];
      }
    },
    createEngine: function (config, names, onUpdate) {
      return Engine.createEngine({ config: config, names: names, onUpdate: onUpdate });
    },
    screenKey: function (v) { return v.phase; },
    build: function (key, v) {
      return key === 'playing' ? boardHtml(v) : gameOverHtml(v);
    },
    bind: function (key, v) {
      D.lastEventId = v.event ? v.event.id : 0;
      if (key === 'gameOver') {
        $('#replay').onclick = function () { api.act({ t: 'replay' }); };
        $('#quit').onclick = api.leave;
        return;
      }
      D.msg = null;
      clearTimeout(D.msgTimer);
      $('#d-quit').onclick = api.leave;
      api.onTap($('#d-panel'), function (el) {
        if (el.dataset.act === 'cell') api.act({ t: 'flag', i: el.dataset.i });
      });
      api.onFrame(function () {
        var view = D.view, tb = D.timeBase;
        if (!view || !tb) return;
        var left = tb.running ? Math.max(0, tb.left - (api.now() - tb.at)) : tb.left;
        api.renderTimer($('#d-timer'), left, view.totalTimeMs, !view.timerStarted);
      });
    },
    update: function (key, v) {
      D.view = v;
      if (key === 'playing') updateBoard(v);
    }
  });
})(typeof window !== 'undefined' ? window : globalThis);
