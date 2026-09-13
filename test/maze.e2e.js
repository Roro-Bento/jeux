/* Labyrinthe, test d'interface : deux manches jouées au clavier et à la souris
 * sur deux onglets, avec vérification que chacun ne voit que sa moitié du jeu.
 *   python3 -m http.server 8000
 *   node test/maze.e2e.js
 */
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const BASE = process.env.BASE || 'http://localhost:8000';
const SHOTS = process.env.SHOTS || path.join(__dirname, '..', '.shots-maze');
const GAME = '/games/labyrinthe/index.html?local=1';

const steps = [];
const ok = m => steps.push('· ' + m);
const fail = m => { throw new Error(m); };

/** Calcule dans la page de l'hôte la route la plus courte, sans piège. */
const routeScript = () => {
  const S = window.__room.engine()._state();
  const M = window.Maze;
  const maze = S.mazes[S.round];
  const blocked = {};
  maze.traps.forEach(c => { blocked[c] = true; });
  const prev = new Map([[S.pos, null]]);
  const queue = [S.pos];
  while (queue.length) {
    const cur = queue.shift();
    if (cur === maze.exit) break;
    for (const d of M.DIRS) {
      if (!M.open(maze, cur, d)) continue;
      const n = M.neighbour(maze, cur, d);
      if (prev.has(n) || blocked[n]) continue;
      prev.set(n, { from: cur, dir: d });
      queue.push(n);
    }
  }
  const out = [];
  let cur = maze.exit;
  while (prev.get(cur)) { out.unshift(prev.get(cur).dir); cur = prev.get(cur).from; }
  return out;
};

(async () => {
  fs.mkdirSync(SHOTS, { recursive: true });
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 900, height: 1050 } });
  const errors = [];
  ctx.on('page', p => {
    p.on('pageerror', e => errors.push(e.message));
    p.on('console', m => {
      if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push(m.text());
    });
  });

  const A = await ctx.newPage();   // hôte = explorateur en manche 1
  const B = await ctx.newPage();   // invité = guide

  await A.goto(BASE + GAME);
  await A.fill('#f-name', 'Alice');
  await A.click('#go-create');
  await A.waitForSelector('#c-size');
  await A.fill('#c-size', '9');
  await A.fill('#c-secs', '600');
  await A.fill('#c-traps', '5');
  await A.fill('#c-beacons', '4');
  const calc = (await A.textContent('#c-calc')).replace(/\s+/g, ' ');
  if (!/9×9/.test(calc) || !/4 balises/.test(calc)) fail('les réglages ne sont pas résumés : ' + calc);
  ok('réglages : ' + calc.trim());
  await A.screenshot({ path: path.join(SHOTS, '01-reglages.png') });

  await A.click('#create');
  await A.waitForFunction(() => /^[A-Z0-9]{4}$/.test(document.querySelector('#the-code').textContent.trim()));
  const code = (await A.textContent('#the-code')).trim();
  const roles = await A.textContent('.roles-box');
  if (!/Explorateur/.test(roles) || !/Guide/.test(roles)) fail('les rôles ne sont pas annoncés dans le lobby');
  ok('room créée (' + code + '), rôles annoncés dans le lobby');

  await B.goto(BASE + GAME + '&room=' + code);
  await B.waitForSelector('#join-code');
  await B.fill('#j-name', 'Bob');
  await B.click('#join');
  await A.waitForFunction(() => /a rejoint/.test(document.querySelector('#lobby-status').textContent), null, { timeout: 8000 });
  await A.click('#start');
  await A.waitForSelector('.vision', { timeout: 8000 });
  await B.waitForSelector('.maze', { timeout: 8000 });
  ok('partie lancée : la vision d’un côté, le plan de l’autre');

  // ------------------------------------------------- étanchéité des écrans
  if (await A.$('.maze')) fail('l’explorateur voit le plan !');
  if (await B.$('.vision')) fail('le guide voit la case courante !');
  if (await B.$('.mcell.start')) fail('le guide voit le point de départ !');
  if (await B.$('.mcell.here')) fail('le guide voit la position de l’explorateur !');
  const cells = await B.$$eval('.mcell', els => els.length);
  if (cells !== 81) fail('le plan devrait faire 81 cases, il en a ' + cells);
  const traps = await B.$$eval('.mcell.trap', els => els.length);
  const beacons = await B.$$eval('.maze .beacon', els => els.length);
  if (traps === 0 || beacons !== 4) fail('plan incomplet : ' + traps + ' pièges, ' + beacons + ' balises');
  ok('étanchéité : le guide a 81 cases, ' + traps + ' pièges et ' + beacons + ' balises, mais ni départ ni position');

  // ------------------------------------------------ la vision est correcte
  const vision = await A.evaluate(() => {
    const S = window.__room.engine()._state();
    const look = window.Maze.look(S.mazes[S.round], S.pos);
    const gates = {};
    document.querySelectorAll('.gate').forEach(g => {
      const d = [...g.classList].find(c => /^g-[nesw]$/.test(c)).slice(2);
      gates[d] = g.classList.contains('wall') ? 'wall' : 'open';
    });
    return { look, gates, text: document.querySelector('#m-say').textContent };
  });
  for (const d of ['n', 'e', 's', 'w']) {
    const expected = vision.look.walls[d] ? 'wall' : 'open';
    if (vision.gates[d] !== expected) fail('la porte ' + d + ' est affichée « ' + vision.gates[d] + ' »');
  }
  if (!/Passages/.test(vision.text) || !/Murs/.test(vision.text)) fail('la description textuelle manque');
  ok('vision : les quatre portes correspondent au plan, et sont décrites en toutes lettres');
  await A.screenshot({ path: path.join(SHOTS, '02-explorateur.png') });
  await B.screenshot({ path: path.join(SHOTS, '03-guide.png') });

  // ---------------------------------------------------- se cogner à un mur
  const wallDir = Object.keys(vision.look.walls).find(d => vision.look.walls[d]);
  if (wallDir) {
    await A.click('.dp[data-d="' + wallDir + '"]');
    await A.waitForSelector('.flyby', { timeout: 4000 });
    const fly = await A.textContent('.flyby');
    if (!/Mur/.test(fly)) fail('le message de mur ne s’affiche pas : ' + fly);
    const moves = await A.evaluate(() => window.__room.view().moves);
    if (moves !== 0) fail('un mur ne doit pas compter comme un pas');
    ok('mur : message affiché, aucun pas compté');
  }

  // -------------------------------------------- le guide pose des repères
  await B.click('.mcell[data-i="12"]');
  if (!await B.$('.mcell[data-i="12"].pinned')) fail('le guide ne peut pas marquer une case');
  await B.click('#m-clear');
  if (await B.$('.mcell.pinned')) fail('les marques ne s’effacent pas');
  ok('le guide peut marquer des cases et tout effacer');

  // ----------------------------------------------------- manche 1 : sortir
  let route = await A.evaluate(routeScript);
  if (!route.length) fail('aucune route trouvée vers la sortie');
  for (const d of route) {
    await A.click('.dp[data-d="' + d + '"]');
    await A.waitForTimeout(22);
  }
  await A.waitForSelector('#next', { timeout: 9000 });
  await B.waitForSelector('#next', { timeout: 9000 });
  const recap = await A.textContent('#app');
  if (!/sortie trouvée/.test(recap)) fail('la manche 1 devait se terminer par une sortie');
  if (!await A.$('.mcell.onpath')) fail('le trajet n’est pas retracé dans le récap');
  if (!await A.$('.mcell.start')) fail('le départ n’est pas révélé dans le récap');
  ok('manche 1 : sortie atteinte en ' + route.length + ' pas, trajet retracé des deux côtés');
  await A.screenshot({ path: path.join(SHOTS, '04-recap.png'), fullPage: true });

  // ------------------------------------------------- manche 2 : on inverse
  await B.click('#next');
  await B.waitForSelector('.vision', { timeout: 8000 });
  await A.waitForSelector('.maze', { timeout: 8000 });
  ok('manche 2 : l’invité explore, l’hôte guide');

  // cette fois on joue au clavier
  route = await A.evaluate(routeScript);
  const KEY = { n: 'ArrowUp', e: 'ArrowRight', s: 'ArrowDown', w: 'ArrowLeft' };
  await B.bringToFront();
  for (const d of route) {
    await B.keyboard.press(KEY[d]);
    await B.waitForTimeout(22);
  }
  await B.waitForSelector('#next', { timeout: 9000 });
  ok('manche 2 : sortie atteinte au clavier (' + route.length + ' pas)');

  await B.click('#next');
  await A.waitForSelector('#replay', { timeout: 8000 });
  await B.waitForSelector('#replay', { timeout: 8000 });
  const final = await A.textContent('#app');
  if (!/2\s*\/\s*2/.test(final)) fail('le résultat final devrait être 2/2 : ' + final.slice(0, 200));
  const maps = await A.$$eval('.recap-map .maze', els => els.length);
  if (maps !== 2) fail('le récap final devrait montrer les deux labyrinthes');
  ok('récap final : 2/2 sorties, les deux plans et les deux trajets');
  await A.screenshot({ path: path.join(SHOTS, '05-final.png'), fullPage: true });

  await A.click('#replay');
  await A.waitForSelector('.vision', { timeout: 8000 });
  const m0 = await A.evaluate(() => window.__room.view().moves);
  if (m0 !== 0) fail('Rejouer ne remet pas le compteur de pas à zéro');
  ok('Rejouer : nouveaux labyrinthes, compteurs à zéro');

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
  console.log('✓ labyrinthe : parcours complet validé');
})().catch(err => {
  steps.forEach(s => console.log('  ' + s));
  console.error('✗ ' + err.message);
  console.error((err.stack || '').split('\n').slice(0, 5).join('\n'));
  process.exit(1);
});
