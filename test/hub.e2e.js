/* Le hub : neuf jeux, deux affichages, et des liens qui mènent quelque part.
 *   python3 -m http.server 8000
 *   node test/hub.e2e.js
 */
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const BASE = process.env.BASE || 'http://localhost:8000';
const SHOTS = process.env.SHOTS || path.join(__dirname, '..', '.shots-hub');

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
  const P = await ctx.newPage();
  await P.goto(BASE + '/');

  // --- les neuf jeux, et chaque lien mène à une vraie page
  const cards = await P.$$eval('.game-card', els => els.map(e => ({
    href: e.getAttribute('href'),
    title: e.querySelector('h3').textContent.trim()
  })));
  if (cards.length !== 9) fail('neuf jeux attendus sur le hub, ' + cards.length + ' affichés');
  for (const c of cards) {
    const res = await P.request.get(BASE + '/' + c.href);
    if (!res.ok()) fail('lien mort vers ' + c.title + ' (' + c.href + ') : ' + res.status());
  }
  ok('neuf jeux listés, neuf liens valides : ' + cards.map(c => c.title).join(', '));

  // --- compact par défaut : tout tient sans défiler
  if (await P.$('#games.detailed')) fail('l’affichage compact doit être celui par défaut');
  if (await P.locator('.game-card .pitch').first().isVisible()) fail('les descriptions doivent être masquées en compact');
  const scroll = await P.evaluate(() => document.documentElement.scrollHeight - window.innerHeight);
  if (scroll > 0) fail('le hub compact devrait tenir dans l’écran, il dépasse de ' + scroll + 'px');
  ok('compact par défaut : neuf cartes, aucun défilement en 900 × 1000');
  await P.screenshot({ path: path.join(SHOTS, '01-compact.png'), fullPage: true });

  // --- la vue détaillée rend les descriptions
  await P.click('#v-list');
  if (!await P.locator('.game-card .pitch').first().isVisible()) fail('la vue détaillée doit montrer les descriptions');
  if (await P.getAttribute('#v-list', 'aria-pressed') !== 'true') fail('le bouton actif doit être annoncé aux lecteurs d’écran');
  ok('vue détaillée : les descriptions reviennent');
  await P.screenshot({ path: path.join(SHOTS, '02-details.png'), fullPage: true });

  // --- le choix est retenu, et réversible
  await P.reload();
  if (!await P.$('#games.detailed')) fail('le choix d’affichage devrait être retenu d’une visite à l’autre');
  await P.click('#v-grid');
  await P.reload();
  if (await P.$('#games.detailed')) fail('le retour au compact devrait être retenu aussi');
  ok('le choix est retenu d’une visite à l’autre, dans les deux sens');

  // --- et si le stockage est refusé, la page marche quand même
  const blind = await browser.newContext({
    viewport: { width: 900, height: 1000 },
    javaScriptEnabled: true
  });
  const Q = await blind.newPage();
  const blindErrors = [];
  Q.on('pageerror', e => blindErrors.push(e.message));
  await Q.addInitScript(() => {
    Object.defineProperty(window, 'localStorage', {
      get() { throw new Error('stockage refusé'); }
    });
  });
  await Q.goto(BASE + '/');
  await Q.click('#v-list');
  if (!await Q.$('#games.detailed')) fail('sans stockage, le bouton doit quand même changer l’affichage');
  if (blindErrors.length) fail('erreur JS sans stockage : ' + blindErrors[0]);
  ok('stockage refusé (navigation privée) : l’affichage fonctionne sans rien retenir');
  await blind.close();

  // ------------------------------------------------------------- mobile
  const M = await ctx.newPage();
  await M.setViewportSize({ width: 390, height: 844 });
  await M.goto(BASE + '/');
  const overflow = await M.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  if (overflow > 1) fail('débordement horizontal sur mobile : ' + overflow + 'px');
  const cols = await M.evaluate(() =>
    getComputedStyle(document.getElementById('games')).gridTemplateColumns.split(' ').length);
  if (cols !== 2) fail('deux colonnes attendues sur un téléphone, ' + cols + ' obtenue(s)');
  ok('téléphone : deux colonnes, pas de scroll horizontal');
  await M.screenshot({ path: path.join(SHOTS, '03-mobile.png'), fullPage: true });

  await browser.close();
  if (errors.length) {
    console.error('Erreurs JS détectées :\n' + errors.join('\n'));
    process.exitCode = 1;
  }
  steps.forEach(s => console.log('  ' + s));
  console.log('✓ hub : neuf jeux et deux affichages validés');
})().catch(err => {
  steps.forEach(s => console.log('  ' + s));
  console.error('✗ ' + err.message);
  console.error((err.stack || '').split('\n').slice(0, 5).join('\n'));
  process.exit(1);
});
