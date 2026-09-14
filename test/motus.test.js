/* Motus en duo : couleurs, échange des tableaux, tableau commun à la fin.
   node test/motus.test.js */
const assert = require('assert');
global.window = global;
global.RNG = require('../common/rng.js');
const Bank = require('../games/motus/words.js');
const Engine = require('../games/motus/engine.js');

let groups = 0;
function t(name, fn) {
  try { fn(); groups++; console.log('  · ' + name); }
  catch (e) { console.error('✗ ' + name + '\n   ' + e.message); process.exitCode = 1; }
}

// ------------------------------------------------------------- la banque
t('la banque est propre et assez fournie', () => {
  assert.ok(Bank.LENGTHS.length >= 3, 'trop peu de longueurs jouables');
  Object.keys(Bank.WORDS).forEach(len => {
    const n = parseInt(len, 10);
    const list = Bank.WORDS[len];
    const seen = new Set();
    list.forEach(w => {
      assert.strictEqual(w.length, n, w + ' n’a pas ' + n + ' lettres');
      assert.ok(/^[A-Z]+$/.test(w), w + ' n’est pas en lettres nues');
      assert.ok(!seen.has(w), 'doublon : ' + w);
      seen.add(w);
    });
    if (Bank.LENGTHS.includes(n)) assert.ok(list.length >= 100, n + ' lettres : seulement ' + list.length + ' mots');
  });
});

// ------------------------------------------------------------- couleurs
t('les couleurs suivent la règle, doublons compris', () => {
  const s = (g, w) => Engine.score(g, w).join('');
  assert.strictEqual(s('MAISON', 'MAISON'), 'okokokokokok');
  assert.strictEqual(s('TRAIN', 'TRUIE'), 'okoknookno');
  // ALLEE contre SALLE : un seul L reste après le L bien placé
  assert.strictEqual(Engine.score('ALLEE', 'SALLE').join(' '), 'pos pos ok no ok');
  // trois E proposés, un seul dans le mot et bien placé : les deux autres sont gris
  assert.strictEqual(Engine.score('EEEEE', 'TERRE').join(' '), 'no ok no no ok');
});

t('le clavier retient le meilleur état connu de chaque lettre', () => {
  const rows = [
    { w: 'TRAIN', marks: ['no', 'pos', 'no', 'no', 'no'] },
    { w: 'ROUTE', marks: ['ok', 'no', 'no', 'no', 'no'] }
  ];
  const k = Engine.keyStates(rows);
  assert.strictEqual(k.R, 'ok', 'le R passe de « présent » à « bien placé »');
  assert.strictEqual(k.T, 'no');
  assert.strictEqual(k.A, 'no');
});

// -------------------------------------------------------------- le duo
function make(words, cfg) {
  const bank = {};
  bank[words[0].length] = words.concat(['ZZZZZZ'.slice(0, words[0].length)]);
  const e = Engine.createEngine({
    config: Object.assign({ length: words[0].length, tries: 6, firstLetter: true }, cfg),
    names: { host: 'Alice', guest: 'Bob' },
    words: bank,
    onUpdate: () => {}
  });
  e.start();
  // on impose les deux mots, pour un test reproductible
  e._state().words = words.slice();
  return e;
}
const H = e => e.viewFor('host');
const G = e => e.viewFor('guest');
const MOTS = ['MAISON', 'JARDIN'];

t('chacun démarre sur son tableau, et ne voit que celui-là', () => {
  const e = make(MOTS);
  assert.strictEqual(H(e).boardIndex, 0);
  assert.strictEqual(G(e).boardIndex, 1);
  assert.strictEqual(H(e).firstLetter, 'M', 'la première lettre est donnée');
  assert.strictEqual(G(e).firstLetter, 'J');
  const seen = JSON.stringify(H(e));
  assert.ok(seen.indexOf('JARDIN') === -1, 'le mot de l’autre tableau ne doit pas fuiter');
  assert.ok(seen.indexOf('MAISON') === -1, 'son propre mot non plus !');
  assert.ok(H(e).otherBoard && H(e).otherBoard.tries === 0, 'on sait juste où en est l’autre');
  e.dispose();
});

t('on ne joue qu’une fois par tour, puis les tableaux s’échangent', () => {
  const e = make(MOTS);
  e.action('host', { t: 'guess', text: 'MARTEAU'.slice(0, 6) });
  assert.strictEqual(H(e).board.rows.length, 1);
  assert.strictEqual(H(e).yourTurn, false, 'il a joué, il attend');
  assert.strictEqual(H(e).waiting, true);
  assert.strictEqual(H(e).boardIndex, 0, 'pas d’échange tant que l’autre n’a pas joué');
  e.action('host', { t: 'guess', text: 'MOUTON' });
  assert.strictEqual(H(e).board.rows.length, 1, 'deux essais d’affilée : refusé');

  e.action('guest', { t: 'guess', text: 'JOUEUR'.slice(0, 6) });
  assert.strictEqual(H(e).boardIndex, 1, 'les tableaux ont changé de mains');
  assert.strictEqual(G(e).boardIndex, 0);
  assert.strictEqual(H(e).yourTurn, true);
  assert.strictEqual(G(e).board.rows.length, 1, 'chacun récupère l’historique laissé par l’autre');
  assert.strictEqual(G(e).board.rows[0].mine, false, 'et voit que cet essai n’est pas le sien');
  e.dispose();
});

t('un mot trop court ou trop long est refusé, sans consommer d’essai', () => {
  const e = make(MOTS);
  e.action('host', { t: 'guess', text: 'CHAT' });
  assert.strictEqual(H(e).board.rows.length, 0);
  assert.strictEqual(H(e).event.type, 'reject');
  assert.ok(/6 lettres/.test(H(e).event.reason));
  e.action('host', { t: 'guess', text: 'ma i son' });
  assert.strictEqual(H(e).board.rows.length, 1, 'les espaces et la casse ne gênent pas');
  assert.ok(H(e).board.solved);
  e.dispose();
});

t('option « mots de la banque » : les suites de lettres au hasard sont refusées', () => {
  const e = make(MOTS, { bankOnly: true });
  e.action('host', { t: 'guess', text: 'AAAAAA' });
  assert.strictEqual(H(e).board.rows.length, 0);
  assert.ok(/banque/.test(H(e).event.reason));
  e.dispose();
});

t('un mot trouvé fait passer les deux joueurs sur le tableau restant', () => {
  const e = make(MOTS);
  e.action('host', { t: 'guess', text: 'MAISON' });        // trouvé du premier coup
  assert.strictEqual(H(e).phase, 'duo', 'le tour finit quand même');
  e.action('guest', { t: 'guess', text: 'JOUEUR'.slice(0, 6) });

  assert.strictEqual(H(e).phase, 'solo');
  assert.strictEqual(G(e).phase, 'solo');
  assert.strictEqual(H(e).shared, true);
  assert.strictEqual(H(e).boardIndex, 1, 'les deux sont sur le tableau qui reste');
  assert.strictEqual(G(e).boardIndex, 1);
  assert.deepStrictEqual(H(e).board.rows.map(r => r.w), G(e).board.rows.map(r => r.w),
    'ils voient exactement le même tableau');

  // la main passe à celui qui n'était pas dessus
  assert.strictEqual(H(e).yourTurn, true, 'Alice arrive avec un œil neuf sur le mot de Bob');
  assert.strictEqual(G(e).yourTurn, false);
  e.action('guest', { t: 'guess', text: 'JUPONS'.slice(0, 6) });
  assert.strictEqual(H(e).board.rows.length, 1, 'ce n’est pas son tour : rien ne passe');

  e.action('host', { t: 'guess', text: 'JUPONS'.slice(0, 6) });
  assert.strictEqual(G(e).yourTurn, true, 'et on alterne');
  assert.strictEqual(H(e).yourTurn, false);
  e.dispose();
});

t('à court d’essais, le tableau est perdu', () => {
  const e = make(MOTS, { tries: 4 });
  // quatre essais sur le tableau 0 (en alternant les joueurs, comme en vrai)
  const filler = ['MOUTON', 'CAMION', 'BALLON', 'CARTON'];
  let i = 0;
  while (!e._state().boards[0].lost && i < 8) {
    const who = e._state().at.host === 0 ? 'host' : 'guest';
    const mate = who === 'host' ? 'guest' : 'host';
    e.action(who, { t: 'guess', text: filler[i % filler.length] });
    if (!e._state().boards[1].solved && !e._state().boards[1].lost) {
      e.action(mate, { t: 'guess', text: 'TUNNEL' });
    }
    i++;
  }
  assert.strictEqual(e._state().boards[0].lost, true, 'le tableau 0 devait être perdu après 4 essais');
  assert.strictEqual(e._state().boards[0].rows.length, 4);
  e.dispose();
});

t('fin de partie : les deux mots sont révélés et les essais attribués', () => {
  const e = make(MOTS);
  e.action('host', { t: 'guess', text: 'MAISON' });
  e.action('guest', { t: 'guess', text: 'MOUTON' });   // sur son tableau JARDIN
  e.action('host', { t: 'guess', text: 'JARDIN' });     // tableau commun, à Alice
  const v = H(e);
  assert.strictEqual(v.phase, 'over');
  assert.strictEqual(v.solvedCount, 2);
  assert.strictEqual(v.totalTries, 3);
  assert.deepStrictEqual(v.results.map(r => r.word), MOTS);
  assert.ok(v.results[0].solved && v.results[1].solved);
  assert.deepStrictEqual(v.results[1].rows.map(r => r.name), ['Bob', 'Alice'],
    'on voit qui a proposé quoi');
  assert.deepStrictEqual(v.results, G(e).results, 'même débriefing des deux côtés');
  e.dispose();
});

t('rejouer : deux nouveaux mots, tableaux vides', () => {
  const e = make(MOTS);
  e.action('host', { t: 'guess', text: 'MAISON' });
  e.action('guest', { t: 'guess', text: 'JARDIN' });
  assert.strictEqual(H(e).phase, 'over');
  e.action('host', { t: 'replay' });
  assert.strictEqual(H(e).phase, 'duo');
  assert.strictEqual(H(e).board.rows.length, 0);
  assert.strictEqual(H(e).boardIndex, 0);
  assert.strictEqual(e._state().words.length, 2);
  e.dispose();
});

t('les réglages sont bornés', () => {
  const c = Engine.sanitizeConfig({ length: 99, tries: 1, firstLetter: false, bankOnly: true });
  assert.strictEqual(c.length, 7);
  assert.strictEqual(c.tries, 4);
  assert.strictEqual(c.firstLetter, false);
  assert.strictEqual(c.bankOnly, true);
  const d = Engine.sanitizeConfig({});
  assert.strictEqual(d.length, Engine.DEFAULT_CONFIG.length);
  assert.strictEqual(d.firstLetter, true);
});

t('une vraie partie tirée au sort a bien deux mots différents', () => {
  for (let k = 0; k < 50; k++) {
    const e = Engine.createEngine({
      config: { length: 6, tries: 6 },
      names: { host: 'A', guest: 'B' },
      onUpdate: () => {}
    });
    e.start();
    const w = e._state().words;
    assert.strictEqual(w.length, 2);
    assert.notStrictEqual(w[0], w[1], 'deux fois le même mot');
    assert.ok(Bank.WORDS[6].includes(w[0]) && Bank.WORDS[6].includes(w[1]));
    e.dispose();
  }
});

console.log('✓ ' + groups + ' groupes de tests passés');
