/* Plateau — Mot de Passe coop.
 * Tout ce qui est propre au jeu ; le salon, le réseau et le lobby vivent
 * dans common/room.js.
 */
(function (global) {
  'use strict';

  var Rules = global.Rules;
  var Engine = global.Engine;
  var B = { lastEventId: 0, lastMessageId: 0, turnSig: '', exSig: null, clueSig: '', timeBase: null };
  var api;

  function $(s) { return document.querySelector(s); }
  function esc(s) { return api.esc(s); }

  // ------------------------------------------------------------- plateau
  function boardHtml() {
    return '<div class="hud">' +
        '<span class="badge gold" id="g-round">Manche 1/2</span>' +
        '<div class="pips" id="g-pips"></div>' +
        '<span class="badge" id="g-score">0 pt</span>' +
      '</div>' +
      '<section class="panel" id="g-panel">' +
        '<div class="stage">' +
          '<div class="role-line" id="g-role"></div>' +
          '<div class="wordbox">' +
            '<div class="kicker" id="g-kicker"></div>' +
            '<div class="word" id="g-word">···</div>' +
            '<div class="sub" id="g-sub"></div>' +
          '</div>' +
          api.timerHtml('g-timer') +
          '<div class="hearts" id="g-hearts"></div>' +
          '<ul class="exchange" id="g-exchange"></ul>' +
          '<form class="entry" id="g-form" autocomplete="off">' +
            '<input id="g-input" type="text" maxlength="30" autocomplete="off" autocorrect="off" spellcheck="false" placeholder="…">' +
            '<button class="btn btn-primary" id="g-send" type="submit">Envoyer</button>' +
          '</form>' +
          '<div class="entry-msg" id="g-msg"></div>' +
          '<div class="bottombar">' +
            '<div id="g-letters"></div>' +
            '<button class="linky" id="g-pass">Passer ce mot</button>' +
          '</div>' +
        '</div>' +
      '</section>' +
      '<div class="center"><button class="linky" id="g-quit">quitter la partie</button></div>';
  }

  function bindBoard(view) {
    B.turnSig = ''; B.exSig = null; B.clueSig = '';
    $('#g-form').addEventListener('submit', onSubmitEntry);
    $('#g-pass').onclick = function () { api.act({ t: 'pass' }); };
    $('#g-quit').onclick = api.leave;
    api.onFrame(function () {
      var v = B.view, tb = B.timeBase;
      if (!v || !tb) return;
      var left = tb.running ? Math.max(0, tb.left - (api.now() - tb.at)) : tb.left;
      api.renderTimer($('#g-timer'), left, v.totalTimeMs, !v.timerStarted);
    });
  }

  function onSubmitEntry(e) {
    e.preventDefault();
    var v = B.view;
    if (!v || v.paused) return;
    var input = $('#g-input');
    var text = input.value.trim();
    if (!text) return;

    if (v.isGiver) {
      var res = Rules.checkClue(text, v.word, {
        singleWord: v.config.singleWordClue,
        previousClues: v.clues
      });
      if (!res.ok) { showMsg(res.message, true); shake($('#g-panel')); input.select(); return; }
      api.act({ t: 'clue', text: text });
    } else {
      api.act({ t: 'guess', text: text });
    }
    input.value = '';
    showMsg('', false);
  }

  function showMsg(text, isError) {
    var m = $('#g-msg');
    if (!m) return;
    m.textContent = text || '';
    m.className = 'entry-msg' + (isError ? '' : ' info');
  }

  function statusIcon(s) {
    return s === 'ok' ? '✅' : s === 'pass' ? '⏭️' : s === 'timeout' ? '⏱️' : '❌';
  }

  function otherNameFrom(v) {
    return v.names[v.yourRole === 'host' ? 'guest' : 'host'] || 'l’autre joueur';
  }

  function updateBoard(v) {
    B.view = v;

    api.setText($('#g-round'), 'Manche ' + v.round + '/' + v.roundCount);
    var pts = v.scores[1] + v.scores[2];
    api.setText($('#g-score'), pts + ' pt' + (pts > 1 ? 's' : ''));

    var log = v.log[v.round] || [];
    var pips = '';
    for (var i = 0; i < v.wordTotal; i++) {
      var cls = 'pip';
      if (i < log.length) cls += log[i].status === 'ok' ? ' ok' : ' miss';
      else if (i === v.wordIndex) cls += ' now';
      pips += '<span class="' + cls + '"></span>';
    }
    api.setHtml($('#g-pips'), pips);

    api.setHtml($('#g-role'), v.isGiver
      ? 'Tu fais deviner à <b>' + esc(otherNameFrom(v)) + '</b>'
      : '<b>' + esc(v.names[v.giver]) + '</b> te fait deviner');

    // mot (donneur) / indice en cours (devineur) / révélation
    var wordEl = $('#g-word'), subEl = $('#g-sub'), kickEl = $('#g-kicker');
    var lastClue = v.clues.length ? v.clues[v.clues.length - 1] : null;
    wordEl.className = 'word';
    var position = 'Mot ' + (v.wordIndex + 1) + ' sur ' + v.wordTotal;

    if (v.paused && v.revealWord) {
      kickEl.textContent = v.event && v.event.type === 'ok' ? 'Trouvé' : 'Le mot était';
      wordEl.textContent = v.revealWord;
      wordEl.classList.add(v.event && v.event.type === 'ok' ? 'reveal-ok' : 'reveal-bad');
      subEl.textContent = v.event && v.event.type === 'ok' ? 'Dans la boîte !'
        : v.event && v.event.type === 'pass' ? 'Mot passé'
        : v.event && v.event.type === 'timeout' ? 'Temps écoulé' : 'Raté';
    } else if (v.isGiver) {
      kickEl.textContent = 'Mot à faire deviner';
      wordEl.textContent = v.word || '···';
      subEl.textContent = position + (v.config.singleWordClue ? ' — fais-le deviner en un mot' : '');
    } else if (lastClue) {
      kickEl.textContent = 'Indice' + (v.clues.length > 1 ? ' n°' + v.clues.length : '');
      wordEl.textContent = lastClue;
      wordEl.classList.add('clue-big');
      subEl.textContent = position;
    } else {
      kickEl.textContent = 'En attente de l’indice';
      wordEl.textContent = '· · ·';
      wordEl.classList.add('secret');
      subEl.textContent = position;
    }

    var clueSig = v.round + '|' + v.wordIndex + '|' + v.clues.length;
    if (!v.isGiver && !v.paused && lastClue && clueSig !== B.clueSig) {
      wordEl.classList.remove('pop');
      void wordEl.offsetWidth;
      wordEl.classList.add('pop');
    }
    B.clueSig = clueSig;

    // chrono
    B.timeBase = { left: v.timeLeftMs, at: api.now(), running: !!v.timerRunning };
    var t = $('#g-timer');
    t.classList.toggle('frozen', v.timerStarted && !v.timerRunning);
    api.renderTimer(t, v.timeLeftMs, v.totalTimeMs, !v.timerStarted);

    // essais restants
    var hearts = '';
    for (var k = 0; k < v.maxAttempts; k++) {
      hearts += '<span class="h' + (k < v.attemptsLeft ? '' : ' used') + '"></span>';
    }
    api.setHtml($('#g-hearts'), hearts + '<span class="hearts-cnt">' + api.plural(v.attemptsLeft, 'essai') + '</span>');

    // échanges
    var items = '';
    var n = Math.max(v.clues.length, v.guesses.length);
    var current = (!v.isGiver && !v.paused && v.clues.length) ? v.clues.length - 1 : -1;
    for (var j = 0; j < n; j++) {
      if (v.clues[j] != null) {
        items += '<li class="clue' + (j === current ? ' current' : '') + '">' +
          '<span class="who">indice</span><span class="bubble">' + esc(v.clues[j]) + '</span></li>';
      }
      if (v.guesses[j] != null) {
        var right = j === v.guesses.length - 1 && v.paused && v.event && v.event.type === 'ok';
        items += '<li class="guess ' + (right ? 'right' : 'wrong') + '"><span class="who">essai</span>' +
          '<span class="bubble">' + esc(v.guesses[j]) + '</span></li>';
      }
    }
    var exSig = v.clues.join('') + '' + v.guesses.join('') +
      '' + (v.paused && v.event ? v.event.type : '') + '' + current;
    if (exSig !== B.exSig) {
      B.exSig = exSig;
      var ex = $('#g-exchange');
      ex.innerHTML = items || '<li class="clue"><span class="who">—</span><span class="bubble" style="opacity:.5">En attente du premier indice…</span></li>';
      ex.scrollTop = ex.scrollHeight;
    }

    // saisie
    var canType = !v.paused && ((v.isGiver && v.turn === 'giver') || (!v.isGiver && v.turn === 'guesser'));
    var input = $('#g-input'), send = $('#g-send'), form = $('#g-form');
    input.disabled = !canType;
    send.disabled = !canType;
    form.classList.toggle('locked', !canType);
    if (v.isGiver) {
      input.placeholder = canType
        ? (v.config.singleWordClue ? 'Ton indice (un seul mot)' : 'Ton indice')
        : (v.paused ? '…' : 'Au tour de ' + otherNameFrom(v) + '…');
      send.textContent = 'Indice';
    } else {
      input.placeholder = canType ? 'Ta proposition' : (v.paused ? '…' : 'En attente de l’indice…');
      send.textContent = 'Proposer';
    }

    var pass = $('#g-pass');
    pass.style.display = v.isGiver ? '' : 'none';
    pass.disabled = v.paused;

    // nombre de lettres
    var letters = '';
    if (v.hint && !v.paused) {
      var total = 0, groups = '';
      v.hint.forEach(function (g) {
        total += g.len;
        var slots = '';
        for (var q = 0; q < g.len; q++) slots += '<i></i>';
        groups += '<span class="grp">' + slots + '</span>';
      });
      letters = '<div class="lettersbar">' +
        '<span class="lb-num">' + total + '</span>' +
        '<span class="lb-cap">' + (total > 1 ? 'lettres' : 'lettre') +
          (v.hint.length > 1 ? '<br><small>' + v.hint.length + ' mots</small>' : '') + '</span>' +
        '<span class="lb-groups">' + groups + '</span>' +
        '</div>';
    }
    api.setHtml($('#g-letters'), letters);

    if (v.message && v.message.id !== B.lastMessageId) {
      B.lastMessageId = v.message.id;
      showMsg(v.message.text, true);
    } else if (!v.message) {
      if (!canType && !v.paused) {
        showMsg(v.isGiver ? otherNameFrom(v) + ' réfléchit…' : 'Lis bien l’indice…', false);
      } else if (canType) {
        var cur = $('#g-msg');
        if (cur && cur.classList.contains('info')) showMsg('', false);
      }
    }

    var sig = [v.phase, v.round, v.wordIndex, v.turn, v.paused ? 1 : 0].join('|');
    if (sig !== B.turnSig) {
      B.turnSig = sig;
      if (canType) setTimeout(function () { try { input.focus(); } catch (e) {} }, 30);
    }

    if (v.event && v.event.id !== B.lastEventId) {
      B.lastEventId = v.event.id;
      playEvent(v.event);
    }
  }

  // ---------------------------------------------------------- animations
  function playEvent(ev) {
    var panel = $('#g-panel');
    if (!panel) return;
    if (ev.type === 'ok') {
      panel.classList.remove('flash-good');
      void panel.offsetWidth;
      panel.classList.add('flash-good');
      confetti(panel);
      toast(panel, 'BRAVO !', 'ok');
    } else if (ev.type === 'wrong') { shake(panel); }
    else if (ev.type === 'fail') { shake(panel); toast(panel, 'RATÉ', 'bad'); }
    else if (ev.type === 'timeout') { shake(panel); toast(panel, 'TEMPS !', 'bad'); }
    else if (ev.type === 'pass') { toast(panel, 'PASSÉ', 'bad'); }
  }

  function shake(panel) {
    if (!panel) return;
    panel.classList.remove('flash-bad');
    void panel.offsetWidth;
    panel.classList.add('flash-bad');
  }

  function confetti(panel) {
    var colors = ['#f5c451', '#3fdcc7', '#ff5f8f', '#ffe6a7', '#37e08a'];
    var wrap = document.createElement('div');
    wrap.className = 'confetti';
    for (var i = 0; i < 16; i++) {
      var s = document.createElement('i');
      s.style.left = (5 + Math.random() * 90) + '%';
      s.style.background = colors[i % colors.length];
      s.style.animationDelay = (Math.random() * 0.35) + 's';
      s.style.animationDuration = (1.1 + Math.random() * 0.8) + 's';
      wrap.appendChild(s);
    }
    panel.appendChild(wrap);
    setTimeout(function () { wrap.remove(); }, 2200);
  }

  function toast(panel, text, kind) {
    var d = document.createElement('div');
    d.className = 'toast-big ' + kind;
    d.textContent = text;
    panel.appendChild(d);
    setTimeout(function () { d.remove(); }, 1300);
  }

  // -------------------------------------------------------------- récaps
  function recapList(entries, title) {
    var head = title ? '<div class="recap-head">' + esc(title) + '</div>' : '';
    if (!entries.length) return head + '<p class="muted small center">Aucun mot.</p>';
    return head + '<ul class="recap-list">' + entries.map(function (e) {
      var meta = [e.clues && e.clues.length ? 'indices : ' + e.clues.join(', ') : 'aucun indice'];
      if (e.status !== 'ok' && e.guesses && e.guesses.length) meta.push('essais : ' + e.guesses.join(', '));
      return '<li class="' + (e.status === 'ok' ? 'ok' : 'miss') + '">' +
        '<span class="mark">' + statusIcon(e.status) + '</span>' +
        '<span class="w">' + esc(e.word) + '</span>' +
        '<span class="meta">' + esc(meta.join(' · ')) + '</span>' +
        '</li>';
    }).join('') + '</ul>';
  }

  function roundRecapHtml(v) {
    var last = v.round >= v.roundCount;
    var nextGiverIsMe = !last ? (v.giver !== v.yourRole) : false;
    return api.logoBlock(true) +
      '<section class="panel">' +
        '<h2 class="section-title">Manche ' + v.round + ' — récapitulatif</h2>' +
        '<div class="score-big"><div class="n">' + v.scores[v.round] + '<span class="over">/' + v.wordTotal + '</span></div>' +
        '<div class="lbl">mots trouvés</div></div>' +
        recapList(v.log[v.round] || []) +
        '<div class="actions" style="margin-top:18px">' +
          '<button class="btn btn-primary btn-block btn-lg" id="next">' +
            (last ? 'Voir le résultat final'
                  : 'Manche ' + (v.round + 1) + ' — ' + (nextGiverIsMe ? 'à toi de faire deviner' : 'à toi de deviner')) +
          '</button>' +
        '</div>' +
      '</section>' + api.footer();
  }

  function gameOverHtml(v) {
    var msg = v.total === v.maxTotal ? 'Sans faute. Respect.'
      : v.total >= v.maxTotal * 0.7 ? 'Belle équipe !'
      : v.total >= v.maxTotal * 0.4 ? 'Pas mal — on remet ça ?'
      : 'La prochaine sera la bonne.';
    return api.logoBlock(true) +
      '<section class="panel">' +
        '<h2 class="section-title">Résultat de l’équipe</h2>' +
        '<div class="score-big"><div class="n">' + v.total + '<span class="over">/' + v.maxTotal + '</span></div>' +
        '<div class="lbl">mots trouvés · ' + esc(msg) + '</div></div>' +
        '<div class="round-tabs">' +
          '<div class="rt"><b>' + v.scores[1] + '/' + v.config.wordCount + '</b><span>Manche 1 · ' + esc(v.names.host) + ' fait deviner</span></div>' +
          '<div class="rt"><b>' + v.scores[2] + '/' + v.config.wordCount + '</b><span>Manche 2 · ' + esc(v.names.guest) + ' fait deviner</span></div>' +
        '</div>' +
        recapList(v.log[1] || [], 'Manche 1 — ' + v.names.host + ' fait deviner') +
        recapList(v.log[2] || [], 'Manche 2 — ' + v.names.guest + ' fait deviner') +
      '</section>' +
      '<section class="panel" style="padding:18px">' +
        '<div class="actions" style="margin:0">' +
          '<button class="btn btn-ghost" id="quit">Quitter</button>' +
          '<button class="btn btn-primary btn-lg" id="replay">Rejouer (mêmes réglages)</button>' +
        '</div>' +
      '</section>' + api.footer();
  }

  // ------------------------------------------------------------ définition
  api = global.Room.api;

  global.Room.init({
    id: 'mot-de-passe',
    title: 'Mot de Passe',
    tagline: 'version coopérative · 2 joueurs',
    howto: [
      '<li>Vous jouez <b>ensemble</b>, pas l’un contre l’autre.</li>',
      '<li><b>Manche 1</b> : le joueur 1 fait deviner les mots au joueur 2. <b>Manche 2</b> : on inverse.</li>',
      '<li>L’indice est <b>un seul mot</b>. Interdit d’utiliser le mot à faire deviner ni une de ses formes (pluriel, féminin, accents…).</li>',
      '<li>Le chrono est <b>global à la manche</b> (5 mots × 18 s = 1 min 30) : il démarre au premier indice et court jusqu’au dernier mot. Le temps gagné sur un mot facile profite au suivant.</li>',
      '<li>Le score final, c’est le nombre total de mots trouvés par le duo.</li>'
    ],
    config: {
      defaults: Engine.DEFAULT_CONFIG,
      sanitize: Engine.sanitizeConfig,
      fields: [
        { key: 'wordCount', id: 'c-words', label: 'Mots par manche', min: 1, max: 20 },
        { key: 'timePerWord', id: 'c-time', label: 'Temps par mot', min: 5, max: 120, suffix: 'secondes, cumulées' },
        { key: 'attempts', id: 'c-tries', label: 'Essais par mot', min: 1, max: 10 },
        { key: 'showLength', id: 'c-len', type: 'toggle', label: 'Afficher le nombre de lettres au devineur' },
        { key: 'singleWordClue', id: 'c-single', type: 'toggle', label: 'Indice en un seul mot' }
      ],
      note: function (c) {
        return 'Chrono <b>global</b> à la manche : ' + c.wordCount + ' × ' + c.timePerWord + ' s = <b>' +
          api.fmtDuration(c.wordCount * c.timePerWord) + '</b> pour faire deviner les ' + c.wordCount + ' mots.';
      },
      summary: function (c) {
        return [
          { value: c.wordCount, label: 'mots / manche' },
          { value: api.fmtDuration(c.wordCount * c.timePerWord), label: 'par manche' },
          { value: c.attempts, label: 'essais / mot' },
          { value: c.showLength ? 'Oui' : 'Non', label: 'nb de lettres' }
        ];
      }
    },
    createEngine: function (config, names, onUpdate) {
      return Engine.createEngine({ config: config, names: names, words: global.WORDS, onUpdate: onUpdate });
    },
    screenKey: function (v) { return v.phase; },
    build: function (key, v) {
      if (key === 'playing') return boardHtml();
      if (key === 'roundRecap') return roundRecapHtml(v);
      return gameOverHtml(v);
    },
    bind: function (key, v) {
      if (key === 'playing') return bindBoard(v);
      if (key === 'roundRecap') { $('#next').onclick = function () { api.act({ t: 'next' }); }; return; }
      $('#replay').onclick = function () { api.act({ t: 'replay' }); };
      $('#quit').onclick = api.leave;
    },
    update: function (key, v) { if (key === 'playing') updateBoard(v); }
  });
})(typeof window !== 'undefined' ? window : globalThis);
