/* Pendu, test d'interface : deux manches jouées sur deux onglets, au clavier
 * comme à la souris.
 *   python3 -m http.server 8000
 *   node test/pendu.e2e.js
 */
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const BASE = process.env.BASE || 'http://localhost:8000';
const SHOTS = process.env.SHOTS || path.join(__dirname, '..', '.shots-pendu');
const GAME = '/games/pendu/index.html?local=1';

const steps = [];
const ok = m => steps.push('· ' + m);
const fail = m => { throw new Error(m); };

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

  const A = await ctx.newPage(), B = await ctx.newPage();
  await A.goto(BASE + GAME);
  await A.fill('#f-name', 'Alice');
  await A.click('#go-create');
  await A.waitForSelector('#c-lives');
  await A.fill('#c-lives', '4');
  await A.fill('#c-each', '1');
  const calc = (await A.textContent('#c-calc')).replace(/\s+/g, ' ');
  if (!/2 manches/.test(calc) || !/4 erreurs/.test(calc)) fail('réglages mal résumés : ' + calc);
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
  await A.waitForSelector('#p-word', { timeout: 8000 });
  await B.waitForSelector('.waiting', { timeout: 8000 });
  ok('manche 1 : l’hôte choisit, l’invité patiente');
  await A.screenshot({ path: path.join(SHOTS, '01-choisir.png') });

  // --- « piocher un mot » remplit le champ sans lancer la manche
  await A.click('[data-act="draw"]');
  await A.waitForFunction(() => document.querySelector('#p-word').value.length > 3, null, { timeout: 4000 });
  const drawn = await A.inputValue('#p-word');
  if (await B.$('.slots')) fail('piocher ne doit pas démarrer la manche');
  ok('« piocher un mot » propose « ' + drawn +' » sans démarrer');

  // --- un mot refusé ne passe pas
  await A.fill('#p-word', 'a1');
  await A.click('[data-act="setword"]');
  await A.waitForFunction(() => document.querySelector('#p-msg').textContent.length > 0, null, { timeout: 4000 });
  if (await B.$('.slots')) fail('un mot invalide a démarré la manche');
  ok('mot invalide refusé : « ' + (await A.textContent('#p-msg')).trim() + ' »');

  // --- le vrai mot
  await A.fill('#p-word', 'Éléphant');
  await A.click('[data-act="setword"]');
  await B.waitForSelector('.keyboard', { timeout: 6000 });
  const bodyB = await B.textContent('#app');
  if (/phant/i.test(bodyB)) fail('le mot a fuité chez le devineur !');
  const slots = await B.$$eval('.slots .slot', els => els.length);
  if (slots !== 8) fail('8 cases attendues, ' + slots + ' affichées');
  const chooserWord = await A.textContent('.chooser-word');
  if (!/Éléphant/.test(chooserWord)) fail('celui qui fait deviner devrait voir son mot');
  ok('mot posé : 8 cases chez le devineur, mot visible seulement chez l’autre');
  await B.screenshot({ path: path.join(SHOTS, '02-deviner.png') });

  // --- une lettre accentuée se révèle avec la lettre simple, au clavier
  await B.bringToFront();
  await B.keyboard.press('e');
  await B.waitForFunction(() => document.querySelectorAll('.slots .slot.filled').length > 0, null, { timeout: 4000 });
  const filled = await B.$$eval('.slots .slot.filled', els => els.map(e => e.textContent).join(''));
  if (filled !== 'Éé') fail('É et é auraient dû se révéler ensemble, obtenu « ' + filled + ' »');
  ok('la lettre E révèle É et é d’un coup (saisie au clavier)');

  // --- une erreur fait avancer le dessin
  const before = await B.$$eval('.gallows .part.on', els => els.length);
  await B.click('.key[data-l="z"]');
  await B.waitForFunction(n => document.querySelectorAll('.gallows .part.on').length > n, before, { timeout: 4000 });
  const lives = await B.evaluate(() => window.__room.view().livesLeft);
  if (lives !== 3) fail('il devrait rester 3 vies, il en reste ' + lives);
  if (!await B.$('.key[data-l="z"].miss[disabled]')) fail('la lettre ratée doit être barrée et désactivée');
  const onA = await A.$$eval('.gallows .part.on', els => els.length);
  if (onA <= before) fail('celui qui fait deviner doit voir le dessin avancer aussi');
  ok('erreur : le dessin avance des deux côtés, la touche est neutralisée');

  // --- on finit le mot
  for (const l of ['l', 'p', 'h', 'a', 'n', 't']) {
    await B.click('.key[data-l="' + l + '"]');
    await B.waitForTimeout(40);
  }
  await B.waitForSelector('#next', { timeout: 6000 });
  await A.waitForSelector('#next', { timeout: 6000 });
  if (!/Mot trouvé/.test(await B.textContent('#app'))) fail('la manche devait être gagnée');
  if (!/Éléphant/.test(await B.textContent('.reveal-word'))) fail('le mot n’est pas révélé au récap');
  ok('mot trouvé : récap avec le mot révélé des deux côtés');
  await B.screenshot({ path: path.join(SHOTS, '03-recap.png') });

  // --- manche 2 : les rôles s'inversent
  await A.click('#next');
  await B.waitForSelector('#p-word', { timeout: 6000 });
  await A.waitForSelector('.waiting', { timeout: 6000 });
  ok('manche 2 : c’est à l’invité de choisir le mot');

  await B.fill('#p-word', 'lune');
  await B.click('[data-act="setword"]');
  await A.waitForSelector('.keyboard', { timeout: 6000 });

  // tenter le mot entier, d'abord faux puis juste
  await A.fill('#p-try', 'soleil');
  await A.press('#p-try', 'Enter');
  await A.waitForFunction(() => window.__room.view().livesLeft === 3, null, { timeout: 4000 });
  await A.fill('#p-try', 'LUNE');
  await A.press('#p-try', 'Enter');
  await A.waitForSelector('#next', { timeout: 6000 });
  ok('tenter le mot entier : une erreur coûte une vie, la bonne réponse gagne');

  await A.click('#next');
  await A.waitForSelector('#replay', { timeout: 6000 });
  await B.waitForSelector('#replay', { timeout: 6000 });
  const final = await A.textContent('.score-big');
  if (!/2\s*\/\s*2/.test(final)) fail('résultat final attendu 2/2, obtenu ' + final.replace(/\s+/g, ' '));
  ok('résultat final : 2/2 mots sauvés');
  await A.screenshot({ path: path.join(SHOTS, '04-final.png'), fullPage: true });

  // ------------------------------------------------------------- mobile
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
  console.log('✓ pendu : parcours complet validé');
})().catch(err => {
  steps.forEach(s => console.log('  ' + s));
  console.error('✗ ' + err.message);
  console.error((err.stack || '').split('\n').slice(0, 5).join('\n'));
  process.exit(1);
});
