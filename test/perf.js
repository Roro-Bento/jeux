/* Mesure du nombre d'images par seconde en RENDU LOGICIEL, c'est-à-dire sans
 * accélération matérielle — exactement la situation où le site paraissait laggy.
 *
 *   python3 -m http.server 8000
 *   node test/perf.js
 *
 * Repère : au-dessus de 50 images/s c'est fluide ; en dessous de 20, ça rame.
 * Les coupables habituels, à éviter dans les feuilles de style : filter: blur(),
 * backdrop-filter, mix-blend-mode, mask-image, et toute animation de fond
 * infinie.
 */
const { chromium } = require('playwright');

const BASE = process.env.BASE || 'http://localhost:8000';

function measure() {
  return new Promise(res => {
    let n = 0;
    const t0 = performance.now();
    (function loop() {
      n++;
      if (performance.now() - t0 < 3000) requestAnimationFrame(loop);
      else res(Math.round(n / ((performance.now() - t0) / 1000)));
    })();
  });
}

async function fpsOf(page, url) {
  await page.goto(url);
  await page.waitForTimeout(600);
  return page.evaluate(measure);
}

(async () => {
  const browser = await chromium.launch({
    args: ['--disable-gpu', '--disable-software-rasterizer', '--disable-gpu-compositing']
  });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const p = await ctx.newPage();

  const res = {};
  res['hub'] = await fpsOf(p, BASE + '/');
  res['mot-de-passe'] = await fpsOf(p, BASE + '/games/mot-de-passe/index.html?local=1');
  res['labyrinthe'] = await fpsOf(p, BASE + '/games/labyrinthe/index.html?local=1');
  res['pictionary'] = await fpsOf(p, BASE + '/games/pictionary/index.html?local=1');
  res['pendu'] = await fpsOf(p, BASE + '/games/pendu/index.html?local=1');
  res['morpion'] = await fpsOf(p, BASE + '/games/morpion/index.html?local=1');
  res['différences'] = await fpsOf(p, BASE + '/games/differences/index.html?local=1');
  res['motus'] = await fpsOf(p, BASE + '/games/motus/index.html?local=1');
  res['enquête'] = await fpsOf(p, BASE + '/games/enquete/index.html?local=1');

  // écran de jeu de la bombe avec le morse ouvert : la diode clignote en boucle,
  // c'est le moment le plus exigeant du site
  const A = await ctx.newPage(), B = await ctx.newPage();
  const GAME = '/games/desamorcage/index.html?local=1&mods=morse';
  await A.goto(BASE + GAME);
  await A.click('#go-create');
  await A.waitForSelector('#c-mods');
  await A.fill('#c-mods', '1');
  await A.click('#create');
  await A.waitForFunction(() => /^[A-Z0-9]{4}$/.test(document.querySelector('#the-code').textContent.trim()));
  const code = (await A.textContent('#the-code')).trim();
  await B.goto(BASE + GAME + '&room=' + code);
  await B.waitForSelector('#join-code');
  await B.click('#join');
  await A.waitForFunction(() => /a rejoint/.test(document.querySelector('#lobby-status').textContent));
  await A.click('#start');
  await A.waitForSelector('.tiles');
  await A.click('.tile[data-i="0"]');
  await A.waitForSelector('.morse-lamp');
  await A.waitForTimeout(600);
  res['bombe (morse ouvert)'] = await A.evaluate(measure);

  await browser.close();

  Object.keys(res).forEach(k => console.log('  · ' + k.padEnd(24) + res[k] + ' images/s'));
  const worst = Math.min.apply(null, Object.keys(res).map(k => res[k]));
  if (worst < 40) {
    console.error('✗ trop lent en rendu logiciel : ' + worst + ' images/s');
    process.exitCode = 1;
  } else {
    console.log('✓ fluide sans accélération matérielle (minimum ' + worst + ' images/s)');
  }
})().catch(err => {
  console.error('✗ ' + err.message);
  process.exit(1);
});
