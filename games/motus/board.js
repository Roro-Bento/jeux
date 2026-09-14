/* Motus en duo — interface.
 *
 * Un seul tableau à l'écran : celui qu'on a en main. On ne voit jamais le
 * contenu de l'autre, seulement où il en est — le reste passe par la voix.
 */
(function (global) {
  'use strict';

  var Engine = global.MotusEngine;
  var api;

  var ROWS_KB = ['AZERTYUIOP', 'QSDFGHJKLM', 'WXCVBN'];

  var D = { view: null, typed: '', sig: '', lastEventId: 0, msg: null, msgTimer: null };

  function $(s) { return document.querySelector(s); }
  function esc(s) { return api.esc(s); }

  /** La saisie repart de la première lettre, comme à la télé. */
  function baseTyped(v) { return v.config.firstLetter && v.firstLetter ? v.firstLetter : ''; }

  // ================================================================ tableau
  function gridHtml(v) {
    var out = '<div class="mgrid" id="m-grid" style="--len:' + v.length + '">';
    for (var r = 0; r < v.tries; r++) {
      var row = v.board.rows[r];
      out += '<div class="mrow' + (row ? '' : (r === v.board.rows.length ? ' current' : ' empty')) + '">';
      for (var c = 0; c < v.length; c++) {
        if (row) {
          out += '<span class="tile ' + row.marks[c] + '">' + row.w[c] + '</span>';
        } else {
          out += '<span class="tile"></span>';
        }
      }
      out += '</div>';
    }
    return out + '</div>';
  }

  function keyboardHtml() {
    var out = '<div class="kb" id="m-kb">';
    ROWS_KB.forEach(function (line, i) {
      out += '<div class="kb-row">';
      if (i === 2) out += '<button type="button" class="key wide" data-act="enter">Entrée</button>';
      line.split('').forEach(function (l) {
        out += '<button type="button" class="key" data-act="key" data-l="' + l + '">' + l + '</button>';
      });
      if (i === 2) out += '<button type="button" class="key wide" data-act="back">⌫</button>';
      out += '</div>';
    });
    return out + '</div>';
  }

  function boardHtml(v) {
    return '<div class="hud motus-hud">' +
        '<span class="badge gold" id="m-where"></span>' +
        '<span class="badge" id="m-tries"></span>' +
      '</div>' +
      '<section class="panel" id="m-panel">' +
        '<div class="mtitle" id="m-title"></div>' +
        gridHtml(v) +
        '<div class="status" id="m-status"></div>' +
        keyboardHtml() +
        '<p class="mod-hint" id="m-hint"></p>' +
      '</section>' +
      '<div class="center"><button class="linky" id="m-quit">quitter la partie</button></div>';
  }

  function paintCurrentRow(v) {
    var grid = $('#m-grid');
    if (!grid) return;
    var r = v.board.rows.length;
    var row = grid.children[r];
    if (!row) return;
    for (var c = 0; c < v.length; c++) {
      var tile = row.children[c];
      var ch = D.typed[c] || '';
      api.setText(tile, ch);
      tile.classList.toggle('typed', !!ch);
      tile.classList.toggle('given', c === 0 && !!ch && !!baseTyped(v) && D.typed.length >= 1);
      tile.classList.toggle('caret', v.yourTurn && c === D.typed.length);
    }
  }

  function paintKeys(v) {
    var kb = $('#m-kb');
    if (!kb) return;
    var keys = kb.querySelectorAll('.key[data-l]');
    for (var i = 0; i < keys.length; i++) {
      var st = v.board.keys[keys[i].dataset.l];
      keys[i].className = 'key' + (st ? ' ' + st : '');
    }
  }

  function statusHtml(v) {
    if (D.msg && Date.now() < D.msg.until) {
      return '<span class="st ' + D.msg.cls + '">' + D.msg.text + '</span>';
    }
    var mate = esc(v.names[v.yourRole === 'host' ? 'guest' : 'host']);
    if (v.shared) {
      return v.yourTurn
        ? '<span class="st mine">Tableau commun — <b>à toi</b> de proposer.</span>'
        : '<span class="st other">Tableau commun — c’est à ' + mate + ' de proposer.</span>';
    }
    if (v.yourTurn) return '<span class="st mine">À toi de proposer un mot.</span>';
    return '<span class="st other">En attente de ' + mate + '…</span>';
  }

  function updateBoard(v) {
    var sig = v.phase + ':' + v.boardIndex + ':' + v.board.rows.length + ':' + (v.firstLetter || '');
    if (sig !== D.sig) {           // nouveau tableau, ou essai enregistré
      D.sig = sig;
      D.typed = baseTyped(v);
    }
    D.view = v;

    api.setText($('#m-where'), v.shared
      ? 'Tableau commun'
      : (v.boardIndex === (v.yourRole === 'host' ? 0 : 1) ? 'Ton tableau' : 'Tableau de ' + v.names[v.yourRole === 'host' ? 'guest' : 'host']));
    api.setText($('#m-tries'), v.board.triesLeft + ' essai' + (v.board.triesLeft > 1 ? 's' : '') + ' restant' + (v.board.triesLeft > 1 ? 's' : ''));

    api.setHtml($('#m-title'), v.shared
      ? '<b>Dernier mot debout</b> — vous y êtes tous les deux, chacun son tour.'
      : (v.otherBoard
          ? 'En face : <b>' + v.otherBoard.tries + ' essai' + (v.otherBoard.tries > 1 ? 's' : '') + '</b> utilisé' +
            (v.otherBoard.tries > 1 ? 's' : '') + (v.otherBoard.played ? ' · a joué ce tour' : ' · n’a pas encore joué')
          : ''));

    // une rangée de plus, ou un tableau qui change de mains : on refait la grille
    var grid = $('#m-grid');
    if (grid && grid.dataset.rows !== sig) {
      grid.outerHTML = gridHtml(v);
      grid = $('#m-grid');
      grid.dataset.rows = sig;
    }
    paintCurrentRow(v);
    paintKeys(v);
    api.setHtml($('#m-status'), statusHtml(v));
    api.setText($('#m-hint'), v.config.firstLetter
      ? 'La première lettre est donnée. Tape ton mot, Entrée pour valider.'
      : 'Tape ton mot, Entrée pour valider.');

    if (v.event && v.event.id !== D.lastEventId) {
      D.lastEventId = v.event.id;
      // un événement chasse le message précédent : il n'est plus d'actualité
      D.msg = null;
      clearTimeout(D.msgTimer);
      var ev = v.event;
      if (ev.type === 'reject' && ev.role === v.yourRole) say(esc(ev.reason), 'wait', 2200);
      else if (ev.type === 'swap') say('Vous échangez vos tableaux.', 'good', 2000);
      else if (ev.type === 'shared') say('Un mot est tombé ! Vous voilà tous les deux sur l’autre.', 'good', 2600);
      else if (ev.type === 'solved' && ev.role !== v.yourRole) say('Trouvé par ' + esc(v.names[ev.role]) + ' !', 'good', 2200);
      else api.setHtml($('#m-status'), statusHtml(v));
    }
  }

  function say(text, cls, ms) {
    D.msg = { text: text, cls: cls, until: Date.now() + ms };
    api.setHtml($('#m-status'), statusHtml(D.view));
    clearTimeout(D.msgTimer);
    D.msgTimer = setTimeout(function () {
      D.msg = null;
      if (D.view && D.view.phase !== 'over') api.setHtml($('#m-status'), statusHtml(D.view));
    }, ms + 30);
  }

  // ------------------------------------------------------------ frappe
  function type(ch) {
    var v = D.view;
    if (!v || !v.yourTurn) return;
    if (D.typed.length >= v.length) return;
    D.typed += ch;
    paintCurrentRow(v);
  }

  function back() {
    var v = D.view;
    if (!v || !v.yourTurn) return;
    var floor = baseTyped(v).length;       // la lettre donnée ne s'efface pas
    if (D.typed.length <= floor) return;
    D.typed = D.typed.slice(0, -1);
    paintCurrentRow(v);
  }

  function submit() {
    var v = D.view;
    if (!v || !v.yourTurn) return;
    if (D.typed.length < v.length) { say('Il manque des lettres.', 'wait', 1600); return; }
    api.act({ t: 'guess', text: D.typed });
  }

  function onKeyDown(e) {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.key === 'Enter') { e.preventDefault(); submit(); return; }
    if (e.key === 'Backspace') { e.preventDefault(); back(); return; }
    var ch = Engine.normalize(e.key);
    if (ch.length === 1) { e.preventDefault(); type(ch); }
  }

  // ------------------------------------------------------------- débriefing
  function resultHtml(v, r) {
    var mine = (v.yourRole === 'host' && r.index === 0) || (v.yourRole === 'guest' && r.index === 1);
    return '<div class="res">' +
      '<div class="res-head"><span class="res-who">' + (mine ? 'Ton mot' : 'Le mot de ' + esc(v.names[v.yourRole === 'host' ? 'guest' : 'host'])) + '</span>' +
        '<b class="res-word ' + (r.solved ? 'ok' : 'ko') + '">' + esc(r.word) + '</b>' +
        '<span class="res-meta">' + (r.solved ? 'trouvé en ' + r.tries + ' essai' + (r.tries > 1 ? 's' : '') : 'pas trouvé') + '</span></div>' +
      '<div class="mgrid small" style="--len:' + v.length + '">' +
        r.rows.map(function (row) {
          return '<div class="mrow" title="' + esc(row.name) + '">' +
            row.w.split('').map(function (ch, i) {
              return '<span class="tile ' + row.marks[i] + '">' + ch + '</span>';
            }).join('') +
            '<span class="by">' + esc(row.name) + '</span></div>';
        }).join('') +
      '</div></div>';
  }

  function gameOverHtml(v) {
    var msg = v.solvedCount === 2 ? 'Les deux mots sont tombés.'
      : v.solvedCount === 1 ? 'Un mot sur deux — il s’en est fallu de peu.'
      : 'Aucun des deux. On en remet une ?';
    return api.logoBlock(true) +
      '<section class="panel">' +
        '<h2 class="section-title">' + (v.solvedCount === 2 ? 'Gagné !' : 'Fin de partie') + '</h2>' +
        '<div class="score-big"><div class="n">' + v.solvedCount + '<span class="over">/2</span></div>' +
        '<div class="lbl">mots trouvés · ' + v.totalTries + ' essais · ' + esc(msg) + '</div></div>' +
        v.results.map(function (r) { return resultHtml(v, r); }).join('') +
      '</section>' +
      '<section class="panel" style="padding:18px">' +
        '<div class="actions" style="margin:0">' +
          '<button class="btn btn-ghost" id="quit">Quitter</button>' +
          '<button class="btn btn-primary btn-lg" id="replay">Deux nouveaux mots</button>' +
        '</div>' +
      '</section>' + api.footer();
  }

  // --------------------------------------------------------------- définition
  api = global.Room.api;

  global.Room.init({
    id: 'motus',
    title: 'Motus en duo',
    tagline: 'deux mots, deux tableaux, un seul duo',
    howto: [
      '<li>Chacun a <b>son</b> mot à faire tomber, sur son propre tableau. Les couleurs sont celles qu’on connaît : bien placée, mal placée, absente.</li>',
      '<li>Quand vous avez proposé un mot tous les deux, <b>les tableaux s’échangent</b> : tu continues sur le mot de ton binôme, avec ses essais sous les yeux.</li>',
      '<li>Tu ne vois jamais le tableau que tu n’as pas en main : racontez-vous ce que vous avez appris.</li>',
      '<li>Dès qu’un mot tombe, vous vous retrouvez <b>tous les deux sur celui qui reste</b>, chacun son tour.</li>',
      '<li>Les essais sont comptés par tableau, pas par joueur.</li>'
    ],
    config: {
      defaults: Engine.DEFAULT_CONFIG,
      sanitize: Engine.sanitizeConfig,
      fields: [
        { key: 'length', id: 'c-len', label: 'Lettres par mot', min: 4, max: 7 },
        { key: 'tries', id: 'c-tries', label: 'Essais par tableau', min: 4, max: 10 },
        { key: 'firstLetter', id: 'c-first', type: 'toggle', label: 'Donner la première lettre' },
        { key: 'bankOnly', id: 'c-bank', type: 'toggle', label: 'N’accepter que les mots de la banque' }
      ],
      note: function (c) {
        return 'Deux mots de <b>' + c.length + ' lettres</b>, <b>' + c.tries + ' essais</b> par tableau ' +
          '— partagés entre vous deux, puisque vous jouez sur les deux.';
      },
      summary: function (c) {
        return [
          { value: c.length, label: 'lettres' },
          { value: c.tries, label: 'essais / tableau' },
          { value: c.firstLetter ? 'Oui' : 'Non', label: '1re lettre' },
          { value: c.bankOnly ? 'Banque' : 'Libre', label: 'mots acceptés' }
        ];
      }
    },
    createEngine: function (config, names, onUpdate) {
      return Engine.createEngine({ config: config, names: names, onUpdate: onUpdate });
    },
    screenKey: function (v) { return v.phase === 'over' ? 'over' : 'play'; },
    build: function (key, v) {
      return key === 'play' ? boardHtml(v) : gameOverHtml(v);
    },
    bind: function (key, v) {
      D.lastEventId = v.event ? v.event.id : 0;
      if (key === 'over') {
        document.removeEventListener('keydown', onKeyDown);
        $('#replay').onclick = function () { api.act({ t: 'replay' }); };
        $('#quit').onclick = api.leave;
        return;
      }
      D.sig = '';
      D.msg = null;
      clearTimeout(D.msgTimer);
      $('#m-quit').onclick = api.leave;
      api.onTap($('#m-panel'), function (el) {
        var what = el.dataset.act;
        if (what === 'key') type(el.dataset.l);
        else if (what === 'back') back();
        else if (what === 'enter') submit();
      });
      document.removeEventListener('keydown', onKeyDown);
      document.addEventListener('keydown', onKeyDown);
    },
    update: function (key, v) {
      D.view = v;
      if (key === 'play') updateBoard(v);
    }
  });
})(typeof window !== 'undefined' ? window : globalThis);
