/* Pictionary, test d'interface : deux onglets, un canevas partagé, une manche
 * complète puis l'inversion des rôles.
 *   python3 -m http.server 8000
 *   node test/pictionary.e2e.js
 */
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const BASE = process.env.BASE || 'http://localhost:8000';
const SHOTS = process.env.SHOTS || path.join(__dirname, '..', '.shots-picto');
const GAME = '/games/pictionary/index.html?local=1';

const steps = [];
const ok = m => steps.push('· ' + m);
const fail = m => { throw new Error(m); };

/** Nombre de pixels peints sur le canevas d'une page. */
const inkOf = page => page.evaluate(() => {
  const c = document.querySelector('#pi-canvas');
  if (!c) return -1;
  const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
  let n = 0;
  for (let i = 3; i < d.length; i += 4) if (d[i] > 8) n++;
  return n;
});

/** Nombre de pixels quasi blancs — la couleur par défaut du crayon. */
const whiteOf = page => page.evaluate(() => {
  const c = document.querySelector('#pi-canvas');
  const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
  let n = 0;
  for (let i = 0; i < d.length; i += 4) {
    if (d[i + 3] > 40 && d[i] > 200 && d[i + 1] > 200 && d[i + 2] > 200) n++;
  }
  return n;
});

/** Trace un trait à la souris sur le canevas. `pause` : temps d'arrêt entre
 *  deux segments, pour imiter quelqu'un qui dessine lentement. */
async function scribble(page, pts, pause) {
  const box = await page.locator('#pi-canvas').boundingBox();
  const at = ([x, y]) => [box.x + box.width * x, box.y + box.height * y];
  await page.mouse.move(...at(pts[0]));
  await page.mouse.down();
  for (const p of pts.slice(1)) {
    await page.mouse.move(...at(p), { steps: 6 });
    if (pause) await page.waitForTimeout(pause);
  }
  await page.mouse.up();
  await page.waitForTimeout(150);
}

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
  await A.waitForSelector('#c-words');
  await A.fill('#c-words', '2');
  await A.fill('#c-secs', '60');
  await A.fill('#c-each', '1');
  await A.click('label:has(#c-len) .txt');
  if (!await A.isChecked('#c-len')) fail('l’interrupteur « nombre de lettres » ne bascule pas au clic sur son libellé');
  const calc = (await A.textContent('#c-calc')).replace(/\s+/g, ' ');
  if (!/2 manches/.test(calc) || !/4 dessins/.test(calc)) fail('réglages mal résumés : ' + calc);
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
  await A.waitForSelector('#pi-canvas', { timeout: 8000 });
  await B.waitForSelector('#pi-form', { timeout: 8000 });

  // --- le mot ne part que chez le dessinateur
  const word = (await A.textContent('.the-word')).trim();
  if (!word) fail('le dessinateur devrait voir son mot');
  const textB = await B.textContent('#app');
  if (textB.toLowerCase().includes(word.toLowerCase())) fail('le mot « ' + word + ' » a fuité chez le devineur !');
  const leaked = await B.evaluate(() => JSON.stringify(window.__room.view()));
  if (leaked.toLowerCase().includes(word.toLowerCase())) fail('le mot fuite dans la vue du devineur');
  ok('mot « ' + word + ' » visible chez le dessinateur seulement');

  // --- l'indice de longueur est là, sans les lettres
  const lb = (await B.textContent('.lettersbar .lb-num')).trim();
  const letters = word.replace(/[^A-Za-zÀ-ÿ]/g, '').length;
  if (lb !== String(letters)) fail('nombre de lettres attendu ' + letters + ', affiché : ' + lb);
  const dashes = await B.$$eval('.lettersbar .grp i', els => els.length);
  if (dashes !== letters) fail('il devrait y avoir ' + letters + ' tirets, il y en a ' + dashes);
  ok('le devineur voit « ' + letters + ' lettres » et rien d’autre');

  if (!/Aucune proposition/.test(await A.textContent('#pi-guesses'))) fail('la liste des essais doit être annoncée dès le départ');

  // --- le chrono attend le premier trait
  if (await A.evaluate(() => window.__room.view().timerStarted)) fail('le chrono ne doit pas tourner avant le 1er trait');
  const before = await inkOf(B);
  await scribble(A, [[0.2, 0.25], [0.5, 0.4], [0.75, 0.3], [0.55, 0.75], [0.3, 0.6]]);
  await B.waitForFunction(n => {
    const c = document.querySelector('#pi-canvas');
    const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
    let k = 0;
    for (let i = 3; i < d.length; i += 4) if (d[i] > 8) k++;
    return k > n + 500;
  }, before, { timeout: 6000 });
  await A.waitForFunction(() => window.__room.view().timerStarted === true, null, { timeout: 4000 });
  await B.waitForFunction(() => window.__room.view().timerStarted === true, null, { timeout: 4000 });
  ok('le trait arrive en direct sur l’autre écran (' + (await inkOf(B)) + ' px) et lance le chrono');
  await A.screenshot({ path: path.join(SHOTS, '01-dessin.png') });
  await B.screenshot({ path: path.join(SHOTS, '02-devine.png') });

  // --- outils : changer d'épaisseur puis annuler le trait
  await A.click('.wd:nth-child(3)');
  await scribble(A, [[0.15, 0.85], [0.85, 0.85]]);
  const twoStrokes = await inkOf(B);
  await A.click('[data-act="undo"]');
  await B.waitForFunction(n => {
    const c = document.querySelector('#pi-canvas');
    const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
    let k = 0;
    for (let i = 3; i < d.length; i += 4) if (d[i] > 8) k++;
    return k < n;
  }, twoStrokes, { timeout: 5000 });
  ok('« annuler » retire le dernier trait des deux côtés');

  // --- un trait tracé LENTEMENT garde sa couleur chez celui qui reçoit.
  //     (régression : la fin de trait était devinée sur un silence de 220 ms,
  //      et la suite repartait avec le crayon par défaut, donc en blanc)
  await A.click('[data-act="wipe"]');
  await B.waitForFunction(() => {
    const c = document.querySelector('#pi-canvas');
    const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
    for (let i = 3; i < d.length; i += 4) if (d[i] > 8) return false;
    return true;
  }, null, { timeout: 5000 });
  await A.click('.swatches .sw:nth-child(2)');       // rouge
  await scribble(A, [[0.2, 0.2], [0.8, 0.2], [0.8, 0.8], [0.2, 0.8], [0.2, 0.2]], 700);
  await B.waitForFunction(() => {
    const c = document.querySelector('#pi-canvas');
    const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
    let k = 0;
    for (let i = 3; i < d.length; i += 4) if (d[i] > 8) k++;
    return k > 2000;
  }, null, { timeout: 8000 });
  const whiteB = await whiteOf(B);
  if (whiteB > 20) fail('le trait rouge est arrivé en blanc chez le devineur (' + whiteB + ' px blancs)');
  if (await whiteOf(A) > 20) fail('le dessinateur voit du blanc alors qu’il dessine en rouge');
  ok('un tracé lent (pauses de 0,7 s) reste rouge des deux côtés');
  await B.screenshot({ path: path.join(SHOTS, '02b-couleur.png') });

  await A.click('[data-act="wipe"]');
  await A.click('.swatches .sw:nth-child(1)');

  // --- une proposition fausse s'affiche chez les deux
  await B.fill('#pi-input', 'chapeau melon');
  await B.press('#pi-input', 'Enter');
  await A.waitForFunction(() => /chapeau melon/.test(document.querySelector('#pi-guesses').textContent), null, { timeout: 5000 });
  if (await A.evaluate(() => window.__room.view().total) !== 0) fail('une proposition fausse ne doit rien marquer');
  ok('le dessinateur voit les essais ratés du devineur');

  // --- la bonne réponse
  await B.fill('#pi-input', word.toUpperCase());
  await B.press('#pi-input', 'Enter');
  await B.waitForSelector('.reveal.on', { timeout: 5000 });
  await A.waitForSelector('.reveal.on', { timeout: 5000 });
  if (!(await B.textContent('.reveal')).includes(word)) fail('le mot doit être révélé au devineur');
  ok('bonne réponse : révélation sur les deux écrans');
  await B.screenshot({ path: path.join(SHOTS, '03-trouve.png') });

  // --- mot suivant : canevas remis à blanc partout
  await A.waitForFunction(() => window.__room.view().wordIndex === 1, null, { timeout: 6000 });
  await A.waitForTimeout(250);
  if (await inkOf(A) > 200) fail('le canevas du dessinateur n’a pas été effacé');
  if (await inkOf(B) > 200) fail('le canevas du devineur n’a pas été effacé');
  const word2 = (await A.textContent('.the-word')).trim();
  if (word2 === word) fail('le mot suivant devrait être différent');
  ok('mot 2 (« ' + word2 + ' ») : canevas vierge des deux côtés');

  // --- validation manuelle par le dessinateur
  await A.click('[data-act="found"]');
  await A.waitForSelector('#next', { timeout: 8000 });
  await B.waitForSelector('#next', { timeout: 8000 });
  const recap = (await A.textContent('.score-big')).replace(/\s+/g, ' ');
  if (!/2\s*\/\s*2/.test(recap)) fail('récap de manche attendu 2/2, obtenu ' + recap);
  ok('« il a trouvé » valide le mot — manche 1 : 2/2');
  await A.screenshot({ path: path.join(SHOTS, '04-recap.png') });

  // --- manche 2 : les rôles s'inversent
  await A.click('#next');
  await B.waitForSelector('#pi-canvas', { timeout: 6000 });
  await A.waitForSelector('#pi-form', { timeout: 6000 });
  if (!await B.$('[data-act="found"]')) fail('en manche 2, c’est l’invité qui doit dessiner');
  ok('manche 2 : c’est à Bob de dessiner');

  await B.click('[data-act="pass"]');
  await B.waitForFunction(() => window.__room.view().wordIndex === 1, null, { timeout: 8000 });
  await B.click('[data-act="found"]');
  await A.waitForSelector('#next', { timeout: 8000 });
  await A.click('#next');
  await A.waitForSelector('#replay', { timeout: 6000 });
  await B.waitForSelector('#replay', { timeout: 6000 });
  const final = (await A.textContent('.score-big')).replace(/\s+/g, ' ');
  if (!/3\s*\/\s*4/.test(final)) fail('résultat final attendu 3/4, obtenu ' + final);
  ok('résultat final : 3/4 (un mot passé)');
  await A.screenshot({ path: path.join(SHOTS, '05-final.png'), fullPage: true });

  // --- rejouer repart proprement
  await A.click('#replay');
  await A.waitForSelector('#pi-canvas', { timeout: 6000 });
  if (await A.evaluate(() => window.__room.view().total) !== 0) fail('le score devrait repartir de zéro');
  if (await inkOf(A) > 200) fail('le canevas devrait être vierge après « rejouer »');
  ok('rejouer : score à zéro et canevas vierge');

  // ------------------------------------------------------------- mobile
  const M = await ctx.newPage();
  await M.setViewportSize({ width: 390, height: 844 });
  await M.goto(BASE + GAME);
  const overflow = await M.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  if (overflow > 1) fail('débordement horizontal sur mobile : ' + overflow + 'px');
  await M.screenshot({ path: path.join(SHOTS, '06-mobile.png') });
  ok('pas de scroll horizontal en 390px');

  await browser.close();
  if (errors.length) {
    console.error('Erreurs JS détectées :\n' + errors.join('\n'));
    process.exitCode = 1;
  }
  steps.forEach(s => console.log('  ' + s));
  console.log('✓ pictionary : parcours complet validé');
})().catch(err => {
  steps.forEach(s => console.log('  ' + s));
  console.error('✗ ' + err.message);
  console.error((err.stack || '').split('\n').slice(0, 5).join('\n'));
  process.exit(1);
});
