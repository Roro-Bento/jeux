/* L'enquête — interface.
 *
 * Trois blocs : le dossier (ce qu'on sait), le carnet (ce qu'on croit), et
 * l'accusation (ce qu'on ose). Le carnet de l'un n'est jamais visible chez
 * l'autre : seule une proposition envoyée traverse.
 */
(function (global) {
  'use strict';

  var Engine = global.EnqueteEngine;
  var api;

  var CATS = ['p', 'i', 't'];
  var CAT_TITLES = { p: 'Où', i: 'Avec quoi', t: 'À quelle heure' };

  var D = { view: null, lastEventId: 0, timeBase: null, msg: null, msgTimer: null };

  function $(s) { return document.querySelector(s); }
  function esc(s) { return api.esc(s); }
  function cap(s) { return s.charAt(0).toUpperCase() + s.slice(1); }

  // ================================================================= carnet
  function selectHtml(v, cat, s, value, readonly) {
    var opts = '<option value="">—</option>';
    v.labels[cat].forEach(function (lab, i) {
      opts += '<option value="' + i + '"' + (value === i ? ' selected' : '') + '>' + esc(cap(lab)) + '</option>';
    });
    return '<select class="pick" data-cat="' + cat + '" data-s="' + s + '"' +
      (readonly ? ' disabled' : '') + ' aria-label="' + CAT_TITLES[cat] + ' — ' + esc(v.labels.s[s]) + '">' +
      opts + '</select>';
  }

  function gridHtml(v, draft, readonly, id) {
    var out = '<div class="carnet"' + (id ? ' id="' + id + '"' : '') + '>' +
      '<div class="cr-head"><span></span>' +
      CATS.map(function (c) { return '<span>' + CAT_TITLES[c] + '</span>'; }).join('') + '</div>';
    for (var s = 0; s < v.n; s++) {
      out += '<div class="cr-row"><span class="who">' + esc(cap(v.labels.s[s])) + '</span>' +
        CATS.map(function (c) { return selectHtml(v, c, s, draft[c][s], readonly); }).join('') +
        '</div>';
    }
    return out + '</div>';
  }

  // ================================================================= écrans
  function playHtml(v) {
    return '<div class="hud enq-hud">' +
        '<span class="badge gold" id="e-tries"></span>' +
        (v.config.minutes ? api.timerHtml('e-timer') : '') +
        '<span class="badge" id="e-count"></span>' +
      '</div>' +
      '<section class="panel" id="e-file">' +
        '<h2 class="section-title">Le dossier</h2>' +
        '<p class="crime">Le vol a eu lieu <b>dans ' + esc(v.crime.place) + '</b>, à <b>' + esc(v.crime.time) + '</b>. ' +
          'Le coupable est donc celui qui s’y trouvait à cette heure-là.</p>' +
        '<h3 class="mini-title">Tes indices</h3>' +
        '<ul class="clues">' + v.clues.map(function (c) {
          return '<li>' + esc(c) + '</li>';
        }).join('') + '</ul>' +
        '<p class="mod-hint">' + esc(v.names[v.yourRole === 'host' ? 'guest' : 'host']) + ' en a ' +
          v.otherClueCount + ' autres, que tu ne verras pas. Lisez-vous les vôtres à voix haute.</p>' +
      '</section>' +
      '<section class="panel" id="e-book">' +
        '<h2 class="section-title">Ton carnet</h2>' +
        '<p class="muted small center">Il est à toi seul : ton binôme ne le voit pas.</p>' +
        gridHtml(v, v.draft, false, 'e-grid') +
        '<div class="actions">' +
          '<button class="btn btn-ghost" data-act="clear">Effacer</button>' +
          '<button class="btn btn-primary" data-act="propose" id="e-propose">Proposer cette solution</button>' +
        '</div>' +
        '<div id="e-deal"></div>' +
      '</section>' +
      '<div class="center"><button class="linky" id="e-quit">quitter la partie</button></div>';
  }

  function dealHtml(v) {
    if (!v.proposal) return '';
    if (v.proposal.mine) {
      return '<div class="deal mine">' +
        '<p><b>Ta proposition est partie.</b> ' + esc(v.names[v.yourRole === 'host' ? 'guest' : 'host']) +
        ' doit la relire et décider — l’accusation ne part que si vous êtes d’accord.</p>' +
        '<div class="actions" style="margin:10px 0 0"><button class="btn btn-ghost" data-act="withdraw">Retirer ma proposition</button></div>' +
        '</div>';
    }
    return '<div class="deal theirs">' +
      '<p><b>' + esc(v.proposal.from) + ' propose cette solution.</b> Compare-la à tes indices : ' +
      'si elle les respecte tous, accusez.</p>' +
      gridHtml(v, v.proposal.grid, true) +
      '<div class="actions" style="margin:12px 0 0">' +
        '<button class="btn btn-ghost" data-act="refuse">Ça ne colle pas</button>' +
        '<button class="btn btn-primary" data-act="accept">Accuser</button>' +
      '</div></div>';
  }

  function statusLine(v) {
    if (D.msg && Date.now() < D.msg.until) return '<span class="st ' + D.msg.cls + '">' + D.msg.text + '</span>';
    return '';
  }

  function updatePlay(v) {
    D.view = v;
    api.setText($('#e-tries'), v.triesLeft + ' accusation' + (v.triesLeft > 1 ? 's' : '') + ' possible' + (v.triesLeft > 1 ? 's' : ''));
    api.setText($('#e-count'), v.clues.length + ' indices en main');

    if (v.config.minutes) {
      D.timeBase = { left: v.timeLeftMs, at: api.now(), running: !!v.timerRunning };
      api.renderTimer($('#e-timer'), v.timeLeftMs, v.totalTimeMs, false);
    }

    // le carnet : on repositionne les valeurs sans reconstruire (focus préservé)
    var grid = $('#e-grid');
    if (grid) {
      var picks = grid.querySelectorAll('select.pick');
      for (var i = 0; i < picks.length; i++) {
        var el = picks[i];
        var want = v.draft[el.dataset.cat][parseInt(el.dataset.s, 10)];
        var str = want == null ? '' : String(want);
        if (el.value !== str) el.value = str;
        el.disabled = !!v.proposal;
      }
    }
    var btn = $('#e-propose');
    if (btn) {
      btn.disabled = !v.draftComplete || !!v.proposal;
      api.setText(btn, v.proposal ? 'Proposition en cours…' : 'Proposer cette solution');
    }

    var sig = v.proposal ? (v.proposal.mine ? 'mine' : 'theirs') + JSON.stringify(v.proposal.grid) : 'none';
    if (sig !== D.dealSig) {
      D.dealSig = sig;
      api.setHtml($('#e-deal'), dealHtml(v) + statusLine(v));
    }

    if (v.event && v.event.id !== D.lastEventId) {
      D.lastEventId = v.event.id;
      var ev = v.event;
      if (ev.type === 'incomplete' && ev.role === v.yourRole) say('Il reste des cases vides dans ton carnet.', 'wait', 2400);
      else if (ev.type === 'wrong') say('Raté. Il vous reste ' + ev.left + ' accusation' + (ev.left > 1 ? 's' : '') + '.', 'wait', 3200);
      else if (ev.type === 'refused' && ev.role !== v.yourRole) say('Ton binôme n’est pas d’accord : reprenez les indices.', 'wait', 3000);
      else if (ev.type === 'proposed' && ev.role !== v.yourRole) say('Une proposition vient d’arriver.', 'good', 2200);
    }
  }

  function say(text, cls, ms) {
    D.msg = { text: text, cls: cls, until: Date.now() + ms };
    var box = $('#e-deal');
    if (box) api.setHtml(box, dealHtml(D.view) + statusLine(D.view));
    clearTimeout(D.msgTimer);
    D.msgTimer = setTimeout(function () {
      D.msg = null;
      if (D.view && D.view.phase === 'playing' && $('#e-deal')) {
        api.setHtml($('#e-deal'), dealHtml(D.view) + statusLine(D.view));
      }
    }, ms + 30);
  }

  // ------------------------------------------------------------- débriefing
  function solutionHtml(v) {
    var out = '<div class="carnet final"><div class="cr-head"><span></span>' +
      CATS.map(function (c) { return '<span>' + CAT_TITLES[c] + '</span>'; }).join('') + '</div>';
    for (var s = 0; s < v.n; s++) {
      out += '<div class="cr-row' + (s === v.culprit ? ' culprit' : '') + '">' +
        '<span class="who">' + esc(cap(v.labels.s[s])) + (s === v.culprit ? ' <i>coupable</i>' : '') + '</span>' +
        CATS.map(function (c) {
          return '<span class="val">' + esc(cap(v.labels[c][v.solution[c][s]])) + '</span>';
        }).join('') + '</div>';
    }
    return out + '</div>';
  }

  function overHtml(v) {
    var win = v.outcome === 'win';
    var title = win ? 'Coupable démasqué' : v.outcome === 'timeout' ? 'Le temps a manqué' : 'L’enquête est close';
    var mine = v.yourRole === 'host' ? v.allClues.host : v.allClues.guest;
    var theirs = v.yourRole === 'host' ? v.allClues.guest : v.allClues.host;
    return api.logoBlock(true) +
      '<section class="panel">' +
        '<h2 class="section-title">' + title + '</h2>' +
        '<p class="verdict ' + (win ? 'ok' : 'ko') + '">' +
          (win ? 'C’était bien <b>' + esc(v.labels.s[v.culprit]) + '</b>.'
               : 'Le coupable était <b>' + esc(v.labels.s[v.culprit]) + '</b>.') + '</p>' +
        solutionHtml(v) +
        '<h3 class="mini-title">Tous les indices, enfin réunis</h3>' +
        '<div class="clue-cols">' +
          '<div><h4>Les tiens</h4><ul class="clues">' + mine.map(function (c) { return '<li>' + esc(c) + '</li>'; }).join('') + '</ul></div>' +
          '<div><h4>Ceux de ' + esc(v.names[v.yourRole === 'host' ? 'guest' : 'host']) + '</h4><ul class="clues">' +
            theirs.map(function (c) { return '<li>' + esc(c) + '</li>'; }).join('') + '</ul></div>' +
        '</div>' +
        '<p class="mod-hint">' + esc(v.publicClue) + '</p>' +
      '</section>' +
      '<section class="panel" style="padding:18px">' +
        '<div class="actions" style="margin:0">' +
          '<button class="btn btn-ghost" id="quit">Quitter</button>' +
          '<button class="btn btn-primary btn-lg" id="replay">Nouvelle enquête</button>' +
        '</div>' +
      '</section>' + api.footer();
  }

  // --------------------------------------------------------------- définition
  api = global.Room.api;

  global.Room.init({
    id: 'enquete',
    title: 'L’enquête',
    tagline: 'la moitié des indices chacun',
    howto: [
      '<li>Un vol a eu lieu dans le manoir. Chaque suspect était dans <b>un lieu</b>, avec <b>un objet</b>, à <b>une heure</b> — et deux suspects ne partagent jamais rien.</li>',
      '<li>Vous recevez <b>la moitié des indices chacun</b>. Aucun des deux ne peut conclure seul : c’est garanti par la façon dont l’énigme est fabriquée.</li>',
      '<li>Ton carnet est privé. Lisez-vous vos indices, comparez, remplissez.</li>',
      '<li>Pour accuser, il faut être deux : l’un propose sa grille complète, l’autre la valide.</li>',
      '<li>Le coupable est celui qui était sur les lieux du vol à l’heure du vol.</li>'
    ],
    config: {
      defaults: Engine.DEFAULT_CONFIG,
      sanitize: Engine.sanitizeConfig,
      fields: [
        { key: 'suspects', id: 'c-susp', label: 'Suspects', min: 4, max: 5 },
        { key: 'mistakes', id: 'c-mist', label: 'Accusations permises', min: 1, max: 5 },
        { key: 'minutes', id: 'c-min', label: 'Chrono', min: 0, max: 45, step: 1, suffix: 'minutes (0 = sans chrono)' }
      ],
      note: function (c) {
        return '<b>' + c.suspects + ' suspects</b>, ' + (c.suspects * 3) + ' cases à remplir, <b>' +
          c.mistakes + ' accusation' + (c.mistakes > 1 ? 's' : '') + '</b> permise' + (c.mistakes > 1 ? 's' : '') +
          (c.minutes ? ' — et ' + c.minutes + ' minutes au chrono.' : ' — sans chrono.');
      },
      summary: function (c) {
        return [
          { value: c.suspects, label: 'suspects' },
          { value: c.mistakes, label: 'accusations' },
          { value: c.minutes ? c.minutes + ' min' : 'libre', label: 'chrono' }
        ];
      }
    },
    createEngine: function (config, names, onUpdate) {
      return Engine.createEngine({ config: config, names: names, onUpdate: onUpdate });
    },
    screenKey: function (v) { return v.phase; },
    build: function (key, v) { return key === 'playing' ? playHtml(v) : overHtml(v); },
    bind: function (key, v) {
      D.lastEventId = v.event ? v.event.id : 0;
      if (key === 'over') {
        $('#replay').onclick = function () { api.act({ t: 'replay' }); };
        $('#quit').onclick = api.leave;
        return;
      }
      D.msg = null;
      D.dealSig = '';
      clearTimeout(D.msgTimer);
      $('#e-quit').onclick = api.leave;

      api.onTap($('#e-book'), function (el) {
        var what = el.dataset.act;
        if (what === 'clear') api.act({ t: 'clear' });
        else if (what === 'propose') api.act({ t: 'propose' });
        else if (what === 'withdraw') api.act({ t: 'withdraw' });
        else if (what === 'refuse') api.act({ t: 'refuse' });
        else if (what === 'accept') api.act({ t: 'accept' });
      });
      // les listes déroulantes ne passent pas par onTap : elles changent, elles
      $('#e-book').addEventListener('change', function (e) {
        var el = e.target;
        if (!el || !el.classList || !el.classList.contains('pick')) return;
        if (el.disabled) return;
        api.act({ t: 'set', cat: el.dataset.cat, s: el.dataset.s, v: el.value });
      });

      if (v.config.minutes) {
        api.onFrame(function () {
          var view = D.view, tb = D.timeBase;
          if (!view || !tb) return;
          var left = tb.running ? Math.max(0, tb.left - (api.now() - tb.at)) : tb.left;
          api.renderTimer($('#e-timer'), left, view.totalTimeMs, false);
        });
      }
    },
    update: function (key, v) {
      D.view = v;
      if (key === 'playing') updatePlay(v);
    }
  });
})(typeof window !== 'undefined' ? window : globalThis);
