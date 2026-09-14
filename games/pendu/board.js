/* Pendu — interface. Celui qui choisit voit le mot en clair, celui qui devine
 * ne voit que les lettres trouvées.
 */
(function (global) {
  'use strict';

  var Engine = global.PenduEngine;
  var api;

  var P = { view: null, lastEventId: 0, lastMessageId: 0, slotSig: '', keysBound: false };

  function $(s) { return document.querySelector(s); }
  function esc(s) { return api.esc(s); }
  var ALPHABET = 'abcdefghijklmnopqrstuvwxyz'.split('');

  // -------------------------------------------------------------- la potence
  // La potence est toujours dessinée : c'est le pendu qui apparaît, morceau
  // par morceau, à mesure des erreurs. Sinon le premier écran paraît vide.
  var FRAME = [
    '<path d="M14 186h74" />',
    '<path d="M40 186V16" />',
    '<path d="M40 16h78" />',
    '<path d="M40 44 66 16" />',
    '<path d="M118 16v26" />'
  ];
  var BODY = [
    '<circle cx="118" cy="56" r="14" />',
    '<path d="M118 70v48" />',
    '<path d="M118 84 97 104" />',
    '<path d="M118 84l21 20" />',
    '<path d="M118 118l-16 30" />',
    '<path d="M118 118l16 30" />'
  ];

  function gallowsHtml(v) {
    var errors = v.lives - v.livesLeft;
    var shown = Math.min(BODY.length, Math.ceil(errors * BODY.length / v.lives));
    var body = FRAME.map(function (p) { return p.replace('/>', ' class="frame"/>'); }).join('');
    for (var i = 0; i < BODY.length; i++) {
      body += BODY[i].replace('/>', ' class="part body' + (i < shown ? ' on' : '') + '"/>');
    }
    return '<svg class="gallows' + (v.livesLeft <= 0 ? ' dead' : '') + '" viewBox="0 0 160 196" aria-hidden="true">' +
      body + '</svg>';
  }

  function livesHtml(v) {
    var out = '';
    for (var i = 0; i < v.lives; i++) out += '<span class="life' + (i < v.livesLeft ? '' : ' used') + '"></span>';
    return out + '<span class="life-lab">' + api.plural(v.livesLeft, 'erreur') + ' restante' +
      (v.livesLeft > 1 ? 's' : '') + '</span>';
  }

  function slotsHtml(v) {
    return '<div class="slots">' + v.slots.map(function (s) {
      if (s.sep != null) return '<span class="sep">' + (s.sep === ' ' ? '&nbsp;' : esc(s.sep)) + '</span>';
      return '<span class="slot' + (s.ch ? ' filled' : '') + '">' + (s.ch ? esc(s.ch) : '') + '</span>';
    }).join('') + '</div>';
  }

  // ============================================================ ÉCRAN CHOISIR
  function chooseHtml(v) {
    if (v.isChooser) {
      return hudHtml(v) +
        '<section class="panel" id="p-panel">' +
          '<h2 class="section-title">À toi de choisir le mot</h2>' +
          '<p class="muted small center">' + esc(v.names[v.guesser]) + ' devra le deviner lettre par lettre.</p>' +
          '<label class="field" style="margin-top:14px"><span class="lab">Le mot (ou une petite expression)</span>' +
            '<input id="p-word" type="text" maxlength="24" autocomplete="off" autocorrect="off" ' +
            'spellcheck="false" placeholder="ex. tournevis"></label>' +
          '<div class="entry-msg" id="p-msg"></div>' +
          '<div class="actions">' +
            '<button type="button" class="btn btn-ghost" data-act="draw">Piocher un mot</button>' +
            '<button type="button" class="btn btn-primary btn-lg" data-act="setword">Valider</button>' +
          '</div>' +
          '<p class="mod-hint">3 à 24 caractères, lettres, espaces et traits d’union. Ne le dis pas à voix haute !</p>' +
        '</section>' +
        '<div class="center"><button class="linky" id="p-quit">quitter la partie</button></div>';
    }
    return hudHtml(v) +
      '<section class="panel" id="p-panel">' +
        '<div class="waiting">' +
          '<div class="dots"><i></i><i></i><i></i></div>' +
          '<p><b>' + esc(v.names[v.chooser]) + '</b> choisit un mot…</p>' +
          '<p class="muted small">Prépare-toi : tu devineras lettre par lettre.</p>' +
        '</div>' +
      '</section>' +
      '<div class="center"><button class="linky" id="p-quit">quitter la partie</button></div>';
  }

  // ============================================================== ÉCRAN JOUER
  function hudHtml(v) {
    return '<div class="hud pendu-hud">' +
        '<span class="badge gold" id="p-round">Manche ' + v.round + '/' + v.roundCount + '</span>' +
        '<div class="role-mini" id="p-role"></div>' +
      '</div>';
  }

  function playHtml(v) {
    return hudHtml(v) +
      '<section class="panel" id="p-panel">' +
        '<div class="pendu-top">' +
          '<div class="gallows-wrap" id="p-gallows"></div>' +
          '<div class="pendu-side">' +
            '<div class="lives" id="p-lives"></div>' +
            '<div class="wrongs" id="p-wrongs"></div>' +
          '</div>' +
        '</div>' +
        '<div id="p-slots"></div>' +
        '<div class="entry-msg" id="p-msg"></div>' +
        (v.isChooser
          ? '<div class="chooser-word">Ton mot : <b>' + esc(v.word || '') + '</b><span class="shh">chut…</span></div>'
          : '<div class="keyboard" id="p-keys"></div>' +
            (v.config.allowWord
              ? '<form class="entry" id="p-form" autocomplete="off">' +
                  '<input id="p-try" type="text" maxlength="24" autocomplete="off" spellcheck="false" placeholder="Tenter le mot entier…">' +
                  '<button class="btn btn-ghost" type="submit">Tenter</button>' +
                '</form>'
              : '')) +
        '<p class="mod-hint" id="p-hint"></p>' +
      '</section>' +
      '<div class="center"><button class="linky" id="p-quit">quitter la partie</button></div>';
  }

  function updatePlay(v) {
    api.setHtml($('#p-gallows'), gallowsHtml(v));
    api.setHtml($('#p-lives'), livesHtml(v));
    api.setHtml($('#p-wrongs'), v.wrong.length
      ? '<span class="wr-lab">Lettres ratées</span>' + v.wrong.map(function (l) {
          return '<span class="wr">' + l.toUpperCase() + '</span>';
        }).join('')
      : '<span class="wr-lab">Aucune erreur</span>');

    api.setHtml($('#p-slots'), slotsHtml(v));
    api.setHtml($('#p-role'), v.isChooser
      ? 'Tu fais deviner à <b>' + esc(v.names[v.guesser]) + '</b>'
      : '<b>' + esc(v.names[v.chooser]) + '</b> te fait deviner · ' + api.plural(v.letterCount, 'lettre'));

    if (!v.isChooser) {
      var keys = ALPHABET.map(function (l) {
        var state = v.found.indexOf(l) !== -1 ? ' hit' : v.wrong.indexOf(l) !== -1 ? ' miss' : '';
        return '<button type="button" class="key' + state + '" data-act="letter" data-l="' + l + '"' +
          (state ? ' disabled' : '') + '>' + l.toUpperCase() + '</button>';
      }).join('');
      api.setHtml($('#p-keys'), keys);
    }

    api.setText($('#p-hint'), v.isChooser
      ? 'Tu ne peux plus rien faire : regarde-le se débattre.'
      : 'Clique une lettre. Les accents sont donnés avec la lettre simple.');

    if (v.message && v.message.id !== P.lastMessageId) {
      P.lastMessageId = v.message.id;
      var m = $('#p-msg');
      if (m) { m.textContent = v.message.text || ''; m.className = 'entry-msg'; }
    }

    if (v.event && v.event.id !== P.lastEventId) {
      P.lastEventId = v.event.id;
      if (v.event.type === 'miss') shake($('#p-panel'));
      if (v.event.type === 'hit') pulse($('#p-slots'));
    }
  }

  function shake(el) {
    if (!el) return;
    el.classList.remove('flash-bad');
    void el.offsetWidth;
    el.classList.add('flash-bad');
    setTimeout(function () { el.classList.remove('flash-bad'); }, 700);
  }
  function pulse(el) {
    if (!el) return;
    el.classList.remove('pop');
    void el.offsetWidth;
    el.classList.add('pop');
  }

  // ------------------------------------------------------------------ récaps
  function roundRecapHtml(v) {
    var l = v.log[v.log.length - 1] || {};
    var last = v.round >= v.roundCount;
    var nextChooserIsMe = !last ? (v.chooser !== v.yourRole) : false;
    return api.logoBlock(true) +
      '<section class="panel">' +
        '<h2 class="section-title">' + (l.found ? 'Mot trouvé !' : 'Pendu…') + '</h2>' +
        '<div class="reveal-word ' + (l.found ? 'ok' : 'ko') + '">' + esc(l.word || '') + '</div>' +
        '<div class="settings-recap">' +
          '<div class="item"><b>' + esc(v.names[l.guesser] || '') + '</b><span>devinait</span></div>' +
          '<div class="item"><b>' + (l.wrong ? l.wrong.length : 0) + '</b><span>erreurs</span></div>' +
          '<div class="item"><b>' + (l.livesLeft || 0) + '</b><span>vies restantes</span></div>' +
        '</div>' +
        (l.wrong && l.wrong.length
          ? '<p class="center muted small" style="margin-top:12px">Lettres ratées : ' +
            l.wrong.map(function (x) { return x.toUpperCase(); }).join(' · ') + '</p>'
          : '') +
        '<div class="actions" style="margin-top:18px">' +
          '<button class="btn btn-primary btn-block btn-lg" id="next">' +
            (last ? 'Voir le résultat final'
                  : 'Manche ' + (v.round + 1) + ' — ' + (nextChooserIsMe ? 'à toi de choisir un mot' : 'à toi de deviner')) +
          '</button>' +
        '</div>' +
      '</section>' + api.footer();
  }

  function gameOverHtml(v) {
    var msg = v.solved === v.total ? 'Tous les mots trouvés. Impressionnant.'
      : v.solved === 0 ? 'Aucun mot trouvé… vous choisissez trop bien.'
      : 'Pas mal — on remet ça ?';
    return api.logoBlock(true) +
      '<section class="panel">' +
        '<h2 class="section-title">Résultat de l’équipe</h2>' +
        '<div class="score-big"><div class="n">' + v.solved + '<span class="over">/' + v.total + '</span></div>' +
        '<div class="lbl">mots trouvés · ' + esc(msg) + '</div></div>' +
        '<ul class="recap-list">' + v.log.map(function (l) {
          return '<li class="' + (l.found ? 'ok' : 'miss') + '">' +
            '<span class="mark">' + (l.found ? '✅' : '💀') + '</span>' +
            '<span class="w">' + esc(l.word) + '</span>' +
            '<span class="meta">' + esc(v.names[l.guesser] || '') + ' devinait · ' +
              l.wrong.length + ' erreur' + (l.wrong.length > 1 ? 's' : '') + '</span></li>';
        }).join('') + '</ul>' +
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
    if (what === 'letter') { api.act({ t: 'letter', l: el.dataset.l }); return; }
    if (what === 'draw') { api.act({ t: 'draw' }); return; }
    if (what === 'setword') {
      var input = $('#p-word');
      if (input) api.act({ t: 'setWord', text: input.value });
    }
  }

  function bindKeys() {
    if (P.keysBound) return;
    P.keysBound = true;
    document.addEventListener('keydown', function (e) {
      var v = P.view;
      if (!v || v.isChooser || v.phase !== 'playing') return;
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      var el = document.activeElement;
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA')) return;
      if (!/^[a-zA-Zà-öø-ÿ]$/.test(e.key)) return;
      api.act({ t: 'letter', l: e.key });
    });
  }

  global.Room.init({
    id: 'pendu',
    title: 'Pendu',
    tagline: 'l’un choisit le mot, l’autre le devine',
    roles: { host: 'Choisit en 1ère', guest: 'Devine en 1ère' },
    howto: [
      '<li>Le premier joueur <b>choisit un mot</b> : il le tape, ou le pioche d’un clic dans la banque.</li>',
      '<li>L’autre le devine <b>lettre par lettre</b>. Chaque lettre absente coûte une vie et fait avancer le dessin.</li>',
      '<li>Les accents sont offerts : proposer <b>E</b> révèle aussi les É, È et Ê.</li>',
      '<li>On peut tenter le <b>mot entier</b> — mais se tromper coûte une vie.</li>',
      '<li>Puis on inverse les rôles. Le score, c’est le nombre de mots sauvés par le duo.</li>'
    ],
    config: {
      defaults: Engine.DEFAULT_CONFIG,
      sanitize: Engine.sanitizeConfig,
      fields: [
        { key: 'lives', id: 'c-lives', label: 'Erreurs autorisées', min: 3, max: 12 },
        { key: 'roundsEach', id: 'c-each', label: 'Mots par joueur', min: 1, max: 3 },
        { key: 'allowWord', id: 'c-allowword', type: 'toggle', label: 'Le devineur peut tenter le mot entier' }
      ],
      note: function (c) {
        return '<b>' + (c.roundsEach * 2) + ' manches</b> en tout (chacun fait deviner ' + c.roundsEach +
          ' mot' + (c.roundsEach > 1 ? 's' : '') + '), avec <b>' + c.lives + ' erreurs</b> autorisées par mot.';
      },
      summary: function (c) {
        return [
          { value: c.roundsEach * 2, label: 'manches' },
          { value: c.lives, label: 'erreurs max' },
          { value: c.allowWord ? 'Oui' : 'Non', label: 'tenter le mot' }
        ];
      }
    },
    createEngine: function (config, names, onUpdate) {
      return Engine.createEngine({ config: config, names: names, words: global.WORDS, onUpdate: onUpdate });
    },
    screenKey: function (v) {
      if (v.phase === 'choosing') return v.isChooser ? 'choose' : 'wait';
      if (v.phase === 'playing') return v.isChooser ? 'watch' : 'guess';
      return v.phase;
    },
    build: function (key, v) {
      if (key === 'choose' || key === 'wait') return chooseHtml(v);
      if (key === 'watch' || key === 'guess') return playHtml(v);
      if (key === 'roundRecap') return roundRecapHtml(v);
      return gameOverHtml(v);
    },
    bind: function (key, v) {
      P.lastEventId = v.event ? v.event.id : 0;
      P.lastMessageId = v.message ? v.message.id : 0;
      if (key === 'roundRecap') { $('#next').onclick = function () { api.act({ t: 'next' }); }; return; }
      if (key === 'gameOver') {
        $('#replay').onclick = function () { api.act({ t: 'replay' }); };
        $('#quit').onclick = api.leave;
        return;
      }
      $('#p-quit').onclick = api.leave;
      api.onTap($('#p-panel'), onAct);
      bindKeys();
      if (key === 'choose') {
        var input = $('#p-word');
        input.addEventListener('keydown', function (e) {
          if (e.key === 'Enter') { e.preventDefault(); api.act({ t: 'setWord', text: input.value }); }
        });
        setTimeout(function () { try { input.focus(); } catch (e) {} }, 40);
      }
      if (key === 'guess' && v.config.allowWord) {
        var form = $('#p-form');
        if (form) form.addEventListener('submit', function (e) {
          e.preventDefault();
          var t = $('#p-try');
          if (t.value.trim()) { api.act({ t: 'word', text: t.value }); t.value = ''; }
        });
      }
    },
    update: function (key, v) {
      P.view = v;
      if (key === 'watch' || key === 'guess') updatePlay(v);
      if (key === 'choose' && v.drawn) {
        var input = $('#p-word');
        if (input && input.value !== v.drawn && input.dataset.drawn !== v.drawn) {
          input.dataset.drawn = v.drawn;
          input.value = v.drawn;
        }
        if (v.message && v.message.id !== P.lastMessageId) {
          P.lastMessageId = v.message.id;
          $('#p-msg').textContent = v.message.text || '';
        }
      } else if (key === 'choose' && v.message && v.message.id !== P.lastMessageId) {
        P.lastMessageId = v.message.id;
        $('#p-msg').textContent = v.message.text || '';
      }
    }
  });
})(typeof window !== 'undefined' ? window : globalThis);
