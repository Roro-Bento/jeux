/* Test d'interface : une partie complète jouée sur deux onglets.
 * Prérequis : un serveur statique sur http://localhost:8000
 *   python3 -m http.server 8000
 *   node test/ui.e2e.js
 */
const { chromium } = require('playwright');
const path = require('path');

const BASE = process.env.BASE || 'http://localhost:8000';
const SHOTS = process.env.SHOTS || path.join(__dirname, '..', '.shots');
const fs = require('fs');

async function expectFocus(page, msg) {
  await page.bringToFront();               // chaque joueur a son écran au premier plan
  try {
    await page.waitForFunction(
      () => document.activeElement && document.activeElement.id === 'g-input',
      null, { timeout: 4000 });
  } catch (e) {
    const id = await page.evaluate(() => document.activeElement && document.activeElement.id);
    throw new Error(msg + ' (focus = ' + (id || 'aucun') + ')');
  }
}

const steps = [];
function ok(msg) { steps.push('· ' + msg); }
function fail(msg) { throw new Error(msg); }

(async () => {
  fs.mkdirSync(SHOTS, { recursive: true });
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 900, height: 1000 } });
  const A = await ctx.newPage();   // hôte
  const B = await ctx.newPage();   // invité
  const errors = [];
  [A, B].forEach((p, i) => {
    p.on('pageerror', e => errors.push('page' + i + ': ' + e.message));
    p.on('console', m => {
      // on ignore le CDN de polices, bloqué dans les environnements hors-ligne
      if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) {
        errors.push('console' + i + ': ' + m.text());
      }
    });
  });

  // ---------------------------------------------------------------- création
  await A.goto(BASE + '/games/mot-de-passe/index.html?local=1');
  await A.fill('#f-name', 'Alice');
  await A.click('#go-create');
  await A.waitForSelector('#c-words');
  await A.fill('#c-words', '2');
  await A.fill('#c-time', '20');
  await A.fill('#c-tries', '2');
  const calc = (await A.textContent('#c-calc')).replace(/\s+/g, ' ');
  if (!/2 × 20 s = 40 s/.test(calc)) fail('le total de la manche n’est pas annoncé : ' + calc);
  ok('écran de réglages : « ' + calc.trim() + ' »');
  await A.screenshot({ path: path.join(SHOTS, '01-config.png') });
  await A.click('#create');
  await A.waitForFunction(() => {
    const c = document.querySelector('#the-code');
    return c && /^[A-Z0-9]{4}$/.test(c.textContent.trim());
  });
  const code = (await A.textContent('#the-code')).trim();
  ok('room créée, code = ' + code);
  await A.screenshot({ path: path.join(SHOTS, '02-lobby-hote.png') });

  // ------------------------------------------------------------ arrivée du 2e
  await B.goto(BASE + '/games/mot-de-passe/index.html?local=1&room=' + code);
  await B.waitForSelector('#join-code');
  if ((await B.inputValue('#join-code')) !== code) fail('le code du lien n’est pas prérempli');
  await B.fill('#j-name', 'Bob');
  await B.click('#join');
  await A.waitForFunction(() => /a rejoint/.test(document.querySelector('#lobby-status').textContent), null, { timeout: 8000 });
  ok('le 2e joueur a rejoint via le lien');
  await A.screenshot({ path: path.join(SHOTS, '03-lobby-complet.png') });

  await A.click('#start');
  await A.waitForSelector('#g-word');
  await B.waitForSelector('#g-word');
  ok('partie lancée sur les deux onglets');

  // ------------------------------------------------------------ vérifs manche
  const secret = (await A.textContent('#g-word')).trim();
  const hidden = (await B.textContent('#g-word')).trim();
  if (!secret || secret === '···') fail('le donneur d’indice ne voit pas le mot');
  if (hidden === secret) fail('le devineur voit le mot !');
  ok('mot visible côté donneur uniquement (« ' + secret + ' » vs « ' + hidden + ' »)');

  const lb = await B.$('#g-letters .lettersbar');
  if (!lb) fail('le bandeau « nombre de lettres » n’est pas affiché');
  const lbNum = parseInt(await B.textContent('#g-letters .lb-num'), 10);
  const lbSlots = await B.$$eval('#g-letters .grp i', els => els.length);
  if (lbNum !== secret.replace(/[^A-Za-zÀ-ÿ]/g, '').length) fail('nombre de lettres faux : ' + lbNum);
  if (lbSlots !== lbNum) fail('nombre de tirets ≠ nombre de lettres');
  const lbBox = await lb.boundingBox();
  if (!lbBox || lbBox.height < 40) fail('le bandeau des lettres est trop discret');
  ok('bandeau des lettres bien visible : ' + lbNum + ' lettres, ' + lbSlots + ' tirets');

  await expectFocus(A, 'le champ du donneur d’indice n’est pas focus au départ');
  ok('champ du donneur focus automatiquement');

  if (await A.getAttribute('#g-timer', 'class') === null) fail('pas de chrono');
  if (!(await A.getAttribute('#g-timer', 'class')).includes('idle')) fail('le chrono tourne avant le 1er indice');
  const t0 = (await A.textContent('#g-timer-num')).trim();
  if (t0 !== '40') fail('le chrono doit afficher le total de la manche (2 mots × 20 s = 40), pas ' + t0);
  ok('chrono global affiché : ' + t0 + ' s pour la manche entière');

  // -------------------------------------------------------- indice interdit
  await A.fill('#g-input', secret);
  await A.click('#g-send');
  await A.waitForFunction(() => /Interdit/.test(document.querySelector('#g-msg').textContent), null, { timeout: 4000 });
  ok('indice = le mot → refusé avec message');
  await A.screenshot({ path: path.join(SHOTS, '04-indice-interdit.png') });

  // ------------------------------------------------------------ indice valide
  await A.fill('#g-input', 'zorglub');
  await A.click('#g-send');
  await B.waitForFunction(() => /zorglub/.test(document.querySelector('#g-word').textContent), null, { timeout: 6000 });
  if (!/zorglub/.test(await B.textContent('#g-exchange'))) {
    fail('l’indice devrait aussi apparaître dans l’historique au-dessus du champ');
  }
  if (!await B.$('#g-exchange li.clue.current')) {
    fail('l’indice en cours n’est pas mis en évidence dans l’historique');
  }
  const bigClue = (await B.textContent('#g-word')).trim();
  if (bigClue !== 'zorglub') fail('l’indice n’est pas affiché en grand chez le devineur (« ' + bigClue + ' »)');
  const clueSize = await B.evaluate(() => parseFloat(getComputedStyle(document.querySelector('#g-word')).fontSize));
  if (clueSize < 32) fail('l’indice est affiché trop petit : ' + clueSize + 'px');
  if (!(await B.getAttribute('#g-word', 'class')).includes('clue-big')) fail('l’indice n’a pas le style mis en avant');
  ok('indice affiché en grand chez le devineur (' + Math.round(clueSize) + 'px)');

  await A.waitForFunction(() => !document.querySelector('#g-timer').classList.contains('idle'), null, { timeout: 4000 });
  ok('chrono démarré au premier indice');

  await expectFocus(B, 'le champ du devineur n’est pas focus après l’indice');
  if (!(await A.isDisabled('#g-input'))) fail('le donneur peut encore taper alors que ce n’est pas son tour');
  ok('la main (et le focus) passe automatiquement au devineur');
  await B.screenshot({ path: path.join(SHOTS, '05-devineur.png') });

  // ---------------------------------------------------------- mauvais essai
  await B.fill('#g-input', 'totalementfaux');
  await B.click('#g-send');
  await A.waitForFunction(() => !document.querySelector('#g-input').disabled, null, { timeout: 6000 });
  await expectFocus(A, 'la main ne revient pas au donneur d’indice');
  ok('essai raté → la main revient au donneur, focus compris');

  // ------------------------------------------------------------- mot trouvé
  await A.fill('#g-input', 'machin');
  await A.click('#g-send');
  await B.waitForFunction(() => !document.querySelector('#g-input').disabled, null, { timeout: 6000 });
  await B.fill('#g-input', secret.toUpperCase());
  await B.click('#g-send');
  await A.waitForFunction(() => /BRAVO|Dans la boîte/.test(document.body.textContent), null, { timeout: 6000 });
  ok('mot trouvé (casse ignorée) + animation de réussite');
  await A.screenshot({ path: path.join(SHOTS, '06-trouve.png') });

  // ----------------------------------------------------- 2e mot : on passe
  await A.waitForFunction(() => {
    const s = document.querySelector('#g-sub');
    return s && /Mot 2 sur 2/.test(s.textContent);
  }, null, { timeout: 8000 });
  ok('enchaînement automatique vers le mot suivant');
  const tLeft = parseInt((await A.textContent('#g-timer-num')).trim(), 10);
  if (!(tLeft < 40)) fail('le chrono est reparti de zéro au mot 2 (' + tLeft + ') : il doit être global');
  ok('chrono global : il reste ' + tLeft + ' s en arrivant sur le mot 2 (pas de remise à 40)');
  await A.click('#g-pass');
  await A.waitForSelector('#next', { timeout: 8000 });
  await B.waitForSelector('#next', { timeout: 8000 });
  ok('récap de fin de manche affiché des deux côtés');
  await A.screenshot({ path: path.join(SHOTS, '07-recap-manche.png') });

  const recapTxt = await A.textContent('.recap-list');
  if (!recapTxt.includes(secret)) fail('le mot trouvé n’apparaît pas dans le récap');
  if (!/1\s*\/\s*2/.test(await A.textContent('.score-big'))) fail('score de manche incorrect');
  ok('récap : 1/2, mots réussis et passés listés');

  // -------------------------------------------------------------- manche 2
  await B.click('#next');
  await A.waitForSelector('#g-word', { timeout: 8000 });
  await B.waitForSelector('#g-word', { timeout: 8000 });
  const secret2 = (await B.textContent('#g-word')).trim();
  const hidden2 = (await A.textContent('#g-word')).trim();
  if (secret2 === hidden2) fail('les rôles ne se sont pas inversés');
  ok('manche 2 : les rôles sont inversés');
  await B.screenshot({ path: path.join(SHOTS, '08-manche2.png') });

  // on joue les 2 mots de la manche 2
  for (let i = 0; i < 2; i++) {
    const w = (await B.textContent('#g-word')).trim();
    await B.fill('#g-input', ['alpha', 'bravo'][i]);
    await B.click('#g-send');
    await A.waitForFunction(() => !document.querySelector('#g-input').disabled, null, { timeout: 6000 });
    await A.fill('#g-input', w);
    await A.click('#g-send');
    if (i === 0) {
      await B.waitForFunction(() => {
        const s = document.querySelector('#g-sub');
        return s && /Mot 2 sur 2/.test(s.textContent);
      }, null, { timeout: 8000 });
    }
  }

  await A.waitForSelector('#next', { timeout: 9000 });
  if (!/2\s*\/\s*2/.test(await A.textContent('.score-big'))) fail('score de la manche 2 incorrect');
  ok('récap de manche 2 : 2/2');
  await A.click('#next');
  await A.waitForSelector('#replay', { timeout: 9000 });
  await B.waitForSelector('#replay', { timeout: 9000 });
  const total = await A.textContent('.score-big');
  if (!/3\s*\/\s*4/.test(total)) fail('score global attendu 3/4, obtenu : ' + total.replace(/\s+/g, ' '));
  ok('récap global : 3/4, bouton Rejouer présent');
  await A.screenshot({ path: path.join(SHOTS, '09-final.png'), fullPage: true });

  // --------------------------------------------------------------- rejouer
  await A.click('#replay');
  await A.waitForSelector('#g-word', { timeout: 8000 });
  await B.waitForSelector('#g-word', { timeout: 8000 });
  const badge = await A.textContent('#g-round');
  if (!/Manche 1\/2/.test(badge)) fail('Rejouer ne repart pas à la manche 1');
  const sub = await A.textContent('#g-sub');
  if (!/Mot 1 sur 2/.test(sub)) fail('Rejouer ne conserve pas le nombre de mots configuré');
  if ((await A.textContent('#g-score')).trim() !== '0 pt') fail('le score n’est pas remis à zéro');
  ok('Rejouer : même config (2 mots), score remis à zéro');

  // ---------------------------------------------------------- mobile check
  const M = await ctx.newPage();
  await M.setViewportSize({ width: 390, height: 844 });
  await M.goto(BASE + '/games/mot-de-passe/index.html?local=1');
  const overflow = await M.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  if (overflow > 1) fail('débordement horizontal sur mobile : ' + overflow + 'px');
  await M.screenshot({ path: path.join(SHOTS, '10-mobile.png') });
  ok('pas de scroll horizontal en 390px');

  await browser.close();

  if (errors.length) {
    console.error('Erreurs JS détectées :\n' + errors.join('\n'));
    process.exitCode = 1;
  }
  steps.forEach(s => console.log('  ' + s));
  console.log('✓ interface : parcours complet validé');
})().catch(async err => {
  steps.forEach(s => console.log('  ' + s));
  console.error('✗ ' + err.message);
  console.error(err.stack.split('\n').slice(0, 6).join('\n'));
  process.exit(1);
});
