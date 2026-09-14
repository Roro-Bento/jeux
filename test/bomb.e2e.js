/* Désamorçage, test d'interface : une bombe entièrement désamorcée à la souris,
 * sur deux onglets, plus les vérifications d'étanchéité entre les deux écrans.
 *   python3 -m http.server 8000
 *   node test/bomb.e2e.js
 */
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const BASE = process.env.BASE || 'http://localhost:8000';
const SHOTS = process.env.SHOTS || path.join(__dirname, '..', '.shots-bomb');
const GAME = '/games/desamorcage/index.html';

const steps = [];
const ok = m => steps.push('· ' + m);
const fail = m => { throw new Error(m); };

/** Ouvre une room, retourne les deux pages prêtes à jouer. */
async function startRoom(ctx, query, cfg) {
  const A = await ctx.newPage();   // hôte = démineur
  const B = await ctx.newPage();   // invité = expert
  await A.goto(BASE + GAME + query);
  await A.fill('#f-name', 'Alice');
  await A.click('#go-create');
  await A.waitForSelector('#c-mods');
  for (const [sel, val] of Object.entries(cfg)) await A.fill(sel, String(val));
  await A.click('#create');
  await A.waitForFunction(() => /^[A-Z0-9]{4}$/.test(document.querySelector('#the-code').textContent.trim()));
  const code = (await A.textContent('#the-code')).trim();

  await B.goto(BASE + GAME + query + '&room=' + code);
  await B.waitForSelector('#join-code');
  await B.fill('#j-name', 'Bob');
  await B.click('#join');
  await A.waitForFunction(() => /a rejoint/.test(document.querySelector('#lobby-status').textContent), null, { timeout: 8000 });
  await A.click('#start');
  await A.waitForSelector('#b-body .tiles', { timeout: 8000 });
  await B.waitForSelector('#man-nav', { timeout: 8000 });
  return { A, B, code };
}

/** Calcule, dans la page du démineur, la suite de clics qui résout le module i. */
function plannerScript(i) {
  return (idx => {
    const v = window.__debug.view();
    const m = v.modules[idx];
    const def = window.Modules.byId(m.id);
    const plan = def.solve(JSON.parse(JSON.stringify(m.state)), v.bomb, { strikes: v.strikes });
    const clicks = [];
    if (m.id === 'fils') {
      clicks.push('.wire[data-k="' + plan.actions[0].i + '"]');
    } else if (m.id === 'sequence') {
      plan.order.slice(m.state.pos).forEach(c => clicks.push('.pad[data-c="' + c + '"]'));
    } else if (m.id === 'symboles') {
      plan.order.slice(m.state.pressed.length).forEach(s => clicks.push('.symkey[data-s="' + s + '"]'));
    } else if (m.id === 'motdepasse') {
      for (let c = 0; c < 5; c++) {
        const target = m.state.cols[c].indexOf(plan.word[c]);
        let steps = (target - m.state.pos[c] + 6) % 6;
        for (let k = 0; k < steps; k++) clicks.push('.wbtn[data-c="' + c + '"][data-d="1"]');
      }
      clicks.push('#pw-ok');
    } else if (m.id === 'morse') {
      const target = m.state.freqs.indexOf(plan.freq);
      let steps = (target - m.state.index + m.state.freqs.length) % m.state.freqs.length;
      for (let k = 0; k < steps; k++) clicks.push('.mod-morse .wbtn[data-d="1"]');
      clicks.push('#morse-send');
    }
    return { id: m.id, name: m.name, clicks };
  })(i);
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

  // ============================================ partie 1 : bombe désamorcée
  const MODS = 'fils,sequence,motdepasse,morse,symboles';
  const { A, B } = await startRoom(ctx, '?local=1&mods=' + MODS,
    { '#c-mods': 5, '#c-min': 12, '#c-strikes': 3 });
  ok('room créée, 5 modules, chrono 12 min');

  // --- étanchéité des deux écrans
  const aText = await A.textContent('#app');
  const bText = await B.textContent('#app');
  const serial = (await A.textContent('.serial')).trim();
  if (!/^[A-Z0-9]{6}$/.test(serial)) fail('numéro de série illisible : ' + serial);
  if (bText.includes(serial)) fail('l’expert voit le numéro de série !');
  if (await B.$('.tiles')) fail('l’expert voit les modules de la bombe !');
  if (!await B.$('#man-nav')) fail('l’expert n’a pas le manuel');
  if (aText.includes('Colonne 1')) fail('le démineur a le manuel sous les yeux !');
  ok('étanchéité vérifiée : la bombe d’un côté, le manuel de l’autre');

  const tiles = await A.$$eval('.tile .t-name', els => els.map(e => e.textContent));
  if (tiles.length !== 5) fail('5 tuiles attendues, ' + tiles.length + ' trouvées');
  ok('boîtier : ' + tiles.join(', '));

  // --- le manuel est navigable et se cale sur le nombre d'erreurs
  // on clique comme un vrai navigateur : appui, petit déplacement, relâchement
  // (Opera supprime le « click » dans ce cas — le jeu doit quand même réagir)
  const navBtn = await B.$('#man-nav button[data-s="sequence"]');
  const nb = await navBtn.boundingBox();
  await B.mouse.move(nb.x + nb.width / 2, nb.y + nb.height / 2);
  await B.mouse.down();
  await B.mouse.move(nb.x + nb.width / 2 + 4, nb.y + nb.height / 2 + 3);
  await B.mouse.up();
  await B.waitForSelector('.seq-table');
  const active = await B.$$eval('.seq-table tr.active td:first-child', els => els.map(e => e.textContent.trim()));
  if (!active.length || active[0] !== '0') fail('le manuel ne surligne pas la ligne « 0 erreur »');
  ok('manuel : onglet cliquable même avec un léger déplacement du pointeur, table calée sur 0 erreur');
  await B.screenshot({ path: path.join(SHOTS, '02-manuel.png'), fullPage: true });

  // --- on désamorce, module par module, à la souris
  for (let i = 0; i < 5; i++) {
    await A.click('.tile[data-i="' + i + '"]');
    await A.waitForSelector('.mod-body');
    if (i === 0) await A.screenshot({ path: path.join(SHOTS, '01-bombe.png') });

    const plan = await A.evaluate(plannerScript, i);
    for (const sel of plan.clicks) {
      await A.click(sel);
      await A.waitForTimeout(35);
    }
    await A.waitForFunction(
      idx => {
        const v = window.__debug.view();
        return v.phase === 'over' || (v.modules && v.modules[idx].solved);
      }, i, { timeout: 8000 });
    const strikes = await A.evaluate(() => window.__debug.view().strikes);
    if (strikes !== 0) fail('erreur inattendue sur « ' + plan.name + ' » (' + strikes + ')');
    ok('module désamorcé à la souris : ' + plan.name);

    const over = await A.evaluate(() => window.__debug.view().phase === 'over');
    if (!over) {
      await A.click('#b-back');
      await A.waitForSelector('.tiles');
    }
  }

  await A.waitForSelector('#replay', { timeout: 8000 });
  await B.waitForSelector('#replay', { timeout: 8000 });
  const res = await A.textContent('#app');
  if (!/Désamorcée/.test(res)) fail('la bombe devait être désamorcée');
  if (!/5\/5/.test(res)) fail('le débriefing ne montre pas 5/5');
  const bRes = await B.textContent('#app');
  if (!bRes.includes(serial)) fail('après coup, l’expert devrait enfin voir les repères');
  if (!/il fallait/.test(bRes)) fail('le débriefing ne donne pas les solutions');
  ok('bombe désamorcée : débriefing complet des deux côtés');
  await A.screenshot({ path: path.join(SHOTS, '03-desamorcee.png'), fullPage: true });

  // --- rejouer en inversant les rôles
  await A.click('#replay-swap');
  await A.waitForSelector('#man-nav', { timeout: 8000 });
  await B.waitForSelector('.tiles', { timeout: 8000 });
  ok('rejouer en inversant : l’hôte reçoit le manuel, l’invité la bombe');

  await A.close(); await B.close();

  // =============================================== partie 2 : le bouton
  const r2 = await startRoom(ctx, '?local=1&mods=bouton', { '#c-mods': 1, '#c-min': 9, '#c-strikes': 3 });
  await r2.A.click('.tile[data-i="0"]');
  await r2.A.waitForSelector('.bigbutton');
  const label = (await r2.A.textContent('.bigbutton')).trim();
  if (!['APPUYER', 'MAINTENIR', 'DÉTONER', 'ABANDON'].includes(label)) fail('libellé de bouton inattendu : ' + label);

  const bandBefore = await r2.A.getAttribute('.mod-bouton .band', 'class');
  if (/\bon\b/.test(bandBefore)) fail('la bande est visible avant même d’avoir maintenu');

  const box = await (await r2.A.$('.bigbutton')).boundingBox();
  await r2.A.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await r2.A.mouse.down();
  await r2.A.waitForTimeout(500);
  const bandDuring = await r2.A.getAttribute('.mod-bouton .band', 'class');
  if (!/\bon\b/.test(bandDuring)) fail('la bande ne s’allume pas quand on maintient le bouton');
  ok('bouton : la bande n’apparaît qu’en maintenant (' + bandDuring.replace('band ', '') + ')');
  await r2.A.screenshot({ path: path.join(SHOTS, '04-bouton.png') });
  await r2.A.mouse.up();
  await r2.A.waitForTimeout(400);

  const after = await r2.A.evaluate(() => {
    const v = window.__debug.view();
    return { phase: v.phase, strikes: v.strikes, solved: v.modules ? v.modules[0].solved : true };
  });
  if (!(after.phase === 'over' || after.strikes === 1 || after.solved)) {
    fail('relâcher le bouton n’a produit ni réussite ni erreur');
  }
  ok('bouton : le relâchement est arbitré par le moteur (' +
    (after.solved || after.phase === 'over' ? 'désamorcé' : 'erreur comptée') + ')');
  await r2.A.close(); await r2.B.close();

  // ================================================ partie 3 : le morse
  const r3 = await startRoom(ctx, '?local=1&mods=morse', { '#c-mods': 1, '#c-min': 9, '#c-strikes': 3 });
  await r3.A.click('.tile[data-i="0"]');
  await r3.A.waitForSelector('.morse-lamp');

  // on échantillonne la lampe pendant quelques secondes et on mesure les
  // durées d'allumage : il doit y avoir des courts ET des longs, nettement
  // différents, et la pause entre lettres doit être visible
  const sample = async (page, ms) => page.evaluate(dur => new Promise(res => {
    const lamp = document.querySelector('.morse-lamp');
    const cap = document.querySelector('.morse-caption');
    const marks = [];
    const seen = {};
    const t0 = performance.now();
    const id = setInterval(() => {
      const state = lamp.classList.contains('on')
        ? (lamp.classList.contains('dash') ? 'dash' : 'dot') : 'off';
      marks.push({ t: performance.now() - t0, state });
      if (cap.textContent.trim()) seen[cap.textContent.trim()] = true;
      if (performance.now() - t0 > dur) { clearInterval(id); res({ marks, seen: Object.keys(seen) }); }
    }, 20);
  }), ms);

  /* Durée d'une phase = écart entre SON début et le début de la suivante.
     Mesurer « dernier échantillon moins premier » sous-estimerait chaque phase
     d'une période d'échantillonnage, et ferait passer un point de 300 ms pour
     un point de 260 ms. */
  function phases(marks) {
    const out = [];
    let cur = null;
    marks.forEach(m => {
      if (!cur || cur.state !== m.state) { cur = { state: m.state, from: m.t }; out.push(cur); }
    });
    out.forEach((p, i) => { p.dur = (i + 1 < out.length ? out[i + 1].from : p.from) - p.from; });
    return out.slice(1, -1);   // on jette les phases tronquées aux extrémités
  }

  // 15 s : de quoi couvrir un mot entier. Sur une fenêtre plus courte, on peut
  // tomber sur une lettre qui n'a que des points (E, I, S) ou que des traits
  // (T, M, O) et croire à tort que le signal ne distingue rien.
  const s1 = await sample(r3.A, 15000);
  const ph = phases(s1.marks);
  const dots = ph.filter(p => p.state === 'dot').map(p => p.dur);
  const dashes = ph.filter(p => p.state === 'dash').map(p => p.dur);
  const gaps = ph.filter(p => p.state === 'off').map(p => p.dur);
  if (!dots.length || !dashes.length) fail('signaux courts et longs non distingués (' + dots.length + ' / ' + dashes.length + ')');
  const avg = a => a.reduce((x, y) => x + y, 0) / a.length;
  const ratio = avg(dashes) / avg(dots);
  if (ratio < 2.3) fail('un trait ne dure que ' + ratio.toFixed(1) + '× un point — trop proche');
  if (avg(dots) < 240) fail('les points défilent trop vite : ' + Math.round(avg(dots)) + ' ms');
  if (Math.max.apply(null, gaps) < 900) fail('aucune pause franche entre les lettres');
  if (!s1.seen.some(t => /lettre suivante|reprend/.test(t))) fail('la fin de lettre n’est pas annoncée');
  ok('morse : point ' + Math.round(avg(dots)) + ' ms, trait ' + Math.round(avg(dashes)) + ' ms (×' +
    ratio.toFixed(1) + '), pause de lettre ' + Math.round(Math.max.apply(null, gaps)) + ' ms, forme rond/barre distincte');
  await r3.A.screenshot({ path: path.join(SHOTS, '06-morse.png') });

  // le bouton « ralentir » allonge bien tout
  await r3.A.click('#morse-speed');
  await r3.A.waitForTimeout(200);
  /* L'unité du signal, en millisecondes. Certaines lettres n'ont QUE des
     traits (T, M, O…) : s'il ne passe aucun point pendant l'échantillon, on
     déduit l'unité des traits, qui en valent trois. */
  const unitOf = list => {
    const d = list.filter(p => p.state === 'dot').map(p => p.dur);
    if (d.length) return avg(d);
    const D = list.filter(p => p.state === 'dash').map(p => p.dur);
    return D.length ? avg(D) / 3 : NaN;
  };
  const unit1 = unitOf(ph);
  const s2 = await sample(r3.A, 9000);
  const unit2 = unitOf(phases(s2.marks));
  if (!(unit2 > unit1 * 1.3)) {
    fail('le mode ralenti ne ralentit pas assez (' + Math.round(unit2) + ' vs ' + Math.round(unit1) + ' ms)');
  }
  ok('morse : le bouton « ralentir » porte l’unité de ' + Math.round(unit1) + ' à ' + Math.round(unit2) + ' ms');
  await r3.A.close(); await r3.B.close();

  // ===================================================== partie 4 : mobile
  const M = await ctx.newPage();
  await M.setViewportSize({ width: 390, height: 844 });
  await M.goto(BASE + GAME + '?local=1');
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
  console.log('✓ désamorçage : parcours complet validé');
})().catch(err => {
  steps.forEach(s => console.log('  ' + s));
  console.error('✗ ' + err.message);
  console.error((err.stack || '').split('\n').slice(0, 5).join('\n'));
  process.exit(1);
});
