/* Morpion — interface. Les deux joueurs voient le même plateau ; ce qui
 * change d'un écran à l'autre, c'est seulement « à qui de jouer ».
 */
(function (global) {
  'use strict';

  var Engine = global.MorpionEngine;
  var api;

  var M = { view: null, lastEventId: 0, boardSig: '' };

  function $(s) { return document.querySelector(s); }
  function esc(s) { return api.esc(s); }
  function glyph(m) { return m === 'x' ? '✕' : m === 'o' ? '◯' : ''; }

  // ------------------------------------------------------------------ plateau
  function boardHtml(v) {
    return '<div class="hud morpion-hud">' +
        '<div class="side side-x" id="mo-x"></div>' +
        '<div class="mid"><span class="badge gold" id="mo-round"></span></div>' +
        '<div class="side side-o" id="mo-o"></div>' +
      '</div>' +
      '<section class="panel" id="mo-panel">' +
        '<div class="turn-line" id="mo-turn"></div>' +
        '<div class="board-wrap" id="mo-board"></div>' +
        '<p class="mod-hint" id="mo-hint"></p>' +
      '</section>' +
      '<div class="center"><button class="linky" id="mo-quit">quitter la partie</button></div>';
  }

  function cellHtml(v, b, c, mark, extra) {
    var cls = ['cell'];
    if (mark) cls.push('taken', 'm-' + mark);
    if (extra) cls.push(extra);
    var idx = v.config.ultimate ? b * 9 + c : c;
    if (v.line && v.line.indexOf(v.config.ultimate ? b : idx) !== -1 && !v.config.ultimate) cls.push('winline');
    return '<button type="button" class="' + cls.join(' ') + '" data-act="play" data-b="' + b +
      '" data-c="' + c + '"' + (mark || !v.yourTurn ? ' disabled' : '') + '>' +
      '<span>' + glyph(mark) + '</span></button>';
  }

  function classicHtml(v) {
    var out = '<div class="grid classic">';
    for (var c = 0; c < 9; c++) out += cellHtml(v, 0, c, v.cells[c]);
    return out + '</div>';
  }

  function ultimateHtml(v) {
    var out = '<div class="grid ultimate">';
    for (var b = 0; b < 9; b++) {
      var won = v.big[b];
      var cls = ['mini'];
      if (won && won !== 'draw') cls.push('won', 'm-' + won);
      if (won === 'draw') cls.push('tied');
      if (!won && (v.active === -1 || v.active === b) && v.phase === 'playing') cls.push('playable');
      if (v.active === b) cls.push('target');
      if (v.line && v.line.indexOf(b) !== -1) cls.push('winline');
      out += '<div class="' + cls.join(' ') + '">';
      for (var c = 0; c < 9; c++) {
        var mark = v.cells[b * 9 + c];
        var blocked = !!won || (v.active !== -1 && v.active !== b);
        out += '<button type="button" class="cell' + (mark ? ' taken m-' + mark : '') + '"' +
          ' data-act="play" data-b="' + b + '" data-c="' + c + '"' +
          (mark || blocked || !v.yourTurn ? ' disabled' : '') + '><span>' + glyph(mark) + '</span></button>';
      }
      if (won && won !== 'draw') out += '<div class="mini-mark">' + glyph(won) + '</div>';
      if (won === 'draw') out += '<div class="mini-mark tie">=</div>';
      out += '</div>';
    }
    return out + '</div>';
  }

  function updateBoard(v) {
    M.view = v;
    var xName = esc(v.marks.x), oName = esc(v.marks.o);
    api.setHtml($('#mo-x'), '<span class="mk m-x">✕</span><span class="who">' + xName +
      '</span><b>' + v.scores.x + '</b>');
    api.setHtml($('#mo-o'), '<b>' + v.scores.o + '</b><span class="who">' + oName +
      '</span><span class="mk m-o">◯</span>');
    api.setText($('#mo-round'), 'Manche ' + v.round + '/' + v.rounds +
      (v.scores.draw ? ' · ' + v.scores.draw + ' nul' + (v.scores.draw > 1 ? 's' : '') : ''));

    api.setHtml($('#mo-turn'), v.yourTurn
      ? '<b class="m-' + v.you + '">À toi de jouer</b> <span class="mk m-' + v.you + '">' + glyph(v.you) + '</span>'
      : '<span class="wait">Au tour de ' + esc(v.marks[v.turn]) + '</span> <span class="mk m-' + v.turn + '">' + glyph(v.turn) + '</span>');

    api.setText($('#mo-hint'), v.config.ultimate
      ? (v.active === -1
        ? 'Grille libre : joue où tu veux.'
        : 'Tu dois jouer dans la grille en surbrillance.')
      : 'Trois symboles alignés et la manche est à toi.');

    var sig = v.cells.join('') + '|' + (v.big || []).join('') + '|' + v.active + '|' + v.yourTurn + '|' + v.phase;
    if (sig !== M.boardSig) {
      M.boardSig = sig;
      $('#mo-board').innerHTML = v.config.ultimate ? ultimateHtml(v) : classicHtml(v);
    }

    if (v.event && v.event.id !== M.lastEventId) {
      M.lastEventId = v.event.id;
      if (v.event.type === 'board') pulse($('#mo-panel'), 'flash-good');
    }
  }

  function pulse(el, cls) {
    if (!el) return;
    el.classList.remove(cls);
    void el.offsetWidth;
    el.classList.add(cls);
    setTimeout(function () { el.classList.remove(cls); }, 900);
  }

  // ------------------------------------------------------------------- récaps
  function finalBoardHtml(v) {
    return '<div class="board-wrap frozen">' +
      (v.config.ultimate ? ultimateHtml(v) : classicHtml(v)) + '</div>';
  }

  function roundRecapHtml(v) {
    var last = v.round >= v.rounds;
    var title = v.winner === 'draw' ? 'Match nul'
      : (v.winner === v.you ? 'Tu gagnes la manche !' : esc(v.marks[v.winner]) + ' gagne la manche');
    return api.logoBlock(true) +
      '<section class="panel">' +
        '<h2 class="section-title">Manche ' + v.round + ' — ' + title + '</h2>' +
        '<div class="score-line">' +
          '<span class="m-x">✕ ' + esc(v.marks.x) + ' <b>' + v.scores.x + '</b></span>' +
          '<span class="sep">—</span>' +
          '<span class="m-o"><b>' + v.scores.o + '</b> ' + esc(v.marks.o) + ' ◯</span>' +
        '</div>' +
        finalBoardHtml(v) +
        '<div class="actions" style="margin-top:16px">' +
          '<button class="btn btn-primary btn-block btn-lg" id="next">' +
            (last ? 'Voir le résultat final' : 'Manche ' + (v.round + 1)) + '</button>' +
        '</div>' +
      '</section>' + api.footer();
  }

  function gameOverHtml(v) {
    var lead = v.scores[v.you] - v.scores[v.opponent];
    var msg = lead > 0 ? 'Tu remportes la série.'
      : lead < 0 ? esc(v.marks[v.opponent]) + ' remporte la série.'
      : 'Égalité parfaite.';
    return api.logoBlock(true) +
      '<section class="panel">' +
        '<h2 class="section-title">Résultat de la série</h2>' +
        '<div class="score-big final-score">' +
          '<span class="m-x">' + v.scores.x + '</span>' +
          '<span class="dash">–</span>' +
          '<span class="m-o">' + v.scores.o + '</span>' +
        '</div>' +
        '<div class="lbl center">' + esc(v.marks.x) + ' ✕ &nbsp;·&nbsp; ◯ ' + esc(v.marks.o) +
          (v.scores.draw ? ' &nbsp;·&nbsp; ' + v.scores.draw + ' nul' + (v.scores.draw > 1 ? 's' : '') : '') +
        '</div>' +
        '<p class="center" style="margin:14px 0 0">' + msg + '</p>' +
        '<ul class="recap-list" style="margin-top:16px">' + v.log.map(function (l) {
          return '<li class="' + (l.winner === 'draw' ? '' : 'ok') + '">' +
            '<span class="mark">' + (l.winner === 'draw' ? '=' : glyph(l.winner)) + '</span>' +
            '<span class="w">Manche ' + l.round + '</span>' +
            '<span class="meta">' + (l.winner === 'draw' ? 'match nul' : esc(v.marks[l.winner])) + '</span></li>';
        }).join('') + '</ul>' +
      '</section>' +
      '<section class="panel" style="padding:18px">' +
        '<div class="actions" style="margin:0">' +
          '<button class="btn btn-ghost" id="quit">Quitter</button>' +
          '<button class="btn btn-primary btn-lg" id="replay">Rejouer une série</button>' +
        '</div>' +
      '</section>' + api.footer();
  }

  // --------------------------------------------------------------- définition
  api = global.Room.api;

  function onAct(el) {
    if (el.dataset.act !== 'play') return;
    api.act({ t: 'play', b: parseInt(el.dataset.b, 10), c: parseInt(el.dataset.c, 10) });
  }

  global.Room.init({
    id: 'morpion',
    title: 'Morpion',
    tagline: 'l’un contre l’autre · classique ou super morpion',
    roles: { host: 'Croix ✕', guest: 'Rond ◯' },
    howto: [
      '<li>Ici on joue <b>l’un contre l’autre</b> — le seul du site.</li>',
      '<li><b>Classique</b> : trois symboles alignés, la manche est gagnée.</li>',
      '<li><b>Super morpion</b> : neuf grilles. La case où tu joues désigne la grille dans laquelle l’autre devra jouer. Si cette grille est déjà gagnée ou pleine, il joue où il veut.</li>',
      '<li>Pour gagner le super morpion, il faut aligner trois <b>grilles</b>.</li>',
      '<li>On alterne qui commence à chaque manche, et le score de la série est tenu en haut.</li>'
    ],
    config: {
      defaults: Engine.DEFAULT_CONFIG,
      sanitize: Engine.sanitizeConfig,
      fields: [
        { key: 'rounds', id: 'c-rounds', label: 'Manches', min: 1, max: 9 },
        { key: 'ultimate', id: 'c-ultimate', type: 'toggle', label: 'Super morpion (9 grilles imbriquées)' }
      ],
      note: function (c) {
        return c.ultimate
          ? '<b>Super morpion</b> : 9 grilles, ta case décide où l’autre joue. Série de <b>' +
            c.rounds + ' manche' + (c.rounds > 1 ? 's' : '') + '</b> — comptez 5 à 10 min par manche.'
          : '<b>Morpion classique</b>, série de <b>' + c.rounds + ' manche' + (c.rounds > 1 ? 's' : '') +
            '</b> — quelques minutes.';
      },
      summary: function (c) {
        return [
          { value: c.ultimate ? 'Super' : 'Classique', label: 'mode' },
          { value: c.rounds, label: 'manches' },
          { value: c.ultimate ? '9×9' : '3×3', label: 'plateau' }
        ];
      }
    },
    createEngine: function (config, names, onUpdate) {
      return Engine.createEngine({ config: config, names: names, onUpdate: onUpdate });
    },
    screenKey: function (v) { return v.phase; },
    build: function (key, v) {
      if (key === 'playing') return boardHtml(v);
      if (key === 'roundRecap') return roundRecapHtml(v);
      return gameOverHtml(v);
    },
    bind: function (key, v) {
      M.lastEventId = v.event ? v.event.id : 0;
      if (key === 'playing') {
        M.boardSig = '';
        $('#mo-quit').onclick = api.leave;
        api.onTap($('#mo-panel'), onAct);
      } else if (key === 'roundRecap') {
        $('#next').onclick = function () { api.act({ t: 'next' }); };
      } else {
        $('#replay').onclick = function () { api.act({ t: 'replay' }); };
        $('#quit').onclick = api.leave;
      }
    },
    update: function (key, v) {
      M.view = v;
      if (key === 'playing') updateBoard(v);
    }
  });
})(typeof window !== 'undefined' ? window : globalThis);
