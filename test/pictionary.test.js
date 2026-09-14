/* Pictionary : mots secrets, chrono déclenché au premier trait, propositions,
   validation manuelle, passage, inversion des rôles.
   node test/pictionary.test.js */
const assert = require('assert');
global.window = global;
global.RNG = require('../common/rng.js');
global.Fr = require('../common/french.js');
const Words = require('../games/pictionary/words.js');
const Engine = require('../games/pictionary/engine.js');

let groups = 0;
function t(name, fn) {
  try { fn(); groups++; console.log('  · ' + name); }
  catch (e) { console.error('✗ ' + name + '\n   ' + e.message); process.exitCode = 1; }
}

function make(cfg) {
  const e = Engine.createEngine({
    config: Object.assign({ wordCount: 2, seconds: 60, roundsEach: 1 }, cfg),
    names: { host: 'Alice', guest: 'Bob' },
    words: Words.WORDS,
    onUpdate: () => {}
  });
  e.start();
  return e;
}
const H = e => e.viewFor('host');
const G = e => e.viewFor('guest');
/** Fait avancer le moteur après la pause de révélation, sans attendre. */
function skipPause(e) {
  const S = e._state();
  S.paused = false;
  S.idx++;
  S.guesses = [];
  S.started = false;
  S.deadline = null;
  S.frozenLeft = e.config.seconds * 1000;
  if (S.idx >= S.words[S.round].length) S.phase = 'roundRecap';
}

// ------------------------------------------------------------ banque de mots
t('la banque de mots est propre', () => {
  assert.ok(Words.WORDS.length > 150, 'trop peu de mots : ' + Words.WORDS.length);
  const seen = new Set();
  Words.WORDS.forEach(w => {
    assert.strictEqual(typeof w, 'string');
    assert.ok(w.trim() === w && w.length > 2, 'mot douteux : « ' + w + ' »');
    assert.ok(!/[0-9]/.test(w), 'chiffre dans « ' + w + ' »');
    assert.ok(!seen.has(w.toLowerCase()), 'doublon : ' + w);
    seen.add(w.toLowerCase());
  });
});

// ------------------------------------------------------------------- secret
t('le devineur ne reçoit jamais le mot', () => {
  const e = make();
  assert.ok(H(e).isDrawer, 'l’hôte dessine en manche 1');
  assert.strictEqual(G(e).isDrawer, false);
  assert.ok(typeof H(e).word === 'string' && H(e).word.length > 0);
  assert.strictEqual(G(e).word, null, 'le mot ne doit pas partir chez le devineur');
  assert.strictEqual(G(e).hint, null, 'sans l’option, pas d’indice de longueur');
  assert.strictEqual(JSON.stringify(G(e)).indexOf(H(e).word), -1, 'le mot fuite quelque part dans la vue');
  e.dispose();
});

t('l’option « nombre de lettres » donne la forme du mot, jamais les lettres', () => {
  const e = make({ showLength: true });
  const hint = G(e).hint;
  assert.ok(Array.isArray(hint) && hint.length >= 1, 'indice attendu');
  const total = hint.reduce((n, g) => n + g.len, 0);
  const letters = H(e).word.replace(/[^A-Za-zÀ-ÿ]/g, '').length;
  assert.strictEqual(total, letters, 'le compte de lettres doit correspondre');
  assert.strictEqual(JSON.stringify(hint).indexOf(H(e).word.slice(0, 3)), -1, 'aucune lettre ne doit fuiter');
  e.dispose();
});

// -------------------------------------------------------------------- chrono
t('le chrono ne démarre qu’au premier trait, et seulement pour le dessinateur', () => {
  const e = make({ seconds: 60 });
  assert.strictEqual(H(e).timerStarted, false);
  assert.strictEqual(H(e).timeLeftMs, 60000);

  e.action('guest', { t: 'ink' });                 // le devineur ne dessine pas
  assert.strictEqual(H(e).timerStarted, false);

  e.action('host', { t: 'ink' });
  assert.ok(H(e).timerStarted && H(e).timerRunning);
  assert.ok(G(e).timerStarted, 'les deux écrans partagent le même chrono');
  e.dispose();
});

// --------------------------------------------------------------- propositions
t('une proposition juste marque un point, une fausse est affichée aux deux', () => {
  const e = make();
  const word = H(e).word;
  e.action('host', { t: 'ink' });

  e.action('guest', { t: 'guess', text: 'nimportequoi' });
  assert.strictEqual(G(e).guesses.length, 1);
  assert.strictEqual(G(e).guesses[0].ok, false);
  assert.deepStrictEqual(H(e).guesses, G(e).guesses, 'le dessinateur voit les essais');
  assert.strictEqual(G(e).total, 0);

  e.action('guest', { t: 'guess', text: word.toUpperCase() });
  assert.strictEqual(G(e).total, 1, 'le mot exact, en majuscules, doit passer');
  assert.strictEqual(G(e).paused, true, 'pause de révélation');
  assert.strictEqual(G(e).revealWord, word, 'le mot est révélé aux deux');
  assert.strictEqual(e._state().log[1][0].status, 'ok');
  e.dispose();
});

t('le dessinateur ne peut pas proposer, le devineur ne peut ni passer ni valider', () => {
  const e = make();
  e.action('host', { t: 'guess', text: H(e).word });
  assert.strictEqual(H(e).total, 0, 'le dessinateur ne doit pas pouvoir deviner');
  e.action('guest', { t: 'found' });
  e.action('guest', { t: 'pass' });
  assert.strictEqual(H(e).paused, false, 'aucune de ces actions ne doit résoudre le mot');
  e.dispose();
});

t('le bouton « il a trouvé » du dessinateur vaut un point', () => {
  const e = make();
  const word = H(e).word;
  e.action('host', { t: 'found' });
  assert.strictEqual(H(e).total, 1);
  assert.strictEqual(H(e).revealWord, word);
  assert.strictEqual(e._state().log[1][0].byDrawer, true);
  e.dispose();
});

t('passer ne marque rien, et l’option peut être coupée', () => {
  let e = make();
  e.action('host', { t: 'pass' });
  assert.strictEqual(H(e).total, 0);
  assert.strictEqual(e._state().log[1][0].status, 'pass');
  e.dispose();

  e = make({ allowPass: false });
  e.action('host', { t: 'pass' });
  assert.strictEqual(H(e).paused, false, 'option coupée : passer est ignoré');
  e.dispose();
});

t('pendant la pause de révélation, plus rien ne compte', () => {
  const e = make();
  e.action('host', { t: 'found' });
  const before = H(e).total;
  e.action('guest', { t: 'guess', text: 'encore' });
  e.action('host', { t: 'found' });
  assert.strictEqual(H(e).total, before, 'la pause gèle la manche');
  e.dispose();
});

// --------------------------------------------------------- manches et rôles
t('les mots s’enchaînent, puis les rôles s’inversent', () => {
  const e = make({ wordCount: 2, roundsEach: 1 });
  assert.strictEqual(H(e).roundCount, 2);
  assert.strictEqual(H(e).wordTotal, 2);
  const first = H(e).word;

  e.action('host', { t: 'found' });
  skipPause(e);
  assert.strictEqual(H(e).wordIndex, 1);
  assert.notStrictEqual(H(e).word, first, 'le mot suivant doit être différent');

  e.action('host', { t: 'pass' });
  skipPause(e);
  assert.strictEqual(H(e).phase, 'roundRecap');
  assert.strictEqual(H(e).roundScore, 1);

  e.action('host', { t: 'next' });
  assert.strictEqual(H(e).round, 2);
  assert.strictEqual(H(e).isDrawer, false, 'en manche 2, c’est l’invité qui dessine');
  assert.ok(G(e).isDrawer);
  assert.strictEqual(H(e).word, null);

  e.action('guest', { t: 'found' });
  skipPause(e);
  e.action('guest', { t: 'found' });
  skipPause(e);
  assert.strictEqual(H(e).phase, 'roundRecap');

  e.action('host', { t: 'next' });
  assert.strictEqual(H(e).phase, 'gameOver');
  assert.strictEqual(H(e).total, 3);
  assert.strictEqual(H(e).maxTotal, 4);
  assert.strictEqual(H(e).rounds.length, 2);
  assert.strictEqual(H(e).rounds[0].drawer, 'host');
  assert.strictEqual(H(e).rounds[1].drawer, 'guest');
  assert.strictEqual(H(e).rounds[0].entries.length, 2);

  e.action('host', { t: 'replay' });
  assert.strictEqual(H(e).phase, 'playing');
  assert.strictEqual(H(e).round, 1);
  assert.strictEqual(H(e).total, 0);
  assert.ok(H(e).isDrawer);
  e.dispose();
});

t('les réglages sont bornés', () => {
  const c = Engine.sanitizeConfig({ wordCount: 99, seconds: 5, roundsEach: 0, allowPass: false, showLength: true });
  assert.strictEqual(c.wordCount, 10);
  assert.strictEqual(c.seconds, 30);
  assert.strictEqual(c.roundsEach, 1);
  assert.strictEqual(c.allowPass, false);
  assert.strictEqual(c.showLength, true);
  const d = Engine.sanitizeConfig({});
  assert.strictEqual(d.wordCount, Engine.DEFAULT_CONFIG.wordCount);
  assert.strictEqual(d.allowPass, true);
});

t('chaque manche tire des mots sans doublon', () => {
  for (let i = 0; i < 60; i++) {
    const e = make({ wordCount: 6, roundsEach: 2 });
    const S = e._state();
    Object.keys(S.words).forEach(r => {
      const list = S.words[r];
      assert.strictEqual(new Set(list).size, list.length, 'doublon dans la manche ' + r);
      assert.strictEqual(list.length, 6);
    });
    e.dispose();
  }
});

console.log('✓ ' + groups + ' groupes de tests passés');
