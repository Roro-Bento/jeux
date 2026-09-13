/* Tests des règles — node test/rules.test.js */
const assert = require('assert');
const R = require('../games/mot-de-passe/rules.js');

let passed = 0;
function t(name, fn) {
  try { fn(); passed++; }
  catch (e) { console.error('✗ ' + name + '\n   ' + e.message); process.exitCode = 1; }
}
const blocked = (clue, word) => R.checkClue(clue, word).ok === false;
const allowed = (clue, word) => R.checkClue(clue, word).ok === true;

// ---------------------------------------------------------------- normalize
t('normalisation accents/casse', () => {
  assert.strictEqual(R.normalize('ÉLÉPHANT'), 'elephant');
  assert.strictEqual(R.normalize('Arc-en-ciel'), 'arc en ciel');
  assert.strictEqual(R.normalize('cœur'), 'coeur');
});

// ------------------------------------------------------- indices interdits
t('le mot lui-même est bloqué', () => {
  assert.ok(blocked('chat', 'chat'));
  assert.ok(blocked('CHAT', 'chat'));
  assert.ok(blocked('châT', 'chat'));
});

t('les pluriels sont bloqués', () => {
  assert.ok(blocked('chats', 'chat'));
  assert.ok(blocked('chat', 'chats'));
  assert.ok(blocked('chevaux', 'cheval'));
  assert.ok(blocked('journaux', 'journal'));
  assert.ok(blocked('bateaux', 'bateau'));
  assert.ok(blocked('yeux', 'oeil'));
  assert.ok(blocked('cailloux', 'caillou'));
});

t('les féminins sont bloqués', () => {
  assert.ok(blocked('chienne', 'chien'));
  assert.ok(blocked('danseuse', 'danseur'));
  assert.ok(blocked('actrice', 'acteur'));
  assert.ok(blocked('boulangère', 'boulanger'));
  assert.ok(blocked('grande', 'grand'));
});

t('un mot du mot composé est bloqué', () => {
  assert.ok(blocked('ciel', 'arc-en-ciel'));
  assert.ok(blocked('arc', 'arc-en-ciel'));
  assert.ok(blocked('main', 'sac à main'));
});

t('chiffres et indices répétés refusés', () => {
  assert.ok(blocked('4', 'chat'));
  assert.ok(blocked('mot2', 'chat'));
  assert.strictEqual(
    R.checkClue('moustache', 'chat', { previousClues: ['Moustache'] }).ok, false);
});

t('plusieurs mots refusés quand singleWord', () => {
  assert.strictEqual(R.checkClue('petit félin', 'chat').ok, false);
  assert.strictEqual(R.checkClue('petit félin', 'chat', { singleWord: false }).ok, true);
});

// -------------------------------------------------------- indices autorisés
t('les dérivés restent autorisés', () => {
  assert.ok(allowed('chaton', 'chat'));
  assert.ok(allowed('pommier', 'pomme'));
  assert.ok(allowed('sourire', 'souris'));
  assert.ok(allowed('poisson', 'petit pois'));
  assert.ok(allowed('château', 'chat'));
  assert.ok(allowed('nounours', 'ours'));
});

t('les mots proches mais distincts passent', () => {
  assert.ok(allowed('mère', 'mer'));
  assert.ok(allowed('tempête', 'temps'));
  assert.ok(allowed('miaou', 'chat'));
  assert.ok(allowed('ronronne', 'chat'));
});

// ----------------------------------------------------------------- réponses
t('la proposition tolère accents et pluriel', () => {
  assert.ok(R.checkGuess('elephant', 'éléphant'));
  assert.ok(R.checkGuess('ÉLÉPHANTS', 'éléphant'));
  assert.ok(R.checkGuess('arc en ciel', 'arc-en-ciel'));
  assert.ok(R.checkGuess('  Chat ', 'chat'));
  assert.ok(!R.checkGuess('chien', 'chat'));
  assert.ok(!R.checkGuess('', 'chat'));
});

// ------------------------------------------------------- nombre de lettres
t('indication du nombre de lettres', () => {
  assert.deepStrictEqual(R.letterHint('chat').map(x => x.len), [4]);
  assert.deepStrictEqual(R.letterHint('éléphant').map(x => x.len), [8]);
  assert.deepStrictEqual(R.letterHint('arc-en-ciel').map(x => x.len), [3, 2, 4]);
});

// -------------------------------------------- balayage de la banque de mots
t('aucun mot de la banque ne se bloque lui-même de façon absurde', () => {
  global.window = global;
  require('../games/mot-de-passe/words.js');
  const words = global.WORDS;
  assert.ok(words.length > 300, 'banque trop petite : ' + words.length);
  words.forEach(w => {
    assert.ok(blocked(w, w), 'le mot ' + w + ' devrait être bloqué comme indice');
    assert.ok(R.checkGuess(w, w), 'le mot ' + w + ' devrait être accepté comme réponse');
    assert.ok(R.letterHint(w).every(g => g.len > 0), 'lettres invalides pour ' + w);
  });
});

console.log('✓ ' + passed + ' groupes de tests passés');
