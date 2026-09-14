/* Pendu : choix du mot, lettres, accents, vies, inversion des rôles.
   node test/pendu.test.js */
const assert = require('assert');
global.window = global;
global.RNG = require('../common/rng.js');
global.Fr = require('../common/french.js');
require('../common/words-fr.js');
const Engine = require('../games/pendu/engine.js');

let groups = 0;
function t(name, fn) {
  try { fn(); groups++; console.log('  · ' + name); }
  catch (e) { console.error('✗ ' + name + '\n   ' + e.message); process.exitCode = 1; }
}

function make(cfg) {
  const e = Engine.createEngine({
    config: Object.assign({ lives: 5, roundsEach: 1 }, cfg),
    names: { host: 'Alice', guest: 'Bob' },
    words: global.WORDS,
    onUpdate: () => {}
  });
  e.start();
  return e;
}
const H = e => e.viewFor('host');
const G = e => e.viewFor('guest');
const shown = v => v.slots.map(s => (s.sep != null ? s.sep : (s.ch || '_'))).join('');

// -------------------------------------------------------- contrôle du mot
t('le mot proposé est contrôlé', () => {
  assert.ok(Engine.checkWord('tournevis').ok);
  assert.ok(Engine.checkWord('arc-en-ciel').ok);
  assert.ok(Engine.checkWord('sac à main').ok);
  assert.ok(Engine.checkWord('éléphant').ok);
  assert.strictEqual(Engine.checkWord('ab').ok, false, 'trop court');
  assert.strictEqual(Engine.checkWord('mot2').ok, false, 'chiffres refusés');
  assert.strictEqual(Engine.checkWord('aaa').ok, false, 'une seule lettre différente');
  assert.strictEqual(Engine.checkWord('a'.repeat(30)).ok, false, 'trop long');
});

// ------------------------------------------------------------ une manche
t('le devineur ne reçoit jamais le mot', () => {
  const e = make();
  assert.strictEqual(H(e).phase, 'choosing');
  assert.ok(H(e).isChooser, 'l’hôte choisit en manche 1');
  assert.strictEqual(G(e).isChooser, false);

  // l'invité ne peut pas choisir à la place de l'hôte
  e.action('guest', { t: 'setWord', text: 'triche' });
  assert.strictEqual(H(e).phase, 'choosing');

  e.action('host', { t: 'setWord', text: 'Éléphant' });
  assert.strictEqual(H(e).phase, 'playing');
  assert.strictEqual(H(e).word, 'Éléphant', 'celui qui fait deviner voit son mot');
  assert.strictEqual(G(e).word, undefined, 'le devineur ne doit pas recevoir le mot');
  assert.strictEqual(G(e).letterCount, 8);
  assert.strictEqual(shown(G(e)), '________');
  e.dispose();
});

t('une lettre révèle toutes ses formes accentuées', () => {
  const e = make();
  e.action('host', { t: 'setWord', text: 'Éléphant' });
  e.action('guest', { t: 'letter', l: 'e' });
  assert.strictEqual(shown(G(e)), 'É_é_____', 'É et é doivent apparaître, obtenu ' + shown(G(e)));
  assert.strictEqual(G(e).livesLeft, 5, 'une bonne lettre ne coûte rien');

  // proposer deux fois la même lettre ne coûte rien non plus
  e.action('guest', { t: 'letter', l: 'E' });
  assert.strictEqual(G(e).livesLeft, 5);
  e.dispose();
});

t('les mauvaises lettres coûtent une vie, et le pendu tombe à zéro', () => {
  const e = make({ lives: 3 });
  e.action('host', { t: 'setWord', text: 'chat' });
  ['b', 'd'].forEach(l => e.action('guest', { t: 'letter', l }));
  assert.strictEqual(G(e).livesLeft, 1);
  assert.deepStrictEqual(G(e).wrong, ['b', 'd']);
  assert.strictEqual(G(e).phase, 'playing');

  e.action('guest', { t: 'letter', l: 'f' });
  assert.strictEqual(G(e).phase, 'roundRecap');
  assert.strictEqual(H(e).log[0].found, false);
  assert.strictEqual(G(e).word, 'chat', 'le mot est révélé au récap');
  e.dispose();
});

t('trouver toutes les lettres gagne la manche', () => {
  const e = make();
  e.action('host', { t: 'setWord', text: 'chat' });
  ['c', 'h', 'a'].forEach(l => e.action('guest', { t: 'letter', l }));
  assert.strictEqual(G(e).phase, 'playing');
  e.action('guest', { t: 'letter', l: 't' });
  assert.strictEqual(G(e).phase, 'roundRecap');
  assert.strictEqual(H(e).log[0].found, true);
  assert.strictEqual(H(e).log[0].wrong.length, 0);
  e.dispose();
});

t('tenter le mot entier : juste on gagne, faux on perd une vie', () => {
  let e = make();
  e.action('host', { t: 'setWord', text: 'éléphant' });
  e.action('guest', { t: 'word', text: 'ELEPHANT' });      // sans accents : accepté
  assert.strictEqual(G(e).phase, 'roundRecap');
  assert.strictEqual(H(e).log[0].found, true);
  e.dispose();

  e = make({ lives: 4 });
  e.action('host', { t: 'setWord', text: 'chat' });
  e.action('guest', { t: 'word', text: 'chien' });
  assert.strictEqual(G(e).livesLeft, 3);
  assert.strictEqual(G(e).phase, 'playing');
  e.dispose();

  e = make({ allowWord: false });
  e.action('host', { t: 'setWord', text: 'chat' });
  e.action('guest', { t: 'word', text: 'chat' });
  assert.strictEqual(G(e).phase, 'playing', 'option désactivée : la tentative est ignorée');
  e.dispose();
});

t('le devineur ne peut pas jouer à la place du choisisseur, et inversement', () => {
  const e = make();
  e.action('host', { t: 'setWord', text: 'chat' });
  e.action('host', { t: 'letter', l: 'a' });               // c'est lui qui fait deviner
  assert.strictEqual(H(e).found.length, 0, 'celui qui connaît le mot ne peut pas proposer de lettre');
  e.dispose();
});

// -------------------------------------------------------- série et rôles
t('les rôles s’inversent, puis le récap global compte les mots sauvés', () => {
  const e = make({ lives: 6, roundsEach: 1 });
  assert.strictEqual(H(e).roundCount, 2);

  e.action('host', { t: 'setWord', text: 'chat' });
  ['c', 'h', 'a', 't'].forEach(l => e.action('guest', { t: 'letter', l }));
  e.action('host', { t: 'next' });

  assert.strictEqual(H(e).round, 2);
  assert.strictEqual(H(e).isChooser, false, 'en manche 2, l’hôte devine');
  assert.ok(G(e).isChooser);

  e.action('guest', { t: 'setWord', text: 'lune' });
  assert.strictEqual(H(e).word, undefined);
  ['z', 'k', 'w', 'x', 'y', 'b'].forEach(l => e.action('host', { t: 'letter', l }));
  assert.strictEqual(H(e).phase, 'roundRecap');

  e.action('guest', { t: 'next' });
  assert.strictEqual(H(e).phase, 'gameOver');
  assert.strictEqual(H(e).solved, 1);
  assert.strictEqual(H(e).total, 2);
  assert.strictEqual(H(e).log[1].word, 'lune');

  e.action('host', { t: 'replay' });
  assert.strictEqual(H(e).phase, 'choosing');
  assert.strictEqual(H(e).round, 1);
  assert.ok(H(e).isChooser);
  e.dispose();
});

t('« piocher un mot » propose un mot de la banque, sans le valider', () => {
  const e = make();
  e.action('host', { t: 'draw' });
  const drawn = H(e).drawn;
  assert.ok(typeof drawn === 'string' && drawn.length >= 4, 'mot pioché : ' + drawn);
  assert.ok(global.WORDS.indexOf(drawn) !== -1, 'le mot doit venir de la banque');
  assert.strictEqual(H(e).phase, 'choosing', 'piocher ne démarre pas la manche');
  assert.strictEqual(G(e).drawn, undefined, 'le devineur ne voit pas le mot pioché');
  e.dispose();
});

console.log('✓ ' + groups + ' groupes de tests passés');
