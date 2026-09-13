/* Moteur de désamorçage : une bombe désamorcée, une bombe qui explose.
   node test/bomb.engine.test.js */
const assert = require('assert');
global.window = global;
const Bomb = require('../games/desamorcage/bomb.js');
global.Bomb = Bomb;
const Modules = require('../games/desamorcage/modules.js');
global.Modules = Modules;
const Engine = require('../games/desamorcage/engine.js');

const steps = [];
const step = m => steps.push(m);
const clone = o => JSON.parse(JSON.stringify(o));

function make(cfg, seed) {
  const e = Engine.createEngine({
    config: Object.assign({ moduleCount: 6, minutes: 5, maxStrikes: 3 }, cfg),
    names: { host: 'Alice', guest: 'Bob' },
    seed: seed == null ? 4242 : seed,
    onUpdate: () => {}
  });
  e.start();
  return e;
}

/** Positionne le chrono sur un temps restant précis (boîte blanche). */
function setTimeLeft(e, ms) {
  const S = e._state();
  S.endsAt = Date.now() + ms / S.rate;
}

/** Joue la solution d'un module à travers le moteur. */
function solveModule(e, i, role) {
  role = role || 'host';
  const S = e._state();
  const m = S.modules[i];
  const def = Modules.byId(m.id);
  const plan = def.solve(clone(m.state), S.bomb, { strikes: S.strikes, timeLeftMs: 300000 });

  for (const a of plan.actions) {
    if (m.id === 'bouton' && a.type === 'up' && !a.quick) {
      // on attend « la bonne seconde » : ici on la fabrique
      for (let s = 590; s > 10; s--) {
        if (Modules.clockDigits(s * 1000).includes(plan.digit)) { setTimeLeft(e, s * 1000); break; }
      }
    }
    if (m.id === 'bouton' && a.type === 'down') {
      e.action(role, { t: 'module', i: i, a: a });
      // maintenir : on triche sur la durée de pression
      S.holdAt = Date.now() - (plan.hold ? 1500 : 100);
      continue;
    }
    e.action(role, { t: 'module', i: i, a: a });
  }
}

(function main() {
  // ------------------------------------------------------------ bombe désamorcée
  let e = make();
  let H = () => e.viewFor('host');
  let G = () => e.viewFor('guest');

  assert.strictEqual(H().phase, 'playing');
  assert.strictEqual(H().moduleCount, 6);
  assert.strictEqual(new Set(e._state().modules.map(m => m.id)).size, 6,
    'avec 6 modules demandés, les 6 types doivent être présents');
  assert.ok(H().isDefuser, 'l’hôte est démineur par défaut');
  assert.ok(H().bomb && H().bomb.serial, 'le démineur voit le numéro de série');
  assert.ok(Array.isArray(H().modules) && H().modules.length === 6);
  step('bombe générée : 6 modules, repères visibles côté démineur');

  assert.strictEqual(G().isDefuser, false);
  assert.strictEqual(G().modules, undefined, 'l’expert ne doit pas recevoir les modules');
  assert.strictEqual(G().bomb, undefined, 'l’expert ne doit pas recevoir les repères');
  assert.strictEqual(G().moduleCount, 6);
  assert.strictEqual(G().solvedCount, 0);
  step('l’expert ne reçoit que le chrono, les erreurs et l’avancement');

  const btn = H().modules.find(m => m.id === 'bouton');
  assert.ok(btn, 'le bouton est bien sur la bombe');
  assert.strictEqual(btn.state.$secret, undefined, 'la bande du bouton ne doit pas fuiter');
  step('les données privées d’un module sont retirées des vues');

  // l'expert ne peut pas toucher aux modules
  e.action('guest', { t: 'module', i: 0, a: { type: 'cut', i: 0 } });
  assert.strictEqual(H().strikes, 0, 'une action de l’expert ne doit rien provoquer');
  assert.strictEqual(H().solvedCount, 0);
  step('l’expert ne peut pas agir sur la bombe');

  for (let i = 0; i < 6; i++) {
    solveModule(e, i);
    assert.strictEqual(H().strikes, 0, 'aucune erreur ne devait survenir (module ' + i + ')');
  }
  assert.strictEqual(H().phase, 'over');
  assert.strictEqual(H().outcome, 'won');
  assert.ok(H().timeLeftMs > 0);
  assert.ok(Array.isArray(H().recap) && H().recap.length === 6);
  assert.ok(H().recap.every(r => r.solved && r.answer), 'le débriefing liste la solution de chaque module');
  assert.ok(G().recap && G().bomb, 'après coup, l’expert voit tout');
  step('bombe désamorcée : 6/6 modules, débriefing complet des deux côtés');
  e.dispose();

  // ----------------------------------------------------------- trois erreurs
  e = make({ moduleCount: 3, maxStrikes: 3, speedUp: true }, 99);
  H = () => e.viewFor('host');
  const S = e._state();
  const wrongOn = i => {
    const m = S.modules[i];
    const def = Modules.byId(m.id);
    const plan = def.solve(clone(m.state), S.bomb, { strikes: S.strikes, timeLeftMs: 300000 });
    if (m.id === 'fils') return { type: 'cut', i: (plan.actions[0].i + 1) % m.state.wires.length };
    if (m.id === 'sequence') return { type: 'press', color: ['rouge', 'bleu', 'vert', 'jaune'].find(c => c !== plan.order[0]) };
    if (m.id === 'motdepasse') { m.state.pos[0] = (m.state.cols[0].indexOf(plan.word[0]) + 1) % 6; return { type: 'submit' }; }
    if (m.id === 'morse') { m.state.index = (m.state.freqs.indexOf(plan.freq) + 2) % m.state.freqs.length; return { type: 'send' }; }
    if (m.id === 'symboles') return { type: 'key', sym: plan.order[1] };
    if (m.id === 'bouton') {
      e.action('host', { t: 'module', i: i, a: { type: 'down' } });
      S.holdAt = Date.now() - (plan.hold ? 100 : 1500);
      if (!plan.hold) setTimeLeft(e, 300000);
      return { type: 'up' };
    }
    return null;
  };

  const rate0 = H().rate;
  e.action('host', { t: 'module', i: 0, a: wrongOn(0) });
  assert.strictEqual(H().strikes, 1);
  assert.ok(H().rate > rate0, 'le chrono doit accélérer après une erreur (' + H().rate + ')');
  step('erreur : le chrono accélère (×' + H().rate + ')');

  e.action('host', { t: 'module', i: 1, a: wrongOn(1) });
  assert.strictEqual(H().strikes, 2);
  assert.strictEqual(H().phase, 'playing');
  e.action('host', { t: 'module', i: 2, a: wrongOn(2) });
  assert.strictEqual(H().phase, 'over');
  assert.strictEqual(H().outcome, 'lost');
  assert.strictEqual(H().reason, 'strikes');
  step('3 erreurs : explosion');
  e.dispose();

  // ------------------------------------------------------------ temps écoulé
  e = make({ moduleCount: 2, minutes: 1 }, 7);
  H = () => e.viewFor('host');
  setTimeLeft(e, 80);
  setTimeout(function () {
    assert.strictEqual(H().phase, 'over', 'la bombe doit exploser à zéro');
    assert.strictEqual(H().outcome, 'lost');
    assert.strictEqual(H().reason, 'time');
    assert.strictEqual(H().timeLeftMs, 0);
    step('chrono à zéro : explosion');
    e.dispose();

    // ------------------------------------------------- rejouer en échangeant
    let f = make({ moduleCount: 2 }, 11);
    assert.strictEqual(f.viewFor('host').isDefuser, true);
    f.action('host', { t: 'replay', swap: true });
    assert.strictEqual(f.viewFor('host').isDefuser, false, 'après échange, l’hôte devient expert');
    assert.strictEqual(f.viewFor('guest').isDefuser, true);
    assert.strictEqual(f.viewFor('guest').phase, 'playing');
    assert.strictEqual(f.viewFor('guest').strikes, 0);
    // et le nouveau démineur peut agir
    solveModule(f, 0, 'guest');
    assert.strictEqual(f.viewFor('guest').strikes, 0);
    step('rejouer en échangeant les rôles : le nouveau démineur a la main');
    f.dispose();

    steps.forEach(s => console.log('  · ' + s));
    console.log('✓ moteur de désamorçage : validé');
  }, 400);
})();
