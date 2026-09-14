/* Les différences, test d'interface : deux grilles sur deux onglets, l'accord
 * obligatoire, la pénalité, puis le débriefing.
 *   python3 -m http.server 8000
 *   node test/differences.e2e.js
 */
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const BASE = process.env.BASE || 'http://localhost:8000';
const SHOTS = process.env.SHOTS || path.join(__dirname, '..', '.shots-diff');
const GAME = '/games/differences/index.html?local=1';

const steps = [];
const ok = m => steps.push('· ' + m);
const fail = m => { throw new Error(m); };

/** Le contenu dessiné de chaque case, tel qu'il est vraiment à l'écran. */
const cellsOf = page => page.$$eval('#d-grid .cell svg', els => els.map(e => e.innerHTML));

(async () => {
  fs.mkdirSync(SHOTS, { recursive: true });
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 900, height: 1100 } });
  const errors = [];
  ctx.on('page', p => {
    p.on('pageerror', e => errors.push(e.message));
    p.on('console', m => {
      if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push(m.text());
    });
  });

  const A = await ctx.newPage(), B = await ctx.newPage();
  await A.goto(BASE + GAME);
  await A.fill('#f-name', 'Alice');
  await A.click('#go-create');
  await A.waitForSelector('#c-cols');
  await A.fill('#c-cols', '4');
  await A.fill('#c-rows', '3');
  await A.fill('#c-diffs', '3');
  await A.fill('#c-secs', '120');
  await A.fill('#c-pen', '20');
  const calc = (await A.textContent('#c-calc')).replace(/\s+/g, ' ');
  if (!/3 différences/.test(calc) || !/12 cases/.test(calc)) fail('réglages mal résumés : ' + calc);
  ok('réglages : ' + calc.trim());
  await A.click('#create');
  await A.waitForFunction(() => /^[A-Z0-9]{4}$/.test(document.querySelector('#the-code').textContent.trim()));
  const code = (await A.textContent('#the-code')).trim();

  await B.goto(BASE + GAME + '&room=' + code);
  await B.waitForSelector('#join-code');
  await B.fill('#j-name', 'Bob');
  await B.click('#join');
  await A.waitForFunction(() => /a rejoint/.test(document.querySelector('#lobby-status').textContent), null, { timeout: 8000 });
  await A.click('#start');
  await A.waitForSelector('#d-grid', { timeout: 8000 });
  await B.waitForSelector('#d-grid', { timeout: 8000 });

  // --- les deux grilles diffèrent vraiment, et de trois cases
  const ga = await cellsOf(A), gb = await cellsOf(B);
  if (ga.length !== 12) fail('12 cases attendues, ' + ga.length + ' affichées');
  const differing = ga.filter((c, i) => c !== gb[i]).length;
  if (differing !== 3) fail('trois cases devraient différer à l’écran, ' + differing + ' diffèrent');
  ok('deux grilles de 12 cases, trois cases réellement différentes à l’écran');

  // --- rien ne fuite chez l'autre
  const leak = await B.evaluate(() => JSON.stringify(window.__room.view()));
  if (/"both"|"diffs":\[/.test(leak)) fail('la grille de l’autre ou la liste des différences fuite');
  ok('aucun des deux ne reçoit la grille de l’autre');

  const diffs = await A.evaluate(() => window.__room.engine()._state().scene.diffs.map(d => d.i));
  const plain = await A.evaluate(() => {
    const S = window.__room.engine()._state();
    for (let i = 0; i < S.scene.cols * S.scene.rows; i++) if (!S.scene.diffs.some(d => d.i === i)) return i;
    return -1;
  });
  await A.screenshot({ path: path.join(SHOTS, '01-grille-a.png') });
  await B.screenshot({ path: path.join(SHOTS, '02-grille-b.png') });

  // --- un seul doigt ne suffit pas, et on ne dit pas à l'autre où il pointe
  if (await A.evaluate(() => window.__room.view().timerStarted)) fail('le chrono ne doit pas tourner avant le premier clic');
  await A.click('.cell[data-i="' + diffs[0] + '"]');
  await A.waitForFunction(() => window.__room.view().timerStarted === true, null, { timeout: 4000 });
  const stA = await A.textContent('#d-status');
  const stB = await B.textContent('#d-status');
  if (!/Tu pointes/.test(stA)) fail('le joueur doit voir la case qu’il pointe : ' + stA);
  if (/[A-D][1-3]/.test(stB)) fail('la case pointée ne doit pas être révélée à l’autre : ' + stB);
  if (!/pointe une case/.test(stB)) fail('l’autre doit savoir qu’on attend : ' + stB);
  if (await A.evaluate(() => window.__room.view().found.length)) fail('un seul clic ne valide rien');
  ok('un seul doigt : l’autre sait qu’on attend, sans savoir où');

  // --- deux cases différentes : on recommence, sans pénalité
  const otherDiff = diffs[1];
  await B.click('.cell[data-i="' + otherDiff + '"]');
  await A.waitForFunction(() => window.__room.view().yourFlag === null, null, { timeout: 4000 });
  if (await A.evaluate(() => window.__room.view().strikes)) fail('ne pas pointer la même case n’est pas une erreur');
  if (!/différentes/.test(await A.textContent('#d-status'))) fail('il faut le dire quand les cases ne correspondent pas');
  ok('deux cases différentes : les doigts sont retirés, aucune pénalité');

  // --- l'accord des deux valide
  await A.click('.cell[data-i="' + diffs[0] + '"]');
  await B.click('.cell[data-i="' + diffs[0] + '"]');
  await A.waitForFunction(() => window.__room.view().found.length === 1, null, { timeout: 4000 });
  if (!await B.$('.cell[data-i="' + diffs[0] + '"].found')) fail('la case trouvée doit être marquée des deux côtés');
  ok('accord des deux : la différence est validée sur les deux écrans');

  // --- un accord qui tombe à côté coûte du temps
  const before = await A.evaluate(() => window.__room.view().timeLeftMs);
  await A.click('.cell[data-i="' + plain + '"]');
  await B.click('.cell[data-i="' + plain + '"]');
  await A.waitForFunction(() => window.__room.view().strikes === 1, null, { timeout: 4000 });
  const after = await A.evaluate(() => window.__room.view().timeLeftMs);
  if (after > before - 19000) fail('la pénalité de 20 s n’a pas été appliquée');
  if (!/erreur/.test(await A.textContent('#d-strikes'))) fail('l’erreur doit apparaître dans le bandeau');
  ok('accord sur une case identique : 20 s en moins, marqué au tableau');

  // --- on finit la partie
  for (const i of diffs.slice(1)) {
    await A.click('.cell[data-i="' + i + '"]');
    await B.click('.cell[data-i="' + i + '"]');
    await A.waitForTimeout(80);
  }
  await A.waitForSelector('#replay', { timeout: 6000 });
  await B.waitForSelector('#replay', { timeout: 6000 });
  const score = (await A.textContent('.score-big')).replace(/\s+/g, ' ');
  if (!/3\s*\/\s*3/.test(score)) fail('score final attendu 3/3, obtenu ' + score);
  const compare = await A.$$('.compare .gd-frame');
  if (compare.length !== 2) fail('le débriefing doit montrer les deux grilles');
  const recap = await A.textContent('.recap-list');
  if (!/(forme|couleur|taille|remplissage)/.test(recap)) fail('chaque différence doit être expliquée : ' + recap);
  ok('gagné : 3/3, les deux grilles côte à côte et les différences expliquées');
  await A.screenshot({ path: path.join(SHOTS, '03-debrief.png'), fullPage: true });

  // --- nouvelle image
  await A.click('#replay');
  await A.waitForSelector('#d-grid', { timeout: 6000 });
  await B.waitForSelector('#d-grid', { timeout: 6000 });
  const ga2 = await cellsOf(A), gb2 = await cellsOf(B);
  if (ga2.filter((c, i) => c !== gb2[i]).length !== 3) fail('la nouvelle image doit avoir trois différences elle aussi');
  if (ga2.join('') === ga.join('')) fail('la nouvelle image devrait être différente de la précédente');
  if (await A.evaluate(() => window.__room.view().found.length)) fail('le compteur devrait repartir de zéro');
  ok('nouvelle image : une autre grille, trois différences, compteur remis à zéro');

  // ------------------------------------------------------------- mobile
  const M = await ctx.newPage();
  await M.setViewportSize({ width: 390, height: 844 });
  await M.goto(BASE + GAME);
  const overflow = await M.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  if (overflow > 1) fail('débordement horizontal sur mobile : ' + overflow + 'px');
  await M.screenshot({ path: path.join(SHOTS, '04-mobile.png') });
  ok('pas de scroll horizontal en 390px');

  await browser.close();
  if (errors.length) {
    console.error('Erreurs JS détectées :\n' + errors.join('\n'));
    process.exitCode = 1;
  }
  steps.forEach(s => console.log('  ' + s));
  console.log('✓ différences : parcours complet validé');
})().catch(err => {
  steps.forEach(s => console.log('  ' + s));
  console.error('✗ ' + err.message);
  console.error((err.stack || '').split('\n').slice(0, 5).join('\n'));
  process.exit(1);
});
