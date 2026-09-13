/* Modules de la bombe : pour des centaines de bombes différentes, la solution
 * décrite par le manuel doit toujours désamorcer, et une action fausse doit
 * toujours provoquer une erreur.
 *   node test/modules.test.js
 */
const assert = require('assert');
const Bomb = require('../games/desamorcage/bomb.js');
global.Bomb = Bomb;
const Modules = require('../games/desamorcage/modules.js');

let groups = 0;
function t(name, fn) {
  try { fn(); groups++; console.log('  · ' + name); }
  catch (e) { console.error('✗ ' + name + '\n   ' + e.message); process.exitCode = 1; }
}

const SEEDS = 400;
const clone = o => JSON.parse(JSON.stringify(o));

function bombFor(seed) {
  const rng = Bomb.rngFrom(seed);
  return Bomb.makeWidgets(rng);
}

/** Rejoue la solution de référence sur un module fraîchement généré. */
function playSolution(mod, seed, strikes) {
  const rng = Bomb.rngFrom(seed * 7919 + 13);
  const bomb = bombFor(seed);
  const state = mod.generate(rng, bomb);
  const ctx = { strikes: strikes || 0, timeLeftMs: 300000, heldMs: 0 };
  const plan = mod.solve(clone(state), bomb, ctx);

  let result = 'noop';
  for (const a of plan.actions) {
    // le bouton dépend du chrono : on se place sur une seconde qui convient
    if (mod.id === 'bouton' && a.type === 'up') {
      ctx.heldMs = a.quick ? 200 : 1500;
      if (!a.quick) {
        // un temps dont l'affichage m:ss contient le chiffre attendu
        for (let s = 600; s > 0; s--) {
          if (Modules.clockDigits(s * 1000).includes(plan.digit)) { ctx.timeLeftMs = s * 1000; break; }
        }
      }
    }
    result = mod.act(state, bomb, ctx, a);
    assert.notStrictEqual(result, 'strike',
      mod.id + ' : la solution du manuel provoque une erreur (graine ' + seed + ')');
  }
  return { result, state, bomb, mod };
}

// ------------------------------------------------------- cohérence générale
Modules.list.forEach(mod => {
  t('« ' + mod.name + ' » se désamorce avec la solution du manuel (' + SEEDS + ' bombes)', () => {
    for (let seed = 1; seed <= SEEDS; seed++) {
      const strikes = seed % 3;               // la séquence dépend du nombre d'erreurs
      const { result } = playSolution(mod, seed, strikes);
      assert.strictEqual(result, 'ok',
        mod.id + ' non résolu à la fin de la solution (graine ' + seed + ')');
    }
  });
});

// ------------------------------------------------------- une action fausse
t('une action fausse provoque une erreur sur chaque module', () => {
  const wrong = {
    fils: (st, plan) => ({ type: 'cut', i: (plan.actions[0].i + 1) % st.wires.length }),
    bouton: () => ({ type: 'up' }),
    sequence: (st, plan) => ({ type: 'press', color: ['rouge', 'bleu', 'vert', 'jaune'].find(c => c !== plan.order[0]) }),
    motdepasse: () => ({ type: 'submit' }),
    morse: () => ({ type: 'send' }),
    symboles: (st, plan) => ({ type: 'key', sym: plan.order[1] })
  };
  Modules.list.forEach(mod => {
    let seen = 0;
    for (let seed = 1; seed <= 60; seed++) {
      const rng = Bomb.rngFrom(seed * 31 + 5);
      const bomb = bombFor(seed);
      const state = mod.generate(rng, bomb);
      const ctx = { strikes: 0, timeLeftMs: 300000, heldMs: 1500 };
      const plan = mod.solve(clone(state), bomb, ctx);

      if (mod.id === 'bouton') {
        // relâcher tout de suite quand il faut maintenir (et l'inverse)
        mod.act(state, bomb, ctx, { type: 'down' });
        ctx.heldMs = plan.hold ? 100 : 1500;
        if (!plan.hold) ctx.timeLeftMs = 300000;
      }
      if (mod.id === 'morse') {
        state.index = (state.freqs.indexOf(plan.freq) + 3) % state.freqs.length;
      }
      if (mod.id === 'motdepasse') {
        state.pos[0] = (state.cols[0].indexOf(plan.word[0]) + 1) % 6;
      }
      const a = wrong[mod.id](state, plan);
      if (!a) continue;
      const r = mod.act(state, bomb, ctx, a);
      assert.strictEqual(r, 'strike', mod.id + ' aurait dû signaler une erreur (graine ' + seed + ')');
      seen++;
    }
    assert.ok(seen > 0, mod.id + ' : aucun cas testé');
  });
});

// ----------------------------------------------------- invariants par module
t('les fils : toujours 3 à 6 fils et un fil à couper valide', () => {
  const mod = Modules.byId('fils');
  for (let seed = 1; seed <= SEEDS; seed++) {
    const bomb = bombFor(seed);
    const st = mod.generate(Bomb.rngFrom(seed), bomb);
    assert.ok(st.wires.length >= 3 && st.wires.length <= 6);
    const i = mod.solve(st, bomb, {}).actions[0].i;
    assert.ok(i >= 0 && i < st.wires.length, 'index hors bornes : ' + i);
  }
});

t('le mot de passe : un seul mot formable, et il fait 5 lettres', () => {
  const mod = Modules.byId('motdepasse');
  Modules.tables.PASSWORDS.forEach(w => assert.strictEqual(w.length, 5, w + ' ne fait pas 5 lettres'));
  for (let seed = 1; seed <= SEEDS; seed++) {
    const st = mod.generate(Bomb.rngFrom(seed), bombFor(seed));
    assert.strictEqual(st.cols.length, 5);
    st.cols.forEach(c => assert.strictEqual(new Set(c).size, 6, 'lettres dupliquées dans une colonne'));
    const matches = Modules.tables.PASSWORDS.filter(w =>
      w.split('').every((ch, i) => st.cols[i].includes(ch)));
    assert.strictEqual(matches.length, 1, 'mots formables : ' + matches.join(', ') + ' (graine ' + seed + ')');
  }
});

t('le morse : le signal se décode et pointe sur une fréquence du manuel', () => {
  const mod = Modules.byId('morse');
  for (let seed = 1; seed <= SEEDS; seed++) {
    const st = mod.generate(Bomb.rngFrom(seed), bombFor(seed));
    const word = Modules.fromMorse(st.signal);
    assert.ok(Modules.tables.MORSE_WORDS.includes(word), 'mot inconnu : ' + word);
    assert.ok(Modules.tables.FREQS.includes(mod.solve(st, null, {}).freq));
  }
  // aucun mot du manuel ne produit le même signal qu'un autre
  const sigs = Modules.tables.MORSE_WORDS.map(Modules.toMorse);
  assert.strictEqual(new Set(sigs).size, sigs.length, 'deux mots ont le même signal morse');
});

t('le clavier : une seule colonne contient les quatre symboles', () => {
  const mod = Modules.byId('symboles');
  for (let seed = 1; seed <= SEEDS; seed++) {
    const st = mod.generate(Bomb.rngFrom(seed), bombFor(seed));
    assert.strictEqual(st.keys.length, 4);
    assert.strictEqual(Modules.symbolColumns(st.keys).length, 1,
      'symboles ambigus : ' + st.keys.join(' ') + ' (graine ' + seed + ')');
  }
});

t('la séquence : la table change avec le nombre d’erreurs', () => {
  const mod = Modules.byId('sequence');
  const bomb = bombFor(3);
  const st = mod.generate(Bomb.rngFrom(3), bomb);
  const a = mod.solve(st, bomb, { strikes: 0 }).order.join('');
  const b = mod.solve(st, bomb, { strikes: 1 }).order.join('');
  assert.notStrictEqual(a, b, 'la traduction devrait changer après une erreur');
  // chaque table est une permutation des quatre couleurs
  ['voyelle', 'sans'].forEach(k => Modules.tables.SEQ_TABLES[k].forEach((row, i) => {
    assert.strictEqual(new Set(Object.values(row)).size, 4, 'table ' + k + '[' + i + '] non bijective');
  }));
});

t('les repères de la bombe sont bien formés', () => {
  for (let seed = 1; seed <= SEEDS; seed++) {
    const b = bombFor(seed);
    assert.strictEqual(b.serial.length, 6);
    assert.ok(/\d$/.test(b.serial), 'le numéro de série doit finir par un chiffre : ' + b.serial);
    assert.ok(b.batteries >= 0 && b.batteries <= 5);
    assert.strictEqual(b.indicators.length, 3);
    assert.strictEqual(new Set(b.indicators.map(i => i.code)).size, 3, 'voyants dupliqués');
  }
});

console.log('✓ ' + groups + ' groupes de tests passés');
