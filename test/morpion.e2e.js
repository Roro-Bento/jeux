/* Morpion, test d'interface : une manche jouée à la souris sur deux onglets,
 * puis vérification des contraintes du super morpion.
 *   python3 -m http.server 8000
 *   node test/morpion.e2e.js
 */
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const BASE = process.env.BASE || 'http://localhost:8000';
const SHOTS = process.env.SHOTS || path.join(__dirname, '..', '.shots-morpion');
const GAME = '/games/morpion/index.html?local=1';

const steps = [];
const ok = m => steps.push('· ' + m);
const fail = m => { throw new Error(m); };

async function startRoom(ctx, cfg) {
  const A = await ctx.newPage(), B = await ctx.newPage();
  await A.goto(BASE + GAME);
  await A.fill('#f-name', 'Alice');
  await A.click('#go-create');
  await A.waitForSelector('#c-rounds');
  await A.fill('#c-rounds', String(cfg.rounds));
  if (cfg.ultimate) await A.click('label.toggle:has(#c-ultimate)');
  await A.click('#create');
  await A.waitForFunction(() => /^[A-Z0-9]{4}$/.test(document.querySelector('#the-code').textContent.trim()));
  const code = (await A.textContent('#the-code')).trim();
  await B.goto(BASE + GAME + '&room=' + code);
  await B.waitForSelector('#join-code');
  await B.fill('#j-name', 'Bob');
  await B.click('#join');
  await A.waitForFunction(() => /a rejoint/.test(document.querySelector('#lobby-status').textContent), null, { timeout: 8000 });
  await A.click('#start');
  await A.waitForSelector('.grid', { timeout: 8000 });
  await B.waitForSelector('.grid', { timeout: 8000 });
  return { A, B };
}

/** joue une case sur la page de celui dont c'est le tour */
async function move(A, B, b, c) {
  const turnOnA = await A.evaluate(() => window.__room.view().yourTurn);
  const page = turnOnA ? A : B;
  await page.click('.cell[data-b="' + b + '"][data-c="' + c + '"]');
  await page.waitForTimeout(60);
}

(async () => {
  fs.mkdirSync(SHOTS, { recursive: true });
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 900, height: 1000 } });
  const errors = [];
  ctx.on('page', p => {
    p.on('pageerror', e => errors.push(e.message));
    p.on('console', m => {
      if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push(m.text());
    });
  });

  // ================================================== partie 1 : classique
  const { A, B } = await startRoom(ctx, { rounds: 2 });
  ok('room créée, série de 2 manches en classique');

  const you = await A.evaluate(() => window.__room.view().you);
  if (you !== 'x') fail('l’hôte devrait jouer les croix, il a « ' + you + ' »');
  if (await B.evaluate(() => window.__room.view().yourTurn)) fail('ce n’est pas à l’invité de commencer');
  const disabled = await B.$$eval('.cell[disabled]', els => els.length);
  if (disabled !== 9) fail('le plateau devrait être verrouillé chez celui qui n’a pas la main');
  ok('les croix commencent : le plateau de l’autre est verrouillé');
  await A.screenshot({ path: path.join(SHOTS, '01-classique.png') });

  // x gagne la ligne du haut
  for (const c of [0, 3, 1, 4, 2]) await move(A, B, 0, c);
  await A.waitForSelector('#next', { timeout: 6000 });
  await B.waitForSelector('#next', { timeout: 6000 });
  const recapA = await A.textContent('#app');
  const recapB = await B.textContent('#app');
  if (!/Tu gagnes la manche/.test(recapA)) fail('le gagnant devrait lire « Tu gagnes la manche »');
  if (!/Alice gagne la manche/.test(recapB)) fail('le perdant devrait lire le nom du gagnant : ' + recapB.slice(0, 120));
  if (!await A.$('.cell.winline')) fail('la ligne gagnante n’est pas mise en évidence');
  ok('manche gagnée : ligne surlignée, récap adapté à chaque écran');
  await A.screenshot({ path: path.join(SHOTS, '02-recap.png') });

  await B.click('#next');
  await A.waitForSelector('.grid', { timeout: 6000 });
  if (!await B.evaluate(() => window.__room.view().yourTurn)) fail('c’est aux ronds de commencer la manche 2');
  ok('manche 2 : c’est l’autre qui commence');

  // les ronds gagnent la colonne de gauche
  for (const c of [0, 1, 3, 2, 6]) await move(A, B, 0, c);
  await A.waitForSelector('#next', { timeout: 6000 });
  await A.click('#next');
  await A.waitForSelector('#replay', { timeout: 6000 });
  const final = await A.textContent('.final-score');
  if (final.replace(/\s/g, '') !== '1–1') fail('score final attendu 1–1, obtenu ' + final.replace(/\s/g, ''));
  ok('fin de série : score 1–1 affiché des deux côtés');
  await A.screenshot({ path: path.join(SHOTS, '03-final.png'), fullPage: true });
  await A.close(); await B.close();

  // =============================================== partie 2 : super morpion
  const r2 = await startRoom(ctx, { rounds: 1, ultimate: true });
  const cells = await r2.A.$$eval('.mini .cell', els => els.length);
  if (cells !== 81) fail('le super morpion devrait avoir 81 cases, il en a ' + cells);
  ok('super morpion : 9 grilles de 9 cases');

  await move(r2.A, r2.B, 4, 2);
  await r2.B.waitForTimeout(120);
  const target = await r2.B.evaluate(() => window.__room.view().active);
  if (target !== 2) fail('la case jouée devait envoyer en grille 2, pas ' + target);
  const targets = await r2.B.$$eval('.mini.target', els => els.length);
  if (targets !== 1) fail('la grille imposée n’est pas mise en évidence');
  const openElsewhere = await r2.B.$$eval('.mini:not(.target) .cell:not([disabled])', els => els.length);
  if (openElsewhere !== 0) fail(openElsewhere + ' cases restent cliquables hors de la grille imposée');
  ok('super morpion : seule la grille imposée est jouable, les autres sont verrouillées');
  await r2.B.screenshot({ path: path.join(SHOTS, '04-super.png') });
  await r2.A.close(); await r2.B.close();

  // ===================================================== partie 3 : mobile
  const M = await ctx.newPage();
  await M.setViewportSize({ width: 390, height: 844 });
  await M.goto(BASE + GAME);
  const overflow = await M.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  if (overflow > 1) fail('débordement horizontal sur mobile : ' + overflow + 'px');
  await M.screenshot({ path: path.join(SHOTS, '05-mobile.png') });
  ok('pas de scroll horizontal en 390px');

  await browser.close();
  if (errors.length) {
    console.error('Erreurs JS détectées :\n' + errors.join('\n'));
    process.exitCode = 1;
  }
  steps.forEach(s => console.log('  ' + s));
  console.log('✓ morpion : parcours complet validé');
})().catch(err => {
  steps.forEach(s => console.log('  ' + s));
  console.error('✗ ' + err.message);
  console.error((err.stack || '').split('\n').slice(0, 5).join('\n'));
  process.exit(1);
});
