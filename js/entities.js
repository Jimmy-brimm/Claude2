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
    chargeTime: 0.8,
    meleeActive: 0.17,
    meleeCooldown: 0.42,
    meleeCooldownDual: 0.27, // holding two boomerangs speeds up attacks
    meleeReach: 46,
    meleeArc: 1.35, // half-angle in radians
    dashSpeed: 640,
    dashTime: 0.16,
    dashCooldown: 0.9,
    rangR: 11,
    rangReturnMax: 880,
    recallSpeed: 330,
    tkSpeed: 620,
    tkRadius: 300,
    curve: 2.4, // radians/second of curve from sideways input at release
    maxPowerups: 3,
  });

  // How far a throw at charge c (0..1) travels before turning back.
  BB.throwPower = (c) => 0.3 + 0.7 * c;
  BB.throwSpeed = (p) => 620 + 430 * p;
  BB.throwOutTime = (p) => 0.42 + 0.5 * p;
  BB.throwRange = (c) => {
    const p = BB.throwPower(c);
    return (BB.throwSpeed(p) * BB.throwOutTime(p)) / 2;
  };

  // ---------------------------------------------------------------------------
  // Power-ups

  BB.POWERUPS = {
    caffeinated: { name: 'Caffeinated', desc: 'Move faster than normal.', color: '#b8743a' },
    phase: { name: 'Dash Through Walls', desc: 'Your dash passes straight through walls.', color: '#8e7bff' },
    teleport: { name: 'Teleport', desc: 'Dash after throwing to warp to your boomerang.', color: '#b05cff' },
    explosive: { name: 'Explosive Boomerang', desc: 'Explodes on impact or at the end of its flight.', color: '#ff5a36' },
    multi: { name: 'Multi Boomerang', desc: 'Throws split into five. Collect them all to throw again.', color: '#3d8bff' },
    fire: { name: 'Fire Boomerang', desc: 'Leaves a trail of fire. Anyone who catches fire burns up.', color: '#ff8a1c' },
    ice: { name: 'Ice Boomerang', desc: 'Leaves a slippery trail of ice.', color: '#5fd0ff' },
    disguise: { name: 'Disguise', desc: 'Stand still to turn into a nearby object.', color: '#6bbf59' },
    shield: { name: 'Shield', desc: 'Survive one extra hit.', color: '#2ec4b6' },
    telekinesis: { name: 'Telekinesis', desc: 'Hold throw while it flies to steer it. Let go to bring it back.', color: '#ff6fa5' },
    decoy: { name: 'Decoy', desc: 'Once per round, dashing leaves a decoy of you behind.', color: '#ffb81c' },
    extra: { name: 'Extra Boomerang', desc: 'Carry a second boomerang and attack faster.', color: '#ffd23f' },
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
    ctx.fillStyle = opts.golden ? '#ffd23f' : color;
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
    const dot = opts.explosive ? '#ff5a36' : opts.fire ? '#ff8a1c' : opts.ice ? '#bff0ff' : null;
    if (dot) {
      ctx.fillStyle = dot;
      U.ellipse(ctx, 0, -s * 0.28, s * 0.22, s * 0.22);
      ctx.fill();
      ctx.lineWidth = Math.max(1, s * 0.08);
      ctx.strokeStyle = INK;
      ctx.stroke();
    }
    ctx.restore();
  };

  // Boomerang gripped by one tip at (x, y), extending along `angle`. flip mirrors it for the other hand.
  BB.drawRangHeld = function (ctx, x, y, angle, size, color, flip, opts) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);
    if (flip) ctx.scale(1, -1);
    BB.drawRang(ctx, size * 0.92, -size * 0.38, 0, size, color, opts);
    ctx.restore();
  };

  BB.drawPowerIcon = function (ctx, type, x, y, s) {
    ctx.save();
    ctx.translate(x, y);
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.strokeStyle = INK;
    const lw = s * 0.1;
    switch (type) {
      case 'caffeinated':
        ctx.fillStyle = '#fff';
        U.roundRect(ctx, -s * 0.38, -s * 0.2, s * 0.6, s * 0.62, s * 0.12);
        ctx.fill();
        ctx.lineWidth = lw;
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(s * 0.26, s * 0.1, s * 0.15, -Math.PI / 2, Math.PI / 2);
        ctx.stroke();
        ctx.fillStyle = '#7a4520';
        ctx.fillRect(-s * 0.32, -s * 0.13, s * 0.48, s * 0.12);
        ctx.strokeStyle = '#b8743a';
        ctx.lineWidth = lw * 0.8;
        for (const sx of [-0.18, 0.05]) {
          ctx.beginPath();
          ctx.moveTo(sx * s, -s * 0.3);
          ctx.quadraticCurveTo((sx + 0.1) * s, -s * 0.45, sx * s, -s * 0.6);
          ctx.stroke();
        }
        break;
      case 'phase':
        ctx.fillStyle = '#c99a6a';
        ctx.fillRect(-s * 0.1, -s * 0.55, s * 0.22, s * 1.1);
        ctx.lineWidth = lw * 0.8;
        ctx.strokeRect(-s * 0.1, -s * 0.55, s * 0.22, s * 1.1);
        ctx.strokeStyle = '#8e7bff';
        ctx.lineWidth = lw * 1.4;
        ctx.setLineDash([s * 0.12, s * 0.1]);
        ctx.beginPath();
        ctx.moveTo(-s * 0.6, 0);
        ctx.lineTo(s * 0.45, 0);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = '#8e7bff';
        ctx.beginPath();
        ctx.moveTo(s * 0.62, 0);
        ctx.lineTo(s * 0.35, -s * 0.22);
        ctx.lineTo(s * 0.35, s * 0.22);
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = INK;
        ctx.lineWidth = lw * 0.6;
        ctx.stroke();
        break;
      case 'teleport':
        ctx.strokeStyle = '#b05cff';
        ctx.lineWidth = lw * 1.2;
        ctx.beginPath();
        for (let i = 0; i <= 40; i++) {
          const a = i * 0.42;
          const rr = s * 0.05 + i * s * 0.013;
          ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
        }
        ctx.stroke();
        ctx.fillStyle = '#fff';
        U.ellipse(ctx, 0, 0, s * 0.1, s * 0.1);
        ctx.fill();
        break;
      case 'explosive':
        ctx.fillStyle = '#3a3150';
        U.ellipse(ctx, 0, s * 0.1, s * 0.5, s * 0.5);
        ctx.fill();
        ctx.lineWidth = lw;
        ctx.stroke();
        ctx.fillStyle = 'rgba(255,255,255,0.5)';
        U.ellipse(ctx, -s * 0.18, -s * 0.08, s * 0.12, s * 0.08, -0.6);
        ctx.fill();
        ctx.strokeStyle = '#c9a26b';
        ctx.beginPath();
        ctx.moveTo(s * 0.25, -s * 0.3);
        ctx.quadraticCurveTo(s * 0.45, -s * 0.6, s * 0.6, -s * 0.5);
        ctx.stroke();
        ctx.fillStyle = '#ffd23f';
        U.ellipse(ctx, s * 0.62, -s * 0.52, s * 0.14, s * 0.14);
        ctx.fill();
        break;
      case 'multi':
        BB.drawRang(ctx, -s * 0.35, s * 0.15, -0.5, s * 0.35, '#7fb2ff');
        BB.drawRang(ctx, s * 0.35, s * 0.15, 0.5, s * 0.35, '#7fb2ff');
        BB.drawRang(ctx, 0, -s * 0.15, 0, s * 0.4, '#3d8bff');
        break;
      case 'fire':
        ctx.beginPath();
        ctx.moveTo(0, -s * 0.65);
        ctx.quadraticCurveTo(s * 0.55, -s * 0.1, s * 0.4, s * 0.3);
        ctx.quadraticCurveTo(s * 0.3, s * 0.62, 0, s * 0.62);
        ctx.quadraticCurveTo(-s * 0.3, s * 0.62, -s * 0.4, s * 0.3);
        ctx.quadraticCurveTo(-s * 0.5, -s * 0.05, -s * 0.15, -s * 0.25);
        ctx.quadraticCurveTo(-s * 0.05, -s * 0.4, 0, -s * 0.65);
        ctx.fillStyle = '#ff6a1c';
        ctx.fill();
        ctx.lineWidth = lw;
        ctx.stroke();
        ctx.fillStyle = '#ffd23f';
        U.ellipse(ctx, 0, s * 0.3, s * 0.18, s * 0.25);
        ctx.fill();
        break;
      case 'ice':
        ctx.strokeStyle = INK;
        ctx.lineWidth = lw * 1.8;
        for (let i = 0; i < 3; i++) {
          const a = (i / 3) * Math.PI;
          ctx.beginPath();
          ctx.moveTo(Math.cos(a) * s * 0.6, Math.sin(a) * s * 0.6);
          ctx.lineTo(-Math.cos(a) * s * 0.6, -Math.sin(a) * s * 0.6);
          ctx.stroke();
        }
        ctx.strokeStyle = '#5fd0ff';
        ctx.lineWidth = lw;
        for (let i = 0; i < 3; i++) {
          const a = (i / 3) * Math.PI;
          ctx.beginPath();
          ctx.moveTo(Math.cos(a) * s * 0.6, Math.sin(a) * s * 0.6);
          ctx.lineTo(-Math.cos(a) * s * 0.6, -Math.sin(a) * s * 0.6);
          ctx.stroke();
        }
        break;
      case 'disguise':
        ctx.fillStyle = '#6bbf59';
        ctx.beginPath();
        ctx.moveTo(-s * 0.62, -s * 0.15);
        ctx.quadraticCurveTo(-s * 0.3, -s * 0.38, 0, -s * 0.12);
        ctx.quadraticCurveTo(s * 0.3, -s * 0.38, s * 0.62, -s * 0.15);
        ctx.quadraticCurveTo(s * 0.55, s * 0.3, s * 0.18, s * 0.25);
        ctx.quadraticCurveTo(0, s * 0.08, -s * 0.18, s * 0.25);
        ctx.quadraticCurveTo(-s * 0.55, s * 0.3, -s * 0.62, -s * 0.15);
        ctx.fill();
        ctx.lineWidth = lw;
        ctx.stroke();
        ctx.fillStyle = INK;
        U.ellipse(ctx, -s * 0.28, -s * 0.02, s * 0.1, s * 0.07);
        ctx.fill();
        U.ellipse(ctx, s * 0.28, -s * 0.02, s * 0.1, s * 0.07);
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
        ctx.lineWidth = lw;
        ctx.stroke();
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = s * 0.09;
        ctx.beginPath();
        ctx.moveTo(-s * 0.2, 0);
        ctx.lineTo(-s * 0.03, s * 0.18);
        ctx.lineTo(s * 0.25, -s * 0.18);
        ctx.stroke();
        break;
      case 'telekinesis':
        BB.drawRang(ctx, 0, s * 0.1, 0.3, s * 0.42, '#ff6fa5');
        ctx.strokeStyle = '#ff6fa5';
        ctx.lineWidth = lw;
        for (const [a, d] of [[-2.4, 0.62], [-0.8, 0.62], [2.6, 0.55]]) {
          ctx.beginPath();
          ctx.moveTo(Math.cos(a) * s * (d - 0.16), Math.sin(a) * s * (d - 0.16));
          ctx.lineTo(Math.cos(a) * s * d, Math.sin(a) * s * d);
          ctx.stroke();
        }
        break;
      case 'decoy':
        ctx.globalAlpha = 0.45;
        ctx.fillStyle = '#ffb81c';
        U.ellipse(ctx, s * 0.2, -s * 0.05, s * 0.36, s * 0.36);
        ctx.fill();
        ctx.lineWidth = lw;
        ctx.stroke();
        ctx.globalAlpha = 1;
        U.ellipse(ctx, -s * 0.18, s * 0.08, s * 0.36, s * 0.36);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = INK;
        U.ellipse(ctx, -s * 0.28, s * 0.04, s * 0.05, s * 0.08);
        ctx.fill();
        U.ellipse(ctx, -s * 0.08, s * 0.04, s * 0.05, s * 0.08);
        ctx.fill();
        break;
      case 'extra':
        BB.drawRang(ctx, -s * 0.12, s * 0.08, -0.6, s * 0.45, '#ffd23f');
        BB.drawRang(ctx, s * 0.12, -s * 0.05, 0.6, s * 0.45, '#ffe680');
        break;
    }
    ctx.restore();
  };

  // The blue "power-up book" pickups.
  BB.drawBook = function (ctx, x, y, s, time) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(Math.sin(time * 2) * 0.08);
    ctx.lineJoin = 'round';
    ctx.lineWidth = s * 0.12;
    ctx.strokeStyle = INK;
    // pages
    U.roundRect(ctx, -s * 0.62, -s * 0.72, s * 1.3, s * 1.45, s * 0.12);
    ctx.fillStyle = '#fffaf0';
    ctx.fill();
    ctx.stroke();
    // cover
    U.roundRect(ctx, -s * 0.7, -s * 0.78, s * 1.25, s * 1.42, s * 0.14);
    const g = ctx.createLinearGradient(-s, 0, s, 0);
    g.addColorStop(0, '#2f6be0');
    g.addColorStop(1, '#4f9bff');
    ctx.fillStyle = g;
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#1f4fb0';
    ctx.fillRect(-s * 0.7, -s * 0.78, s * 0.2, s * 1.42);
    // ribbon
    ctx.fillStyle = '#ff4d6d';
    ctx.beginPath();
    ctx.moveTo(s * 0.2, s * 0.6);
    ctx.lineTo(s * 0.2, s * 0.92);
    ctx.lineTo(s * 0.3, s * 0.82);
    ctx.lineTo(s * 0.4, s * 0.92);
    ctx.lineTo(s * 0.4, s * 0.6);
    ctx.fill();
    // star emblem
    ctx.fillStyle = '#ffd23f';
    ctx.beginPath();
    for (let i = 0; i < 10; i++) {
      const a = -Math.PI / 2 + (i * Math.PI) / 5;
      const rr = i % 2 ? s * 0.16 : s * 0.38;
      ctx.lineTo(s * 0.05 + Math.cos(a) * rr, -s * 0.05 + Math.sin(a) * rr);
    }
    ctx.closePath();
    ctx.fill();
    ctx.lineWidth = s * 0.08;
    ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.4)';
    U.roundRect(ctx, s * 0.32, -s * 0.65, s * 0.1, s * 1.1, s * 0.05);
    ctx.fill();
    ctx.restore();
  };

  // ---------------------------------------------------------------------------

  const newStats = () => ({
    throws: 0, throwHits: 0, kills: 0, throwKills: 0, meleeKills: 0, otherKills: 0,
    longestKill: 0, deaths: 0, falls: 0, suicides: 0, teamKills: 0, survived: 0, powerups: 0, deflects: 0,
  });

  class Player {
    constructor(slot, cfg) {
      this.slot = slot;
      this.cfg = cfg;
      this.charIndex = cfg.char;
      this.char = BB.CHARACTERS[cfg.char];
      this.color = cfg.color || BB.PLAYER_COLORS[slot];
      this.team = cfg.team == null ? null : cfg.team;
      this.isBot = !!cfg.isBot;
      this.isDecoy = !!cfg.isDecoy;
      this.name = cfg.name;
      this.score = 0;
      this.r = TUNE.playerR;
      this.powerups = [];
      this.shield = false;
      this.stats = newStats();
      this.brain = this.isBot ? new BB.Bot(this, cfg.difficulty || 'normal') : null;
      this.reset(0, 0, 0);
    }

    has(id) {
      return this.powerups.includes(id);
    }

    get maxRangs() {
      return this.has('extra') ? 2 : 1;
    }

    get hasRang() {
      return this.held > 0;
    }

    reset(x, y, facing) {
      this.x = x; this.y = y;
      this.vx = 0; this.vy = 0;
      this.facing = facing;
      this.alive = true;
      this.benched = false;
      this.held = this.maxRangs;
      this.respawnQueue = [];
      this.aiming = false;
      this.aimCharge = 0;
      this.aimBlock = false;
      this.pullHeld = false;
      this.recalling = false;
      this.steering = false;
      this.aimPoint = null;
      this.meleeT = 0;
      this.meleeCd = 0;
      this.meleeHits = null;
      this.swingDir = 1;
      this.dashT = 0;
      this.dashCd = 0;
      this.dashDir = { x: 0, y: 0 };
      this.phasing = 0;
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
      this.burning = 0;
      this.burnBy = null;
      this.disguised = false;
      this.stillT = 0;
      this.decoyUsed = false;
      if (this.brain) this.brain.reset();
    }

    // Returns true when the pickup changed anything.
    addPowerup(id) {
      if (id === 'shield') {
        if (this.shield) return false;
        this.shield = true;
        return true;
      }
      if (this.has(id)) return false;
      if (id === 'fire') this.powerups = this.powerups.filter((p) => p !== 'ice');
      if (id === 'ice') this.powerups = this.powerups.filter((p) => p !== 'fire');
      this.powerups.push(id);
      while (this.powerups.length > TUNE.maxPowerups) this.powerups.shift();
      if (id === 'extra') this.held = Math.min(this.held + 1, this.maxRangs);
      this.held = Math.min(this.held, this.maxRangs);
      return true;
    }

    get speedMul() {
      let m = this.has('caffeinated') ? 1.3 : 1;
      if (this.brain) m *= this.brain.d.speed;
      if (this.aiming) m *= TUNE.aimSpeedMul;
      if (this.burning > 0) m *= 1.12;
      return m;
    }

    get rangSize() {
      return TUNE.rangR;
    }

    get meleeReach() {
      return TUNE.meleeReach;
    }

    get hidden() {
      return this.inBush || this.disguised;
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
      for (let i = this.respawnQueue.length - 1; i >= 0; i--) {
        this.respawnQueue[i] -= dt;
        if (this.respawnQueue[i] <= 0) {
          this.respawnQueue.splice(i, 1);
          this.held = Math.min(this.maxRangs, this.held + 1);
          game.particles.ring(this.x, this.y, '#ffffff', 26);
          if (game.audible) BB.Audio.play('catch');
        }
      }

      if (cmd.aim != null) this.facing = cmd.aim;
      this.aimPoint = cmd.aimPoint || null;
      const frozen = game.phase === 'countdown' || this.stun > 0;
      if (!cmd.aimHeld) this.aimBlock = false;

      // disguise: stand still to blend in, anything else breaks it
      if (this.has('disguise') && !this.isDecoy) {
        const idle = Math.hypot(cmd.mx, cmd.my) < 0.1 && !cmd.melee && !cmd.dash && !cmd.aimHeld && this.meleeT <= 0;
        if (idle && !frozen) {
          this.stillT += dt;
          if (this.stillT > 0.7 && !this.disguised) {
            this.disguised = true;
            game.particles.burst(this.x, this.y - 8, 10, { color: 'rgba(255,255,255,0.9)', speed: 120, size: 8, type: 'smoke', life: 0.5 });
          }
        } else {
          if (this.disguised) game.particles.burst(this.x, this.y - 8, 10, { color: 'rgba(255,255,255,0.9)', speed: 120, size: 8, type: 'smoke', life: 0.5 });
          this.disguised = false;
          this.stillT = 0;
        }
      } else {
        this.disguised = false;
      }

      // melee
      if (this.meleeT > 0) this.meleeT = Math.max(0, this.meleeT - dt);
      if (!frozen && cmd.melee && this.held > 0 && this.meleeCd <= 0 && !this.isDecoy) {
        this.aiming = false;
        this.aimCharge = 0;
        this.meleeT = TUNE.meleeActive;
        this.meleeCd = this.held >= 2 ? TUNE.meleeCooldownDual : TUNE.meleeCooldown;
        this.meleeHits = new Set();
        this.swingDir = -this.swingDir;
        this.squash = -0.12;
        if (game.audible) BB.Audio.play('swing');
      }

      // aim / throw (needs a boomerang in hand and a fresh press)
      if (!frozen && cmd.aimHeld && this.held > 0 && this.meleeT <= 0 && !this.aimBlock && !this.isDecoy) {
        if (!this.aiming) { this.aiming = true; this.aimCharge = 0; }
        this.aimCharge = Math.min(1, this.aimCharge + dt / TUNE.chargeTime);
      } else if (this.aiming) {
        if (this.held > 0 && !frozen) game.throwRang(this, cmd);
        this.aiming = false;
        this.aimCharge = 0;
      }
      // empty-handed: holding throw recalls dropped boomerangs (or steers them with telekinesis)
      this.pullHeld = !frozen && cmd.aimHeld && this.held === 0 && !this.aiming && !this.aimBlock && !this.isDecoy;

      // dash (teleport / decoy hook into it)
      if (this.dashT > 0) this.dashT -= dt;
      if (!frozen && cmd.dash && this.dashCd <= 0 && this.dashT <= 0) {
        const cd = TUNE.dashCooldown;
        if (this.has('teleport') && game.teleport(this)) {
          this.dashCd = cd;
        } else {
          let dx = cmd.mx, dy = cmd.my;
          const l = Math.hypot(dx, dy);
          if (l < 0.1) { dx = Math.cos(this.facing); dy = Math.sin(this.facing); } else { dx /= l; dy /= l; }
          if (this.has('decoy') && !this.decoyUsed && !this.isDecoy) {
            this.decoyUsed = true;
            game.spawnDecoy(this, dx, dy);
          }
          this.dashDir = { x: dx, y: dy };
          this.dashT = TUNE.dashTime;
          this.dashCd = cd;
          this.squash = 0.18;
          if (game.audible && !this.isDecoy) BB.Audio.play('dash');
          game.particles.burst(this.x, this.y + this.r * 0.6, 6, { color: 'rgba(255,255,255,0.8)', speed: 90, size: 5, life: 0.35, type: 'smoke' });
        }
      }

      // movement
      this.onSlick = arena.isSlickAt(this.x, this.y) || game.onIce(this.x, this.y);
      let mx = frozen || this.recalling ? 0 : cmd.mx, my = frozen || this.recalling ? 0 : cmd.my;
      const ml = Math.hypot(mx, my);
      if (ml > 1) { mx /= ml; my /= ml; }
      const phase = this.has('phase');
      if (this.dashT > 0 || this.phasing > 0) {
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
      if (phase && (this.dashT > 0 || this.phasing > 0)) {
        // ghost through walls, but never out of the arena
        const m = BB.TILE + this.r;
        this.x = U.clamp(this.x, m, BB.W - m);
        this.y = U.clamp(this.y, m, BB.H - m);
        // finishing a dash inside a wall carries on until clear
        if (this.dashT <= 0) {
          this.phasing = arena.solidAt(this.x, this.y, this.r * 0.6) ? Math.max(this.phasing, 0.01) : 0;
          if (this.phasing > 0) this.phasing += dt;
          if (this.phasing > 0.4) { this.phasing = 0; arena.collideCircle(this, this.r); }
        } else if (arena.solidAt(this.x, this.y, this.r * 0.6)) {
          this.phasing = 0.01;
        }
      } else {
        this.phasing = 0;
        const hit = arena.collideCircle(this, this.r);
        if (hit) {
          const vn = this.vx * hit.nx + this.vy * hit.ny;
          if (vn < 0) { this.vx -= vn * hit.nx; this.vy -= vn * hit.ny; }
        }
      }
      const spd = Math.hypot(this.vx, this.vy);
      this.moving = U.clamp(spd / TUNE.speed, 0, 1);
      this.walkPhase += spd * dt * 0.075;

      const wasInBush = this.inBush;
      this.inBush = arena.isBushAt(this.x, this.y);
      if (this.inBush && ((spd > 60 && Math.random() < dt * 8) || !wasInBush)) game.particles.leaves(this.x, this.y, arena.theme.bush.mid, wasInBush ? 1 : 5);

      if (this.burning > 0 && Math.random() < dt * 30) {
        game.particles.add({ x: this.x + U.rand(-10, 10), y: this.y - 10 + U.rand(-8, 8), vx: U.rand(-20, 20), vy: U.rand(-90, -50), life: 0.4, size: U.rand(4, 7), color: U.choice(['#ff6a1c', '#ffd23f', '#ff3d1c']), type: 'dot', drag: 1 });
      }

      // falling into a pit (unless mid-dash over it)
      if (this.dashT <= 0 && this.phasing <= 0 && arena.isPitAt(this.x, this.y)) {
        this.falling = true;
        this.fallT = 0;
        this.aiming = false;
        this.disguised = false;
        if (game.audible) BB.Audio.play('fall');
      }
    }

    // --- drawing --------------------------------------------------------------

    draw(ctx, game) {
      if (!this.alive) return;
      if (this.disguised) {
        game.arena.drawProp(ctx, { x: this.x, y: this.y - 2 });
        return;
      }
      let scale = 1, alpha = 1;
      if (this.falling) {
        scale = Math.max(0.05, 1 - this.fallT / 0.55);
        alpha = scale;
      }
      ctx.save();
      ctx.globalAlpha = alpha;
      const mood = this.meleeT > 0 || this.aiming ? 'angry' : this.falling || this.burning > 0 ? 'dizzy' : 'idle';
      if (this.shield) {
        ctx.fillStyle = 'rgba(46,196,182,0.18)';
        U.ellipse(ctx, this.x, this.y - 6, this.r * 1.7, this.r * 1.7);
        ctx.fill();
      }
      const arms = this.falling ? null : this.armLayout(game);
      BB.drawCharacter(ctx, this.char, this.x, this.y - (this.falling ? this.fallT * 10 : 0), this.r, {
        facing: this.facing,
        time: game.time + this.slot,
        moving: this.moving,
        walkPhase: this.walkPhase,
        blink: this.blinkT < 0,
        mood,
        ring: this.falling ? null : this.color,
        scale,
        squash: this.squash,
        noShadow: this.falling,
        back: arms ? (c) => this.drawArms(c, arms, false) : null,
        front: arms ? (c) => this.drawArms(c, arms, true) : null,
      });
      if (this.burning > 0) {
        ctx.globalAlpha = alpha * (0.35 + Math.sin(game.time * 30) * 0.1);
        ctx.fillStyle = '#ff6a1c';
        U.ellipse(ctx, this.x, this.y - this.r * 0.2, this.r * 1.05, this.r * 1.0);
        ctx.fill();
        ctx.globalAlpha = alpha;
      }
      if (this.flash > 0) {
        ctx.globalAlpha = alpha * (this.flash / 0.2);
        ctx.fillStyle = '#fff';
        U.ellipse(ctx, this.x, this.y - this.r * 0.15, this.r * 1.05, this.r * 1.0);
        ctx.fill();
        ctx.globalAlpha = alpha;
      }
      if (this.shield) {
        ctx.strokeStyle = 'rgba(46,196,182,0.9)';
        ctx.lineWidth = 3;
        U.ellipse(ctx, this.x, this.y - 6, this.r * 1.7, this.r * 1.7);
        ctx.stroke();
        ctx.strokeStyle = 'rgba(255,255,255,0.8)';
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        const w = Math.sin(game.time * 3) * 0.2;
        ctx.arc(this.x, this.y - 6, this.r * 1.45, -2.4 + w, -1.6 + w);
        ctx.stroke();
      }
      ctx.restore();
    }

    // Where the two hands go (body-local coordinates) and what they hold.
    armLayout(game) {
      const r = this.r;
      const f = this.facing;
      const fx = Math.cos(f), fy = Math.sin(f) * 0.75;
      const px = -Math.sin(f), py = Math.cos(f) * 0.75; // the fighter's right-hand side
      const swingBob = Math.sin(this.walkPhase) * r * 0.12 * this.moving;
      const rangOpts = {
        explosive: this.has('explosive'), fire: this.has('fire'), ice: this.has('ice'),
      };
      const size = this.rangSize * 1.1;
      const main = { x: px * r * 0.98 + fx * r * 0.2, y: py * r * 0.98 + fy * r * 0.2 + r * 0.25 + swingBob, rang: this.held > 0, angle: f - 0.35 + Math.sin(this.walkPhase) * 0.15 * this.moving, flip: false };
      const off = { x: -px * r * 0.98 + fx * r * 0.15, y: -py * r * 0.98 + fy * r * 0.15 + r * 0.25 - swingBob, rang: this.held > 1, angle: f + 0.35, flip: true };
      if (this.meleeT > 0) {
        // the boomerang sweeps across the front like a blade
        const t = 1 - this.meleeT / BB.TUNE.meleeActive;
        const a = f + this.swingDir * (-1.45 + 2.9 * U.easeOutCubic(t));
        main.x = Math.cos(a) * r * 1.05;
        main.y = Math.sin(a) * r * 1.05 * 0.75 + r * 0.2;
        main.angle = a;
        main.flip = this.swingDir < 0;
      } else if (this.aiming) {
        // wind-up: boomerang cocked back behind the shoulder, free hand pointing at the target
        const shake = this.aimCharge >= 1 ? Math.sin(game.time * 60) * 1.2 : 0;
        main.x = -fx * r * 0.55 + px * r * 0.85 + shake;
        main.y = -fy * r * 0.55 + py * r * 0.85 - r * 0.25;
        main.angle = f + Math.PI - 0.55 - this.aimCharge * 0.35;
        main.flip = true;
        off.x = fx * r * 1.0 - px * r * 0.35;
        off.y = fy * r * 1.0 - py * r * 0.35 + r * 0.1;
      } else if (this.pullHeld) {
        // reaching out to call the boomerang back
        const w = Math.sin(game.time * 18) * r * 0.05;
        main.x = fx * r * 1.05 + px * r * 0.35;
        main.y = fy * r * 1.05 + py * r * 0.35 + w;
        off.x = fx * r * 1.05 - px * r * 0.35;
        off.y = fy * r * 1.05 - py * r * 0.35 - w;
      }
      return { main, off, size, color: this.color, opts: rangOpts };
    }

    drawArms(ctx, arms, front) {
      for (const h of [arms.off, arms.main]) {
        const isFront = h.y > -this.r * 0.15;
        if (isFront !== front) continue;
        if (h.rang) BB.drawRangHeld(ctx, h.x, h.y, h.angle, arms.size, arms.color, h.flip, arms.opts);
        BB.drawHand(ctx, this.char, h.x, h.y, this.r);
      }
    }
  }
  BB.Player = Player;

  // ---------------------------------------------------------------------------

  let rangId = 0;

  class Rang {
    constructor(owner, group, x, y, angle, power, curve) {
      this.id = ++rangId;
      this.owner = owner;
      this.group = group;
      this.x = x; this.y = y;
      this.dirX = Math.cos(angle);
      this.dirY = Math.sin(angle);
      this.speed0 = BB.throwSpeed(power);
      this.outTime = BB.throwOutTime(power);
      this.vx = this.dirX * this.speed0;
      this.vy = this.dirY * this.speed0;
      this.curve = curve || 0;
      this.state = 'out';
      this.t = 0;
      this.retT = 0;
      this.spin = Math.random() * TAU;
      this.r = owner.rangSize;
      this.explosive = owner.has('explosive');
      this.exploded = false;
      this.fire = owner.has('fire');
      this.ice = owner.has('ice');
      this.trailDist = 0;
      this.clashT = 0;
      this.dead = false;
      this.trail = [];
      this.startX = x; this.startY = y;
    }

    get flying() {
      return this.state === 'out' || this.state === 'return' || this.state === 'recall' || this.state === 'tk';
    }

    // Who this boomerang can slice right now.
    canHurt(p, game) {
      if (!this.flying || !p.alive || p.falling || p === this.owner || p.benched) return false;
      if (p.isDecoy && p.owner === this.owner) return false;
      return game.canHarm(this.owner, p);
    }

    draw(ctx) {
      const color = this.owner.color;
      if (this.flying) {
        for (let i = 0; i < this.trail.length; i++) {
          const p = this.trail[i];
          const k = i / this.trail.length;
          ctx.globalAlpha = k * 0.35;
          ctx.fillStyle = this.fire ? '#ff8a1c' : this.ice ? '#bff0ff' : color;
          U.ellipse(ctx, p.x, p.y, this.r * 0.7 * k, this.r * 0.7 * k);
          ctx.fill();
        }
        ctx.globalAlpha = 1;
      }
      const lift = this.flying ? 14 : 2;
      ctx.fillStyle = 'rgba(0,0,0,0.2)';
      U.ellipse(ctx, this.x, this.y + 4, this.r * 0.9, this.r * 0.45);
      ctx.fill();
      if (this.state === 'recall' || this.state === 'tk') {
        ctx.strokeStyle = U.rgba(color, 0.5);
        ctx.lineWidth = 3;
        U.ellipse(ctx, this.x, this.y - lift, this.r * 1.5, this.r * 1.5);
        ctx.stroke();
      }
      BB.drawRang(ctx, this.x, this.y - lift, this.spin, this.r, color, {
        explosive: this.explosive && !this.exploded, fire: this.fire, ice: this.ice,
      });
      if (this.state === 'dropped') {
        // bobbing marker so owners can find their dropped boomerang
        const by = this.y - 30 + Math.sin(performance.now() / 200) * 3;
        ctx.fillStyle = color;
        ctx.strokeStyle = INK;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(this.x - 5, by - 5);
        ctx.lineTo(this.x + 5, by - 5);
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
    constructor(x, y) {
      this.x = x; this.y = y;
      this.t = 0;
      this.dead = false;
    }

    draw(ctx, time) {
      const pop = Math.min(1, this.t / 0.35);
      const s = U.easeOutBack(pop);
      const bob = Math.sin(time * 3 + this.x) * 3;
      ctx.fillStyle = 'rgba(0,0,0,0.2)';
      U.ellipse(ctx, this.x, this.y + 12, 14 * s, 5 * s);
      ctx.fill();
      ctx.save();
      ctx.translate(this.x, this.y - 10 + bob);
      ctx.scale(s, s);
      ctx.fillStyle = 'rgba(79,155,255,0.25)';
      U.ellipse(ctx, 0, 0, 22 + Math.sin(time * 5) * 2, 22 + Math.sin(time * 5) * 2);
      ctx.fill();
      BB.drawBook(ctx, 0, 0, 14, time);
      ctx.restore();
    }
  }
  BB.PowerUp = PowerUp;

  // ---------------------------------------------------------------------------

  class Half {
    constructor(player, side, cutAngle, hitAngle, burnt) {
      this.ch = player.char;
      this.r = player.r;
      this.side = side;
      this.burnt = !!burnt;
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
      if (this.burnt) ctx.filter = 'brightness(0.45) saturate(0.6)';
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
          case 'spark':
            ctx.strokeStyle = p.color;
            ctx.lineWidth = p.size * k;
            ctx.lineCap = 'round';
            ctx.beginPath();
            ctx.moveTo(p.x, p.y);
            ctx.lineTo(p.x - p.vx * 0.04, p.y - p.vy * 0.04);
            ctx.stroke();
            break;
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
