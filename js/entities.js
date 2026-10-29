// Fighters, boomerangs, power-ups, sliced halves and particles.
(function () {
  'use strict';
  const BB = window.BB;
  const U = BB.util;
  const TAU = BB.TAU;
  const INK = BB.INK;

  // ---------------------------------------------------------------------------
  // Tuning

  const TUNE = (BB.TUNE = {
    playerR: 17,
    speed: 235,
    aimSpeedMul: 0.55,
    chargeTime: 0.75,
    meleeActive: 0.17,
    meleeCooldown: 0.42,
    meleeReach: 46,
    meleeArc: 1.35, // half-angle in radians
    dashSpeed: 640,
    dashTime: 0.16,
    dashCooldown: 0.9,
    rangR: 11,
    rangReturnMax: 950,
  });

  // How far a throw at charge c (0..1) travels before turning back.
  BB.throwPower = (c) => 0.3 + 0.7 * c;
  BB.throwSpeed = (p) => 700 + 520 * p;
  BB.throwOutTime = (p) => 0.38 + 0.5 * p;
  BB.throwRange = (c) => {
    const p = BB.throwPower(c);
    return (BB.throwSpeed(p) * BB.throwOutTime(p)) / 2;
  };

  // ---------------------------------------------------------------------------
  // Power-ups

  BB.POWERUPS = {
    multi: { name: 'Multi-Rang', desc: 'Throw three boomerangs at once.', color: '#3d8bff' },
    explosive: { name: 'Kaboom-Rang', desc: 'Your boomerang explodes on impact. Mind the blast!', color: '#ff5a36' },
    shield: { name: 'Bubble Shield', desc: 'Shrug off one hit.', color: '#2ec4b6' },
    turbo: { name: 'Turbo', desc: 'Run faster and dash twice as often.', color: '#ffb81c' },
    giant: { name: 'Big Rang', desc: 'A huge boomerang and a longer swing.', color: '#a259ff' },
  };
  BB.POWERUP_TYPES = Object.keys(BB.POWERUPS);

  BB.drawRang = function (ctx, x, y, angle, size, color, opts = {}) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);
    const s = size;
    ctx.beginPath();
    ctx.moveTo(-s, s * 0.42);
    ctx.quadraticCurveTo(0, -s * 0.95, s, s * 0.42);
    ctx.lineTo(s * 0.6, s * 0.72);
    ctx.quadraticCurveTo(0, -s * 0.22, -s * 0.6, s * 0.72);
    ctx.closePath();
    ctx.fillStyle = color;
    ctx.fill();
    ctx.lineJoin = 'round';
    ctx.lineWidth = Math.max(2, s * 0.17);
    ctx.strokeStyle = INK;
    ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.75)';
    for (const sx of [-1, 1]) {
      U.ellipse(ctx, sx * s * 0.78, s * 0.52, s * 0.12, s * 0.12);
      ctx.fill();
    }
    ctx.strokeStyle = 'rgba(255,255,255,0.55)';
    ctx.lineWidth = Math.max(1, s * 0.09);
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(-s * 0.45, s * 0.05);
    ctx.quadraticCurveTo(0, -s * 0.48, s * 0.45, s * 0.05);
    ctx.stroke();
    if (opts.explosive) {
      ctx.fillStyle = '#ff5a36';
      U.ellipse(ctx, 0, -s * 0.28, s * 0.22, s * 0.22);
      ctx.fill();
      ctx.lineWidth = Math.max(1, s * 0.08);
      ctx.strokeStyle = INK;
      ctx.stroke();
    }
    ctx.restore();
  };

  BB.drawPowerIcon = function (ctx, type, x, y, s) {
    ctx.save();
    ctx.translate(x, y);
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.strokeStyle = INK;
    switch (type) {
      case 'multi':
        BB.drawRang(ctx, -s * 0.35, s * 0.15, -0.5, s * 0.35, '#7fb2ff');
        BB.drawRang(ctx, s * 0.35, s * 0.15, 0.5, s * 0.35, '#7fb2ff');
        BB.drawRang(ctx, 0, -s * 0.15, 0, s * 0.4, '#3d8bff');
        break;
      case 'explosive':
        ctx.fillStyle = '#3a3150';
        U.ellipse(ctx, 0, s * 0.1, s * 0.5, s * 0.5);
        ctx.fill();
        ctx.lineWidth = s * 0.1;
        ctx.stroke();
        ctx.fillStyle = 'rgba(255,255,255,0.5)';
        U.ellipse(ctx, -s * 0.18, -s * 0.08, s * 0.12, s * 0.08, -0.6);
        ctx.fill();
        ctx.strokeStyle = '#c9a26b';
        ctx.lineWidth = s * 0.1;
        ctx.beginPath();
        ctx.moveTo(s * 0.25, -s * 0.3);
        ctx.quadraticCurveTo(s * 0.45, -s * 0.6, s * 0.6, -s * 0.5);
        ctx.stroke();
        ctx.fillStyle = '#ffd23f';
        U.ellipse(ctx, s * 0.62, -s * 0.52, s * 0.14, s * 0.14);
        ctx.fill();
        break;
      case 'shield':
        ctx.beginPath();
        ctx.moveTo(0, -s * 0.6);
        ctx.quadraticCurveTo(s * 0.35, -s * 0.42, s * 0.5, -s * 0.45);
        ctx.quadraticCurveTo(s * 0.55, s * 0.3, 0, s * 0.62);
        ctx.quadraticCurveTo(-s * 0.55, s * 0.3, -s * 0.5, -s * 0.45);
        ctx.quadraticCurveTo(-s * 0.35, -s * 0.42, 0, -s * 0.6);
        ctx.fillStyle = '#2ec4b6';
        ctx.fill();
        ctx.lineWidth = s * 0.1;
        ctx.stroke();
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = s * 0.09;
        ctx.beginPath();
        ctx.moveTo(-s * 0.2, 0);
        ctx.lineTo(-s * 0.03, s * 0.18);
        ctx.lineTo(s * 0.25, -s * 0.18);
        ctx.stroke();
        break;
      case 'turbo':
        ctx.beginPath();
        ctx.moveTo(s * 0.12, -s * 0.65);
        ctx.lineTo(-s * 0.38, s * 0.08);
        ctx.lineTo(-s * 0.02, s * 0.08);
        ctx.lineTo(-s * 0.15, s * 0.65);
        ctx.lineTo(s * 0.4, -s * 0.12);
        ctx.lineTo(s * 0.04, -s * 0.12);
        ctx.closePath();
        ctx.fillStyle = '#ffd23f';
        ctx.fill();
        ctx.lineWidth = s * 0.1;
        ctx.stroke();
        break;
      case 'giant':
        BB.drawRang(ctx, 0, s * 0.05, -0.2, s * 0.62, '#a259ff');
        break;
    }
    ctx.restore();
  };

  // ---------------------------------------------------------------------------

  class Player {
    constructor(slot, cfg) {
      this.slot = slot;
      this.cfg = cfg;
      this.charIndex = cfg.char;
      this.char = BB.CHARACTERS[cfg.char];
      this.color = BB.PLAYER_COLORS[slot];
      this.isBot = !!cfg.isBot;
      this.name = cfg.name;
      this.score = 0;
      this.r = TUNE.playerR;
      this.brain = this.isBot ? new BB.Bot(this, cfg.difficulty || 'normal') : null;
      this.reset(0, 0, 0);
    }

    reset(x, y, facing) {
      this.x = x; this.y = y;
      this.vx = 0; this.vy = 0;
      this.facing = facing;
      this.alive = true;
      this.hasRang = true;
      this.rang = null;
      this.rangRespawn = 0;
      this.aiming = false;
      this.aimCharge = 0;
      this.meleeT = 0;
      this.meleeCd = 0;
      this.meleeHits = null;
      this.swingDir = 1;
      this.dashT = 0;
      this.dashCd = 0;
      this.dashDir = { x: 0, y: 0 };
      this.powerup = null;
      this.shield = false;
      this.falling = false;
      this.fallT = 0;
      this.walkPhase = 0;
      this.moving = 0;
      this.inBush = false;
      this.onSlick = false;
      this.lastHitBy = null;
      this.lastHitT = -99;
      this.flash = 0;
      this.blinkT = U.rand(1, 4);
      this.squash = 0;
      this.stun = 0;
      this.roundKills = 0;
      if (this.brain) this.brain.reset();
    }

    get speedMul() {
      let m = this.powerup === 'turbo' ? 1.35 : 1;
      if (this.brain) m *= this.brain.d.speed;
      if (this.aiming) m *= TUNE.aimSpeedMul;
      return m;
    }

    get rangSize() {
      return this.powerup === 'giant' ? 21 : TUNE.rangR;
    }

    get meleeReach() {
      return TUNE.meleeReach + (this.powerup === 'giant' ? 16 : 0);
    }

    // Movement and own timers. Interactions (hits, catches) live in Game.
    update(game, cmd, dt) {
      const arena = game.arena;
      if (this.falling) {
        this.fallT += dt;
        this.x += this.vx * dt * 0.3;
        this.y += this.vy * dt * 0.3;
        if (this.fallT > 0.55) game.killByFall(this);
        return;
      }
      this.meleeCd = Math.max(0, this.meleeCd - dt);
      this.dashCd = Math.max(0, this.dashCd - dt);
      this.flash = Math.max(0, this.flash - dt);
      this.stun = Math.max(0, this.stun - dt);
      this.squash *= Math.exp(-12 * dt);
      this.blinkT -= dt;
      if (this.blinkT < -0.12) this.blinkT = U.rand(1.5, 4.5);
      if (this.rangRespawn > 0) {
        this.rangRespawn -= dt;
        if (this.rangRespawn <= 0 && !this.hasRang) {
          this.hasRang = true;
          this.rang = null;
          game.particles.ring(this.x, this.y, '#ffffff', 26);
          if (game.audible) BB.Audio.play('catch');
        }
      }

      if (cmd.aim != null) this.facing = cmd.aim;
      const frozen = game.phase === 'countdown' || this.stun > 0;

      // melee
      if (this.meleeT > 0) this.meleeT = Math.max(0, this.meleeT - dt);
      if (!frozen && cmd.melee && this.hasRang && this.meleeCd <= 0) {
        this.aiming = false;
        this.aimCharge = 0;
        this.meleeT = TUNE.meleeActive;
        this.meleeCd = TUNE.meleeCooldown;
        this.meleeHits = new Set();
        this.swingDir = -this.swingDir;
        this.squash = -0.12;
        if (game.audible) BB.Audio.play('swing');
      }

      // aim / throw
      if (!frozen && cmd.aimHeld && this.hasRang && this.meleeT <= 0) {
        if (!this.aiming) { this.aiming = true; this.aimCharge = 0; }
        this.aimCharge = Math.min(1, this.aimCharge + dt / TUNE.chargeTime);
      } else if (this.aiming) {
        if (this.hasRang && !frozen) game.throwRang(this);
        this.aiming = false;
        this.aimCharge = 0;
      }

      // dash
      if (this.dashT > 0) this.dashT -= dt;
      if (!frozen && cmd.dash && this.dashCd <= 0 && this.dashT <= 0) {
        let dx = cmd.mx, dy = cmd.my;
        const l = Math.hypot(dx, dy);
        if (l < 0.1) { dx = Math.cos(this.facing); dy = Math.sin(this.facing); } else { dx /= l; dy /= l; }
        this.dashDir = { x: dx, y: dy };
        this.dashT = TUNE.dashTime;
        this.dashCd = this.powerup === 'turbo' ? TUNE.dashCooldown * 0.5 : TUNE.dashCooldown;
        this.squash = 0.18;
        if (game.audible) BB.Audio.play('dash');
        game.particles.burst(this.x, this.y + this.r * 0.6, 6, { color: 'rgba(255,255,255,0.8)', speed: 90, size: 5, life: 0.35, type: 'smoke' });
      }

      // movement
      this.onSlick = arena.isSlickAt(this.x, this.y);
      let mx = frozen ? 0 : cmd.mx, my = frozen ? 0 : cmd.my;
      const ml = Math.hypot(mx, my);
      if (ml > 1) { mx /= ml; my /= ml; }
      if (this.dashT > 0) {
        this.vx = this.dashDir.x * TUNE.dashSpeed;
        this.vy = this.dashDir.y * TUNE.dashSpeed;
        if (Math.random() < 0.5) game.particles.add({ x: this.x, y: this.y + 6, vx: 0, vy: -10, life: 0.25, size: this.r * 0.8, color: U.rgba(this.color, 0.25), type: 'smoke' });
      } else {
        const sp = TUNE.speed * this.speedMul;
        const k = this.onSlick ? 1.7 : 16;
        const f = 1 - Math.exp(-k * dt);
        this.vx += (mx * sp - this.vx) * f;
        this.vy += (my * sp - this.vy) * f;
      }
      this.x += this.vx * dt;
      this.y += this.vy * dt;
      const hit = arena.collideCircle(this, this.r);
      if (hit) {
        const vn = this.vx * hit.nx + this.vy * hit.ny;
        if (vn < 0) { this.vx -= vn * hit.nx; this.vy -= vn * hit.ny; }
      }
      const spd = Math.hypot(this.vx, this.vy);
      this.moving = U.clamp(spd / TUNE.speed, 0, 1);
      this.walkPhase += spd * dt * 0.075;

      const wasInBush = this.inBush;
      this.inBush = arena.isBushAt(this.x, this.y);
      if (this.inBush && (spd > 60 && Math.random() < dt * 8 || !wasInBush)) game.particles.leaves(this.x, this.y, arena.theme.bush.mid, wasInBush ? 1 : 5);

      // falling into a pit (unless mid-dash over it)
      if (this.dashT <= 0 && arena.isPitAt(this.x, this.y)) {
        this.falling = true;
        this.fallT = 0;
        this.aiming = false;
        if (game.audible) BB.Audio.play('fall');
      }
    }

    draw(ctx, game) {
      if (!this.alive) return;
      const time = game.time;
      let scale = 1, alpha = 1;
      if (this.falling) {
        scale = Math.max(0.05, 1 - this.fallT / 0.55);
        alpha = scale;
      }
      ctx.save();
      ctx.globalAlpha = alpha;
      const mood = this.meleeT > 0 || this.aiming ? 'angry' : this.falling ? 'dizzy' : 'idle';
      // boomerang held behind the body when facing up
      const behind = Math.sin(this.facing) < -0.2;
      if (this.hasRang && behind && !this.falling) this.drawHeldRang(ctx, game);
      if (this.shield) {
        ctx.fillStyle = 'rgba(46,196,182,0.18)';
        U.ellipse(ctx, this.x, this.y - 6, this.r * 1.7, this.r * 1.7);
        ctx.fill();
      }
      BB.drawCharacter(ctx, this.char, this.x, this.y - (this.falling ? this.fallT * 10 : 0), this.r, {
        facing: this.facing,
        time: time + this.slot,
        moving: this.moving,
        walkPhase: this.walkPhase,
        blink: this.blinkT < 0,
        mood,
        ring: this.falling ? null : this.color,
        scale,
        squash: this.squash,
        noShadow: this.falling,
      });
      if (this.flash > 0) {
        ctx.globalAlpha = alpha * (this.flash / 0.2);
        ctx.fillStyle = '#fff';
        U.ellipse(ctx, this.x, this.y - this.r * 0.15, this.r * 1.05, this.r * 1.0);
        ctx.fill();
        ctx.globalAlpha = alpha;
      }
      if (this.hasRang && !behind && !this.falling) this.drawHeldRang(ctx, game);
      if (this.shield) {
        ctx.strokeStyle = 'rgba(46,196,182,0.9)';
        ctx.lineWidth = 3;
        U.ellipse(ctx, this.x, this.y - 6, this.r * 1.7, this.r * 1.7);
        ctx.stroke();
        ctx.strokeStyle = 'rgba(255,255,255,0.8)';
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.arc(this.x, this.y - 6, this.r * 1.45, -2.4 + Math.sin(time * 3) * 0.2, -1.6 + Math.sin(time * 3) * 0.2);
        ctx.stroke();
      }
      ctx.restore();
    }

    drawHeldRang(ctx, game) {
      const f = this.facing;
      let ang, dist, side;
      if (this.meleeT > 0) {
        // sweep across the front during a swing
        const t = 1 - this.meleeT / TUNE.meleeActive;
        const a = f + this.swingDir * (-1.3 + 2.6 * U.easeOutCubic(t));
        dist = this.r + 12 + (this.powerup === 'giant' ? 8 : 0);
        const hx = this.x + Math.cos(a) * dist, hy = this.y - 8 + Math.sin(a) * dist;
        BB.drawRang(ctx, hx, hy, a + Math.PI / 2, this.rangSize, this.color, { explosive: this.powerup === 'explosive' });
        return;
      }
      if (this.aiming) {
        ang = f + Math.PI * 0.75; dist = this.r + 4; side = 0;
        const shake = this.aimCharge >= 1 ? Math.sin(game.time * 60) * 1.2 : 0;
        const hx = this.x + Math.cos(ang) * dist + shake, hy = this.y - 8 + Math.sin(ang) * dist;
        BB.drawRang(ctx, hx, hy, f + Math.PI / 2 + 0.6, this.rangSize, this.color, { explosive: this.powerup === 'explosive' });
        return;
      }
      side = f + Math.PI / 2;
      const hx = this.x + Math.cos(side) * (this.r + 2), hy = this.y - 6 + Math.sin(side) * (this.r * 0.6) + Math.sin(this.walkPhase) * 1.5;
      BB.drawRang(ctx, hx, hy, f + Math.PI / 2 - 0.3, this.rangSize * 0.85, this.color, { explosive: this.powerup === 'explosive' });
    }
  }
  BB.Player = Player;

  // ---------------------------------------------------------------------------

  class Rang {
    constructor(owner, x, y, angle, power, extra) {
      this.owner = owner;
      this.x = x; this.y = y;
      this.dirX = Math.cos(angle);
      this.dirY = Math.sin(angle);
      this.speed0 = BB.throwSpeed(power);
      this.outTime = BB.throwOutTime(power);
      this.vx = this.dirX * this.speed0;
      this.vy = this.dirY * this.speed0;
      this.state = 'out';
      this.t = 0;
      this.retT = 0;
      this.spin = Math.random() * TAU;
      this.r = owner.rangSize;
      this.extra = !!extra;
      this.explosive = owner.powerup === 'explosive';
      this.deflector = null;
      this.wallHits = 0;
      this.clashT = 0;
      this.dead = false;
      this.trail = [];
    }

    get flying() {
      return this.state === 'out' || this.state === 'return';
    }

    // Who this boomerang can slice right now.
    canHurt(p) {
      if (!this.flying || !p.alive || p.falling) return false;
      if (this.deflector) return p !== this.deflector;
      return p !== this.owner;
    }

    get killer() {
      return this.deflector || this.owner;
    }

    draw(ctx) {
      const color = this.owner.color;
      if (this.flying) {
        for (let i = 0; i < this.trail.length; i++) {
          const p = this.trail[i];
          ctx.globalAlpha = (i / this.trail.length) * 0.35;
          ctx.fillStyle = color;
          U.ellipse(ctx, p.x, p.y, this.r * 0.7 * (i / this.trail.length), this.r * 0.7 * (i / this.trail.length));
          ctx.fill();
        }
        ctx.globalAlpha = 1;
      }
      // shadow, then the rang lifted off the ground while flying
      const lift = this.flying ? 14 : 2;
      ctx.fillStyle = 'rgba(0,0,0,0.2)';
      U.ellipse(ctx, this.x, this.y + 4, this.r * 0.9, this.r * 0.45);
      ctx.fill();
      BB.drawRang(ctx, this.x, this.y - lift, this.spin, this.r, this.deflector ? this.deflector.color : color, { explosive: this.explosive });
      if (this.state === 'dropped' && !this.extra) {
        // bobbing marker so owners can find their dropped boomerang
        const by = this.y - 34 + Math.sin(performance.now() / 200) * 3;
        ctx.fillStyle = color;
        ctx.strokeStyle = INK;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(this.x - 6, by - 6);
        ctx.lineTo(this.x + 6, by - 6);
        ctx.lineTo(this.x, by + 2);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
      }
    }
  }
  BB.Rang = Rang;

  // ---------------------------------------------------------------------------

  class PowerUp {
    constructor(type, x, y) {
      this.type = type;
      this.x = x; this.y = y;
      this.t = 0;
      this.dead = false;
    }

    draw(ctx, time) {
      const pop = Math.min(1, this.t / 0.35);
      const s = U.easeOutBack(pop);
      const bob = Math.sin(time * 3 + this.x) * 3;
      ctx.fillStyle = 'rgba(0,0,0,0.2)';
      U.ellipse(ctx, this.x, this.y + 12, 15 * s, 6 * s);
      ctx.fill();
      ctx.save();
      ctx.translate(this.x, this.y - 10 + bob);
      ctx.scale(s, s);
      const col = BB.POWERUPS[this.type].color;
      ctx.fillStyle = U.rgba(col, 0.25);
      U.ellipse(ctx, 0, 0, 24 + Math.sin(time * 5) * 2, 24 + Math.sin(time * 5) * 2);
      ctx.fill();
      ctx.fillStyle = '#fff';
      U.ellipse(ctx, 0, 0, 18, 18);
      ctx.fill();
      ctx.lineWidth = 3;
      ctx.strokeStyle = col;
      ctx.stroke();
      ctx.lineWidth = 2;
      ctx.strokeStyle = INK;
      U.ellipse(ctx, 0, 0, 20, 20);
      ctx.stroke();
      BB.drawPowerIcon(ctx, this.type, 0, 0, 22);
      ctx.fillStyle = 'rgba(255,255,255,0.7)';
      U.ellipse(ctx, -8, -10, 5, 3, -0.6);
      ctx.fill();
      ctx.restore();
    }
  }
  BB.PowerUp = PowerUp;

  // ---------------------------------------------------------------------------

  class Half {
    constructor(player, side, cutAngle, hitAngle) {
      this.ch = player.char;
      this.r = player.r;
      this.side = side;
      const nx = Math.cos(cutAngle + Math.PI / 2) * side, ny = Math.sin(cutAngle + Math.PI / 2) * side;
      this.x = player.x + nx * 4;
      this.y = player.y + ny * 4;
      const sp = U.rand(110, 170);
      this.vx = nx * sp + Math.cos(hitAngle) * 120;
      this.vy = ny * sp + Math.sin(hitAngle) * 120;
      this.z = 10;
      this.vz = U.rand(160, 240);
      this.rot = cutAngle;
      this.spin = U.rand(4, 9) * side;
      this.fall = 0;
      this.dead = false;
    }

    update(dt, arena) {
      if (this.fall > 0) {
        this.fall += dt;
        if (this.fall > 0.5) this.dead = true;
        return;
      }
      this.vz -= 900 * dt;
      this.z += this.vz * dt;
      if (this.z <= 0) {
        this.z = 0;
        this.vz = Math.abs(this.vz) > 80 ? -this.vz * 0.35 : 0;
        const f = Math.exp(-5 * dt);
        this.vx *= f; this.vy *= f; this.spin *= f;
        if (arena.isPitAt(this.x, this.y)) this.fall = 0.001;
      }
      this.x += this.vx * dt;
      this.y += this.vy * dt;
      this.rot += this.spin * dt;
      const hit = arena.collideCircle(this, this.r * 0.6);
      if (hit) {
        const vn = this.vx * hit.nx + this.vy * hit.ny;
        if (vn < 0) { this.vx -= 1.6 * vn * hit.nx; this.vy -= 1.6 * vn * hit.ny; }
      }
    }

    draw(ctx) {
      const s = this.fall > 0 ? Math.max(0.01, 1 - this.fall / 0.5) : 1;
      ctx.fillStyle = 'rgba(0,0,0,0.2)';
      U.ellipse(ctx, this.x, this.y + this.r * 0.4, this.r * 0.8 * s, this.r * 0.35 * s);
      ctx.fill();
      ctx.save();
      ctx.translate(this.x, this.y - this.z - this.r * 0.2);
      ctx.rotate(this.rot);
      ctx.scale(s, s);
      BB.drawHalf(ctx, this.ch, this.r, this.side);
      ctx.restore();
    }
  }
  BB.Half = Half;

  // ---------------------------------------------------------------------------

  class Particles {
    constructor() { this.list = []; }

    add(p) {
      p.t = 0;
      p.maxLife = p.life;
      this.list.push(p);
      return p;
    }

    burst(x, y, n, o) {
      for (let i = 0; i < n; i++) {
        const a = o.angle != null ? o.angle + U.rand(-(o.spread || 0.6), o.spread || 0.6) : U.rand(0, TAU);
        const sp = U.rand(0.4, 1) * (o.speed || 200);
        this.add({
          x, y,
          vx: Math.cos(a) * sp,
          vy: Math.sin(a) * sp,
          life: U.rand(0.6, 1) * (o.life || 0.6),
          size: U.rand(0.6, 1.2) * (o.size || 4),
          color: Array.isArray(o.color) ? U.choice(o.color) : o.color,
          type: o.type || 'dot',
          drag: o.drag == null ? 4 : o.drag,
          grav: o.grav || 0,
        });
      }
    }

    ring(x, y, color, size, life = 0.35) {
      this.add({ x, y, vx: 0, vy: 0, life, size, color, type: 'ring' });
    }

    leaves(x, y, color, n) {
      for (let i = 0; i < n; i++) {
        this.add({
          x: x + U.rand(-12, 12), y: y + U.rand(-14, 4),
          vx: U.rand(-50, 50), vy: U.rand(-90, -30),
          life: U.rand(0.4, 0.8), size: U.rand(3, 5), color, type: 'leaf',
          rot: U.rand(0, TAU), grav: 220, drag: 2,
        });
      }
    }

    text(x, y, str, color, size = 22) {
      this.add({ x, y, vx: 0, vy: -50, life: 1.1, size, color, type: 'text', str, drag: 1.5 });
    }

    update(dt) {
      for (const p of this.list) {
        p.t += dt;
        const d = Math.exp(-(p.drag || 0) * dt);
        p.vx *= d; p.vy *= d;
        p.vy += (p.grav || 0) * dt;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        if (p.rot != null) p.rot += dt * 6;
      }
      this.list = this.list.filter((p) => p.t < p.maxLife);
    }

    draw(ctx) {
      for (const p of this.list) {
        const k = 1 - p.t / p.maxLife;
        ctx.globalAlpha = Math.min(1, k * 1.5);
        switch (p.type) {
          case 'dot':
            ctx.fillStyle = p.color;
            U.ellipse(ctx, p.x, p.y, p.size * k, p.size * k);
            ctx.fill();
            break;
          case 'spark': {
            ctx.strokeStyle = p.color;
            ctx.lineWidth = p.size * k;
            ctx.lineCap = 'round';
            ctx.beginPath();
            ctx.moveTo(p.x, p.y);
            ctx.lineTo(p.x - p.vx * 0.04, p.y - p.vy * 0.04);
            ctx.stroke();
            break;
          }
          case 'smoke':
            ctx.globalAlpha = k * 0.7;
            ctx.fillStyle = p.color;
            U.ellipse(ctx, p.x, p.y, p.size * (1.6 - k * 0.6), p.size * (1.6 - k * 0.6));
            ctx.fill();
            break;
          case 'ring':
            ctx.strokeStyle = p.color;
            ctx.lineWidth = 4 * k + 1;
            U.ellipse(ctx, p.x, p.y, p.size * (1.4 - k * 0.8), p.size * (1.4 - k * 0.8));
            ctx.stroke();
            break;
          case 'leaf':
            ctx.fillStyle = p.color;
            U.ellipse(ctx, p.x, p.y, p.size, p.size * 0.5, p.rot);
            ctx.fill();
            ctx.strokeStyle = INK;
            ctx.lineWidth = 1;
            ctx.stroke();
            break;
          case 'text': {
            const s = p.size * (p.t < 0.15 ? U.easeOutBack(p.t / 0.15) : 1);
            ctx.font = `${s}px "Lilita One", sans-serif`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.lineWidth = 5;
            ctx.strokeStyle = INK;
            ctx.lineJoin = 'round';
            ctx.strokeText(p.str, p.x, p.y);
            ctx.fillStyle = p.color;
            ctx.fillText(p.str, p.x, p.y);
            break;
          }
        }
      }
      ctx.globalAlpha = 1;
    }
  }
  BB.Particles = Particles;
})();
