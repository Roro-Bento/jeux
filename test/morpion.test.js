/* Morpion : règles du classique et du super morpion.
   node test/morpion.test.js */
const assert = require('assert');
global.window = global;
const Engine = require('../games/morpion/engine.js');

let groups = 0;
function t(name, fn) {
  try { fn(); groups++; console.log('  · ' + name); }
  catch (e) { console.error('✗ ' + name + '\n   ' + e.message); process.exitCode = 1; }
}

function make(cfg) {
  const e = Engine.createEngine({
    config: Object.assign({ rounds: 3, ultimate: false }, cfg),
    names: { host: 'Alice', guest: 'Bob' },
    onUpdate: () => {}
  });
  e.start();
  return e;
}
const H = e => e.viewFor('host');
const G = e => e.viewFor('guest');
/** joue une case pour le joueur dont c'est le tour */
function play(e, b, c) {
  const v = H(e);
  e.action(v.turn === v.you ? 'host' : 'guest', { t: 'play', b, c });
}

// ------------------------------------------------------------- le classique
t('classique : tour par tour, cases occupées refusées, alignement gagnant', () => {
  const e = make();
  assert.strictEqual(H(e).you, 'x', 'l’hôte joue les croix par défaut');
  assert.strictEqual(G(e).you, 'o');
  assert.ok(H(e).yourTurn && !G(e).yourTurn, 'les croix commencent');

  // jouer hors de son tour ne fait rien
  e.action('guest', { t: 'play', b: 0, c: 4 });
  assert.strictEqual(H(e).cells.filter(Boolean).length, 0, 'un coup hors tour doit être ignoré');

  e.action('host', { t: 'play', b: 0, c: 0 });          // x
  assert.strictEqual(H(e).cells[0], 'x');
  assert.ok(G(e).yourTurn, 'la main passe à l’adversaire');

  // rejouer la même case ne fait rien
  e.action('guest', { t: 'play', b: 0, c: 0 });
  assert.strictEqual(H(e).cells[0], 'x');
  assert.ok(G(e).yourTurn, 'un coup invalide ne fait pas passer le tour');

  e.action('guest', { t: 'play', b: 0, c: 3 });          // o
  play(e, 0, 1);                                          // x
  play(e, 0, 4);                                          // o
  assert.strictEqual(H(e).phase, 'playing');
  play(e, 0, 2);                                          // x gagne la ligne du haut
  assert.strictEqual(H(e).phase, 'roundRecap');
  assert.strictEqual(H(e).winner, 'x');
  assert.deepStrictEqual(H(e).line, [0, 1, 2]);
  assert.deepStrictEqual(H(e).scores, { x: 1, o: 0, draw: 0 });
  e.dispose();
});

t('classique : match nul et alternance de celui qui commence', () => {
  const e = make({ rounds: 2 });
  // grille pleine sans alignement : x o x / x o o / o x x
  [4, 0, 8, 2, 1, 7, 3, 5, 6].forEach(c => play(e, 0, c));
  assert.strictEqual(H(e).phase, 'roundRecap');
  assert.strictEqual(H(e).winner, 'draw', 'issue attendue : match nul, obtenu ' + H(e).winner);
  assert.strictEqual(H(e).scores.draw, 1);

  e.action('host', { t: 'next' });
  assert.strictEqual(H(e).round, 2);
  assert.strictEqual(H(e).turn, 'o', 'c’est aux ronds de commencer la manche 2');
  assert.ok(G(e).yourTurn && !H(e).yourTurn);
  assert.strictEqual(H(e).cells.filter(Boolean).length, 0, 'plateau remis à zéro');
  e.dispose();
});

t('classique : fin de série et rejouer', () => {
  const e = make({ rounds: 1 });
  [0, 3, 1, 4, 2].forEach(c => play(e, 0, c));           // x gagne
  assert.strictEqual(H(e).phase, 'roundRecap');
  e.action('host', { t: 'next' });
  assert.strictEqual(H(e).phase, 'gameOver');
  assert.strictEqual(H(e).log.length, 1);

  e.action('guest', { t: 'replay' });
  assert.strictEqual(H(e).phase, 'playing');
  assert.strictEqual(H(e).round, 1);
  assert.deepStrictEqual(H(e).scores, { x: 0, o: 0, draw: 0 });
  e.dispose();
});

t('l’échange des rôles donne les croix à l’invité', () => {
  const e = Engine.createEngine({
    config: { rounds: 1, swapRoles: true }, names: {}, onUpdate: () => {}
  });
  e.start();
  assert.strictEqual(H(e).you, 'o');
  assert.strictEqual(G(e).you, 'x');
  assert.ok(G(e).yourTurn, 'les croix commencent, donc l’invité');
  e.dispose();
});

// ----------------------------------------------------------- le super morpion
t('super : la case jouée envoie l’adversaire dans la grille correspondante', () => {
  const e = make({ ultimate: true });
  assert.strictEqual(H(e).cells.length, 81);
  assert.strictEqual(H(e).active, -1, 'premier coup libre');

  e.action('host', { t: 'play', b: 4, c: 2 });           // x joue en grille 4, case 2
  assert.strictEqual(H(e).active, 2, 'l’adversaire doit jouer en grille 2');

  // jouer ailleurs est refusé
  e.action('guest', { t: 'play', b: 5, c: 0 });
  assert.strictEqual(H(e).cells[5 * 9 + 0], null, 'coup hors de la grille imposée refusé');
  assert.ok(G(e).yourTurn, 'et le tour ne passe pas');

  e.action('guest', { t: 'play', b: 2, c: 4 });
  assert.strictEqual(H(e).active, 4);
  e.dispose();
});

t('super : gagner une petite grille, puis la grande', () => {
  const e = make({ ultimate: true, rounds: 1 });
  const S = e._state();

  // on installe une position : x tient les grilles 0 et 1, et va gagner la 2
  S.big[0] = 'x';
  S.big[1] = 'x';
  S.active = 2;
  S.turn = 'x';
  // x aligne le haut de la grille 2
  S.cells[2 * 9 + 0] = 'x';
  S.cells[2 * 9 + 1] = 'x';
  e.action('host', { t: 'play', b: 2, c: 2 });

  assert.strictEqual(H(e).big[2], 'x', 'la petite grille doit être remportée');
  assert.strictEqual(H(e).phase, 'roundRecap');
  assert.strictEqual(H(e).winner, 'x', 'trois grilles alignées gagnent la manche');
  assert.deepStrictEqual(H(e).line, [0, 1, 2]);
  e.dispose();
});

t('super : une grille close renvoie vers un coup libre', () => {
  const e = make({ ultimate: true });
  const S = e._state();
  S.big[3] = 'o';                    // la grille 3 est déjà prise
  S.active = -1;
  S.turn = 'x';
  e.action('host', { t: 'play', b: 0, c: 3 });   // envoie vers la grille 3…
  assert.strictEqual(H(e).active, -1, '…qui est close : le coup suivant est libre');

  // et on ne peut pas jouer dans une grille déjà gagnée
  e.action('guest', { t: 'play', b: 3, c: 0 });
  assert.strictEqual(H(e).cells[3 * 9 + 0], null, 'grille déjà gagnée : coup refusé');
  e.dispose();
});

t('les deux joueurs voient le même plateau', () => {
  const e = make({ ultimate: true });
  e.action('host', { t: 'play', b: 4, c: 4 });
  const a = H(e), b = G(e);
  assert.deepStrictEqual(a.cells, b.cells);
  assert.deepStrictEqual(a.big, b.big);
  assert.strictEqual(a.active, b.active);
  assert.strictEqual(a.turn, b.turn);
  assert.notStrictEqual(a.yourTurn, b.yourTurn, 'seul « à qui de jouer » diffère');
});

console.log('✓ ' + groups + ' groupes de tests passés');
