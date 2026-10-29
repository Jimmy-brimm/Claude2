// The playable snack fighters, drawn procedurally in a soft, chunky cartoon style.
(function () {
  'use strict';
  const BB = window.BB;
  const U = BB.util;
  const TAU = BB.TAU;
  const INK = (BB.INK = '#2a1f3d');

  BB.PLAYER_COLORS = ['#ff4d4d', '#3d8bff', '#33c46a', '#ffb81c'];

  function outlineFill(ctx, fill, lw) {
    ctx.fillStyle = fill;
    ctx.fill();
    ctx.lineWidth = lw;
    ctx.strokeStyle = INK;
    ctx.stroke();
  }

  function shine(ctx, r, x, y) {
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    U.ellipse(ctx, x * r, y * r, r * 0.22, r * 0.12, -0.6);
    ctx.fill();
    U.ellipse(ctx, (x + 0.2) * r, (y + 0.12) * r, r * 0.06, r * 0.05, 0);
    ctx.fill();
  }

  function radial(ctx, r, light, dark) {
    const g = ctx.createRadialGradient(-r * 0.35, -r * 0.45, r * 0.1, 0, 0, r * 1.1);
    g.addColorStop(0, light);
    g.addColorStop(1, dark);
    return g;
  }

  const CHARACTERS = (BB.CHARACTERS = [
    {
      id: 'bao',
      name: 'Bao',
      desc: 'Soft on the outside, savage on the inside.',
      body: '#f4ead8',
      feet: '#c9a77c',
      inside: '#fff7ea',
      juice: '#f5e7cc',
      faceY: 0.14,
      drawBody(ctx, r) {
        U.ellipse(ctx, 0, 0, r * 1.03, r * 0.95);
        outlineFill(ctx, radial(ctx, r, '#fffdf8', '#e3d4ba'), r * 0.13);
        // folded pleats spiralling into a pinched top
        const cy = -r * 0.48;
        ctx.strokeStyle = '#c8b28f';
        ctx.lineWidth = r * 0.075;
        ctx.lineCap = 'round';
        for (let i = 0; i < 7; i++) {
          const a = (i / 7) * TAU;
          ctx.beginPath();
          ctx.moveTo(0, cy);
          ctx.quadraticCurveTo(Math.cos(a + 0.8) * r * 0.32, cy + Math.sin(a + 0.8) * r * 0.18,
            Math.cos(a) * r * 0.52, cy + Math.sin(a) * r * 0.3);
          ctx.stroke();
        }
        U.ellipse(ctx, 0, cy, r * 0.13, r * 0.1);
        outlineFill(ctx, '#f8f0e2', r * 0.06);
        shine(ctx, r, -0.55, -0.15);
      },
      drawInside(ctx, r) {
        U.ellipse(ctx, 0, 0, r * 0.56, r * 0.17);
        ctx.fillStyle = '#b5653a';
        ctx.fill();
        U.ellipse(ctx, -r * 0.15, -r * 0.03, r * 0.15, r * 0.05);
        ctx.fillStyle = '#d98b55';
        ctx.fill();
      },
    },
    {
      id: 'kiwi',
      name: 'Kiwi',
      desc: 'Fuzzy, fast and full of seeds.',
      body: '#9a6a3f',
      feet: '#5a3a1f',
      inside: '#8cc63f',
      juice: '#9ad04f',
      faceY: 0.05,
      drawBody(ctx, r) {
        // fuzz
        ctx.strokeStyle = '#6b4526';
        ctx.lineWidth = r * 0.06;
        ctx.lineCap = 'round';
        for (let i = 0; i < 26; i++) {
          const a = (i / 26) * TAU;
          ctx.beginPath();
          ctx.moveTo(Math.cos(a) * r * 0.9, Math.sin(a) * r * 0.88);
          ctx.lineTo(Math.cos(a + 0.05) * r * 1.1, Math.sin(a + 0.05) * r * 1.07);
          ctx.stroke();
        }
        U.ellipse(ctx, 0, 0, r * 0.99, r * 0.96);
        outlineFill(ctx, radial(ctx, r, '#b98656', '#7d522d'), r * 0.13);
        ctx.fillStyle = 'rgba(70,40,15,0.45)';
        for (let i = 0; i < 16; i++) {
          const a = i * 2.39996;
          const d = r * (0.25 + ((i * 7) % 5) * 0.14);
          U.ellipse(ctx, Math.cos(a) * d, Math.sin(a) * d * 0.95, r * 0.045, r * 0.035);
          ctx.fill();
        }
        U.ellipse(ctx, 0, -r * 0.86, r * 0.12, r * 0.08);
        outlineFill(ctx, '#4b2f17', r * 0.05);
        shine(ctx, r, -0.5, -0.45);
      },
      drawInside(ctx, r) {
        ctx.fillStyle = '#2a1f3d';
        for (let i = 0; i < 12; i++) {
          const a = (i / 12) * TAU;
          U.ellipse(ctx, Math.cos(a) * r * 0.5, Math.sin(a) * r * 0.16, r * 0.04, r * 0.025, a);
          ctx.fill();
        }
        U.ellipse(ctx, 0, 0, r * 0.3, r * 0.09);
        ctx.fillStyle = '#f1f7d0';
        ctx.fill();
      },
    },
    {
      id: 'macaron',
      name: 'Macaron',
      desc: 'Sweet, fancy and fiercely crunchy.',
      body: '#f79cc0',
      feet: '#c25e86',
      inside: '#ffe3ee',
      juice: '#ffc6dc',
      faceY: -0.12,
      drawBody(ctx, r) {
        U.ellipse(ctx, 0, r * 0.34, r * 0.94, r * 0.58);
        outlineFill(ctx, '#e07ea6', r * 0.12);
        U.ellipse(ctx, 0, r * 0.15, r * 1.0, r * 0.6);
        outlineFill(ctx, '#fff4e2', r * 0.12);
        U.ellipse(ctx, 0, -r * 0.14, r * 0.98, r * 0.78);
        outlineFill(ctx, radial(ctx, r, '#ffc4dc', '#ee86b0'), r * 0.13);
        // ruffled "feet" under the top shell
        ctx.lineWidth = r * 0.05;
        for (let i = -4; i <= 4; i++) {
          const x = i * r * 0.2;
          const y = -r * 0.14 + r * 0.76 * Math.sqrt(Math.max(0, 1 - (x / (r * 0.98)) ** 2));
          U.ellipse(ctx, x, y, r * 0.1, r * 0.07);
          outlineFill(ctx, '#f28fb7', r * 0.05);
        }
        shine(ctx, r, -0.5, -0.5);
      },
      drawInside(ctx, r) {
        U.ellipse(ctx, 0, 0, r * 0.88, r * 0.09);
        ctx.fillStyle = '#fff8e8';
        ctx.fill();
        ctx.strokeStyle = '#e07ea6';
        ctx.lineWidth = r * 0.04;
        ctx.stroke();
      },
    },
    {
      id: 'radish',
      name: 'Radish',
      desc: 'Crisp, peppery and a little bit rooty.',
      body: '#e8445a',
      feet: '#9e1f35',
      inside: '#ffffff',
      juice: '#ff9aa8',
      faceY: 0.06,
      drawBody(ctx, r) {
        for (const a of [-0.55, 0.55, 0]) {
          ctx.save();
          ctx.translate(0, -r * 0.7);
          ctx.rotate(a);
          U.ellipse(ctx, 0, -r * 0.42, r * 0.22, r * 0.48);
          outlineFill(ctx, a === 0 ? '#6fd25a' : '#4fb043', r * 0.1);
          ctx.strokeStyle = 'rgba(30,90,30,0.6)';
          ctx.lineWidth = r * 0.05;
          ctx.beginPath();
          ctx.moveTo(0, -r * 0.1);
          ctx.lineTo(0, -r * 0.75);
          ctx.stroke();
          ctx.restore();
        }
        ctx.beginPath();
        ctx.moveTo(-r * 0.16, r * 0.8);
        ctx.quadraticCurveTo(r * 0.05, r * 1.45, r * 0.2, r * 1.25);
        ctx.quadraticCurveTo(r * 0.1, r * 1.1, r * 0.16, r * 0.8);
        ctx.closePath();
        outlineFill(ctx, '#fbe3e6', r * 0.08);
        U.ellipse(ctx, 0, 0, r * 0.98, r * 0.95);
        outlineFill(ctx, radial(ctx, r, '#ff8396', '#cf2841'), r * 0.13);
        ctx.strokeStyle = 'rgba(255,255,255,0.55)';
        ctx.lineWidth = r * 0.07;
        ctx.beginPath();
        ctx.arc(0, r * 0.05, r * 0.78, 0.6, Math.PI - 0.6);
        ctx.stroke();
        shine(ctx, r, -0.5, -0.4);
      },
      drawInside(ctx, r) {
        U.ellipse(ctx, 0, 0, r * 0.82, r * 0.25);
        ctx.strokeStyle = '#ff9aa8';
        ctx.lineWidth = r * 0.07;
        ctx.stroke();
      },
    },
  ]);

  function drawFace(ctx, ch, r, o) {
    const facing = o.facing == null ? Math.PI / 2 : o.facing;
    const s = Math.sin(facing);
    const c = Math.cos(facing);
    if (s < -0.6 && !o.front) return; // looking away from the camera
    const ox = c * r * 0.32;
    const oy = s * r * 0.12 + ch.faceY * r;
    const sep = r * 0.3 * (1 - Math.abs(c) * 0.2);
    const mood = o.mood || 'idle';
    ctx.fillStyle = INK;
    ctx.strokeStyle = INK;
    ctx.lineCap = 'round';
    for (const side of [-1, 1]) {
      const ex = ox + side * sep;
      if (mood === 'happy') {
        ctx.lineWidth = r * 0.08;
        ctx.beginPath();
        ctx.arc(ex, oy + r * 0.04, r * 0.1, Math.PI * 1.1, Math.PI * 1.9);
        ctx.stroke();
      } else if (mood === 'dizzy') {
        ctx.lineWidth = r * 0.07;
        ctx.beginPath();
        ctx.moveTo(ex - r * 0.08, oy - r * 0.08); ctx.lineTo(ex + r * 0.08, oy + r * 0.08);
        ctx.moveTo(ex + r * 0.08, oy - r * 0.08); ctx.lineTo(ex - r * 0.08, oy + r * 0.08);
        ctx.stroke();
      } else {
        const h = o.blink ? r * 0.025 : mood === 'angry' ? r * 0.12 : r * 0.15;
        U.ellipse(ctx, ex, oy, r * 0.1, h);
        ctx.fill();
        if (!o.blink) {
          ctx.fillStyle = '#fff';
          U.ellipse(ctx, ex - r * 0.03, oy - r * 0.06, r * 0.04, r * 0.04);
          ctx.fill();
          ctx.fillStyle = INK;
        }
        if (mood === 'angry') {
          ctx.lineWidth = r * 0.06;
          ctx.beginPath();
          ctx.moveTo(ex - side * r * 0.12, oy - r * 0.24);
          ctx.lineTo(ex + side * r * 0.08, oy - r * 0.16);
          ctx.stroke();
        }
      }
    }
    ctx.fillStyle = 'rgba(255,110,140,0.45)';
    for (const side of [-1, 1]) {
      U.ellipse(ctx, ox + side * sep * 1.45, oy + r * 0.17, r * 0.12, r * 0.07);
      ctx.fill();
    }
    ctx.fillStyle = INK;
    if (mood === 'angry' || mood === 'shout') {
      U.ellipse(ctx, ox, oy + r * 0.24, r * 0.08, r * 0.07);
      ctx.fill();
    } else {
      ctx.lineWidth = r * 0.06;
      ctx.beginPath();
      ctx.arc(ox, oy + r * 0.13, r * 0.09, 0.35, Math.PI - 0.35);
      ctx.stroke();
    }
  }

  // Draws a full character standing at (x, y) (y is the centre of the body's footprint).
  BB.drawCharacter = function (ctx, ch, x, y, r, o = {}) {
    const t = o.time || 0;
    const moving = o.moving || 0;
    const phase = o.walkPhase || 0;
    const bob = Math.abs(Math.sin(phase)) * 2.2 * moving + Math.sin(t * 3) * 0.7 * (1 - moving);
    ctx.save();
    ctx.translate(x, y);
    if (o.alpha != null) ctx.globalAlpha *= o.alpha;
    if (o.scale) ctx.scale(o.scale, o.scale);
    if (!o.noShadow) {
      ctx.fillStyle = 'rgba(0,0,0,0.22)';
      U.ellipse(ctx, 0, r * 0.78, r * 0.95, r * 0.36);
      ctx.fill();
    }
    if (o.ring) {
      ctx.strokeStyle = o.ring;
      ctx.lineWidth = 3;
      U.ellipse(ctx, 0, r * 0.76, r * 1.08, r * 0.44);
      ctx.stroke();
    }
    // feet
    const step = Math.sin(phase) * r * 0.2 * moving;
    for (const side of [-1, 1]) {
      U.ellipse(ctx, side * r * 0.42, r * 0.72 + step * side, r * 0.25, r * 0.17);
      outlineFill(ctx, ch.feet, r * 0.08);
    }
    ctx.translate(0, -bob - r * 0.12);
    // o.back / o.front draw arms and held items around the body, in body-local coordinates
    if (o.back) o.back(ctx);
    ctx.save();
    const sq = o.squash || 0;
    ctx.scale(1 + sq, 1 - sq);
    ch.drawBody(ctx, r);
    drawFace(ctx, ch, r, o);
    ctx.restore();
    if (o.front) o.front(ctx);
    ctx.restore();
  };

  // A little round hand in the character's limb colour.
  BB.drawHand = function (ctx, ch, x, y, r) {
    U.ellipse(ctx, x, y, r * 0.24, r * 0.22);
    outlineFill(ctx, ch.feet, r * 0.08);
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    U.ellipse(ctx, x - r * 0.06, y - r * 0.07, r * 0.08, r * 0.05);
    ctx.fill();
  };

  // One half of a sliced fighter, cut along its local x-axis. side -1 = top half, 1 = bottom half.
  BB.drawHalf = function (ctx, ch, r, side) {
    ctx.save();
    ctx.beginPath();
    if (side < 0) ctx.rect(-r * 2, -r * 2, r * 4, r * 2);
    else ctx.rect(-r * 2, 0, r * 4, r * 2);
    ctx.clip();
    ch.drawBody(ctx, r);
    ctx.restore();
    U.ellipse(ctx, 0, 0, r * 0.95, r * 0.3);
    ctx.fillStyle = ch.inside;
    ctx.fill();
    ctx.lineWidth = r * 0.11;
    ctx.strokeStyle = INK;
    ctx.stroke();
    ch.drawInside(ctx, r);
  };

  // Portrait helper for menus and the HUD (draws into a square canvas).
  BB.drawPortrait = function (canvas, charIndex, opts = {}) {
    const ctx = canvas.getContext('2d');
    const s = canvas.width;
    ctx.clearRect(0, 0, s, s);
    if (opts.bg) {
      ctx.fillStyle = opts.bg;
      ctx.beginPath();
      ctx.arc(s / 2, s / 2, s * 0.47, 0, TAU);
      ctx.fill();
      ctx.lineWidth = s * 0.04;
      ctx.strokeStyle = INK;
      ctx.stroke();
    }
    const r = s * (opts.size || 0.28);
    BB.drawCharacter(ctx, CHARACTERS[charIndex], s / 2, s / 2 + r * 0.25, r, {
      facing: Math.PI / 2,
      time: opts.time || 0,
      blink: opts.blink,
      mood: opts.mood,
      noShadow: opts.noShadow,
      moving: opts.moving || 0,
      walkPhase: opts.walkPhase || 0,
      ring: opts.ring,
    });
  };
})();
