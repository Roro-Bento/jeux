/* Motus en duo, test d'interface : deux tableaux qui s'échangent, puis le
 * dernier mot à deux.
 *   python3 -m http.server 8000
 *   node test/motus.e2e.js
 */
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const BASE = process.env.BASE || 'http://localhost:8000';
const SHOTS = process.env.SHOTS || path.join(__dirname, '..', '.shots-motus');
const GAME = '/games/motus/index.html?local=1';

const steps = [];
const ok = m => steps.push('· ' + m);
const fail = m => { throw new Error(m); };

/** Tape un mot au clavier physique et valide. */
async function play(page, word) {
  await page.bringToFront();
  // la première lettre est déjà posée par le jeu
  for (const ch of word.slice(1)) await page.keyboard.press(ch.toLowerCase());
  await page.keyboard.press('Enter');
  await page.waitForTimeout(120);
}

/** Les rangées DÉJÀ JOUÉES : celles dont les cases portent une couleur.
 *  (la rangée en cours de frappe contient du texte, mais aucune couleur) */
const rowsOf = page => page.$$eval('#m-grid .mrow', els => els
  .filter(r => Array.from(r.children).every(t => /\b(ok|pos|no)\b/.test(t.className)))
  .map(r => Array.from(r.children).map(t => t.textContent).join('')));

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
  await A.waitForSelector('#c-len');
  await A.fill('#c-len', '6');
  await A.fill('#c-tries', '6');
  const calc = (await A.textContent('#c-calc')).replace(/\s+/g, ' ');
  if (!/6 lettres/.test(calc) || !/6 essais/.test(calc)) fail('réglages mal résumés : ' + calc);
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
  await A.waitForSelector('#m-grid', { timeout: 8000 });
  await B.waitForSelector('#m-grid', { timeout: 8000 });

  // on impose deux mots connus pour piloter la partie
  const words = await A.evaluate(() => {
    const e = window.__room.engine();
    e._state().words = ['MAISON', 'JARDIN'];
    e.action('host', { t: 'guess', text: '?' });   // essai refusé : force la mise à jour des deux vues
    return e._state().words.slice();
  });
  await A.waitForFunction(() => window.__room.view().firstLetter === 'M', null, { timeout: 4000 });
  await B.waitForFunction(() => window.__room.view().firstLetter === 'J', null, { timeout: 4000 });
  if (words.join() !== 'MAISON,JARDIN') fail('impossible de fixer les mots du test');

  // --- chacun son tableau, et sa première lettre
  if (await A.evaluate(() => window.__room.view().boardIndex) !== 0) fail('l’hôte devrait démarrer sur le tableau 0');
  if (await B.evaluate(() => window.__room.view().boardIndex) !== 1) fail('l’invité devrait démarrer sur le tableau 1');
  await A.waitForTimeout(150);
  const firstA = await A.evaluate(() => window.__room.view().firstLetter);
  const firstB = await B.evaluate(() => window.__room.view().firstLetter);
  if (firstA !== 'M' || firstB !== 'J') fail('la première lettre devrait être donnée : ' + firstA + '/' + firstB);
  const leak = await A.evaluate(() => JSON.stringify(window.__room.view()));
  if (/MAISON|JARDIN/.test(leak)) fail('un mot complet fuite dans la vue en cours de partie');
  ok('chacun sur son tableau, première lettre donnée, aucun mot dans les vues');
  await A.screenshot({ path: path.join(SHOTS, '01-depart.png') });

  // --- un mot trop court est refusé
  await A.bringToFront();
  await A.keyboard.press('o');
  await A.keyboard.press('Enter');
  await A.waitForTimeout(200);
  if ((await rowsOf(A)).length) fail('un mot incomplet ne doit pas partir');
  if (!/manque/i.test(await A.textContent('#m-status'))) fail('il faut le dire quand le mot est incomplet');
  await A.keyboard.press('Backspace');
  ok('un mot incomplet est refusé, sans consommer d’essai');

  // --- un essai chacun, puis l'échange
  await play(A, 'MOUTON');
  if ((await rowsOf(A)).length !== 1) fail('l’essai d’Alice n’est pas arrivé sur son tableau');
  if (await A.evaluate(() => window.__room.view().boardIndex) !== 0) fail('pas d’échange avant que les deux aient joué');
  if (!/attente/i.test(await A.textContent('#m-status'))) fail('Alice devrait attendre Bob');
  const colors = await A.$$eval('#m-grid .mrow:first-child .tile', els => els.map(e => e.className.replace('tile ', '')));
  if (colors.join(' ') !== 'ok no no no ok ok') fail('couleurs de MOUTON contre MAISON inattendues : ' + colors.join(' '));
  ok('MOUTON contre MAISON : M vert, O et N verts en fin, le reste gris');

  await play(B, 'JUPONS');
  await A.waitForFunction(() => window.__room.view().boardIndex === 1, null, { timeout: 5000 });
  if (await B.evaluate(() => window.__room.view().boardIndex) !== 0) fail('Bob devrait récupérer le tableau d’Alice');
  const seen = await A.evaluate(() => window.__room.view().board.rows.map(r => r.w));
  if (seen.join() !== 'JUPONS') fail('Alice devrait voir l’essai laissé par Bob : ' + seen.join());
  if (!/Tableau de Bob/.test(await A.textContent('#m-where'))) fail('le bandeau doit dire sur quel tableau on est');
  ok('les deux ont joué : les tableaux s’échangent, avec l’historique de l’autre');
  await A.screenshot({ path: path.join(SHOTS, '02-echange.png') });

  // --- le clavier garde ce qu'on a appris
  const keyJ = await A.$eval('.key[data-l="J"]', e => e.className);
  if (!/ok/.test(keyJ)) fail('le J devrait être marqué bien placé sur le clavier : ' + keyJ);
  ok('le clavier reprend les couleurs du tableau qu’on a en main');

  // --- Alice trouve JARDIN, on bascule à deux sur MAISON
  await play(A, 'JARDIN');
  await B.waitForTimeout(150);
  await play(B, 'CARTON');
  await A.waitForFunction(() => window.__room.view().shared === true, null, { timeout: 5000 });
  await B.waitForFunction(() => window.__room.view().shared === true, null, { timeout: 5000 });
  const ra = await rowsOf(A), rb = await rowsOf(B);
  if (ra.join() !== rb.join()) fail('le tableau commun doit être identique des deux côtés : ' + ra + ' / ' + rb);
  if (!/commun/i.test(await A.textContent('#m-where'))) fail('le bandeau doit annoncer le tableau commun');
  const turnA = await A.evaluate(() => window.__room.view().yourTurn);
  const turnB = await B.evaluate(() => window.__room.view().yourTurn);
  if (turnA === turnB) fail('un seul des deux doit avoir la main sur le tableau commun');
  ok('un mot trouvé : tableau commun, même contenu des deux côtés, un seul à la main');
  await A.screenshot({ path: path.join(SHOTS, '03-commun.png') });

  // --- celui qui n'a pas la main ne peut rien jouer
  const idle = turnA ? B : A;
  const active = turnA ? A : B;
  const before = (await rowsOf(idle)).length;
  await play(idle, 'MELONS');
  if ((await rowsOf(idle)).length !== before) fail('un joueur a pu jouer hors de son tour');
  ok('hors de son tour, la frappe ne part pas');

  // --- on termine
  await play(active, 'MAISON');
  await A.waitForSelector('#replay', { timeout: 6000 });
  await B.waitForSelector('#replay', { timeout: 6000 });
  const score = (await A.textContent('.score-big')).replace(/\s+/g, ' ');
  if (!/2\s*\/\s*2/.test(score)) fail('score final attendu 2/2, obtenu ' + score);
  const debrief = await A.textContent('.panel');
  if (!/MAISON/.test(debrief) || !/JARDIN/.test(debrief)) fail('les deux mots doivent être révélés à la fin');
  if (!/Alice/.test(debrief) || !/Bob/.test(debrief)) fail('chaque essai doit être attribué à son auteur');
  ok('gagné 2/2 : les deux mots révélés, chaque essai signé');
  await A.screenshot({ path: path.join(SHOTS, '04-final.png'), fullPage: true });

  // --- rejouer
  await A.click('#replay');
  await A.waitForSelector('#m-grid', { timeout: 6000 });
  if ((await rowsOf(A)).length) fail('le tableau devrait être vide après « deux nouveaux mots »');
  if (await A.evaluate(() => window.__room.view().boardIndex) !== 0) fail('chacun devrait retrouver son tableau');
  ok('deux nouveaux mots : tableaux vides, chacun chez soi');

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
  console.log('✓ motus : parcours complet validé');
})().catch(err => {
  steps.forEach(s => console.log('  ' + s));
  console.error('✗ ' + err.message);
  console.error((err.stack || '').split('\n').slice(0, 5).join('\n'));
  process.exit(1);
});
