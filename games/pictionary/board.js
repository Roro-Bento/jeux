/* Pictionary — interface et canevas partagé.
 *
 * Le dessin ne passe PAS par le moteur : chaque trait part directement vers
 * l'autre navigateur par le canal « peer », en coordonnées relatives (0 à 1),
 * pour que les deux écrans restent identiques quelle que soit leur taille.
 */
(function (global) {
  'use strict';

  var Engine = global.PictoEngine;
  var api;

  var COLORS = ['#f4f6fb', '#ff6b6b', '#ffc14d', '#6fe08a', '#63b3ff', '#c88bff'];
  var WIDTHS = [0.006, 0.014, 0.030];

  var D = {
    view: null,
    strokes: [],        // [{c, w, e, p:[x,y,…]}]
    cur: null,          // trait en cours (dessinateur)
    color: COLORS[0],
    width: WIDTHS[1],
    erase: false,
    canvas: null, ctx: null,
    pending: null, flushAt: 0, flushTimer: null,
    lastStyle: null,
    wordSig: '',
    lastEventId: 0,
    inkSent: false,
    guessSig: null
  };

  function $(s) { return document.querySelector(s); }
  function $$(s) { return Array.prototype.slice.call(document.querySelectorAll(s)); }
  function esc(s) { return api.esc(s); }

  // ================================================================= canevas
  function setupCanvas() {
    D.canvas = $('#pi-canvas');
    if (!D.canvas) return;
    D.ctx = D.canvas.getContext('2d');
    sizeCanvas();
    if (global.ResizeObserver) {
      var ro = new ResizeObserver(function () { sizeCanvas(); redraw(); });
      ro.observe(D.canvas.parentNode);
      D.canvas.__ro = ro;
    }
  }

  function sizeCanvas() {
    var c = D.canvas;
    if (!c) return;
    var rect = c.getBoundingClientRect();
    var dpr = Math.min(2, global.devicePixelRatio || 1);
    var w = Math.max(1, Math.round(rect.width * dpr));
    var h = Math.max(1, Math.round(rect.height * dpr));
    if (c.width !== w || c.height !== h) { c.width = w; c.height = h; }
  }

  function applyStyle(st) {
    var ctx = D.ctx;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.globalCompositeOperation = st.e ? 'destination-out' : 'source-over';
    ctx.strokeStyle = st.e ? 'rgba(0,0,0,1)' : st.c;
    ctx.lineWidth = Math.max(1, (st.e ? st.w * 2.2 : st.w) * D.canvas.width);
  }

  /** Dessine un trait à partir du point `from`. */
  function drawStroke(st, from) {
    var ctx = D.ctx, p = st.p;
    if (!ctx || p.length < 4) {
      if (ctx && p.length === 2) {            // un simple point
        applyStyle(st);
        ctx.beginPath();
        ctx.arc(p[0] * D.canvas.width, p[1] * D.canvas.height, ctx.lineWidth / 2, 0, Math.PI * 2);
        ctx.fillStyle = st.e ? 'rgba(0,0,0,1)' : st.c;
        ctx.fill();
      }
      return;
    }
    applyStyle(st);
    ctx.beginPath();
    var start = Math.max(0, (from || 0) * 2);
    ctx.moveTo(p[start] * D.canvas.width, p[start + 1] * D.canvas.height);
    for (var i = start + 2; i < p.length; i += 2) {
      ctx.lineTo(p[i] * D.canvas.width, p[i + 1] * D.canvas.height);
    }
    ctx.stroke();
  }

  function redraw() {
    if (!D.ctx) return;
    D.ctx.globalCompositeOperation = 'source-over';
    D.ctx.clearRect(0, 0, D.canvas.width, D.canvas.height);
    D.strokes.forEach(function (st) { drawStroke(st, 0); });
    if (D.cur) drawStroke(D.cur, 0);
  }

  function clearInk() {
    clearTimeout(D.flushTimer);
    D.flushTimer = null;
    D.pending = null;
    D.strokes = [];
    D.cur = null;
    D.lastStyle = null;
    if (D.ctx) {
      D.ctx.globalCompositeOperation = 'source-over';
      D.ctx.clearRect(0, 0, D.canvas.width, D.canvas.height);
    }
  }

  // ------------------------------------------------------- envoi des traits
  function flushInk(force) {
    clearTimeout(D.flushTimer);
    D.flushTimer = null;
    if (!D.pending) return;
    var now = Date.now();
    if (!force && now < D.flushAt) {
      // trop tôt pour envoyer : on repasse tout seul, sinon un tracé lent
      // laisserait des points en attente pendant des secondes
      D.flushTimer = setTimeout(function () { flushInk(true); }, D.flushAt - now);
      return;
    }
    api.sendPeer({ k: 'p', pts: D.pending });
    D.pending = null;
    D.flushAt = now + 55;
  }

  function pushPoint(x, y) {
    if (!D.cur) return;
    var n = D.cur.p.length;
    // on ignore les micro-déplacements : moins de trafic, trait aussi lisse
    if (n >= 2) {
      var dx = x - D.cur.p[n - 2], dy = y - D.cur.p[n - 1];
      if (dx * dx + dy * dy < 0.0000045) return;
    }
    var from = Math.max(0, D.cur.p.length / 2 - 1);
    D.cur.p.push(x, y);
    drawStroke(D.cur, from);
    if (!D.pending) D.pending = [];
    D.pending.push(round3(x), round3(y));
    flushInk(false);
  }

  function round3(v) { return Math.round(v * 1000) / 1000; }

  function posOf(e) {
    var r = D.canvas.getBoundingClientRect();
    return [
      Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)),
      Math.max(0, Math.min(1, (e.clientY - r.top) / r.height))
    ];
  }

  function startStroke(e) {
    var v = D.view;
    if (!v || !v.isDrawer || v.paused || v.phase !== 'playing') return;
    e.preventDefault();
    D.canvas.setPointerCapture && D.canvas.setPointerCapture(e.pointerId);
    var p = posOf(e);
    D.cur = { c: D.color, w: D.width, e: D.erase, p: [p[0], p[1]] };
    api.sendPeer({ k: 's', c: D.cur.c, w: D.cur.w, e: D.cur.e, x: round3(p[0]), y: round3(p[1]) });
    drawStroke(D.cur, 0);
    if (!D.inkSent) { D.inkSent = true; api.act({ t: 'ink' }); }
  }

  function moveStroke(e) {
    if (!D.cur) return;
    e.preventDefault();
    var p = posOf(e);
    pushPoint(p[0], p[1]);
  }

  function endStroke() {
    if (!D.cur) return;
    flushInk(true);
    api.sendPeer({ k: 'e' });        // fin de trait explicite
    D.strokes.push(D.cur);
    D.cur = null;
  }

  /* Réception des traits de l'autre joueur.
   *
   * Un trait n'est JAMAIS clos sur un silence : quand on dessine lentement, il
   * peut s'écouler une seconde entre deux paquets, et une fin devinée donnerait
   * un trait tout neuf — donc repeint avec le style par défaut (du blanc).
   * C'est le dessinateur qui annonce la fin ({k:'e'}), et le style en cours est
   * gardé de côté pour qu'un paquet égaré ne puisse pas changer de couleur. */
  function onPeer(m) {
    if (!m || !m.k) return;
    if (m.k === 'c') { clearInk(); return; }
    if (m.k === 'u') { closeStroke(); D.strokes.pop(); redraw(); return; }
    if (m.k === 'e') { closeStroke(); return; }
    if (m.k === 's') {
      closeStroke();
      D.lastStyle = { c: m.c, w: m.w, e: m.e };
      D.cur = { c: m.c, w: m.w, e: m.e, p: [m.x, m.y] };
      drawStroke(D.cur, 0);
      return;
    }
    if (m.k === 'p' && m.pts) {
      if (!D.cur) {
        var st = D.lastStyle || { c: COLORS[0], w: WIDTHS[1], e: false };
        D.cur = { c: st.c, w: st.w, e: st.e, p: [] };
      }
      var from = Math.max(0, D.cur.p.length / 2 - 1);
      for (var i = 0; i < m.pts.length; i += 2) D.cur.p.push(m.pts[i], m.pts[i + 1]);
      drawStroke(D.cur, from);
    }
  }

  function closeStroke() {
    if (!D.cur) return;
    if (D.cur.p.length) D.strokes.push(D.cur);
    D.cur = null;
  }

  // ==================================================================== vues
  function hudHtml() {
    return '<div class="hud picto-hud">' +
        '<span class="badge gold" id="pi-round"></span>' +
        api.timerHtml('pi-timer') +
        '<span class="badge" id="pi-score"></span>' +
      '</div>';
  }

  function toolsHtml() {
    return '<div class="tools" id="pi-tools">' +
      '<div class="swatches">' + COLORS.map(function (c, i) {
        return '<button type="button" class="sw' + (i === 0 ? ' on' : '') + '" data-act="color" data-c="' + c +
          '" style="--sw:' + c + '"></button>';
      }).join('') +
      '<button type="button" class="sw eraser" data-act="erase" title="Gomme">⌫</button></div>' +
      '<div class="widths">' + WIDTHS.map(function (w, i) {
        return '<button type="button" class="wd' + (i === 1 ? ' on' : '') + '" data-act="width" data-w="' + w +
          '"><i style="--d:' + (6 + i * 7) + 'px"></i></button>';
      }).join('') + '</div>' +
      '<div class="tool-actions">' +
        '<button type="button" class="linky" data-act="undo">annuler</button>' +
        '<button type="button" class="linky" data-act="wipe">tout effacer</button>' +
      '</div></div>';
  }

  function boardHtml(v) {
    return hudHtml() +
      '<section class="panel" id="pi-panel">' +
        '<div class="word-line" id="pi-word"></div>' +
        '<div class="canvas-wrap"><canvas id="pi-canvas"></canvas>' +
          '<div class="reveal" id="pi-reveal"></div></div>' +
        (v.isDrawer ? toolsHtml() : '') +
        '<ul class="guesses" id="pi-guesses"></ul>' +
        (v.isDrawer
          ? '<div class="actions drawer-actions">' +
              (v.config.allowPass ? '<button type="button" class="btn btn-ghost" data-act="pass">Passer</button>' : '') +
              '<button type="button" class="btn btn-primary" data-act="found">Il a trouvé !</button>' +
            '</div>'
          : '<form class="entry" id="pi-form" autocomplete="off">' +
              '<input id="pi-input" type="text" maxlength="30" autocomplete="off" autocorrect="off" spellcheck="false" placeholder="Ta proposition">' +
              '<button class="btn btn-primary" type="submit">Proposer</button>' +
            '</form>') +
        '<div id="pi-letters"></div>' +
        '<p class="mod-hint" id="pi-hint"></p>' +
      '</section>' +
      '<div class="center"><button class="linky" id="pi-quit">quitter la partie</button></div>';
  }

  function updateBoard(v) {
    D.view = v;
    api.setText($('#pi-round'), 'Manche ' + v.round + '/' + v.roundCount);
    api.setText($('#pi-score'), v.total + ' pt' + (v.total > 1 ? 's' : ''));

    // nouveau mot : on repart d'une feuille blanche des deux côtés
    var sig = v.round + ':' + v.wordIndex;
    if (sig !== D.wordSig) {
      D.wordSig = sig;
      D.inkSent = false;
      clearInk();
      var input = $('#pi-input');
      if (input) { input.value = ''; setTimeout(function () { try { input.focus(); } catch (e) {} }, 40); }
    }

    var pos = 'Mot ' + (v.wordIndex + 1) + ' sur ' + v.wordTotal;
    api.setHtml($('#pi-word'), v.isDrawer
      ? '<span class="kicker">À faire deviner</span><b class="the-word">' + esc(v.word || '') + '</b>' +
        '<span class="pos">' + pos + '</span>'
      : '<span class="kicker">' + esc(v.names[v.drawer]) + ' dessine</span>' +
        '<span class="pos">' + pos + '</span>');

    var rev = $('#pi-reveal');
    if (v.paused && v.revealWord) {
      var okWord = v.event && v.event.type === 'ok';
      api.setHtml(rev, '<div class="rev-in ' + (okWord ? 'ok' : 'ko') + '">' +
        '<span>' + (okWord ? 'Trouvé !' : v.event && v.event.type === 'pass' ? 'Passé' : 'Temps écoulé') + '</span>' +
        '<b>' + esc(v.revealWord) + '</b></div>');
      rev.classList.add('on');
    } else {
      rev.classList.remove('on');
      api.setHtml(rev, '');
    }

    var t = $('#pi-timer');
    D.timeBase = { left: v.timeLeftMs, at: api.now(), running: !!v.timerRunning };
    t.classList.toggle('frozen', v.timerStarted && !v.timerRunning);
    api.renderTimer(t, v.timeLeftMs, v.totalTimeMs, !v.timerStarted);

    var gsig = v.guesses.map(function (g) { return g.text + (g.ok ? '!' : ''); }).join('|');
    if (gsig !== D.guessSig) {
      D.guessSig = gsig;
      api.setHtml($('#pi-guesses'), v.guesses.length
        ? v.guesses.map(function (g) {
            return '<li class="' + (g.ok ? 'right' : 'wrong') + '">' + esc(g.text) + '</li>';
          }).join('')
        : '<li class="empty">' + (v.isDrawer ? 'Aucune proposition pour l’instant.' : 'Propose ce que tu vois.') + '</li>');
      var ul = $('#pi-guesses');
      if (ul) ul.scrollTop = ul.scrollHeight;
    }

    var letters = '';
    if (v.hint && !v.paused) {
      var total = 0, groups = '';
      v.hint.forEach(function (g) {
        total += g.len;
        var slots = '';
        for (var q = 0; q < g.len; q++) slots += '<i></i>';
        groups += '<span class="grp">' + slots + '</span>';
      });
      letters = '<div class="lettersbar"><span class="lb-num">' + total + '</span>' +
        '<span class="lb-cap">' + (total > 1 ? 'lettres' : 'lettre') + '</span>' +
        '<span class="lb-groups">' + groups + '</span></div>';
    }
    api.setHtml($('#pi-letters'), letters);

    api.setText($('#pi-hint'), v.isDrawer
      ? 'Ni lettres, ni chiffres, ni gestes : que du dessin.'
      : 'Tape tout ce qui te passe par la tête — le dessinateur voit tes essais.');

    if (v.event && v.event.id !== D.lastEventId) {
      D.lastEventId = v.event.id;
      if (v.event.type === 'wrong') flash($('#pi-guesses'), 'nudge');
    }
  }

  function flash(el, cls) {
    if (!el) return;
    el.classList.remove(cls);
    void el.offsetWidth;
    el.classList.add(cls);
    setTimeout(function () { el.classList.remove(cls); }, 500);
  }

  // ------------------------------------------------------------------ récaps
  function entriesHtml(entries) {
    if (!entries.length) return '<p class="muted small center">Aucun mot.</p>';
    return '<ul class="recap-list">' + entries.map(function (e) {
      var icon = e.status === 'ok' ? '✅' : e.status === 'pass' ? '⏭️' : '⏱️';
      var meta = e.status === 'ok'
        ? (e.byDrawer ? 'validé par le dessinateur' : 'en ' + Math.round(e.timeMs / 1000) + ' s')
        : (e.guesses.length ? 'essais : ' + e.guesses.slice(-3).join(', ') : 'aucune proposition');
      return '<li class="' + (e.status === 'ok' ? 'ok' : 'miss') + '">' +
        '<span class="mark">' + icon + '</span><span class="w">' + esc(e.word) + '</span>' +
        '<span class="meta">' + esc(meta) + '</span></li>';
    }).join('') + '</ul>';
  }

  function roundRecapHtml(v) {
    var last = v.round >= v.roundCount;
    var nextDrawerIsMe = !last ? (v.drawer !== v.yourRole) : false;
    return api.logoBlock(true) +
      '<section class="panel">' +
        '<h2 class="section-title">Manche ' + v.round + ' — récapitulatif</h2>' +
        '<div class="score-big"><div class="n">' + v.roundScore + '<span class="over">/' + v.wordTotal + '</span></div>' +
        '<div class="lbl">mots devinés · ' + esc(v.names[v.drawer]) + ' dessinait</div></div>' +
        entriesHtml((v.log && v.log[v.round]) || []) +
        '<div class="actions" style="margin-top:18px">' +
          '<button class="btn btn-primary btn-block btn-lg" id="next">' +
            (last ? 'Voir le résultat final'
                  : 'Manche ' + (v.round + 1) + ' — ' + (nextDrawerIsMe ? 'à toi de dessiner' : 'à toi de deviner')) +
          '</button>' +
        '</div>' +
      '</section>' + api.footer();
  }

  function gameOverHtml(v) {
    var msg = v.total === v.maxTotal ? 'Sans faute — vous vous comprenez trop bien.'
      : v.total >= v.maxTotal * 0.6 ? 'Belle équipe !'
      : 'On remet ça ?';
    return api.logoBlock(true) +
      '<section class="panel">' +
        '<h2 class="section-title">Résultat de l’équipe</h2>' +
        '<div class="score-big"><div class="n">' + v.total + '<span class="over">/' + v.maxTotal + '</span></div>' +
        '<div class="lbl">mots devinés · ' + esc(msg) + '</div></div>' +
        v.rounds.map(function (r) {
          return '<div class="recap-head">Manche ' + r.round + ' — ' + esc(v.names[r.drawer]) +
            ' dessinait · ' + r.score + '/' + v.config.wordCount + '</div>' + entriesHtml(r.entries);
        }).join('') +
      '</section>' +
      '<section class="panel" style="padding:18px">' +
        '<div class="actions" style="margin:0">' +
          '<button class="btn btn-ghost" id="quit">Quitter</button>' +
          '<button class="btn btn-primary btn-lg" id="replay">Rejouer</button>' +
        '</div>' +
      '</section>' + api.footer();
  }

  // --------------------------------------------------------------- définition
  api = global.Room.api;

  function onAct(el) {
    var what = el.dataset.act;
    if (what === 'color') {
      D.color = el.dataset.c;
      D.erase = false;
      $$('#pi-tools .sw').forEach(function (b) { b.classList.toggle('on', b === el); });
      return;
    }
    if (what === 'erase') {
      D.erase = true;
      $$('#pi-tools .sw').forEach(function (b) { b.classList.toggle('on', b === el); });
      return;
    }
    if (what === 'width') {
      D.width = parseFloat(el.dataset.w);
      $$('#pi-tools .wd').forEach(function (b) { b.classList.toggle('on', b === el); });
      return;
    }
    if (what === 'undo') { D.strokes.pop(); redraw(); api.sendPeer({ k: 'u' }); return; }
    if (what === 'wipe') { clearInk(); api.sendPeer({ k: 'c' }); return; }
    if (what === 'found') { api.act({ t: 'found' }); return; }
    if (what === 'pass') { api.act({ t: 'pass' }); }
  }

  global.Room.init({
    id: 'pictionary',
    title: 'Pictionary',
    tagline: 'l’un dessine, l’autre devine',
    roles: { host: 'Dessine en 1ère', guest: 'Devine en 1ère' },
    howto: [
      '<li>Un joueur reçoit un mot et le <b>dessine</b> ; l’autre voit le dessin apparaître en direct et <b>tape ses propositions</b>.</li>',
      '<li>Le dessinateur voit défiler les essais ratés — c’est fait pour : ça lui dit quoi corriger.</li>',
      '<li>Interdit d’écrire des lettres ou des chiffres dans le dessin.</li>',
      '<li>Le chrono ne démarre qu’au <b>premier trait</b>. Le dessinateur peut passer un mot, ou valider à la main si son binôme a dit la bonne réponse à voix haute.</li>',
      '<li>Puis on inverse. Le score, c’est le nombre de mots devinés par le duo.</li>'
    ],
    config: {
      defaults: Engine.DEFAULT_CONFIG,
      sanitize: Engine.sanitizeConfig,
      fields: [
        { key: 'wordCount', id: 'c-words', label: 'Mots par manche', min: 1, max: 10 },
        { key: 'seconds', id: 'c-secs', label: 'Temps par mot', min: 30, max: 300, step: 10, suffix: 'secondes' },
        { key: 'roundsEach', id: 'c-each', label: 'Manches par joueur', min: 1, max: 3 },
        { key: 'allowPass', id: 'c-pass', type: 'toggle', label: 'Le dessinateur peut passer un mot' },
        { key: 'showLength', id: 'c-len', type: 'toggle', label: 'Afficher le nombre de lettres au devineur' }
      ],
      note: function (c) {
        return '<b>' + (c.roundsEach * 2) + ' manches</b> de ' + c.wordCount + ' mot' +
          (c.wordCount > 1 ? 's' : '') + ', <b>' + api.fmtDuration(c.seconds) + '</b> par mot — soit ' +
          c.wordCount * c.roundsEach * 2 + ' dessins en tout.';
      },
      summary: function (c) {
        return [
          { value: c.wordCount, label: 'mots / manche' },
          { value: api.fmtDuration(c.seconds), label: 'par mot' },
          { value: c.roundsEach * 2, label: 'manches' },
          { value: c.showLength ? 'Oui' : 'Non', label: 'nb de lettres' }
        ];
      }
    },
    createEngine: function (config, names, onUpdate) {
      return Engine.createEngine({ config: config, names: names, words: global.PICTO_WORDS, onUpdate: onUpdate });
    },
    onPeer: onPeer,
    screenKey: function (v) {
      if (v.phase === 'playing') return v.isDrawer ? 'draw' : 'guess';
      return v.phase;
    },
    build: function (key, v) {
      if (key === 'draw' || key === 'guess') return boardHtml(v);
      if (key === 'roundRecap') return roundRecapHtml(v);
      return gameOverHtml(v);
    },
    bind: function (key, v) {
      D.lastEventId = v.event ? v.event.id : 0;
      if (key === 'roundRecap') { $('#next').onclick = function () { api.act({ t: 'next' }); }; return; }
      if (key === 'gameOver') {
        $('#replay').onclick = function () { api.act({ t: 'replay' }); };
        $('#quit').onclick = api.leave;
        return;
      }
      D.wordSig = '';
      D.guessSig = null;
      D.strokes = [];
      D.cur = null;
      D.lastStyle = null;
      $('#pi-quit').onclick = api.leave;
      api.onTap($('#pi-panel'), onAct);
      setupCanvas();

      if (key === 'draw') {
        D.canvas.addEventListener('pointerdown', startStroke);
        D.canvas.addEventListener('pointermove', moveStroke);
        document.addEventListener('pointerup', endStroke);
        document.addEventListener('pointercancel', endStroke);
      } else {
        var form = $('#pi-form');
        form.addEventListener('submit', function (e) {
          e.preventDefault();
          var input = $('#pi-input');
          var text = input.value.trim();
          if (!text) return;
          api.act({ t: 'guess', text: text });
          input.value = '';
        });
      }
      api.onFrame(function () {
        var view = D.view, tb = D.timeBase;
        if (!view || !tb) return;
        var left = tb.running ? Math.max(0, tb.left - (api.now() - tb.at)) : tb.left;
        api.renderTimer($('#pi-timer'), left, view.totalTimeMs, !view.timerStarted);
      });
    },
    update: function (key, v) {
      D.view = v;
      if (key === 'draw' || key === 'guess') updateBoard(v);
    }
  });
})(typeof window !== 'undefined' ? window : globalThis);
