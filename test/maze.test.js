/* Labyrinthe : génération du plan et moteur.
   node test/maze.test.js */
const assert = require('assert');
global.window = global;
const RNG = require('../common/rng.js');
global.RNG = RNG;
const Maze = require('../games/labyrinthe/maze.js');
global.Maze = Maze;
const Engine = require('../games/labyrinthe/engine.js');

let groups = 0;
function t(name, fn) {
  try { fn(); groups++; console.log('  · ' + name); }
  catch (e) { console.error('✗ ' + name + '\n   ' + e.message); process.exitCode = 1; }
}

/** Chemin le plus court en évitant les pièges, exprimé en directions. */
function route(maze, from, to) {
  const blocked = {};
  maze.traps.forEach(c => { blocked[c] = true; });
  const prev = new Map([[from, null]]);
  const queue = [from];
  while (queue.length) {
    const cur = queue.shift();
    if (cur === to) break;
    for (const d of Maze.DIRS) {
      if (!Maze.open(maze, cur, d)) continue;
      const n = Maze.neighbour(maze, cur, d);
      if (prev.has(n) || blocked[n]) continue;
      prev.set(n, { from: cur, dir: d });
      queue.push(n);
    }
  }
  if (!prev.has(to)) return null;
  const out = [];
  let cur = to;
  while (prev.get(cur)) { out.unshift(prev.get(cur).dir); cur = prev.get(cur).from; }
  return out;
}

// ------------------------------------------------------------- génération
t('300 labyrinthes : toujours une sortie atteignable sans marcher sur un piège', () => {
  for (let seed = 1; seed <= 300; seed++) {
    const m = Maze.create(RNG.rngFrom(seed), { size: 9, traps: 6, beacons: 4 });
    assert.strictEqual(m.cells.length, 81);
    assert.notStrictEqual(m.start, m.exit, 'départ et sortie confondus');
    assert.ok(m.traps.indexOf(m.start) === -1 && m.traps.indexOf(m.exit) === -1);
    m.beacons.forEach(b => assert.ok(m.traps.indexOf(b.cell) === -1, 'une balise est posée sur un piège'));
    assert.strictEqual(new Set(m.beacons.map(b => b.cell)).size, m.beacons.length, 'deux balises sur la même case');
    assert.ok(route(m, m.start, m.exit), 'aucune route sans piège (graine ' + seed + ')');
  }
});

t('aucun blocage possible : ni case murée, ni piège qui enferme (400 labyrinthes)', () => {
  for (let seed = 1; seed <= 400; seed++) {
    const m = Maze.create(RNG.rngFrom(seed * 3 + 1), { size: 9, traps: 8, beacons: 4 });

    // 1. le creusage relie toutes les cases : aucune ne peut être murée des 4 côtés
    for (let i = 0; i < m.cells.length; i++) {
      const ways = Maze.DIRS.filter(d => Maze.open(m, i, d)).length;
      assert.ok(ways >= 1, 'la case ' + i + ' est murée de tous les côtés (graine ' + seed + ')');
    }

    // 2. depuis le départ, la sortie est atteignable sans jamais marcher sur un piège
    const blocked = {};
    m.traps.forEach(c => { blocked[c] = true; });
    const dist = Maze.distances(m, m.start, blocked);
    assert.notStrictEqual(dist[m.exit], -1, 'sortie inatteignable sans piège (graine ' + seed + ')');

    // 3. et surtout : partout où l'explorateur peut aller, la sortie reste
    //    atteignable. Comme il est repoussé dès qu'il touche un piège, il ne
    //    quitte jamais cette zone — il ne peut donc jamais rester coincé.
    for (let i = 0; i < m.cells.length; i++) {
      if (dist[i] === -1) continue;                 // zone inaccessible, il n'y ira jamais
      assert.notStrictEqual(Maze.distances(m, i, blocked)[m.exit], -1,
        'depuis la case ' + i + ' on ne peut plus sortir (graine ' + seed + ')');
    }
  }
});

t('les murs sont cohérents entre cases voisines', () => {
  for (let seed = 1; seed <= 100; seed++) {
    const m = Maze.create(RNG.rngFrom(seed), { size: 7, traps: 4, beacons: 3 });
    for (let i = 0; i < m.cells.length; i++) {
      for (const d of Maze.DIRS) {
        const n = Maze.neighbour(m, i, d);
        if (n === -1) continue;
        assert.strictEqual(m.cells[i][d], m.cells[n][Maze.OPPOSITE[d]],
          'mur asymétrique entre ' + i + ' et ' + n);
      }
    }
  }
});

t('le labyrinthe a des boucles (sinon le plan se devine trop vite)', () => {
  let withLoops = 0;
  for (let seed = 1; seed <= 60; seed++) {
    const m = Maze.create(RNG.rngFrom(seed), { size: 9, traps: 0, beacons: 0 });
    let openings = 0;
    for (let i = 0; i < m.cells.length; i++) {
      for (const d of Maze.DIRS) {
        if (Maze.open(m, i, d)) openings++;
      }
    }
    // un labyrinthe parfait de n cases a exactement n-1 passages (×2 sens)
    if (openings / 2 > m.cells.length - 1) withLoops++;
  }
  assert.strictEqual(withLoops, 60, 'certains labyrinthes sont des arbres parfaits');
});

t('la vue de l’explorateur ne décrit que sa case', () => {
  const m = Maze.create(RNG.rngFrom(7), { size: 9, traps: 6, beacons: 4 });
  const look = Maze.look(m, m.start);
  assert.deepStrictEqual(Object.keys(look).sort(), ['beacon', 'nearExit', 'onExit', 'walls']);
  Maze.DIRS.forEach(d => assert.strictEqual(typeof look.walls[d], 'boolean'));
  const onBeacon = Maze.look(m, m.beacons[0].cell);
  assert.ok(onBeacon.beacon && onBeacon.beacon.label, 'la balise sous les pieds doit être visible');
});

// ----------------------------------------------------------------- moteur
t('moteur : séparation des vues, pas, murs, pièges, deux manches', () => {
  const e = Engine.createEngine({
    config: { size: 9, traps: 6, beacons: 4, seconds: 300, trapPenalty: 15 },
    names: { host: 'Alice', guest: 'Bob' },
    seed: 4242,
    onUpdate: () => {}
  });
  e.start();
  const H = () => e.viewFor('host');
  const G = () => e.viewFor('guest');
  const S = e._state();

  // --- qui voit quoi
  assert.ok(H().isWalker, 'l’hôte explore en manche 1');
  assert.ok(H().here && H().here.walls, 'l’explorateur voit sa case');
  assert.strictEqual(H().maze, undefined, 'l’explorateur ne doit pas recevoir le plan');
  assert.strictEqual(G().here, undefined, 'le guide ne doit pas recevoir la case courante');
  assert.ok(G().maze && G().maze.cells.length === 81, 'le guide reçoit le plan');
  assert.strictEqual(G().maze.start, undefined, 'le guide ne doit pas connaître le départ');
  assert.ok(Array.isArray(G().maze.traps) && G().maze.traps.length > 0, 'le guide voit les pièges');
  assert.ok(G().maze.beacons.every(b => b.cell >= 0), 'le guide voit les balises');

  // --- le guide ne peut pas bouger
  e.action('guest', { t: 'move', dir: 'n' });
  assert.strictEqual(H().moves, 0, 'le guide ne doit pas pouvoir déplacer l’explorateur');
  assert.strictEqual(H().timerStarted, false, 'le chrono ne démarre pas tout seul');

  // --- se cogner dans un mur ne coûte pas un pas
  const m1 = S.mazes[1];
  const wallDir = Maze.DIRS.find(d => !Maze.open(m1, S.pos, d));
  if (wallDir) {
    e.action('host', { t: 'move', dir: wallDir });
    assert.strictEqual(H().moves, 0, 'un mur ne compte pas comme un pas');
    assert.strictEqual(H().event.type, 'bump');
    assert.strictEqual(H().timerStarted, true, 'le chrono démarre au premier geste');
  }

  // --- marcher sur un piège : on recule et on perd du temps
  const trapRoute = (() => {
    for (const trap of m1.traps) {
      const r = route(m1, m1.start, trap);
      if (r && r.length) return { trap, r };
      // le piège n'est pas atteignable sans traverser un autre piège : on cherche un voisin
      for (const d of Maze.DIRS) {
        const n = Maze.neighbour(m1, trap, d);
        if (n === -1 || !Maze.open(m1, trap, d)) continue;
        const r2 = route(m1, m1.start, n);
        if (r2) return { trap, r: r2.concat([Maze.OPPOSITE[d]]) };
      }
    }
    return null;
  })();
  assert.ok(trapRoute, 'aucun piège atteignable pour le test');
  trapRoute.r.forEach(d => e.action('host', { t: 'move', dir: d }));
  assert.strictEqual(H().trapsHit, 1, 'le piège doit être compté');
  assert.strictEqual(S.pos, Maze.neighbour(m1, trapRoute.trap, Maze.OPPOSITE[trapRoute.r[trapRoute.r.length - 1]]),
    'on doit être repoussé sur la case précédente');
  assert.ok(H().timeLeftMs < 300000 - 14000, 'la pénalité de temps doit être appliquée');

  // --- sortir
  const rest = route(m1, S.pos, m1.exit);
  assert.ok(rest, 'plus de route vers la sortie');
  rest.forEach(d => e.action('host', { t: 'move', dir: d }));
  assert.strictEqual(H().phase, 'roundRecap');
  assert.strictEqual(H().log[1].finished, true);
  assert.ok(H().log[1].moves > 0);
  assert.ok(H().maze && H().reveal, 'au débriefing, l’explorateur voit enfin le plan et son trajet');
  assert.ok(G().reveal.path.length > 1);

  // --- manche 2 : les rôles s'inversent
  e.action('guest', { t: 'next' });
  assert.strictEqual(H().round, 2);
  assert.strictEqual(H().isWalker, false, 'l’hôte devient guide');
  assert.strictEqual(G().isWalker, true);
  assert.ok(G().here && !G().maze);
  assert.ok(H().maze && !H().here);

  const m2 = e._state().mazes[2];
  route(m2, m2.start, m2.exit).forEach(d => e.action('guest', { t: 'move', dir: d }));
  assert.strictEqual(H().phase, 'roundRecap');
  e.action('host', { t: 'next' });
  assert.strictEqual(H().phase, 'gameOver');
  assert.strictEqual(H().solvedRounds, 2);
  assert.strictEqual(H().rounds.length, 2);
  assert.ok(H().rounds[0].path.length > 1 && H().rounds[1].path.length > 1);

  // --- rejouer
  e.action('host', { t: 'replay' });
  assert.strictEqual(H().phase, 'playing');
  assert.strictEqual(H().round, 1);
  assert.strictEqual(H().moves, 0);
  assert.strictEqual(H().trapsHit, 0);
  assert.strictEqual(H().timerStarted, false);
  e.dispose();
});

t('moteur : le temps écoulé termine la manche', done => {
  const e = Engine.createEngine({
    config: { size: 7, traps: 2, beacons: 3, seconds: 30 },
    seed: 9, onUpdate: () => {}
  });
  e.start();
  const S = e._state();
  const dir = Maze.DIRS.find(d => Maze.open(S.mazes[1], S.pos, d));
  e.action('host', { t: 'move', dir: dir });          // démarre le chrono
  S.deadline = Date.now() + 60;                        // on force la fin
  const started = Date.now();
  while (Date.now() - started < 400) { /* attente courte, synchrone */ }
  // le test est synchrone : on déclenche la vérification via une action
  e.action('host', { t: 'move', dir: dir });
  const v = e.viewFor('host');
  assert.ok(v.phase === 'roundRecap' || v.timeLeftMs === 0, 'la manche devait s’arrêter');
  e.dispose();
});

console.log('✓ ' + groups + ' groupes de tests passés');
