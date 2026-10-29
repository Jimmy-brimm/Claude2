// Arena layouts, collision queries and pre-rendered themed artwork.
//
// Map legend:
//   #  wall / counter / rock        T  round obstacle (jar, pine tree, cactus)
//   ~  pit (water, chasm) - deadly   "  bush / tall grass - hides fighters
//   _  slippery floor (oil, ice)     =  bridge over a pit
//   .  floor                         1-4 spawn points
(function () {
  'use strict';
  const BB = window.BB;
  const U = BB.util;
  const T = BB.TILE;
  const INK = BB.INK;
  const TAU = BB.TAU;
  const E = 12; // how far walls are extruded "up" for the 3/4 view
  const PROP_R = 15; // collision radius of round obstacles
  const RES = 2; // pre-render resolution multiplier

  // ---------------------------------------------------------------------------
  // Themes

  const THEMES = {
    kitchen: {
      floor(ctx, tx, ty, rng) {
        ctx.fillStyle = (tx + ty) % 2 ? '#fdf3e1' : '#cdeee0';
        ctx.fillRect(tx * T, ty * T, T, T);
        ctx.fillStyle = 'rgba(255,255,255,0.35)';
        ctx.fillRect(tx * T + 3, ty * T + 3, T - 6, 3);
        ctx.strokeStyle = 'rgba(80,60,40,0.08)';
        ctx.lineWidth = 1;
        ctx.strokeRect(tx * T + 0.5, ty * T + 0.5, T - 1, T - 1);
      },
      decor(ctx, x, y, rng) {
        const k = rng();
        if (k < 0.5) {
          ctx.fillStyle = U.choice(['#e3b26b', '#d49a52', '#f0c98a']);
          for (let i = 0; i < 4; i++) {
            U.ellipse(ctx, x + (rng() - 0.5) * 18, y + (rng() - 0.5) * 18, 1.5 + rng() * 1.5, 1.2 + rng());
            ctx.fill();
          }
        } else if (k < 0.75) {
          ctx.fillStyle = 'rgba(255,255,255,0.55)';
          U.ellipse(ctx, x, y, 9 + rng() * 6, 5 + rng() * 3, rng() * 3);
          ctx.fill();
        } else {
          ctx.fillStyle = '#7cc55a';
          U.ellipse(ctx, x, y, 3.5, 3.5);
          ctx.fill();
          ctx.strokeStyle = INK;
          ctx.lineWidth = 1;
          ctx.stroke();
        }
      },
      wall: { top: '#f8f5ef', front: '#b7744a', edge: '#ffffff' },
      wallDetail(ctx, walls, arena, rng) {
        // marble veins on the counter tops
        ctx.strokeStyle = 'rgba(150,150,170,0.35)';
        ctx.lineWidth = 1.2;
        for (const w of walls) {
          if (rng() < 0.45) {
            const x = w.tx * T, y = w.ty * T - E;
            ctx.beginPath();
            ctx.moveTo(x + rng() * T, y + 4);
            ctx.quadraticCurveTo(x + rng() * T, y + T / 2, x + rng() * T, y + T - 4);
            ctx.stroke();
          }
        }
        // cabinet doors and knobs on the fronts
        for (const w of walls) {
          if (arena.tile(w.tx, w.ty + 1) === '#') continue;
          const x = w.tx * T, y = w.ty * T + T - E;
          ctx.strokeStyle = 'rgba(60,30,10,0.35)';
          ctx.lineWidth = 1.5;
          ctx.strokeRect(x + 4, y + 2, T - 8, E - 4);
          ctx.fillStyle = '#ffd23f';
          U.ellipse(ctx, x + T / 2, y + E / 2, 2.2, 2.2);
          ctx.fill();
        }
      },
      pit: { rim: '#c9d6de', fill: '#53b7e0', deep: '#2f8fc0', rimLine: '#9fb2bd' },
      slick: { fill: 'rgba(245,190,60,0.55)', edge: 'rgba(205,140,30,0.55)', shine: 'rgba(255,255,230,0.7)' },
      bush: { dark: '#2e7d32', mid: '#4caf50', light: '#7ed36f', kind: 'leaf' },
      prop: drawHoneyJar,
      water: true,
    },

    frost: {
      floor(ctx, tx, ty, rng) {
        const v = rng() * 0.04;
        ctx.fillStyle = U.shade('#e8f3fb', v);
        ctx.fillRect(tx * T, ty * T, T, T);
      },
      decor(ctx, x, y, rng) {
        const k = rng();
        if (k < 0.45) {
          ctx.fillStyle = 'rgba(160,195,225,0.35)';
          U.ellipse(ctx, x, y + 4, 14 + rng() * 10, 6 + rng() * 3);
          ctx.fill();
          ctx.fillStyle = '#ffffff';
          U.ellipse(ctx, x, y, 13 + rng() * 9, 6 + rng() * 3);
          ctx.fill();
        } else if (k < 0.75) {
          ctx.fillStyle = 'rgba(140,175,210,0.35)';
          for (let i = 0; i < 3; i++) {
            const fx = x + i * 9, fy = y + (i % 2) * 6;
            U.ellipse(ctx, fx, fy, 2.6, 4, 0.3);
            ctx.fill();
          }
        } else {
          ctx.strokeStyle = 'rgba(255,255,255,0.95)';
          ctx.lineWidth = 1.4;
          ctx.beginPath();
          ctx.moveTo(x - 4, y); ctx.lineTo(x + 4, y);
          ctx.moveTo(x, y - 4); ctx.lineTo(x, y + 4);
          ctx.stroke();
        }
      },
      wall: { top: '#ffffff', front: '#8fb8d4', edge: '#ffffff' },
      wallDetail(ctx, walls, arena, rng) {
        for (const w of walls) {
          const x = w.tx * T, y = w.ty * T - E;
          ctx.fillStyle = 'rgba(170,205,230,0.45)';
          U.ellipse(ctx, x + 10 + rng() * 20, y + 12 + rng() * 16, 6 + rng() * 5, 3 + rng() * 2);
          ctx.fill();
          if (arena.tile(w.tx, w.ty + 1) === '#') continue;
          const fy = w.ty * T + T - E;
          // icicles
          ctx.fillStyle = '#e8f7ff';
          ctx.strokeStyle = INK;
          ctx.lineWidth = 0.7;
          for (let i = 0; i < 2; i++) {
            if (rng() < 0.4) continue;
            const ix = x + 8 + i * 18 + rng() * 6;
            ctx.beginPath();
            ctx.moveTo(ix - 3, fy + E - 1);
            ctx.lineTo(ix + 3, fy + E - 1);
            ctx.lineTo(ix, fy + E + 6 + rng() * 4);
            ctx.closePath();
            ctx.fill();
            ctx.stroke();
          }
          ctx.strokeStyle = 'rgba(255,255,255,0.5)';
          ctx.beginPath();
          ctx.moveTo(x + 6, fy + 4);
          ctx.lineTo(x + 16, fy + 8);
          ctx.stroke();
        }
      },
      pit: { rim: '#ffffff', fill: '#2a6f9f', deep: '#174b73', rimLine: '#a9d5f0' },
      slick: { fill: '#c4e8fb', edge: '#8ccbef', shine: 'rgba(255,255,255,0.9)', cracks: true },
      bush: { dark: '#2d5e43', mid: '#3f7d5a', light: '#5e9e76', kind: 'snowy' },
      prop: drawPine,
      water: true,
    },

    canyon: {
      floor(ctx, tx, ty, rng) {
        ctx.fillStyle = U.shade('#f2c27f', (rng() - 0.5) * 0.04);
        ctx.fillRect(tx * T, ty * T, T, T);
      },
      decor(ctx, x, y, rng) {
        const k = rng();
        if (k < 0.4) {
          ctx.strokeStyle = 'rgba(190,120,60,0.28)';
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.moveTo(x - 18, y);
          ctx.quadraticCurveTo(x - 6, y - 6, x + 4, y);
          ctx.quadraticCurveTo(x + 12, y + 5, x + 20, y - 1);
          ctx.stroke();
        } else if (k < 0.75) {
          for (let i = 0; i < 3; i++) {
            ctx.fillStyle = U.choice(['#c99a6a', '#b88457', '#d8b088']);
            U.ellipse(ctx, x + (rng() - 0.5) * 20, y + (rng() - 0.5) * 16, 2 + rng() * 3, 1.5 + rng() * 2);
            ctx.fill();
            ctx.strokeStyle = 'rgba(42,31,61,0.5)';
            ctx.lineWidth = 0.8;
            ctx.stroke();
          }
        } else {
          ctx.strokeStyle = 'rgba(150,90,40,0.35)';
          ctx.lineWidth = 1.2;
          ctx.beginPath();
          ctx.moveTo(x - 8, y - 6);
          ctx.lineTo(x - 1, y);
          ctx.lineTo(x - 4, y + 7);
          ctx.moveTo(x - 1, y);
          ctx.lineTo(x + 8, y + 2);
          ctx.stroke();
        }
      },
      wall: { top: '#e8925a', front: '#b4552f', edge: '#f5b07f' },
      wallDetail(ctx, walls, arena, rng) {
        for (const w of walls) {
          const x = w.tx * T, y = w.ty * T - E;
          ctx.fillStyle = 'rgba(160,70,35,0.35)';
          for (let i = 0; i < 3; i++) {
            U.ellipse(ctx, x + 6 + rng() * 28, y + 6 + rng() * 28, 1.5 + rng() * 2, 1 + rng() * 1.5);
            ctx.fill();
          }
          if (arena.tile(w.tx, w.ty + 1) === '#') continue;
          const fy = w.ty * T + T - E;
          ctx.strokeStyle = 'rgba(120,45,20,0.5)';
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.moveTo(x, fy + E * 0.45);
          ctx.lineTo(x + T, fy + E * 0.45 + (rng() - 0.5) * 2);
          ctx.stroke();
        }
      },
      pit: { rim: '#c77548', fill: '#2a120b', deep: '#120604', rimLine: '#8a3f22', cliff: '#8a4127' },
      slick: null,
      bush: { dark: '#9c7424', mid: '#c99b3c', light: '#e8c66a', kind: 'grass' },
      prop: drawCactus,
      water: false,
    },
  };

  // ---------------------------------------------------------------------------
  // Round obstacles (drawn y-sorted with the fighters)

  function drawHoneyJar(ctx) {
    ctx.fillStyle = 'rgba(0,0,0,0.2)';
    U.ellipse(ctx, 3, 8, 19, 8);
    ctx.fill();
    const g = ctx.createLinearGradient(-15, 0, 15, 0);
    g.addColorStop(0, '#ffcc4d');
    g.addColorStop(1, '#e8961c');
    U.roundRect(ctx, -16, -26, 32, 36, 10);
    ctx.fillStyle = g;
    ctx.fill();
    ctx.lineWidth = 1.6;
    ctx.strokeStyle = INK;
    ctx.stroke();
    U.roundRect(ctx, -16, -12, 32, 12, 2);
    ctx.fillStyle = '#fff4dc';
    ctx.fill();
    ctx.lineWidth = 1.2;
    ctx.stroke();
    ctx.fillStyle = '#e2453c';
    ctx.beginPath();
    ctx.arc(-2, -7, 2.4, Math.PI, 0);
    ctx.arc(2.6, -7, 2.4, Math.PI, 0);
    ctx.lineTo(0, -2.5);
    ctx.closePath();
    ctx.fill();
    U.ellipse(ctx, 0, -27, 17, 7);
    ctx.fillStyle = '#e2453c';
    ctx.fill();
    ctx.lineWidth = 1.6;
    ctx.stroke();
    ctx.fillStyle = '#fff';
    for (let i = -2; i <= 2; i++) {
      U.ellipse(ctx, i * 6, -27 + (Math.abs(i) % 2) * 2 - 1, 2.2, 1.6);
      ctx.fill();
    }
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    U.roundRect(ctx, -11, -20, 4, 26, 2);
    ctx.fill();
  }

  function drawPine(ctx) {
    ctx.fillStyle = 'rgba(30,60,90,0.22)';
    U.ellipse(ctx, 4, 8, 22, 9);
    ctx.fill();
    ctx.fillStyle = '#7a4b2a';
    ctx.strokeStyle = INK;
    ctx.lineWidth = 1.4;
    U.roundRect(ctx, -4, -4, 8, 12, 2);
    ctx.fill();
    ctx.stroke();
    const tiers = [
      { y: -10, r: 22, c: '#2e7550' },
      { y: -24, r: 17, c: '#368a5d' },
      { y: -37, r: 11, c: '#40a06b' },
    ];
    for (const t of tiers) {
      ctx.beginPath();
      for (let i = 0; i <= 18; i++) {
        const a = (i / 18) * TAU;
        const rr = i % 2 ? t.r * 0.78 : t.r;
        ctx.lineTo(Math.cos(a) * rr, t.y + Math.sin(a) * rr * 0.6);
      }
      ctx.closePath();
      ctx.fillStyle = t.c;
      ctx.fill();
      ctx.lineWidth = 1.4;
      ctx.strokeStyle = INK;
      ctx.lineJoin = 'round';
      ctx.stroke();
      ctx.fillStyle = '#ffffff';
      U.ellipse(ctx, -t.r * 0.15, t.y - t.r * 0.25, t.r * 0.55, t.r * 0.22);
      ctx.fill();
    }
  }

  function drawCactus(ctx) {
    ctx.fillStyle = 'rgba(80,30,10,0.22)';
    U.ellipse(ctx, 4, 8, 17, 7);
    ctx.fill();
    ctx.lineWidth = 1.6;
    ctx.strokeStyle = INK;
    ctx.lineJoin = 'round';
    const green = '#4fb06a';
    // arms
    ctx.fillStyle = green;
    ctx.beginPath();
    ctx.moveTo(-6, -14);
    ctx.lineTo(-15, -14);
    ctx.quadraticCurveTo(-20, -14, -20, -20);
    ctx.lineTo(-20, -30);
    ctx.quadraticCurveTo(-20, -35, -15.5, -35);
    ctx.quadraticCurveTo(-11, -35, -11, -30);
    ctx.lineTo(-11, -22);
    ctx.lineTo(-6, -22);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(6, -8);
    ctx.lineTo(14, -8);
    ctx.quadraticCurveTo(19, -8, 19, -14);
    ctx.lineTo(19, -22);
    ctx.quadraticCurveTo(19, -27, 14.5, -27);
    ctx.quadraticCurveTo(10, -27, 10, -22);
    ctx.lineTo(10, -16);
    ctx.lineTo(6, -16);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    U.roundRect(ctx, -9, -44, 18, 54, 9);
    const g = ctx.createLinearGradient(-9, 0, 9, 0);
    g.addColorStop(0, '#6fcf86');
    g.addColorStop(1, '#3a9455');
    ctx.fillStyle = g;
    ctx.fill();
    ctx.stroke();
    ctx.strokeStyle = 'rgba(30,80,40,0.5)';
    ctx.lineWidth = 1;
    for (const x of [-3, 3]) {
      ctx.beginPath();
      ctx.moveTo(x, -38);
      ctx.lineTo(x, 6);
      ctx.stroke();
    }
    ctx.fillStyle = '#ff6fa5';
    ctx.strokeStyle = INK;
    ctx.lineWidth = 1.2;
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * TAU;
      U.ellipse(ctx, Math.cos(a) * 3.5, -44 + Math.sin(a) * 3, 3, 2.4, a);
      ctx.fill();
      ctx.stroke();
    }
    ctx.fillStyle = '#ffd23f';
    U.ellipse(ctx, 0, -44, 2, 2);
    ctx.fill();
  }

  // ---------------------------------------------------------------------------
  // Arena definitions

  const DEFS = (BB.ARENA_DEFS = [
    {
      id: 'kitchen',
      name: 'Sunny Kitchen',
      desc: 'Oil spills ring a deep sink. Herb pots make great hiding spots.',
      theme: 'kitchen',
      map: [
        '################################',
        '#1............................2#',
        '#..............................#',
        '#...####......""""......####...#',
        '#...####......""""......####...#',
        '#..............................#',
        '#......T...__________...T......#',
        '#.........._~~~~~~~~_..........#',
        '#..""......_~~~~~~~~_......""..#',
        '#..""......_~~~~~~~~_......""..#',
        '#.........._~~~~~~~~_..........#',
        '#......T...__________...T......#',
        '#..............................#',
        '#...####......""""......####...#',
        '#...####......""""......####...#',
        '#..............................#',
        '#3............................4#',
        '################################',
      ],
    },
    {
      id: 'frost',
      name: 'Frosty Glade',
      desc: 'A frozen pond with cracked holes. Mind your footing on the ice!',
      theme: 'frost',
      map: [
        '################################',
        '#1.....T................T.....2#',
        '#..............................#',
        '#..###........""""........###..#',
        '#..#........................#..#',
        '#..#.....______________.....#..#',
        '#........______________........#',
        '#."".....___~~_________....."".#',
        '#."".....___~~_T_______....."".#',
        '#.""....._______T_~~___....."".#',
        '#.""....._________~~___....."".#',
        '#........______________........#',
        '#..#.....______________.....#..#',
        '#..#........................#..#',
        '#..###........""""........###..#',
        '#..............................#',
        '#3.....T................T.....4#',
        '################################',
      ],
    },
    {
      id: 'canyon',
      name: 'Sunset Canyon',
      desc: 'Two rickety bridges over a bottomless chasm. Dash across if you dare.',
      theme: 'canyon',
      map: [
        '################################',
        '#1............~~..............2#',
        '#..........T..~~.......T.......#',
        '#...###.......~~...........""".#',
        '#...###.......==.......T...""".#',
        '#.............~~...............#',
        '#......"""....~~~....##........#',
        '#......""".....~~....##........#',
        '#..............~~....##.....T..#',
        '#..T.....##....~~..............#',
        '#........##....~~....."""......#',
        '#........##....~~~...."""......#',
        '#...............~~.............#',
        '#."""...T.......==.......###...#',
        '#."""...........~~.......###...#',
        '#.......T.......~~..T..........#',
        '#3..............~~............4#',
        '################################',
      ],
    },
  ]);

  // ---------------------------------------------------------------------------

  class Arena {
    constructor(def) {
      this.def = def;
      this.id = def.id;
      this.name = def.name;
      this.theme = THEMES[def.theme];
      this.grid = [];
      this.spawns = [];
      this.props = [];
      for (let ty = 0; ty < BB.ROWS; ty++) {
        const row = [];
        const src = def.map[ty] || '';
        for (let tx = 0; tx < BB.COLS; tx++) {
          let c = src[tx] || '#';
          if (c >= '1' && c <= '9') {
            this.spawns[+c - 1] = { x: (tx + 0.5) * T, y: (ty + 0.5) * T };
            c = '.';
          }
          if (c === 'T') this.props.push({ tx, ty, x: (tx + 0.5) * T, y: (ty + 0.5) * T });
          row.push(c);
        }
        this.grid.push(row);
      }
      this.built = false;
    }

    tile(tx, ty) {
      if (tx < 0 || ty < 0 || tx >= BB.COLS || ty >= BB.ROWS) return '#';
      return this.grid[ty][tx];
    }

    tileAt(x, y) {
      return this.tile(Math.floor(x / T), Math.floor(y / T));
    }

    isSolidTile(c) { return c === '#' || c === 'T'; }
    isWalkable(tx, ty) { const c = this.tile(tx, ty); return c !== '#' && c !== 'T' && c !== '~'; }
    isPitAt(x, y) { return this.tileAt(x, y) === '~'; }
    isSlickAt(x, y) { return this.tileAt(x, y) === '_'; }
    isBushAt(x, y) { return this.tileAt(x, y) === '"'; }

    // Is the point inside solid geometry (wall tile or round obstacle)?
    solidAt(x, y, pad = 0) {
      const tx = Math.floor(x / T), ty = Math.floor(y / T);
      const c = this.tile(tx, ty);
      if (c === '#') return true;
      for (let oy = -1; oy <= 1; oy++) {
        for (let ox = -1; ox <= 1; ox++) {
          if (this.tile(tx + ox, ty + oy) === 'T') {
            const px = (tx + ox + 0.5) * T, py = (ty + oy + 0.5) * T;
            if (Math.hypot(x - px, y - py) < PROP_R + pad) return true;
          }
        }
      }
      return false;
    }

    // Push a circle (obj.x, obj.y, radius r) out of solid geometry. Returns the
    // last contact normal, or null when nothing was touched.
    collideCircle(obj, r) {
      let hit = null;
      const tx0 = Math.floor((obj.x - r) / T) - 1, tx1 = Math.floor((obj.x + r) / T) + 1;
      const ty0 = Math.floor((obj.y - r) / T) - 1, ty1 = Math.floor((obj.y + r) / T) + 1;
      for (let ty = ty0; ty <= ty1; ty++) {
        for (let tx = tx0; tx <= tx1; tx++) {
          const c = this.tile(tx, ty);
          if (c === '#') {
            const x0 = tx * T, y0 = ty * T;
            const cx = U.clamp(obj.x, x0, x0 + T), cy = U.clamp(obj.y, y0, y0 + T);
            const dx = obj.x - cx, dy = obj.y - cy;
            const d2 = dx * dx + dy * dy;
            if (d2 >= r * r) continue;
            let nx, ny, push;
            if (d2 > 1e-6) {
              const d = Math.sqrt(d2);
              nx = dx / d; ny = dy / d; push = r - d;
            } else {
              // centre is inside the tile: leave through the nearest open side
              const opts = [
                { nx: -1, ny: 0, p: obj.x - x0 + r, open: this.tile(tx - 1, ty) !== '#' },
                { nx: 1, ny: 0, p: x0 + T - obj.x + r, open: this.tile(tx + 1, ty) !== '#' },
                { nx: 0, ny: -1, p: obj.y - y0 + r, open: this.tile(tx, ty - 1) !== '#' },
                { nx: 0, ny: 1, p: y0 + T - obj.y + r, open: this.tile(tx, ty + 1) !== '#' },
              ].sort((a, b) => (b.open - a.open) || (a.p - b.p));
              nx = opts[0].nx; ny = opts[0].ny; push = opts[0].p;
            }
            obj.x += nx * push;
            obj.y += ny * push;
            hit = { nx, ny };
          } else if (c === 'T') {
            const px = (tx + 0.5) * T, py = (ty + 0.5) * T;
            const dx = obj.x - px, dy = obj.y - py;
            const d = Math.hypot(dx, dy);
            const min = r + PROP_R;
            if (d >= min) continue;
            const nx = d > 1e-6 ? dx / d : 1, ny = d > 1e-6 ? dy / d : 0;
            obj.x = px + nx * min;
            obj.y = py + ny * min;
            hit = { nx, ny };
          }
        }
      }
      return hit;
    }

    // Clear straight line for projectiles (walls and obstacles block; pits don't).
    lineClear(x0, y0, x1, y1, pad = 0) {
      const d = Math.hypot(x1 - x0, y1 - y0);
      const n = Math.max(1, Math.ceil(d / 8));
      for (let i = 1; i < n; i++) {
        const t = i / n;
        if (this.solidAt(x0 + (x1 - x0) * t, y0 + (y1 - y0) * t, pad)) return false;
      }
      return true;
    }

    // Clear straight line for walking (also avoids pits).
    walkClear(x0, y0, x1, y1) {
      const d = Math.hypot(x1 - x0, y1 - y0);
      const n = Math.max(1, Math.ceil(d / 10));
      for (let i = 0; i <= n; i++) {
        const t = i / n;
        const x = x0 + (x1 - x0) * t, y = y0 + (y1 - y0) * t;
        if (this.solidAt(x, y, 14) || this.isPitAt(x, y)) return false;
        for (const [ox, oy] of [[12, 0], [-12, 0], [0, 12], [0, -12]]) {
          if (this.isPitAt(x + ox, y + oy) || this.tileAt(x + ox, y + oy) === '#') return false;
        }
      }
      return true;
    }

    randomFloorPoint(filter) {
      for (let i = 0; i < 200; i++) {
        const tx = U.randInt(1, BB.COLS - 2), ty = U.randInt(1, BB.ROWS - 2);
        const c = this.tile(tx, ty);
        if (c !== '.' && c !== '=') continue;
        const p = { x: (tx + 0.5) * T, y: (ty + 0.5) * T, tx, ty };
        if (!filter || filter(p)) return p;
      }
      return null;
    }

    // ---- artwork ----------------------------------------------------------

    build() {
      if (this.built) return;
      this.built = true;
      this.bg = U.makeCanvas(BB.W * RES, BB.H * RES);
      this.bushLayer = U.makeCanvas(BB.W * RES, BB.H * RES);
      const ctx = this.bg.getContext('2d');
      ctx.scale(RES, RES);
      const rng = U.seeded(this.id.length * 977 + this.id.charCodeAt(0) * 131);
      const th = this.theme;
      const tiles = (ch) => {
        const out = [];
        for (let ty = 0; ty < BB.ROWS; ty++)
          for (let tx = 0; tx < BB.COLS; tx++) if (this.grid[ty][tx] === ch) out.push({ tx, ty });
        return out;
      };

      // floor
      for (let ty = 0; ty < BB.ROWS; ty++) for (let tx = 0; tx < BB.COLS; tx++) th.floor(ctx, tx, ty, rng);
      for (let i = 0; i < 70; i++) {
        const tx = Math.floor(rng() * BB.COLS), ty = Math.floor(rng() * BB.ROWS);
        if (this.tile(tx, ty) !== '.') continue;
        th.decor(ctx, (tx + rng()) * T, (ty + rng()) * T, rng);
      }

      // slippery patches
      // obstacles standing on slippery floor get the slick painted under them too
      const slick = tiles('_').concat(tiles('T').filter((t) =>
        [[1, 0], [-1, 0], [0, 1], [0, -1]].filter(([ox, oy]) => this.tile(t.tx + ox, t.ty + oy) === '_').length >= 2));
      if (th.slick && slick.length) {
        ctx.fillStyle = th.slick.edge;
        for (const s of slick) { U.roundRect(ctx, s.tx * T - 4, s.ty * T - 4, T + 8, T + 8, 14); ctx.fill(); }
        ctx.fillStyle = th.slick.fill;
        for (const s of slick) { U.roundRect(ctx, s.tx * T - 1, s.ty * T - 1, T + 2, T + 2, 10); ctx.fill(); }
        ctx.strokeStyle = th.slick.shine;
        ctx.lineCap = 'round';
        for (const s of slick) {
          if (rng() < 0.45) {
            ctx.lineWidth = 2.5;
            const x = s.tx * T + 8 + rng() * 16, y = s.ty * T + 8 + rng() * 16;
            ctx.beginPath();
            ctx.moveTo(x, y + 8);
            ctx.lineTo(x + 9, y);
            ctx.stroke();
          }
          if (th.slick.cracks && rng() < 0.3) {
            ctx.lineWidth = 1;
            ctx.strokeStyle = 'rgba(255,255,255,0.9)';
            const x = s.tx * T + rng() * T, y = s.ty * T + rng() * T;
            ctx.beginPath();
            ctx.moveTo(x, y);
            ctx.lineTo(x + 10, y + 4);
            ctx.lineTo(x + 14, y + 12);
            ctx.moveTo(x + 10, y + 4);
            ctx.lineTo(x + 18, y + 2);
            ctx.stroke();
            ctx.strokeStyle = th.slick.shine;
          }
        }
      }

      // pits
      const pits = tiles('~');
      const pc = th.pit;
      ctx.fillStyle = INK;
      for (const p of pits) { U.roundRect(ctx, p.tx * T - 5, p.ty * T - 5, T + 10, T + 10, 11); ctx.fill(); }
      ctx.fillStyle = pc.rim;
      for (const p of pits) { U.roundRect(ctx, p.tx * T - 4, p.ty * T - 4, T + 8, T + 8, 10); ctx.fill(); }
      ctx.fillStyle = pc.rimLine;
      for (const p of pits) { ctx.fillRect(p.tx * T - 1, p.ty * T - 1, T + 2, T + 2); }
      // base fill, including the seams between neighbouring pit tiles
      ctx.fillStyle = th.water ? pc.fill : pc.deep;
      for (const p of pits) {
        const x = p.tx * T, y = p.ty * T;
        ctx.fillRect(x + 1, y + 1, T - 2, T - 2);
        if (this.tile(p.tx + 1, p.ty) === '~') ctx.fillRect(x + T - 2, y + 1, 4, T - 2);
        if (this.tile(p.tx, p.ty + 1) === '~') ctx.fillRect(x + 1, y + T - 2, T - 2, 4);
      }
      // cliff face / inner shadow along the far edge sells the depth
      for (const p of pits) {
        if (this.tile(p.tx, p.ty - 1) === '~') continue;
        const x = p.tx * T, y = p.ty * T;
        const w = T - 2 + (this.tile(p.tx + 1, p.ty) === '~' ? 2 : 0);
        if (pc.cliff) {
          ctx.fillStyle = pc.cliff;
          ctx.fillRect(x + 1, y + 1, w, 16);
          ctx.strokeStyle = 'rgba(60,20,10,0.6)';
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.moveTo(x + 1, y + 9); ctx.lineTo(x + 1 + w, y + 9);
          ctx.stroke();
          const sh = ctx.createLinearGradient(0, y + 17, 0, y + 30);
          sh.addColorStop(0, 'rgba(0,0,0,0.5)');
          sh.addColorStop(1, 'rgba(0,0,0,0)');
          ctx.fillStyle = sh;
          ctx.fillRect(x + 1, y + 17, w, 13);
        } else {
          const sh = ctx.createLinearGradient(0, y, 0, y + 14);
          sh.addColorStop(0, 'rgba(0,30,60,0.45)');
          sh.addColorStop(1, 'rgba(0,30,60,0)');
          ctx.fillStyle = sh;
          ctx.fillRect(x + 1, y + 1, w, 14);
        }
      }

      // bridges
      for (const b of tiles('=')) {
        const x = b.tx * T, y = b.ty * T;
        const horizontal = this.tile(b.tx - 1, b.ty) !== '~' || this.tile(b.tx + 1, b.ty) !== '~';
        ctx.fillStyle = 'rgba(0,0,0,0.35)';
        ctx.fillRect(x - 2, y + 6, T + 4, T);
        for (let i = 0; i < 5; i++) {
          ctx.fillStyle = i % 2 ? '#b07a45' : '#c48a50';
          ctx.strokeStyle = INK;
          ctx.lineWidth = 0.8;
          if (horizontal) {
            ctx.fillRect(x + i * 8, y + 3, 7, T - 6);
            ctx.strokeRect(x + i * 8, y + 3, 7, T - 6);
          } else {
            ctx.fillRect(x + 3, y + i * 8, T - 6, 7);
            ctx.strokeRect(x + 3, y + i * 8, T - 6, 7);
          }
        }
        ctx.strokeStyle = '#7a5530';
        ctx.lineWidth = 3;
        ctx.beginPath();
        if (horizontal) {
          ctx.moveTo(x - 4, y + 3); ctx.lineTo(x + T + 4, y + 3);
          ctx.moveTo(x - 4, y + T - 3); ctx.lineTo(x + T + 4, y + T - 3);
        } else {
          ctx.moveTo(x + 3, y - 4); ctx.lineTo(x + 3, y + T + 4);
          ctx.moveTo(x + T - 3, y - 4); ctx.lineTo(x + T - 3, y + T + 4);
        }
        ctx.stroke();
      }

      // walls: drop shadow, outline, front faces, tops
      const walls = tiles('#');
      const wc = th.wall;
      ctx.fillStyle = 'rgba(40,20,40,0.2)';
      for (const w of walls) ctx.fillRect(w.tx * T + 7, w.ty * T + 4, T, T);
      ctx.fillStyle = INK;
      for (const w of walls) {
        const below = this.tile(w.tx, w.ty + 1) === '#';
        U.roundRect(ctx, w.tx * T - 1.5, w.ty * T - E - 1.5, T + 3, T + (below ? 0 : E) + 3, 4);
        ctx.fill();
      }
      for (const w of walls) {
        if (this.tile(w.tx, w.ty + 1) === '#') continue;
        ctx.fillStyle = wc.front;
        ctx.fillRect(w.tx * T, w.ty * T + T - E, T, E);
        ctx.fillStyle = 'rgba(0,0,0,0.12)';
        ctx.fillRect(w.tx * T, w.ty * T + T - 4, T, 4);
      }
      ctx.fillStyle = INK;
      for (const w of walls) {
        if (this.tile(w.tx, w.ty + 1) === '#') continue;
        ctx.fillRect(w.tx * T - (this.tile(w.tx - 1, w.ty) === '#' ? 0 : 1.5), w.ty * T + T - E - 0.6, T + (this.tile(w.tx - 1, w.ty) === '#' ? 0 : 1.5) + (this.tile(w.tx + 1, w.ty) === '#' ? 0 : 1.5), 1.2);
      }
      for (const w of walls) {
        ctx.fillStyle = wc.top;
        ctx.fillRect(w.tx * T, w.ty * T - E, T, T - (this.tile(w.tx, w.ty + 1) === '#' ? 0 : 1.5));
      }
      // light edge along exposed top sides
      ctx.fillStyle = wc.edge;
      for (const w of walls) {
        if (this.tile(w.tx, w.ty - 1) !== '#') ctx.fillRect(w.tx * T + 2, w.ty * T - E + 2, T - 4, 3);
      }
      th.wallDetail(ctx, walls, this, rng);

      // soft vignette
      const vg = ctx.createRadialGradient(BB.W / 2, BB.H / 2, BB.H * 0.45, BB.W / 2, BB.H / 2, BB.W * 0.7);
      vg.addColorStop(0, 'rgba(0,0,0,0)');
      vg.addColorStop(1, 'rgba(40,20,60,0.22)');
      ctx.fillStyle = vg;
      ctx.fillRect(0, 0, BB.W, BB.H);

      this._buildBushes(tiles('"'), U.seeded(4242 + this.id.length));
      this._buildPropSprite();
    }

    _buildBushes(bushes, rng) {
      const ctx = this.bushLayer.getContext('2d');
      ctx.scale(RES, RES);
      const bc = this.theme.bush;
      const blobs = [];
      for (const b of bushes) {
        for (let i = 0; i < 4; i++) {
          blobs.push({
            x: b.tx * T + (i % 2 ? 29 : 11) + (rng() - 0.5) * 6,
            y: b.ty * T + (i < 2 ? 12 : 28) + (rng() - 0.5) * 6 - 6,
            r: 14 + rng() * 4,
          });
        }
      }
      // drop shadow
      ctx.fillStyle = 'rgba(0,0,0,0.18)';
      for (const b of blobs) { U.ellipse(ctx, b.x + 4, b.y + 10, b.r, b.r * 0.8); ctx.fill(); }
      ctx.fillStyle = INK;
      for (const b of blobs) { U.ellipse(ctx, b.x, b.y, b.r + 1.5, b.r + 1.5); ctx.fill(); }
      ctx.fillStyle = bc.dark;
      for (const b of blobs) { U.ellipse(ctx, b.x, b.y, b.r, b.r); ctx.fill(); }
      ctx.fillStyle = bc.mid;
      for (const b of blobs) { U.ellipse(ctx, b.x - 2, b.y - 3, b.r * 0.82, b.r * 0.78); ctx.fill(); }
      if (bc.kind === 'grass') {
        ctx.lineCap = 'round';
        for (const b of blobs) {
          for (let i = 0; i < 6; i++) {
            const bx = b.x + (rng() - 0.5) * b.r * 1.4, by = b.y + (rng() - 0.2) * b.r;
            const lean = (rng() - 0.5) * 10;
            ctx.strokeStyle = bc.dark;
            ctx.lineWidth = 3.5;
            ctx.beginPath();
            ctx.moveTo(bx, by);
            ctx.quadraticCurveTo(bx + lean * 0.3, by - 10, bx + lean, by - 16 - rng() * 6);
            ctx.stroke();
            ctx.strokeStyle = bc.light;
            ctx.lineWidth = 1.8;
            ctx.stroke();
          }
        }
      } else {
        ctx.fillStyle = bc.light;
        for (const b of blobs) {
          U.ellipse(ctx, b.x - b.r * 0.35, b.y - b.r * 0.4, b.r * 0.35, b.r * 0.25, -0.5);
          ctx.fill();
        }
        if (bc.kind === 'snowy') {
          ctx.fillStyle = '#ffffff';
          for (const b of blobs) {
            U.ellipse(ctx, b.x - 1, b.y - b.r * 0.55, b.r * 0.55, b.r * 0.28);
            ctx.fill();
          }
        } else {
          ctx.strokeStyle = 'rgba(20,70,20,0.45)';
          ctx.lineWidth = 1.2;
          for (const b of blobs) {
            ctx.beginPath();
            ctx.moveTo(b.x - b.r * 0.4, b.y + b.r * 0.2);
            ctx.lineTo(b.x + b.r * 0.4, b.y - b.r * 0.2);
            ctx.stroke();
          }
        }
      }
    }

    _buildPropSprite() {
      // Sprite with the anchor (tile centre) at (40, 70) in a 80x90 box.
      this.propSprite = U.makeCanvas(80 * RES, 90 * RES);
      const ctx = this.propSprite.getContext('2d');
      ctx.scale(RES, RES);
      ctx.translate(40, 70);
      this.theme.prop(ctx);
    }

    drawBase(ctx) {
      ctx.drawImage(this.bg, 0, 0, BB.W, BB.H);
    }

    drawProp(ctx, p) {
      ctx.drawImage(this.propSprite, p.x - 40, p.y - 70, 80, 90);
    }

    drawBushes(ctx) {
      ctx.drawImage(this.bushLayer, 0, 0, BB.W, BB.H);
    }

    // Cheap per-frame shimmer on the water.
    drawAnimated(ctx, time) {
      if (!this.theme.water) return;
      ctx.save();
      ctx.strokeStyle = 'rgba(255,255,255,0.45)';
      ctx.lineWidth = 2;
      ctx.lineCap = 'round';
      for (let ty = 0; ty < BB.ROWS; ty++) {
        for (let tx = 0; tx < BB.COLS; tx++) {
          if (this.grid[ty][tx] !== '~') continue;
          const ph = time * 1.6 + tx * 1.3 + ty * 2.1;
          const a = (Math.sin(ph) + 1) / 2;
          ctx.globalAlpha = a * 0.8;
          const x = tx * T + 10 + ((tx * 7 + ty * 3) % 14), y = ty * T + 18 + ((tx * 5) % 12);
          ctx.beginPath();
          ctx.moveTo(x, y);
          ctx.quadraticCurveTo(x + 5, y - 3 - a * 2, x + 10, y);
          ctx.stroke();
        }
      }
      ctx.restore();
    }

    drawPreview(canvas) {
      this.build();
      const ctx = canvas.getContext('2d');
      const s = canvas.width / BB.W;
      ctx.save();
      ctx.scale(s, s);
      this.drawBase(ctx);
      for (const p of this.props.slice().sort((a, b) => a.y - b.y)) this.drawProp(ctx, p);
      this.drawBushes(ctx);
      ctx.restore();
    }
  }

  const cache = {};
  BB.getArena = function (id) {
    if (!cache[id]) {
      const def = DEFS.find((d) => d.id === id) || DEFS[0];
      cache[id] = new Arena(def);
    }
    const a = cache[id];
    a.build();
    return a;
  };
  BB.PROP_R = PROP_R;
})();
