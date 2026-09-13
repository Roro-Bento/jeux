/* Test du moteur — partie complète jouée en mémoire.
   node test/engine.test.js */
const assert = require('assert');
global.window = global;
require('../games/mot-de-passe/words.js');
global.Rules = require('../games/mot-de-passe/rules.js');
const Engine = require('../games/mot-de-passe/engine.js');

const sleep = ms => new Promise(r => setTimeout(r, ms));
const log = [];
function step(msg) { log.push(msg); }

(async function main() {
  const e = Engine.createEngine({
    config: { wordCount: 2, timePerWord: 5, attempts: 2, showLength: true },
    names: { host: 'Alice', guest: 'Bob' },
    words: global.WORDS,
    onUpdate: () => {}
  });
  e.start();

  const H = () => e.viewFor('host');
  const G = () => e.viewFor('guest');

  // --- état initial
  assert.strictEqual(H().phase, 'playing');
  assert.strictEqual(H().round, 1);
  assert.ok(H().isGiver, 'l’hôte fait deviner en manche 1');
  assert.strictEqual(typeof H().word, 'string');
  assert.strictEqual(G().word, null, 'le devineur ne doit jamais recevoir le mot');
  assert.ok(G().hint && G().hint.length, 'le devineur reçoit le nombre de lettres');
  assert.strictEqual(H().timerStarted, false, 'le chrono ne démarre pas tout seul');
  assert.strictEqual(H().totalTimeMs, 10000, 'chrono global : 2 mots × 5 s');
  assert.strictEqual(H().timeLeftMs, 10000);
  step('état initial ok');

  // --- le devineur ne peut pas jouer avant l’indice
  e.action('guest', { t: 'guess', text: 'nimportequoi' });
  assert.strictEqual(H().guesses.length, 0, 'proposition hors tour ignorée');

  // --- indice interdit (le mot lui-même)
  const secret = H().word;
  e.action('host', { t: 'clue', text: secret });
  assert.strictEqual(H().clues.length, 0, 'indice = le mot → refusé');
  assert.ok(H().message && /Interdit/.test(H().message.text));
  assert.strictEqual(H().timerStarted, false, 'un indice refusé ne démarre pas le chrono');
  step('indice interdit refusé');

  // --- indice valide : le chrono démarre
  e.action('host', { t: 'clue', text: 'zorglub' });
  assert.strictEqual(H().clues.length, 1);
  assert.strictEqual(H().timerStarted, true, 'le chrono démarre au premier indice');
  assert.strictEqual(H().timerRunning, true);
  assert.ok(H().timeLeftMs <= 10000 && H().timeLeftMs > 9000);
  assert.strictEqual(H().turn, 'guesser');
  assert.strictEqual(G().clues[0], 'zorglub', 'le devineur voit l’indice');
  step('chrono démarré au 1er indice');

  // --- le donneur d’indice ne peut pas enchaîner deux indices
  e.action('host', { t: 'clue', text: 'blabla' });
  assert.strictEqual(H().clues.length, 1, 'pas deux indices d’affilée');

  // --- mauvaise proposition
  e.action('guest', { t: 'guess', text: 'absolumentpaslemot' });
  assert.strictEqual(H().attemptsLeft, 1);
  assert.strictEqual(H().turn, 'giver', 'la main revient au donneur d’indice');
  step('mauvaise proposition → 1 essai consommé');

  // --- bonne proposition
  e.action('host', { t: 'clue', text: 'truc' });
  e.action('guest', { t: 'guess', text: secret.toUpperCase() });
  assert.strictEqual(H().scores[1], 1, 'un point marqué');
  assert.strictEqual(H().paused, true, 'pause de révélation');
  assert.strictEqual(H().revealWord, secret, 'le mot est révélé aux deux joueurs');
  assert.strictEqual(G().revealWord, secret);
  assert.strictEqual(H().timerRunning, false, 'le chrono est gelé pendant la révélation');
  const frozen = H().timeLeftMs;
  step('mot trouvé (majuscules tolérées), chrono gelé');

  await sleep(1600);
  assert.strictEqual(H().wordIndex, 1, 'on passe au mot suivant');
  assert.strictEqual(H().attemptsLeft, 2, 'essais réinitialisés');
  assert.strictEqual(H().clues.length, 0);
  assert.strictEqual(H().timerStarted, true, 'le chrono n’est PAS remis à zéro entre deux mots');
  assert.strictEqual(H().timerRunning, true, 'le chrono repart au mot suivant');
  assert.ok(H().timeLeftMs <= frozen + 50, 'le temps restant est bien reporté : ' + H().timeLeftMs + ' vs ' + frozen);
  step('chrono global : le temps restant est reporté sur le mot suivant');

  // --- mot passé
  e.action('host', { t: 'pass' });
  assert.strictEqual(H().log[1][1].status, 'pass');
  await sleep(2300);
  assert.strictEqual(H().phase, 'roundRecap', 'fin de manche après le dernier mot');
  assert.strictEqual(H().log[1].length, 2);
  assert.strictEqual(H().scores[1], 1);
  step('récap de manche 1 : 1/2');

  // --- manche 2 : les rôles s’inversent
  e.action('guest', { t: 'next' });
  assert.strictEqual(H().phase, 'playing');
  assert.strictEqual(H().round, 2);
  assert.strictEqual(H().isGiver, false, 'l’hôte devient devineur');
  assert.strictEqual(G().isGiver, true);
  assert.strictEqual(H().word, null);
  assert.strictEqual(typeof G().word, 'string');
  step('manche 2 : rôles inversés');

  // --- le chrono de manche s'épuise : tous les mots restants sont perdus
  e.action('guest', { t: 'clue', text: 'machin' });
  assert.strictEqual(G().timerStarted, true);
  assert.strictEqual(G().totalTimeMs, 10000);
  await sleep(10400);
  assert.strictEqual(H().log[2][0].status, 'timeout', 'le mot en cours expire');
  step('expiration du chrono de manche');

  await sleep(2300);
  assert.strictEqual(H().phase, 'roundRecap', 'la manche s’arrête quand le temps est écoulé');
  assert.strictEqual(H().log[2].length, 2, 'les mots non joués sont comptés comme ratés');
  assert.strictEqual(H().log[2][1].status, 'timeout');
  assert.strictEqual(H().scores[2], 0);
  step('les mots restants sont marqués ratés');

  e.action('host', { t: 'next' });
  assert.strictEqual(H().phase, 'gameOver');
  assert.strictEqual(H().total, 1);
  assert.strictEqual(H().maxTotal, 4);
  assert.strictEqual(H().log[1].length + H().log[2].length, 4);
  step('récap global : 1/4');

  // --- rejouer conserve les réglages
  e.action('host', { t: 'replay' });
  assert.strictEqual(H().phase, 'playing');
  assert.strictEqual(H().round, 1);
  assert.strictEqual(H().total, 0);
  assert.strictEqual(H().timerStarted, false, 'chrono réarmé pour la nouvelle partie');
  assert.strictEqual(H().timeLeftMs, 10000);
  assert.strictEqual(H().isGiver, true, 'on repart avec l’hôte qui fait deviner');
  assert.strictEqual(H().config.wordCount, 2);
  assert.strictEqual(H().config.timePerWord, 5);
  assert.strictEqual(H().config.attempts, 2);
  step('rejouer : mêmes réglages, score remis à zéro');

  e.dispose();
  log.forEach(l => console.log('  · ' + l));
  console.log('✓ moteur : partie complète validée');
})().catch(err => {
  console.error('✗ ' + err.message);
  process.exit(1);
});
