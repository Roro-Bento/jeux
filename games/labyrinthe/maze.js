/* Labyrinthe — génération du plan.
 *
 * Un labyrinthe « parfait » (un seul chemin entre deux cases) serait trop
 * facile à cartographier : on rouvre quelques murs pour créer des boucles,
 * ce qui oblige vraiment à se repérer aux balises.
 */
(function (global) {
  'use strict';

  var RNG = global.RNG || (typeof require === 'function' ? require('../../common/rng.js') : null);

  var DIRS = ['n', 'e', 's', 'w'];
  var DELTA = { n: [0, -1], e: [1, 0], s: [0, 1], w: [-1, 0] };
  var OPPOSITE = { n: 's', e: 'w', s: 'n', w: 'e' };
  var LABEL = { n: 'nord', e: 'est', s: 'sud', w: 'ouest' };

  var BEACONS = [
    { id: 'triangle', glyph: '▲', color: 'rouge', label: 'triangle rouge' },
    { id: 'carre', glyph: '■', color: 'bleu', label: 'carré bleu' },
    { id: 'rond', glyph: '●', color: 'jaune', label: 'rond jaune' },
    { id: 'losange', glyph: '◆', color: 'vert', label: 'losange vert' },
    { id: 'etoile', glyph: '★', color: 'violet', label: 'étoile violette' },
    { id: 'croix', glyph: '✚', color: 'orange', label: 'croix orange' }
  ];

  function idx(w, x, y) { return y * w + x; }
  function xy(w, i) { return { x: i % w, y: Math.floor(i / w) }; }
  function inside(w, h, x, y) { return x >= 0 && y >= 0 && x < w && y < h; }

  /** Case voisine dans une direction, ou -1 si on sort du plan. */
  function neighbour(maze, i, dir) {
    var p = xy(maze.w, i);
    var d = DELTA[dir];
    var nx = p.x + d[0], ny = p.y + d[1];
    return inside(maze.w, maze.h, nx, ny) ? idx(maze.w, nx, ny) : -1;
  }

  /** Peut-on passer de la case i vers dir ? */
  function open(maze, i, dir) {
    return !maze.cells[i][dir] && neighbour(maze, i, dir) !== -1;
  }

  function carve(rng, w, h) {
    var cells = [];
    for (var i = 0; i < w * h; i++) cells.push({ n: true, e: true, s: true, w: true });
    var maze = { w: w, h: h, cells: cells };

    var seen = new Array(w * h).fill(false);
    var stack = [RNG.int(rng, 0, w * h - 1)];
    seen[stack[0]] = true;

    while (stack.length) {
      var cur = stack[stack.length - 1];
      var options = RNG.shuffle(rng, DIRS).filter(function (d) {
        var n = neighbour(maze, cur, d);
        return n !== -1 && !seen[n];
      });
      if (!options.length) { stack.pop(); continue; }
      var dir = options[0];
      var nxt = neighbour(maze, cur, dir);
      cells[cur][dir] = false;
      cells[nxt][OPPOSITE[dir]] = false;
      seen[nxt] = true;
      stack.push(nxt);
    }

    // quelques boucles : sans elles, le plan se devine trop vite
    var extra = Math.round(w * h * 0.14);
    for (var k = 0; k < extra; k++) {
      var c = RNG.int(rng, 0, w * h - 1);
      var d2 = RNG.pick(rng, DIRS);
      var n2 = neighbour(maze, c, d2);
      if (n2 === -1) continue;
      cells[c][d2] = false;
      cells[n2][OPPOSITE[d2]] = false;
    }
    return maze;
  }

  /** Distances depuis `from`, en ignorant les cases de `blocked`. */
  function distances(maze, from, blocked) {
    var dist = new Array(maze.w * maze.h).fill(-1);
    if (blocked && blocked[from]) return dist;
    dist[from] = 0;
    var queue = [from];
    while (queue.length) {
      var cur = queue.shift();
      for (var k = 0; k < DIRS.length; k++) {
        var d = DIRS[k];
        if (!open(maze, cur, d)) continue;
        var n = neighbour(maze, cur, d);
        if (dist[n] !== -1) continue;
        if (blocked && blocked[n]) continue;
        dist[n] = dist[cur] + 1;
        queue.push(n);
      }
    }
    return dist;
  }

  /**
   * @param {object} opts { size, traps, beacons }
   */
  function create(rng, opts) {
    opts = opts || {};
    var size = Math.max(5, Math.min(15, opts.size || 9));
    var wantTraps = Math.max(0, Math.min(size * size / 4, opts.traps == null ? 6 : opts.traps));
    var wantBeacons = Math.max(0, Math.min(BEACONS.length, opts.beacons == null ? 4 : opts.beacons));

    var maze = carve(rng, size, size);
    var n = size * size;

    // départ au hasard, sortie le plus loin possible
    var start = RNG.int(rng, 0, n - 1);
    var d0 = distances(maze, start, null);
    var far = 0;
    for (var i = 1; i < n; i++) if (d0[i] > d0[far]) far = i;
    var exit = far;

    // balises sur des cases libres, bien réparties
    var free = [];
    for (var j = 0; j < n; j++) if (j !== start && j !== exit) free.push(j);
    var beacons = RNG.sample(rng, BEACONS, wantBeacons).map(function (b, k) {
      return { id: b.id, glyph: b.glyph, color: b.color, label: b.label, cell: -1, order: k };
    });
    var pool = RNG.shuffle(rng, free);
    beacons.forEach(function (b) { b.cell = pool.pop(); });
    var beaconCells = {};
    beacons.forEach(function (b) { beaconCells[b.cell] = b; });

    // pièges : on n'en garde une combinaison que si la sortie reste atteignable
    var candidates = free.filter(function (c) { return !beaconCells[c]; });
    var traps = [];
    for (var attempt = 0; attempt < 60 && traps.length < wantTraps; attempt++) {
      var pickCell = RNG.pick(rng, candidates);
      if (traps.indexOf(pickCell) !== -1) continue;
      var test = traps.concat([pickCell]);
      var blocked = {};
      test.forEach(function (c) { blocked[c] = true; });
      if (distances(maze, start, blocked)[exit] !== -1) traps = test;
    }

    maze.start = start;
    maze.exit = exit;
    maze.traps = traps;
    maze.beacons = beacons;
    maze.size = size;
    return maze;
  }

  /** Ce que voit l'explorateur depuis une case : murs, balise, sortie adjacente. */
  function look(maze, i) {
    var walls = {}, exits = {};
    DIRS.forEach(function (d) {
      var passable = open(maze, i, d);
      walls[d] = !passable;
      exits[d] = passable && neighbour(maze, i, d) === maze.exit;
    });
    var beacon = null;
    for (var k = 0; k < maze.beacons.length; k++) {
      if (maze.beacons[k].cell === i) { beacon = maze.beacons[k]; break; }
    }
    return {
      walls: walls,
      nearExit: exits,
      onExit: i === maze.exit,
      beacon: beacon ? { glyph: beacon.glyph, color: beacon.color, label: beacon.label } : null
    };
  }

  var API = {
    DIRS: DIRS,
    LABEL: LABEL,
    OPPOSITE: OPPOSITE,
    BEACONS: BEACONS,
    create: create,
    look: look,
    open: open,
    neighbour: neighbour,
    distances: distances,
    idx: idx,
    xy: xy
  };

  global.Maze = API;
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
})(typeof window !== 'undefined' ? window : globalThis);
