/* Désamorçage — interfaces.
 * Deux écrans radicalement différents : la bombe pour le démineur,
 * le manuel pour l'expert. Aucun des deux ne voit celui de l'autre.
 */
(function (global) {
  'use strict';

  var Engine = global.BombEngine;
  var Manual = global.Manual;
  var api;

  var D = {
    view: null,
    open: null,        // index du module ouvert
    section: 'reperes',
    bodySig: '',
    manSig: '',
    timeBase: null,
    lastEventId: 0,
    holding: null,
    morseCache: {}
  };

  function $(s) { return document.querySelector(s); }
  function $$(s) { return Array.prototype.slice.call(document.querySelectorAll(s)); }
  function esc(s) { return api.esc(s); }
  function act(i, a) { api.act({ t: 'module', i: i, a: a }); }

  // ============================================================ ÉCRAN BOMBE
  function defuserHtml() {
    return '<div class="hud bomb-hud">' +
        '<div class="strikes" id="b-strikes"></div>' +
        api.timerHtml('b-timer') +
        '<div class="progress-badge" id="b-progress"></div>' +
      '</div>' +
      '<section class="panel casing" id="b-panel">' +
        '<div class="widgets" id="b-widgets"></div>' +
        '<div id="b-body"></div>' +
      '</section>' +
      '<div class="center"><button class="linky" id="b-quit">quitter la partie</button></div>';
  }

  function widgetsHtml(v) {
    var b = v.bomb;
    if (!b) return '';
    var cells = '';
    for (var i = 0; i < 5; i++) cells += '<i class="' + (i < b.batteries ? 'on' : '') + '"></i>';
    return '<div class="wg"><span class="wg-lab">Série</span><b class="serial">' + esc(b.serial) + '</b></div>' +
      '<div class="wg"><span class="wg-lab">Piles</span><span class="batts">' + cells + '</span></div>' +
      '<div class="wg"><span class="wg-lab">Voyants</span><span class="inds">' +
        b.indicators.map(function (ind) {
          return '<span class="ind' + (ind.lit ? ' lit' : '') + '">' + ind.code + '</span>';
        }).join('') +
      '</span></div>';
  }

  function tilesHtml(v) {
    return '<div class="tiles">' + v.modules.map(function (m, i) {
      return '<button class="tile' + (m.solved ? ' done' : '') + '" data-i="' + i + '">' +
        '<span class="t-emoji">' + m.emoji + '</span>' +
        '<span class="t-name">' + esc(m.name) + '</span>' +
        '<span class="t-state">' + (m.solved ? 'désamorcé' : 'à faire') + '</span>' +
        '</button>';
    }).join('') + '</div>' +
    '<p class="casing-hint">Décris ce que tu vois à voix haute. L’autre a le manuel.</p>';
  }

  function moduleHtml(v, i) {
    var m = v.modules[i];
    var r = RENDER[m.id];
    return '<div class="mod-head">' +
        '<button class="linky" id="b-back">◀ boîtier</button>' +
        '<span class="mod-title">' + m.emoji + ' ' + esc(m.name) + '</span>' +
        '<span class="mod-flag">' + (m.solved ? '✅' : '') + '</span>' +
      '</div>' +
      '<div class="mod-body' + (m.solved ? ' solved' : '') + '">' +
        (m.solved ? '<div class="mod-done">Module désamorcé.</div>' : r.html(m.state, v)) +
      '</div>';
  }

  // ------------------------------------------------------------- rendus modules
  var RENDER = {
    fils: {
      html: function (st) {
        return '<div class="mod-fils"><div class="wires">' + st.wires.map(function (c, k) {
          var cut = st.cut.indexOf(k) !== -1;
          return '<button class="wire' + (cut ? ' cut' : '') + '" data-k="' + k + '"' + (cut ? ' disabled' : '') + '>' +
            '<span class="wn">' + (k + 1) + '</span>' +
            '<span class="wbar c-' + c + '"></span>' +
            '<span class="wname">' + c + '</span>' +
            '</button>';
        }).join('') + '</div>' +
        '<p class="mod-hint">Clique sur un fil pour le couper.</p></div>';
      },
      bind: function (i) {
        $$('.wire').forEach(function (el) {
          el.onclick = function () { act(i, { type: 'cut', i: parseInt(el.dataset.k, 10) }); };
        });
      }
    },

    bouton: {
      html: function (st) {
        return '<div class="mod-bouton">' +
          '<div class="band' + (st.band ? ' on band-' + st.band : '') + '"></div>' +
          '<button class="bigbutton c-' + st.color + (st.holding ? ' held' : '') + '" id="bb">' +
            '<span>' + esc(st.label) + '</span></button>' +
          '<p class="mod-hint">Appuie brièvement… ou maintiens et relâche au bon moment.</p></div>';
      },
      bind: function (i) {
        var b = $('#bb');
        if (!b) return;
        function press(e) {
          e.preventDefault();
          if (D.holding != null) return;
          D.holding = i;
          act(i, { type: 'down' });
        }
        b.addEventListener('pointerdown', press);
        b.addEventListener('keydown', function (e) { if (e.key === ' ' || e.key === 'Enter') press(e); });
        b.addEventListener('keyup', function (e) { if (e.key === ' ' || e.key === 'Enter') releaseHold(); });
      }
    },

    sequence: {
      html: function (st) {
        var pads = global.Modules.tables.SEQ_COLORS.map(function (c) {
          return '<button class="pad p-' + c + '" data-c="' + c + '"><span>' + c + '</span></button>';
        }).join('');
        return '<div class="mod-seq"><div class="pads">' + pads + '</div>' +
          '<div class="seq-info">Séquence de <b>' + st.seq.length + '</b> flashs · ' +
          '<b>' + st.pos + '/' + st.seq.length + '</b> validés</div>' +
          '<p class="mod-hint">Regarde la boucle, annonce les couleurs, appuie sur celles que l’expert te dicte.</p></div>';
      },
      bind: function (i) {
        $$('.pad').forEach(function (el) {
          el.onclick = function () { act(i, { type: 'press', color: el.dataset.c }); };
        });
      },
      frame: function (st) {
        var step = 620, gap = 1500;
        var total = st.seq.length * step + gap;
        var t = Date.now() % total;
        var idx = Math.floor(t / step);
        var lit = (idx < st.seq.length && (t % step) < 430) ? st.seq[idx] : null;
        $$('.pad').forEach(function (el) {
          var on = el.dataset.c === lit;
          if (el.__lit !== on) { el.__lit = on; el.classList.toggle('lit', on); }
        });
      }
    },

    motdepasse: {
      html: function (st) {
        var wheels = st.cols.map(function (col, c) {
          return '<div class="wheel">' +
            '<button class="wbtn" data-c="' + c + '" data-d="-1">▲</button>' +
            '<div class="wletter">' + col[st.pos[c]] + '</div>' +
            '<button class="wbtn" data-c="' + c + '" data-d="1">▼</button>' +
            '</div>';
        }).join('');
        return '<div class="mod-pass"><div class="wheels">' + wheels + '</div>' +
          '<button class="btn btn-primary" id="pw-ok">Valider</button>' +
          '<p class="mod-hint">Fais défiler une molette pour lire ses six lettres.</p></div>';
      },
      bind: function (i) {
        $$('.wbtn').forEach(function (el) {
          el.onclick = function () {
            act(i, { type: 'cycle', col: parseInt(el.dataset.c, 10), dir: parseInt(el.dataset.d, 10) });
          };
        });
        var ok = $('#pw-ok');
        if (ok) ok.onclick = function () { act(i, { type: 'submit' }); };
      }
    },

    morse: {
      html: function (st) {
        return '<div class="mod-morse">' +
          '<div class="led" id="morse-led"></div>' +
          '<div class="freq-row">' +
            '<button class="wbtn" data-d="-1">◀</button>' +
            '<div class="freq"><b>' + st.freqs[st.index] + '</b> MHz</div>' +
            '<button class="wbtn" data-d="1">▶</button>' +
          '</div>' +
          '<button class="btn btn-primary" id="morse-send">Transmettre</button>' +
          '<p class="mod-hint">Court = point, long = trait, pause = lettre suivante.</p></div>';
      },
      bind: function (i) {
        $$('.mod-morse .wbtn').forEach(function (el) {
          el.onclick = function () { act(i, { type: 'freq', dir: parseInt(el.dataset.d, 10) }); };
        });
        var s = $('#morse-send');
        if (s) s.onclick = function () { act(i, { type: 'send' }); };
      },
      frame: function (st) {
        var led = $('#morse-led');
        if (!led) return;
        var tl = D.morseCache[st.signal] || (D.morseCache[st.signal] = morseTimeline(st.signal));
        var t = Date.now() % tl.total, acc = 0, on = false;
        for (var k = 0; k < tl.seg.length; k++) {
          acc += tl.seg[k].d;
          if (t < acc) { on = tl.seg[k].on; break; }
        }
        if (led.__on !== on) { led.__on = on; led.classList.toggle('on', on); }
      }
    },

    symboles: {
      html: function (st) {
        return '<div class="mod-sym"><div class="symkeys">' + st.keys.map(function (s) {
          var done = st.pressed.indexOf(s) !== -1;
          return '<button class="symkey' + (done ? ' done' : '') + '" data-s="' + esc(s) + '">' + s + '</button>';
        }).join('') + '</div>' +
        '<div class="seq-info"><b>' + st.pressed.length + '/4</b> dans l’ordre</div>' +
        '<p class="mod-hint">Une seule colonne du manuel contient ces quatre symboles.</p></div>';
      },
      bind: function (i) {
        $$('.symkey').forEach(function (el) {
          el.onclick = function () { act(i, { type: 'key', sym: el.dataset.s }); };
        });
      }
    }
  };

  /** Le relâchement est écouté au niveau du document : le bouton peut être
   *  reconstruit pendant la pression sans qu'on perde le « up ». */
  function releaseHold() {
    if (D.holding == null) return;
    var i = D.holding;
    D.holding = null;
    act(i, { type: 'up' });
  }
  document.addEventListener('pointerup', releaseHold);
  document.addEventListener('pointercancel', releaseHold);

  function morseTimeline(signal) {
    var seg = [], total = 0;
    function push(on, d) { seg.push({ on: on, d: d }); total += d; }
    signal.split(' ').forEach(function (letter, li, arr) {
      letter.split('').forEach(function (sym, si) {
        push(true, sym === '.' ? 280 : 760);
        push(false, si === letter.length - 1 ? 0 : 240);
      });
      push(false, li === arr.length - 1 ? 2200 : 780);
    });
    return { seg: seg.filter(function (s) { return s.d > 0; }), total: total };
  }

  // ---------------------------------------------------------- mise à jour bombe
  function updateDefuser(v) {
    D.view = v;
    api.setHtml($('#b-widgets'), widgetsHtml(v));
    api.setHtml($('#b-strikes'), strikesHtml(v));
    api.setHtml($('#b-progress'), '<b>' + v.solvedCount + '/' + v.moduleCount + '</b>' +
      '<span>' + (v.moduleCount > 1 ? 'modules' : 'module') + '</span>');

    var open = D.open;
    if (open != null && !v.modules[open]) open = D.open = null;
    var sig = open == null
      ? 'grid:' + v.modules.map(function (m) { return m.solved ? 1 : 0; }).join('')
      : 'mod:' + open + ':' + JSON.stringify(v.modules[open]);

    if (sig !== D.bodySig) {
      D.bodySig = sig;
      var body = $('#b-body');
      if (open == null) {
        body.innerHTML = tilesHtml(v);
        $$('.tile').forEach(function (el) {
          el.onclick = function () { D.open = parseInt(el.dataset.i, 10); D.bodySig = ''; updateDefuser(D.view); };
        });
      } else {
        body.innerHTML = moduleHtml(v, open);
        $('#b-back').onclick = function () { D.open = null; D.bodySig = ''; updateDefuser(D.view); };
        var m = v.modules[open];
        if (!m.solved && RENDER[m.id].bind) RENDER[m.id].bind(open);
      }
    }
    syncClock(v);
    fireEvent(v);
  }

  function strikesHtml(v) {
    var out = '';
    for (var i = 0; i < v.maxStrikes; i++) {
      out += '<span class="strike' + (i < v.strikes ? ' on' : '') + '">✕</span>';
    }
    return out + '<span class="strike-lab">erreur' + (v.maxStrikes > 1 ? 's' : '') + '</span>';
  }

  // =========================================================== ÉCRAN MANUEL
  function expertHtml(v) {
    return '<div class="hud bomb-hud">' +
        '<div class="strikes" id="b-strikes"></div>' +
        api.timerHtml('b-timer') +
        '<div class="progress-badge" id="b-progress"></div>' +
      '</div>' +
      '<section class="panel manual">' +
        '<div class="man-top">' +
          '<b>Manuel de désamorçage</b>' +
          '<span class="muted small">' + esc(v.names[v.defuser]) + ' a la bombe — pas toi.</span>' +
        '</div>' +
        '<nav class="man-nav" id="man-nav">' + Manual.sections.map(function (s) {
          return '<button data-s="' + s.id + '">' + s.emoji + ' ' + esc(s.title) + '</button>';
        }).join('') + '</nav>' +
        '<div class="man-body" id="man-body"></div>' +
      '</section>' +
      '<div class="center"><button class="linky" id="b-quit">quitter la partie</button></div>';
  }

  function updateExpert(v) {
    D.view = v;
    api.setHtml($('#b-strikes'), strikesHtml(v));
    api.setHtml($('#b-progress'), '<b>' + v.solvedCount + '/' + v.moduleCount + '</b>' +
      '<span>' + (v.moduleCount > 1 ? 'modules' : 'module') + '</span>');

    var sig = D.section + ':' + v.strikes;
    if (sig !== D.manSig) {
      D.manSig = sig;
      $('#man-body').innerHTML = Manual.byId(D.section).html;
      $$('#man-nav button').forEach(function (b) {
        b.classList.toggle('active', b.dataset.s === D.section);
        b.onclick = function () { D.section = b.dataset.s; D.manSig = ''; updateExpert(D.view); };
      });
      // la table de la séquence dépend du nombre d'erreurs : on surligne la bonne ligne
      $$('.seq-table tr[data-strikes]').forEach(function (tr) {
        tr.classList.toggle('active', parseInt(tr.dataset.strikes, 10) === Math.min(v.strikes, 2));
      });
    }
    syncClock(v);
    fireEvent(v);
  }

  // ------------------------------------------------------------------ commun
  function syncClock(v) {
    D.timeBase = { left: v.timeLeftMs, at: api.now(), running: v.phase === 'playing', rate: v.rate || 1 };
    var t = $('#b-timer');
    if (t) {
      t.classList.toggle('rush', (v.rate || 1) > 1);
      api.renderTimer(t, v.timeLeftMs, v.totalTimeMs, false);
    }
  }

  function bindCommon() {
    var q = $('#b-quit');
    if (q) q.onclick = api.leave;
    api.onFrame(function () {
      var v = D.view, tb = D.timeBase;
      if (!v || !tb) return;
      var left = tb.running
        ? Math.max(0, tb.left - (api.now() - tb.at) * tb.rate)
        : tb.left;
      api.renderTimer($('#b-timer'), left, v.totalTimeMs, false);
      if (v.isDefuser && D.open != null && v.modules) {
        var m = v.modules[D.open];
        if (m && !m.solved && RENDER[m.id].frame) RENDER[m.id].frame(m.state);
      }
    });
  }

  function fireEvent(v) {
    if (!v.event || v.event.id === D.lastEventId) return;
    D.lastEventId = v.event.id;
    var panel = $('#b-panel') || $('.panel');
    if (!panel) return;
    if (v.event.type === 'strike') {
      flash(panel, 'flash-bad');
      bigToast('ERREUR', 'bad');
    } else if (v.event.type === 'solved') {
      flash(panel, 'flash-good');
      bigToast('MODULE OK', 'ok');
    }
  }

  function flash(el, cls) {
    el.classList.remove(cls);
    void el.offsetWidth;
    el.classList.add(cls);
    setTimeout(function () { el.classList.remove(cls); }, 1000);
  }

  function bigToast(text, kind) {
    var host = $('#b-panel') || $('.panel');
    if (!host) return;
    var d = document.createElement('div');
    d.className = 'toast-big ' + kind;
    d.textContent = text;
    host.appendChild(d);
    setTimeout(function () { d.remove(); }, 1200);
  }

  // ========================================================== ÉCRAN FINAL
  function overHtml(v) {
    var won = v.outcome === 'won';
    var used = v.totalTimeMs - v.timeLeftMs;
    var why = won ? 'Tous les modules désamorcés.'
      : v.reason === 'strikes' ? 'Trop d’erreurs — la bombe a sauté.'
      : 'Le chrono est arrivé à zéro.';
    return '<div class="logo"><h1 class="sm ' + (won ? 'win' : 'lose') + '">' +
        (won ? 'Désamorcée' : 'Boum') + '</h1></div>' +
      '<section class="panel">' +
        '<div class="result-big ' + (won ? 'won' : 'lost') + '">' + (won ? '🎉' : '💥') + '</div>' +
        '<p class="center" style="margin:0 0 6px">' + esc(why) + '</p>' +
        '<div class="settings-recap">' +
          '<div class="item"><b>' + v.solvedCount + '/' + v.moduleCount + '</b><span>modules</span></div>' +
          '<div class="item"><b>' + api.fmtClock(won ? v.timeLeftMs : used) + '</b><span>' +
            (won ? 'restant' : 'écoulé') + '</span></div>' +
          '<div class="item"><b>' + v.strikes + '/' + v.maxStrikes + '</b><span>erreurs</span></div>' +
        '</div>' +
        '<div class="recap-head">Débriefing</div>' +
        '<ul class="recap-list">' + (v.recap || []).map(function (r) {
          return '<li class="' + (r.solved ? 'ok' : 'miss') + '">' +
            '<span class="mark">' + (r.solved ? '✅' : '❌') + '</span>' +
            '<span class="w">' + r.emoji + ' ' + esc(r.name) + '</span>' +
            '<span class="meta">' + (r.answer ? 'il fallait ' + esc(r.answer) : '') + '</span>' +
            '</li>';
        }).join('') + '</ul>' +
        (v.bomb ? '<div class="widgets after">' + widgetsHtml(v) + '</div>' : '') +
      '</section>' +
      '<section class="panel" style="padding:18px">' +
        '<div class="actions" style="margin:0">' +
          '<button class="btn btn-ghost" id="quit">Quitter</button>' +
          '<button class="btn btn-ghost" id="replay-swap">Rejouer en inversant les rôles</button>' +
          '<button class="btn btn-primary btn-lg" id="replay">Nouvelle bombe</button>' +
        '</div>' +
      '</section>' + api.footer();
  }

  /* Aides à la mise au point, actives uniquement avec ?local=1 ou ?debug=1 :
   * « mods » impose la liste des modules, « seed » fige la bombe.
   * Rien de tout cela n'est disponible dans une partie normale. */
  /* La liste des modules de la dernière bombe est conservée d'une session à
   * l'autre, uniquement pour éviter de retomber sur la même. */
  function loadLastModules() {
    try { return JSON.parse(localStorage.getItem('bomb-last-modules') || '[]'); }
    catch (e) { return []; }
  }
  function saveLastModules(ids) {
    try { localStorage.setItem('bomb-last-modules', JSON.stringify(ids)); } catch (e) {}
  }

  function debugParams() {
    try {
      var q = new URLSearchParams(location.search);
      if (q.get('local') !== '1' && q.get('debug') !== '1') return {};
      var mods = q.get('mods');
      var seed = q.get('seed');
      return {
        onlyModules: mods ? mods.split(',').map(function (s) { return s.trim(); }).filter(Boolean) : null,
        seed: seed ? parseInt(seed, 10) : undefined
      };
    } catch (e) { return {}; }
  }

  // ------------------------------------------------------------- définition
  api = global.Room.api;

  if (debugParams().onlyModules !== undefined) {
    global.__debug = { view: function () { return D.view; }, state: D };
  }

  global.Room.init({
    id: 'desamorcage',
    title: 'Désamorçage',
    tagline: 'l’un a la bombe, l’autre a le manuel',
    roles: { host: 'Démineur', guest: 'Expert' },
    howto: [
      '<li>Un joueur a <b>la bombe</b> à l’écran. L’autre a <b>le manuel</b>. Interdit de regarder l’écran de l’autre.</li>',
      '<li>Le démineur décrit ce qu’il voit ; l’expert cherche la règle et lui dicte quoi faire.</li>',
      '<li>Chaque module a ses propres règles, qui dépendent souvent du <b>numéro de série</b>, du nombre de <b>piles</b> et des <b>voyants</b> allumés.</li>',
      '<li>Une erreur ne bloque pas le module, mais <b>le chrono accélère</b>. Au bout de 3 erreurs, ça saute.</li>',
      '<li>Tout désamorcer avant la fin du chrono, et vous avez gagné — ensemble.</li>'
    ],
    config: {
      defaults: Engine.DEFAULT_CONFIG,
      sanitize: Engine.sanitizeConfig,
      fields: [
        { key: 'moduleCount', id: 'c-mods', label: 'Modules', min: 1, max: 6 },
        { key: 'minutes', id: 'c-min', label: 'Chrono', min: 1, max: 15, suffix: 'minutes' },
        { key: 'maxStrikes', id: 'c-strikes', label: 'Erreurs tolérées', min: 1, max: 5 },
        { key: 'speedUp', id: 'c-speed', type: 'toggle', label: 'Le chrono accélère à chaque erreur' }
      ],
      note: function (c) {
        return '<b>' + c.moduleCount + '</b> module' + (c.moduleCount > 1 ? 's' : '') + ' à désamorcer en <b>' +
          api.fmtDuration(c.minutes * 60) + '</b>, ' + c.maxStrikes + ' erreur' + (c.maxStrikes > 1 ? 's' : '') +
          ' tolérée' + (c.maxStrikes > 1 ? 's' : '') + '.';
      },
      summary: function (c) {
        return [
          { value: c.moduleCount, label: 'modules' },
          { value: api.fmtDuration(c.minutes * 60), label: 'de chrono' },
          { value: c.maxStrikes, label: 'erreurs max' },
          { value: c.speedUp ? 'Oui' : 'Non', label: 'accélération' }
        ];
      }
    },
    createEngine: function (config, names, onUpdate) {
      return Engine.createEngine({
        lastModules: loadLastModules(),
        onBomb: saveLastModules,
        config: Object.assign({}, config, debugParams().onlyModules ? { onlyModules: debugParams().onlyModules } : {}),
        names: names,
        seed: debugParams().seed,
        onUpdate: onUpdate
      });
    },
    screenKey: function (v) {
      return v.phase === 'over' ? 'over' : (v.isDefuser ? 'bomb' : 'manual');
    },
    build: function (key, v) {
      if (key === 'bomb') return defuserHtml();
      if (key === 'manual') return expertHtml(v);
      return overHtml(v);
    },
    bind: function (key, v) {
      if (key === 'over') {
        $('#replay').onclick = function () { api.act({ t: 'replay' }); };
        $('#replay-swap').onclick = function () { api.act({ t: 'replay', swap: true }); };
        $('#quit').onclick = api.leave;
        return;
      }
      D.open = null; D.bodySig = ''; D.manSig = ''; D.lastEventId = 0;
      bindCommon();
    },
    update: function (key, v) {
      D.view = v;
      if (key === 'bomb') updateDefuser(v);
      else if (key === 'manual') updateExpert(v);
    }
  });
})(typeof window !== 'undefined' ? window : globalThis);
