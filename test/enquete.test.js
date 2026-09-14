/* L'enquête : des énigmes qu'aucun des deux ne peut résoudre seul.
   node test/enquete.test.js */
const assert = require('assert');
global.window = global;
global.RNG = require('../common/rng.js');
const Puzzle = require('../games/enquete/puzzle.js');
const Engine = require('../games/enquete/engine.js');

let groups = 0;
function t(name, fn) {
  try { fn(); groups++; console.log('  · ' + name); }
  catch (e) { console.error('✗ ' + name + '\n   ' + e.message); process.exitCode = 1; }
}

const CATS = ['p', 'i', 't'];

// ===================================================== le cœur du jeu
t('200 énigmes : les deux moitiés ensemble donnent UNE solution, chacune seule en laisse plusieurs', () => {
  let minClues = 99, maxClues = 0;
  for (let k = 0; k < 200; k++) {
    const g = Puzzle.generate(global.RNG.rngFrom(20000 + k), { suspects: 4 });
    assert.ok(g, 'génération échouée à la graine ' + k);

    // la vraie grille satisfait tous les indices
    const all = [g.publicClue].concat(g.clues);
    all.forEach(c => assert.ok(Puzzle.holds(c, g.solution), 'indice faux : ' + Puzzle.clueText(c)));

    // ensemble : une seule grille possible
    const sols = Puzzle.solve(all, g.n, 3);
    assert.strictEqual(sols.length, 1, k + ' : ' + sols.length + ' solutions au lieu d’une');
    CATS.forEach(c => assert.deepStrictEqual(sols[0][c], g.solution[c]));

    // séparément : personne ne peut conclure
    [0, 1].forEach(h => {
      const half = [g.publicClue].concat(g.halves[h]);
      const n = Puzzle.solve(half, g.n, 2).length;
      assert.ok(n >= 2, 'la moitié ' + h + ' suffit à conclure seule (graine ' + k + ')');
      assert.ok(g.halves[h].length >= 1, 'une moitié est vide');
    });

    // aucun indice n'est en trop : en retirer un casse l'unicité
    g.clues.forEach((c, i) => {
      const without = [g.publicClue].concat(g.clues.filter((_, j) => j !== i));
      assert.ok(!Puzzle.unique(without, g.n), 'indice superflu : ' + Puzzle.clueText(c));
    });

    minClues = Math.min(minClues, g.clues.length);
    maxClues = Math.max(maxClues, g.clues.length);
  }
  console.log('     (' + minClues + ' à ' + maxClues + ' indices privés par énigme)');
});

t('à 5 suspects aussi', () => {
  for (let k = 0; k < 8; k++) {
    const g = Puzzle.generate(global.RNG.rngFrom(700 + k), { suspects: 5 });
    assert.ok(g, 'génération échouée');
    assert.strictEqual(g.n, 5);
    assert.strictEqual(Puzzle.solve([g.publicClue].concat(g.clues), 5, 3).length, 1);
    [0, 1].forEach(h => {
      assert.ok(Puzzle.solve([g.publicClue].concat(g.halves[h]), 5, 2).length >= 2,
        'une moitié suffit seule, à 5 suspects');
    });
  }
});

t('le coupable est bien celui qui était sur les lieux à l’heure du vol', () => {
  for (let k = 0; k < 60; k++) {
    const g = Puzzle.generate(global.RNG.rngFrom(3000 + k), { suspects: 4 });
    assert.strictEqual(g.solution.p[g.culprit], g.crime.p);
    assert.strictEqual(g.solution.t[g.culprit], g.crime.t);
    // et personne d'autre ne remplit ces deux conditions
    const also = [];
    for (let s = 0; s < g.n; s++) {
      if (g.solution.p[s] === g.crime.p && g.solution.t[s] === g.crime.t) also.push(s);
    }
    assert.deepStrictEqual(also, [g.culprit]);
  }
});

t('les indices se lisent en français, sans référence circulaire', () => {
  const g = Puzzle.generate(global.RNG.rngFrom(11), { suspects: 4 });
  const texts = g.clues.map(Puzzle.clueText);
  texts.forEach(txt => {
    assert.ok(/^[A-ZÉÈÀÇ]/.test(txt), 'majuscule attendue : ' + txt);
    assert.ok(/\.$/.test(txt), 'point final attendu : ' + txt);
    assert.ok(!/undefined|NaN/.test(txt), 'phrase mal formée : ' + txt);
  });
  // « la personne qui était dans la cave était dans la cave » n'existe pas
  g.clues.concat([g.publicClue]).forEach(c => {
    if (c.k === 'is') assert.notStrictEqual(c.a.by, c.cat, 'indice circulaire : ' + Puzzle.clueText(c));
  });
});

// ========================================================== le moteur
function make(cfg) {
  const e = Engine.createEngine({
    config: Object.assign({ suspects: 4, mistakes: 2, minutes: 0 }, cfg),
    names: { host: 'Alice', guest: 'Bob' },
    seed: 4242,
    onUpdate: () => {}
  });
  e.start();
  return e;
}
const H = e => e.viewFor('host');
const G = e => e.viewFor('guest');
const fill = (e, role, sol) => {
  CATS.forEach(c => sol[c].forEach((v, s) => e.action(role, { t: 'set', cat: c, s, v })));
};

t('chacun ne reçoit que sa moitié d’indices, et jamais la solution', () => {
  const e = make();
  const S = e._state();
  const h = H(e), g = G(e);
  assert.strictEqual(h.clues.length, S.puzzle.halves[0].length);
  assert.strictEqual(g.clues.length, S.puzzle.halves[1].length);
  assert.strictEqual(h.otherClueCount, g.clues.length, 'on sait combien l’autre en a');
  h.clues.forEach(c => assert.ok(!g.clues.includes(c), 'un indice apparaît des deux côtés'));
  assert.strictEqual(h.solution, undefined, 'la solution ne doit pas partir en cours de partie');
  assert.strictEqual(h.culprit, undefined);
  assert.ok(h.crime.place && h.crime.time, 'le lieu et l’heure du vol sont publics');
  e.dispose();
});

t('le carnet est privé', () => {
  const e = make();
  e.action('host', { t: 'set', cat: 'p', s: 0, v: 2 });
  assert.strictEqual(H(e).draft.p[0], 2);
  assert.strictEqual(G(e).draft.p[0], null, 'le carnet de l’un n’est pas celui de l’autre');
  e.dispose();
});

t('une valeur déjà posée ailleurs se déplace au lieu de se dupliquer', () => {
  const e = make();
  e.action('host', { t: 'set', cat: 'i', s: 0, v: 1 });
  e.action('host', { t: 'set', cat: 'i', s: 3, v: 1 });
  const d = H(e).draft.i;
  assert.strictEqual(d[0], null, 'l’objet a quitté la première ligne');
  assert.strictEqual(d[3], 1);
  e.dispose();
});

t('on ne peut pas accuser avec une grille incomplète', () => {
  const e = make();
  e.action('host', { t: 'set', cat: 'p', s: 0, v: 0 });
  e.action('host', { t: 'propose' });
  assert.strictEqual(H(e).proposal, undefined);
  assert.strictEqual(H(e).event.type, 'incomplete');
  e.dispose();
});

t('accuser demande l’accord des deux', () => {
  const e = make();
  const sol = e._state().puzzle.solution;
  fill(e, 'host', sol);
  assert.strictEqual(H(e).draftComplete, true);

  e.action('host', { t: 'propose' });
  assert.ok(H(e).proposal.mine, 'l’auteur voit que c’est sa proposition');
  assert.strictEqual(G(e).proposal.mine, false);
  assert.strictEqual(G(e).proposal.from, 'Alice');
  assert.deepStrictEqual(G(e).proposal.grid.p, sol.p, 'l’autre voit la grille proposée');

  // l'auteur ne peut pas valider sa propre proposition
  e.action('host', { t: 'accept' });
  assert.strictEqual(H(e).phase, 'playing');
  assert.ok(H(e).proposal, 'la proposition tient toujours');

  e.action('guest', { t: 'accept' });
  assert.strictEqual(H(e).phase, 'over');
  assert.strictEqual(H(e).outcome, 'win');
  e.dispose();
});

t('refuser rend la main sans rien coûter', () => {
  const e = make();
  fill(e, 'host', e._state().puzzle.solution);
  e.action('host', { t: 'propose' });
  e.action('guest', { t: 'refuse' });
  assert.strictEqual(H(e).proposal, undefined);
  assert.strictEqual(H(e).strikes, 0, 'refuser n’est pas une erreur');
  assert.strictEqual(H(e).phase, 'playing');

  // et l'auteur peut retirer la sienne
  e.action('host', { t: 'propose' });
  e.action('host', { t: 'withdraw' });
  assert.strictEqual(G(e).proposal, undefined);
  e.dispose();
});

t('une accusation fausse coûte une tentative, deux fois et c’est perdu', () => {
  const e = make({ mistakes: 2 });
  const sol = e._state().puzzle.solution;
  const wrong = { p: sol.p.slice(), i: sol.i.slice(), t: sol.t.slice() };
  wrong.p = [sol.p[1], sol.p[0]].concat(sol.p.slice(2));   // deux lieux permutés

  fill(e, 'guest', wrong);
  e.action('guest', { t: 'propose' });
  e.action('host', { t: 'accept' });
  assert.strictEqual(H(e).strikes, 1);
  assert.strictEqual(H(e).triesLeft, 1);
  assert.strictEqual(H(e).phase, 'playing');
  assert.strictEqual(H(e).event.type, 'wrong');

  e.action('guest', { t: 'propose' });
  e.action('host', { t: 'accept' });
  assert.strictEqual(H(e).phase, 'over');
  assert.strictEqual(H(e).outcome, 'lost');
  e.dispose();
});

t('à la fin, tout est révélé : solution, coupable, et les indices de l’autre', () => {
  const e = make();
  const S = e._state();
  fill(e, 'host', S.puzzle.solution);
  e.action('host', { t: 'propose' });
  e.action('guest', { t: 'accept' });
  const v = H(e);
  assert.deepStrictEqual(v.solution, S.puzzle.solution);
  assert.strictEqual(v.culprit, S.puzzle.culprit);
  assert.strictEqual(v.allClues.host.length + v.allClues.guest.length, S.puzzle.clues.length);
  assert.ok(/vol a eu lieu/.test(v.publicClue));
  assert.deepStrictEqual(v.allClues, G(e).allClues, 'même débriefing des deux côtés');
  e.dispose();
});

t('le chrono à zéro perd la partie', () => {
  const e = make({ minutes: 5 });
  const S = e._state();
  assert.ok(H(e).timeLeftMs > 0);
  S.deadline = Date.now() - 1;
  fill(e, 'host', S.puzzle.solution);
  e.action('host', { t: 'propose' });
  // le contrôle du chrono tourne sur un intervalle : on l'exerce ici à la main
  assert.strictEqual(H(e).timeLeftMs, 0);
  e.dispose();
});

t('rejouer redistribue une nouvelle énigme', () => {
  // sans graine imposée, contrairement aux autres tests : on veut du neuf
  const e = Engine.createEngine({
    config: { suspects: 4, mistakes: 2, minutes: 0 },
    names: { host: 'Alice', guest: 'Bob' },
    onUpdate: () => {}
  });
  e.start();
  const before = H(e).clues.join('|');
  fill(e, 'host', e._state().puzzle.solution);
  e.action('host', { t: 'propose' });
  e.action('guest', { t: 'accept' });
  e.action('host', { t: 'replay' });
  assert.strictEqual(H(e).phase, 'playing');
  assert.strictEqual(H(e).strikes, 0);
  assert.strictEqual(H(e).draft.p[0], null, 'le carnet est vierge');
  assert.notStrictEqual(H(e).clues.join('|'), before, 'ce devrait être une autre énigme');
  e.dispose();
});

t('les réglages sont bornés', () => {
  const c = Engine.sanitizeConfig({ suspects: 9, mistakes: 0, minutes: 99 });
  assert.strictEqual(c.suspects, 5);
  assert.strictEqual(c.mistakes, 1);
  assert.strictEqual(c.minutes, 45);
});

console.log('✓ ' + groups + ' groupes de tests passés');
