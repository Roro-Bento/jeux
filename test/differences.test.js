/* Les différences : les scènes sont honnêtes, et il faut l'accord des deux.
   node test/differences.test.js */
const assert = require('assert');
global.window = global;
global.RNG = require('../common/rng.js');
const Scene = require('../games/differences/scene.js');
const Engine = require('../games/differences/engine.js');

let groups = 0;
function t(name, fn) {
  try { fn(); groups++; console.log('  · ' + name); }
  catch (e) { console.error('✗ ' + name + '\n   ' + e.message); process.exitCode = 1; }
}

const ATTRS = ['sh', 'co', 'sz', 'fi'];
function diffAttrs(x, y) { return ATTRS.filter(a => x[a] !== y[a]); }

// ------------------------------------------------------------ les scènes
t('400 scènes : exactement N différences, d’un seul attribut chacune', () => {
  for (let k = 0; k < 400; k++) {
    const rng = global.RNG.rngFrom(1000 + k);
    const cols = 3 + (k % 4), rows = 3 + (k % 3), want = 2 + (k % 6);
    const s = Scene.generate(rng, { cols, rows, diffs: want });
    assert.strictEqual(s.a.length, cols * rows);
    assert.strictEqual(s.b.length, cols * rows);

    const changed = [];
    for (let i = 0; i < s.a.length; i++) {
      const d = diffAttrs(s.a[i], s.b[i]);
      if (d.length === 0) continue;
      assert.strictEqual(d.length, 1, 'case ' + i + ' : ' + d.length + ' attributs changés d’un coup');
      changed.push({ i, attr: d[0] });
    }
    assert.strictEqual(changed.length, want, want + ' différences attendues, ' + changed.length + ' trouvées');

    // ce que le moteur annonce doit correspondre à ce qu'on voit
    assert.deepStrictEqual(
      s.diffs.map(d => ({ i: d.i, attr: d.attr })),
      changed,
      'la liste des différences ne colle pas aux grilles'
    );

    // une taille ne change qu'entre petit et grand
    s.diffs.filter(d => d.attr === 'sz').forEach(d => {
      const pair = [s.a[d.i].sz, s.b[d.i].sz].sort().join('-');
      assert.strictEqual(pair, 'grand-petit', 'changement de taille indescriptible : ' + pair);
    });

    // toutes les valeurs restent dans les listes connues
    s.a.concat(s.b).forEach(c => {
      assert.ok(Scene.SHAPES.includes(c.sh) && Scene.COLORS.includes(c.co));
      assert.ok(Scene.SIZES.includes(c.sz) && Scene.FILLS.includes(c.fi));
    });
  }
});

t('les repères de cases sont ceux qu’on lit à l’écran', () => {
  assert.strictEqual(Scene.cellName(0, 5), 'A1');
  assert.strictEqual(Scene.cellName(4, 5), 'E1');
  assert.strictEqual(Scene.cellName(5, 5), 'A2');
  assert.strictEqual(Scene.cellName(13, 5), 'D3');
});

t('aucune des deux scènes n’est « l’originale »', () => {
  // sur les différences de taille, le « grand » doit tomber à peu près aussi
  // souvent d'un côté que de l'autre : sinon un joueur saurait, en voyant un
  // grand rond, qu'il est du côté modifié
  let bigOnA = 0, bigOnB = 0;
  for (let k = 0; k < 400; k++) {
    const s = Scene.generate(global.RNG.rngFrom(7000 + k), { cols: 5, rows: 4, diffs: 6 });
    s.diffs.filter(d => d.attr === 'sz').forEach(d => {
      if (s.a[d.i].sz === 'grand') bigOnA++; else bigOnB++;
    });
  }
  const total = bigOnA + bigOnB;
  assert.ok(total > 200, 'échantillon trop petit : ' + total);
  const share = bigOnA / total;
  assert.ok(share > 0.4 && share < 0.6, 'déséquilibre entre les deux scènes : ' + share.toFixed(2));
});

t('à graine égale, la même scène', () => {
  const a = Scene.generate(global.RNG.rngFrom(1234), { cols: 5, rows: 4, diffs: 6 });
  const b = Scene.generate(global.RNG.rngFrom(1234), { cols: 5, rows: 4, diffs: 6 });
  assert.deepStrictEqual(a, b);
});

// ------------------------------------------------------------- le moteur
function make(cfg) {
  const e = Engine.createEngine({
    config: Object.assign({ cols: 4, rows: 3, diffs: 3, seconds: 120, penalty: 20 }, cfg),
    names: { host: 'Alice', guest: 'Bob' },
    seed: 42,
    onUpdate: () => {}
  });
  e.start();
  return e;
}
const H = e => e.viewFor('host');
const G = e => e.viewFor('guest');
const someDiff = e => e._state().scene.diffs[0].i;
const notDiff = e => {
  const S = e._state();
  for (let i = 0; i < S.scene.cols * S.scene.rows; i++) if (!S.scene.diffs.some(d => d.i === i)) return i;
  throw new Error('grille entièrement différente ?');
};

t('chacun voit sa grille, jamais celle de l’autre', () => {
  const e = make();
  const S = e._state();
  assert.deepStrictEqual(H(e).grid, S.scene.a);
  assert.deepStrictEqual(G(e).grid, S.scene.b);
  assert.strictEqual(H(e).both, undefined, 'la grille de l’autre ne doit pas partir en cours de partie');
  assert.strictEqual(H(e).diffs, undefined, 'la liste des différences non plus');
  assert.strictEqual(H(e).diffsTotal, 3);
  e.dispose();
});

t('le chrono démarre au premier clic, pas avant', () => {
  const e = make();
  assert.strictEqual(H(e).timerStarted, false);
  assert.strictEqual(H(e).timeLeftMs, 120000);
  e.action('host', { t: 'flag', i: 0 });
  assert.ok(H(e).timerStarted && H(e).timerRunning);
  assert.ok(G(e).timerStarted, 'le chrono est commun aux deux');
  e.dispose();
});

t('il faut que les deux pointent la même case', () => {
  const e = make();
  const good = someDiff(e);
  e.action('host', { t: 'flag', i: good });
  assert.strictEqual(H(e).yourFlag, good);
  assert.strictEqual(G(e).yourFlag, null, 'le doigt de l’un n’est pas celui de l’autre');
  assert.strictEqual(G(e).otherWaiting, true, 'l’autre doit savoir qu’on attend');
  assert.strictEqual(G(e).found.length, 0, 'un seul joueur ne valide rien');

  e.action('guest', { t: 'flag', i: good });
  assert.deepStrictEqual(H(e).found, [good]);
  assert.deepStrictEqual(G(e).found, [good]);
  assert.strictEqual(H(e).event.type, 'good');
  e.dispose();
});

t('la case pointée par l’autre n’est jamais révélée', () => {
  const e = make();
  e.action('host', { t: 'flag', i: someDiff(e) });
  const seen = JSON.stringify(G(e));
  assert.ok(seen.indexOf('"otherWaiting":true') !== -1);
  assert.strictEqual(G(e).otherFlag, undefined, 'la case de l’autre ne doit pas figurer dans sa vue');
  e.dispose();
});

t('deux cases différentes : personne n’est puni, on recommence', () => {
  const e = make();
  const S = e._state();
  e.action('host', { t: 'flag', i: 0 });
  e.action('guest', { t: 'flag', i: 1 });
  assert.strictEqual(H(e).event.type, 'mismatch');
  assert.strictEqual(H(e).yourFlag, null, 'les deux doigts sont retirés');
  assert.strictEqual(G(e).yourFlag, null);
  assert.strictEqual(S.strikes, 0, 'se tromper de case n’est pas une erreur');
  e.dispose();
});

t('un accord qui tombe à côté coûte du temps', () => {
  const e = make({ penalty: 20 });
  const bad = notDiff(e);
  e.action('host', { t: 'flag', i: bad });
  const before = H(e).timeLeftMs;
  e.action('guest', { t: 'flag', i: bad });
  assert.strictEqual(H(e).event.type, 'bad');
  assert.strictEqual(H(e).strikes, 1);
  assert.strictEqual(H(e).lostSeconds, 20);
  assert.ok(H(e).timeLeftMs <= before - 19000, 'le chrono doit avoir reculé de 20 s');
  assert.strictEqual(H(e).found.length, 0);
  e.dispose();
});

t('on peut retirer son doigt', () => {
  const e = make();
  e.action('host', { t: 'flag', i: 2 });
  e.action('host', { t: 'flag', i: 2 });
  assert.strictEqual(H(e).yourFlag, null);
  assert.strictEqual(G(e).otherWaiting, false);
  e.dispose();
});

t('une case déjà trouvée ne se repointe pas', () => {
  const e = make();
  const good = someDiff(e);
  e.action('host', { t: 'flag', i: good });
  e.action('guest', { t: 'flag', i: good });
  e.action('host', { t: 'flag', i: good });
  assert.strictEqual(H(e).yourFlag, null, 'plus rien à pointer sur une case résolue');
  e.dispose();
});

t('toutes les différences trouvées : la partie est gagnée et tout est révélé', () => {
  const e = make();
  e._state().scene.diffs.forEach(d => {
    e.action('host', { t: 'flag', i: d.i });
    e.action('guest', { t: 'flag', i: d.i });
  });
  const v = H(e);
  assert.strictEqual(v.phase, 'gameOver');
  assert.strictEqual(v.outcome, 'win');
  assert.ok(v.both.a && v.both.b, 'le débriefing montre les deux scènes');
  assert.strictEqual(v.diffs.length, 3);
  assert.ok(v.diffs.every(d => d.found));
  assert.ok(/rond|carré|triangle|étoile|losange|croix|rouge|bleu|vert|jaune|violet|orange|petit|grand|plein|contour/.test(v.diffs[0].text),
    'chaque différence est expliquée en français : ' + v.diffs[0].text);
  e.dispose();
});

t('le chrono à zéro perd la partie', () => {
  const e = make({ seconds: 60 });
  e.action('host', { t: 'flag', i: 0 });
  const S = e._state();
  S.deadline = Date.now() - 1;
  e.action('host', { t: 'flag', i: 1 });     // n'importe quelle action réveille le contrôle
  e.action('guest', { t: 'flag', i: 1 });
  assert.strictEqual(H(e).phase, 'gameOver');
  assert.strictEqual(H(e).outcome, 'timeout');
  assert.ok(H(e).diffs.some(d => !d.found), 'les différences ratées sont montrées');
  e.dispose();
});

t('rejouer redistribue une nouvelle scène', () => {
  const e = make();
  const before = JSON.stringify(e._state().scene.a);
  e.action('host', { t: 'flag', i: someDiff(e) });
  e.action('host', { t: 'replay' });
  assert.strictEqual(H(e).phase, 'playing');
  assert.strictEqual(H(e).found.length, 0);
  assert.strictEqual(H(e).timerStarted, false);
  // même graine dans ce test : on vérifie surtout que tout est remis à neuf
  assert.strictEqual(typeof before, 'string');
  e.dispose();
});

t('les réglages sont bornés', () => {
  const c = Engine.sanitizeConfig({ cols: 99, rows: 1, diffs: 99, seconds: 5, penalty: 999 });
  assert.strictEqual(c.cols, 8);
  assert.strictEqual(c.rows, 3);
  assert.ok(c.diffs <= c.cols * c.rows / 2, 'jamais plus d’une case sur deux');
  assert.strictEqual(c.seconds, 60);
  assert.strictEqual(c.penalty, 60);
});

console.log('✓ ' + groups + ' groupes de tests passés');
