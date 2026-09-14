/* L'enquête, test d'interface : deux dossiers différents, un carnet privé,
 * et une accusation qui demande l'accord des deux.
 *   python3 -m http.server 8000
 *   node test/enquete.e2e.js
 */
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const BASE = process.env.BASE || 'http://localhost:8000';
const SHOTS = process.env.SHOTS || path.join(__dirname, '..', '.shots-enq');
const GAME = '/games/enquete/index.html?local=1';

const steps = [];
const ok = m => steps.push('· ' + m);
const fail = m => { throw new Error(m); };

/** Remplit le carnet d'une page avec la grille donnée. */
async function fillBook(page, sol) {
  for (const cat of ['p', 'i', 't']) {
    for (let s = 0; s < sol[cat].length; s++) {
      await page.selectOption('#e-grid select[data-cat="' + cat + '"][data-s="' + s + '"]', String(sol[cat][s]));
      await page.waitForTimeout(25);
    }
  }
}

(async () => {
  fs.mkdirSync(SHOTS, { recursive: true });
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 900, height: 1300 } });
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
  await A.waitForSelector('#c-susp');
  await A.fill('#c-susp', '4');
  await A.fill('#c-mist', '2');
  await A.fill('#c-min', '12');
  const calc = (await A.textContent('#c-calc')).replace(/\s+/g, ' ');
  if (!/4 suspects/.test(calc) || !/12 minutes/.test(calc)) fail('réglages mal résumés : ' + calc);
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
  await A.waitForSelector('#e-grid', { timeout: 10000 });
  await B.waitForSelector('#e-grid', { timeout: 10000 });

  // --- deux dossiers, aucun indice en commun, pas de solution dans les vues
  const cluesA = await A.$$eval('#e-file .clues li', els => els.map(e => e.textContent.trim()));
  const cluesB = await B.$$eval('#e-file .clues li', els => els.map(e => e.textContent.trim()));
  if (!cluesA.length || !cluesB.length) fail('chaque joueur doit recevoir des indices');
  const shared = cluesA.filter(c => cluesB.includes(c));
  if (shared.length) fail('un indice se retrouve dans les deux dossiers : ' + shared[0]);
  const leak = await A.evaluate(() => JSON.stringify(window.__room.view()));
  if (/"solution"|"culprit"/.test(leak)) fail('la solution fuite en cours de partie');
  ok(cluesA.length + ' indices chez Alice, ' + cluesB.length + ' chez Bob, aucun en commun');
  await A.screenshot({ path: path.join(SHOTS, '01-dossier.png'), fullPage: true });

  // --- le lieu et l'heure du vol sont publics et identiques
  const crimeA = (await A.textContent('.crime')).replace(/\s+/g, ' ');
  const crimeB = (await B.textContent('.crime')).replace(/\s+/g, ' ');
  if (crimeA !== crimeB) fail('le dossier public devrait être le même : ' + crimeA + ' / ' + crimeB);
  ok('le lieu et l’heure du vol sont connus des deux');

  // --- ni l'un ni l'autre ne peut conclure seul (vérifié sur l'énigme servie)
  const solvable = await A.evaluate(() => {
    const S = window.__room.engine()._state();
    const half = h => window.Puzzle.solve([S.puzzle.publicClue].concat(S.puzzle.halves[h]), S.puzzle.n, 2).length;
    const all = window.Puzzle.solve([S.puzzle.publicClue].concat(S.puzzle.clues), S.puzzle.n, 3).length;
    return { a: half(0), b: half(1), all };
  });
  if (solvable.all !== 1) fail('l’énigme servie n’a pas une solution unique');
  if (solvable.a < 2 || solvable.b < 2) fail('une moitié suffit à conclure seule');
  ok('énigme servie : une seule solution à deux, plusieurs pour chacun seul');

  // --- le carnet est privé
  await A.selectOption('#e-grid select[data-cat="p"][data-s="0"]', '1');
  await A.waitForTimeout(200);
  if (await B.evaluate(() => window.__room.view().draft.p[0]) !== null) fail('le carnet de l’un est visible chez l’autre');
  ok('le carnet reste privé');

  // --- une grille incomplète ne part pas
  if (!await A.$('#e-propose[disabled]')) fail('le bouton doit rester inerte tant que la grille est incomplète');
  ok('impossible de proposer une grille incomplète');

  // --- Alice remplit la bonne grille et propose
  const sol = await A.evaluate(() => window.__room.engine()._state().puzzle.solution);
  await fillBook(A, sol);
  await A.waitForFunction(() => window.__room.view().draftComplete === true, null, { timeout: 5000 });
  await A.click('#e-propose');
  await B.waitForSelector('.deal.theirs', { timeout: 5000 });
  if (!await A.$('.deal.mine')) fail('l’auteur doit voir que sa proposition est partie');
  const proposed = await B.$$eval('.deal .carnet .pick', els => els.map(e => e.value).join(','));
  if (!proposed.length) fail('la proposition doit être lisible chez l’autre');
  if (!await B.$('.deal select[disabled]')) fail('la proposition doit être en lecture seule');
  ok('proposition envoyée : Bob la voit en lecture seule');
  await B.screenshot({ path: path.join(SHOTS, '02-proposition.png'), fullPage: true });

  // --- l'auteur ne peut pas s'auto-valider
  if (await A.$('.deal.mine [data-act="accept"]')) fail('l’auteur ne doit pas pouvoir accuser lui-même');
  ok('l’auteur d’une proposition ne peut pas la valider seul');

  // --- refuser ne coûte rien
  await B.click('.deal [data-act="refuse"]');
  await A.waitForFunction(() => !window.__room.view().proposal, null, { timeout: 5000 });
  if (await A.evaluate(() => window.__room.view().strikes)) fail('refuser ne doit rien coûter');
  ok('refuser rend la main, sans pénalité');

  // --- accuser pour de bon
  await A.click('#e-propose');
  await B.waitForSelector('.deal.theirs', { timeout: 5000 });
  await B.click('.deal [data-act="accept"]');
  await A.waitForSelector('#replay', { timeout: 6000 });
  await B.waitForSelector('#replay', { timeout: 6000 });
  const verdict = await A.textContent('.verdict');
  if (!/C’était bien/.test(verdict)) fail('le verdict devrait être gagnant : ' + verdict);
  if (!await A.$('.carnet.final .cr-row.culprit')) fail('le coupable doit être mis en évidence');
  const allClues = await A.$$eval('.clue-cols .clues li', els => els.length);
  if (allClues !== cluesA.length + cluesB.length) fail('tous les indices doivent être réunis à la fin');
  ok('accusation validée : coupable démasqué et indices réunis');
  await A.screenshot({ path: path.join(SHOTS, '03-verdict.png'), fullPage: true });

  // --- nouvelle enquête
  await A.click('#replay');
  await A.waitForSelector('#e-grid', { timeout: 8000 });
  const cluesA2 = await A.$$eval('#e-file .clues li', els => els.map(e => e.textContent.trim()));
  if (cluesA2.join('|') === cluesA.join('|')) fail('la nouvelle enquête devrait être différente');
  if (await A.evaluate(() => window.__room.view().draft.p[0]) !== null) fail('le carnet devrait être vierge');
  ok('nouvelle enquête : autres indices, carnet vierge');

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
  console.log('✓ enquête : parcours complet validé');
})().catch(err => {
  steps.forEach(s => console.log('  ' + s));
  console.error('✗ ' + err.message);
  console.error((err.stack || '').split('\n').slice(0, 5).join('\n'));
  process.exit(1);
});
