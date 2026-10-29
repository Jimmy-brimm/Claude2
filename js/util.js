// Shared constants and small helpers.
(function () {
  'use strict';
  const BB = (window.BB = window.BB || {});

  BB.W = 1280;
  BB.H = 720;
  BB.TILE = 40;
  BB.COLS = 32;
  BB.ROWS = 18;
  BB.TAU = Math.PI * 2;

  const U = (BB.util = {
    clamp: (v, a, b) => (v < a ? a : v > b ? b : v),
    lerp: (a, b, t) => a + (b - a) * t,
    dist: (ax, ay, bx, by) => Math.hypot(bx - ax, by - ay),
    rand: (a, b) => a + Math.random() * (b - a),
    randInt: (a, b) => Math.floor(a + Math.random() * (b - a + 1)),
    choice: (arr) => arr[Math.floor(Math.random() * arr.length)],
    sign: (v) => (v < 0 ? -1 : 1),

    angDiff(a, b) {
      let d = (b - a) % BB.TAU;
      if (d > Math.PI) d -= BB.TAU;
      if (d < -Math.PI) d += BB.TAU;
      return d;
    },

    shuffle(arr) {
      for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
      }
      return arr;
    },

    // Deterministic RNG (mulberry32) so arena decorations look the same every time.
    seeded(seed) {
      let s = seed >>> 0;
      return function () {
        s = (s + 0x6d2b79f5) | 0;
        let t = Math.imul(s ^ (s >>> 15), 1 | s);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
      };
    },

    easeOutBack(t) {
      const c1 = 1.70158, c3 = c1 + 1;
      return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
    },
    easeOutCubic: (t) => 1 - Math.pow(1 - t, 3),

    parseHex(hex) {
      let c = hex.replace('#', '');
      if (c.length === 3) c = c.split('').map((x) => x + x).join('');
      return [parseInt(c.slice(0, 2), 16), parseInt(c.slice(2, 4), 16), parseInt(c.slice(4, 6), 16)];
    },

    // amt in [-1, 1]: negative darkens, positive lightens.
    shade(hex, amt) {
      let [r, g, b] = U.parseHex(hex);
      if (amt < 0) {
        r *= 1 + amt; g *= 1 + amt; b *= 1 + amt;
      } else {
        r += (255 - r) * amt; g += (255 - g) * amt; b += (255 - b) * amt;
      }
      return `rgb(${r | 0},${g | 0},${b | 0})`;
    },

    rgba(hex, a) {
      const [r, g, b] = U.parseHex(hex);
      return `rgba(${r},${g},${b},${a})`;
    },

    ellipse(ctx, x, y, rx, ry, rot) {
      ctx.beginPath();
      ctx.ellipse(x, y, Math.max(0.01, rx), Math.max(0.01, ry), rot || 0, 0, BB.TAU);
    },

    roundRect(ctx, x, y, w, h, r) {
      ctx.beginPath();
      if (ctx.roundRect) ctx.roundRect(x, y, w, h, r);
      else ctx.rect(x, y, w, h);
    },

    makeCanvas(w, h) {
      const c = document.createElement('canvas');
      c.width = w;
      c.height = h;
      return c;
    },
  });
})();
