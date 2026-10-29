// Match / round simulation and rendering.
(function () {
  'use strict';
  const BB = window.BB;
  const U = BB.util;
  const TUNE = BB.TUNE;
  const INK = BB.INK;
  const TAU = BB.TAU;

  const STEP = 1 / 120;
  const ROUND_TIME = 90;
  const COUNT_STEP = 0.65;

  class Game {
    constructor(cfg, hooks) {
      this.cfg = cfg;
      this.hooks = hooks || {};
      this.demo = !!cfg.demo;
      this.players = cfg.players.map((pc) => new BB.Player(pc.slot, pc));
      this.human = this.players.find((p) => !p.isBot) || null;
      this.round = 0;
      this.time = 0;
      this.acc = 0;
      this.paused = false;
      this.stain = U.makeCanvas(BB.W, BB.H);
      this.stainCtx = this.stain.getContext('2d');
      this.arenaQueue = [];
      this.lastArena = null;
      this.pending = { melee: false, dash: false };
      this.shake = 0;
      this.hitstop = 0;
      this.slowmoT = 0;
      this.phase = 'idle';
    }

    get audible() {
      return !this.demo;
    }

    nextArenaId() {
      if (this.cfg.arena && this.cfg.arena !== 'shuffle') return this.cfg.arena;
      if (!this.arenaQueue.length) {
        this.arenaQueue = U.shuffle(BB.ARENA_DEFS.map((d) => d.id));
        if (this.arenaQueue[0] === this.lastArena) this.arenaQueue.push(this.arenaQueue.shift());
      }
      this.lastArena = this.arenaQueue.shift();
      return this.lastArena;
    }

    startRound() {
      this.round++;
      this.arena = BB.getArena(this.nextArenaId());
      this.rangs = [];
      this.powerups = [];
      this.halves = [];
      this.flashes = [];
      this.particles = new BB.Particles();
      this.stainCtx.clearRect(0, 0, BB.W, BB.H);
      const order = U.shuffle([0, 1, 2, 3]);
      this.players.forEach((p, i) => {
        const s = this.arena.spawns[order[i]];
        p.reset(s.x, s.y, Math.atan2(BB.H / 2 - s.y, BB.W / 2 - s.x));
      });
      this.phase = 'countdown';
      this.phaseT = 0;
      this.countShown = -1;
      this.roundTime = 0;
      this.fightT = 0;
      this.puTimer = U.rand(5, 8);
      this.endT = 0;
      this.timeUp = false;
      this.slowmoT = 0;
      this.hitstop = 0;
      this.roundPoints = new Map();
      this.pending.melee = this.pending.dash = false;
      if (this.hooks.onRoundStart) this.hooks.onRoundStart(this);
    }

    // ------------------------------------------------------------------------

    frame(realDt) {
      if (this.paused || this.phase === 'idle' || this.phase === 'results') return;
      realDt = Math.min(realDt, 0.1);
      const I = BB.Input;
      if (this.human && !this.demo) {
        if (I.wasPressed('melee')) this.pending.melee = true;
        if (I.wasPressed('dash')) this.pending.dash = true;
      }
      if (this.hitstop > 0) {
        this.hitstop -= realDt;
        return;
      }
      let scale = 1;
      if (this.slowmoT > 0) {
        this.slowmoT -= realDt;
        scale = 0.3;
      }
      this.acc += realDt * scale;
      let n = 0;
      while (this.acc >= STEP && n < 24) {
        this.update(STEP);
        this.acc -= STEP;
        n++;
        if (this.phase === 'results') break;
      }
      this.shake *= Math.exp(-9 * realDt);
    }

    humanCmd() {
      const I = BB.Input, p = this.human;
      const cmd = {
        mx: (I.isDown('right') ? 1 : 0) - (I.isDown('left') ? 1 : 0),
        my: (I.isDown('down') ? 1 : 0) - (I.isDown('up') ? 1 : 0),
        aim: Math.atan2(I.mouse.y - (p.y - 8), I.mouse.x - p.x),
        melee: this.pending.melee,
        dash: this.pending.dash,
        aimHeld: I.isDown('throw'),
      };
      this.pending.melee = this.pending.dash = false;
      return cmd;
    }

    update(dt) {
      this.time += dt;
      this.phaseT += dt;

      if (this.phase === 'countdown') {
        const step = Math.floor(this.phaseT / COUNT_STEP);
        if (step !== this.countShown && step < 3) {
          this.countShown = step;
          if (this.audible) BB.Audio.play('count');
        }
        if (this.phaseT >= COUNT_STEP * 3) {
          this.phase = 'playing';
          this.fightT = 0.8;
          if (this.audible) BB.Audio.play('go');
        }
      } else if (this.phase === 'playing') {
        this.roundTime += dt;
        this.fightT = Math.max(0, this.fightT - dt);
        this.updatePowerupSpawns(dt);
        if (this.roundTime >= ROUND_TIME) {
          this.timeUp = true;
          this.endRound();
        }
      }

      for (const p of this.players) {
        if (!p.alive) continue;
        const cmd = p.isBot ? p.brain.think(this, dt) : this.humanCmd();
        p.update(this, cmd, dt);
      }
      this.separatePlayers();
      this.resolveMelee();
      for (const r of this.rangs) this.updateRang(r, dt);
      this.resolveRangClashes();
      this.rangs = this.rangs.filter((r) => !r.dead);
      this.updatePowerups(dt);
      for (const h of this.halves) h.update(dt, this.arena);
      this.halves = this.halves.filter((h) => !h.dead);
      this.particles.update(dt);
      for (const f of this.flashes) f.t += dt;
      this.flashes = this.flashes.filter((f) => f.t < f.life);

      if (this.phase === 'playing') {
        const alive = this.players.filter((p) => p.alive);
        if (alive.length <= 1) this.endRound();
      } else if (this.phase === 'roundEnd') {
        this.endT += dt;
        if (this.endT >= 1.7) this.finishRound();
      }
    }

    endRound() {
      if (this.phase !== 'playing') return;
      this.phase = 'roundEnd';
      this.endT = 0;
      for (const p of this.players) p.aiming = false;
    }

    finishRound() {
      if (this.demo) {
        for (const p of this.players) p.score = 0;
        this.startRound();
        return;
      }
      this.phase = 'results';
      if (this.hooks.onRoundEnd) this.hooks.onRoundEnd(this);
    }

    matchWinner() {
      const max = Math.max(...this.players.map((p) => p.score));
      if (max < this.cfg.pointsToWin) return null;
      const top = this.players.filter((p) => p.score === max);
      return top.length === 1 ? top[0] : null;
    }

    // ------------------------------------------------------------------------
    // Combat

    throwRang(p) {
      const power = BB.throwPower(p.aimCharge);
      const offsets = p.powerup === 'multi' ? [0, -0.3, 0.3] : [0];
      offsets.forEach((a, i) => {
        const ang = p.facing + a;
        let x = p.x + Math.cos(ang) * (p.r + 4), y = p.y + Math.sin(ang) * (p.r + 4);
        if (this.arena.solidAt(x, y, 4)) { x = p.x; y = p.y; }
        const r = new BB.Rang(p, x, y, ang, power, i > 0);
        this.rangs.push(r);
        if (i === 0) p.rang = r;
      });
      p.hasRang = false;
      p.squash = -0.15;
      if (this.audible) BB.Audio.play('throw');
    }

    updateRang(r, dt) {
      const arena = this.arena;
      r.t += dt;
      r.clashT = Math.max(0, r.clashT - dt);
      if (r.ignoreT > 0) r.ignoreT -= dt;
      if (r.state === 'out') {
        const sp = Math.max(0, r.speed0 * (1 - r.t / r.outTime));
        r.vx = r.dirX * sp;
        r.vy = r.dirY * sp;
        if (r.t >= r.outTime) {
          r.state = 'return';
          r.retT = 0;
          r.deflector = null;
        }
      } else if (r.state === 'return') {
        r.retT += dt;
        const o = r.owner;
        if (!o.alive || o.falling) {
          this.dropRang(r);
        } else {
          const dx = o.x - r.x, dy = o.y - r.y;
          const l = Math.hypot(dx, dy) || 1;
          const sp = Math.min(TUNE.rangReturnMax, 260 + r.retT * 1300);
          r.vx = (dx / l) * sp;
          r.vy = (dy / l) * sp;
        }
      } else if (r.state === 'dropped') {
        const f = Math.exp(-6 * dt);
        r.vx *= f;
        r.vy *= f;
      }

      if (r.flying) {
        r.spin += dt * 24;
        r.trail.push({ x: r.x, y: r.y - 14 });
        if (r.trail.length > 7) r.trail.shift();
      } else {
        r.trail.length = 0;
      }

      // move in small steps so fast boomerangs never tunnel through walls
      const dist = Math.hypot(r.vx, r.vy) * dt;
      const n = Math.max(1, Math.ceil(dist / 6));
      for (let i = 0; i < n && !r.dead; i++) {
        r.x += (r.vx * dt) / n;
        r.y += (r.vy * dt) / n;
        const hit = arena.collideCircle(r, r.r * 0.7);
        if (hit) {
          this.rangHitWall(r, hit);
          break;
        }
      }
      if (r.dead) return;

      if (r.state === 'dropped' && arena.isPitAt(r.x, r.y)) {
        r.dead = true;
        if (!r.extra) r.owner.rangRespawn = 1.0;
        this.splash(r.x, r.y, 0.5);
        return;
      }

      if (r.flying) {
        for (const p of this.players) {
          if (!r.canHurt(p) || (r.ignoreT > 0 && r.ignore === p)) continue;
          if (Math.hypot(p.x - r.x, p.y - 4 - r.y) < p.r + r.r * 0.8) {
            this.rangHitPlayer(r, p);
            if (r.dead) return;
          }
        }
      }

      const o = r.owner;
      if (o.alive && !o.falling) {
        const d = Math.hypot(o.x - r.x, o.y - r.y);
        if (r.state === 'return' && d < o.r + r.r + 8) {
          r.dead = true;
          if (!r.extra) {
            o.hasRang = true;
            o.rang = null;
            o.squash = 0.12;
            if (this.audible) BB.Audio.play('catch');
          }
        } else if (r.state === 'dropped' && !r.extra && !o.hasRang && d < o.r + r.r + 10) {
          r.dead = true;
          o.hasRang = true;
          o.rang = null;
          if (this.audible) BB.Audio.play('pickup');
          this.particles.ring(o.x, o.y, '#ffffff', 22);
        }
      }
    }

    dropRang(r) {
      if (r.extra) {
        r.dead = true;
        this.particles.burst(r.x, r.y, 6, { color: 'rgba(255,255,255,0.9)', speed: 80, size: 5, type: 'smoke', life: 0.4 });
        return;
      }
      r.state = 'dropped';
      r.deflector = null;
      r.vx *= 0.25;
      r.vy *= 0.25;
    }

    rangHitWall(r, hit) {
      if (r.explosive && r.flying) {
        this.explode(r.x, r.y, r.killer);
        r.dead = true;
        if (!r.extra) r.owner.rangRespawn = 1.0;
        return;
      }
      if (!r.flying) {
        const vn = r.vx * hit.nx + r.vy * hit.ny;
        if (vn < 0) { r.vx -= 2 * vn * hit.nx; r.vy -= 2 * vn * hit.ny; }
        return;
      }
      this.particles.burst(r.x, r.y, 6, { color: ['#fff', '#ffe08a'], speed: 220, size: 3, type: 'spark', life: 0.25 });
      if (this.audible) BB.Audio.play('thud');
      if (r.state === 'out') {
        const dn = r.dirX * hit.nx + r.dirY * hit.ny;
        r.dirX -= 2 * dn * hit.nx;
        r.dirY -= 2 * dn * hit.ny;
        r.state = 'return';
        r.retT = 0.25;
        r.deflector = null;
      } else {
        const vn = r.vx * hit.nx + r.vy * hit.ny;
        r.vx = (r.vx - 2 * vn * hit.nx) * 0.3;
        r.vy = (r.vy - 2 * vn * hit.ny) * 0.3;
        this.dropRang(r);
      }
    }

    rangHitPlayer(r, p) {
      if (p.shield) {
        this.popShield(p, r.killer);
        const nx = r.x - p.x, ny = r.y - p.y;
        const l = Math.hypot(nx, ny) || 1;
        p.vx -= (nx / l) * 260;
        p.vy -= (ny / l) * 260;
        r.ignore = p;
        r.ignoreT = 0.3;
        if (r.explosive) {
          this.explode(r.x, r.y, r.killer, p);
          r.dead = true;
          if (!r.extra) r.owner.rangRespawn = 1.0;
          return;
        }
        r.dirX = nx / l;
        r.dirY = ny / l;
        r.state = 'return';
        r.retT = 0.2;
        r.deflector = null;
        return;
      }
      if (r.explosive) {
        this.explode(r.x, r.y, r.killer);
        r.dead = true;
        if (!r.extra) r.owner.rangRespawn = 1.0;
        return;
      }
      this.kill(p, r.killer, Math.atan2(r.vy, r.vx));
    }

    resolveRangClashes() {
      const rs = this.rangs;
      for (let i = 0; i < rs.length; i++) {
        const a = rs[i];
        if (!a.flying || a.dead || a.clashT > 0) continue;
        for (let j = i + 1; j < rs.length; j++) {
          const b = rs[j];
          if (!b.flying || b.dead || b.clashT > 0 || a.owner === b.owner) continue;
          const dx = b.x - a.x, dy = b.y - a.y;
          const d = Math.hypot(dx, dy);
          if (d > a.r + b.r) continue;
          const nx = dx / (d || 1), ny = dy / (d || 1);
          const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
          this.particles.burst(mx, my, 12, { color: ['#fff', '#ffd23f'], speed: 320, size: 3, type: 'spark', life: 0.3 });
          this.flashes.push({ x: mx, y: my, t: 0, life: 0.15, r: 30 });
          if (this.audible) BB.Audio.play('clang');
          for (const [r, sx, sy] of [[a, -nx, -ny], [b, nx, ny]]) {
            if (r.explosive) {
              this.explode(r.x, r.y, r.killer);
              r.dead = true;
              if (!r.extra) r.owner.rangRespawn = 1.0;
              continue;
            }
            r.dirX = sx;
            r.dirY = sy;
            r.state = 'return';
            r.retT = 0.1;
            r.deflector = null;
            r.clashT = 0.25;
          }
          break;
        }
      }
    }

    resolveMelee() {
      const hits = [];
      for (const p of this.players) {
        if (!p.alive || p.falling || p.meleeT <= 0) continue;
        const reach = p.meleeReach;
        // deflect boomerangs
        for (const r of this.rangs) {
          if (!r.flying || r.clashT > 0) continue;
          if (r.owner === p && !r.deflector) continue;
          if (r.deflector === p) continue;
          const dx = r.x - p.x, dy = r.y - p.y;
          const d = Math.hypot(dx, dy);
          if (d > reach + r.r + 8) continue;
          if (Math.abs(U.angDiff(p.facing, Math.atan2(dy, dx))) > TUNE.meleeArc + 0.25) continue;
          const sp = Math.max(880, Math.hypot(r.vx, r.vy) * 1.1);
          r.dirX = Math.cos(p.facing);
          r.dirY = Math.sin(p.facing);
          r.state = 'out';
          r.t = 0;
          r.speed0 = sp;
          r.outTime = 0.55;
          r.deflector = r.owner === p ? null : p;
          r.clashT = 0.2;
          this.particles.burst(r.x, r.y, 14, { color: ['#fff', '#ffd23f', p.color], speed: 360, size: 3, type: 'spark', life: 0.3 });
          this.flashes.push({ x: r.x, y: r.y, t: 0, life: 0.15, r: 34 });
          this.hitstop = Math.max(this.hitstop, 0.05);
          if (this.audible) BB.Audio.play('clang');
        }
        // slash fighters
        for (const q of this.players) {
          if (q === p || !q.alive || q.falling || p.meleeHits.has(q)) continue;
          const dx = q.x - p.x, dy = q.y - p.y;
          const d = Math.hypot(dx, dy);
          if (d > reach + q.r) continue;
          if (d > q.r + p.r && Math.abs(U.angDiff(p.facing, Math.atan2(dy, dx))) > TUNE.meleeArc) continue;
          if (!this.arena.lineClear(p.x, p.y, q.x, q.y)) continue;
          p.meleeHits.add(q);
          hits.push([p, q]);
        }
      }
      for (const [p, q] of hits) {
        const mutual = hits.some(([a, b]) => a === q && b === p);
        const ang = Math.atan2(q.y - p.y, q.x - p.x);
        if (mutual) {
          // simultaneous slashes clang off each other
          if (p.slot < q.slot) {
            for (const [a, s] of [[p, -1], [q, 1]]) {
              a.vx = Math.cos(ang) * 420 * s;
              a.vy = Math.sin(ang) * 420 * s;
              a.stun = 0.18;
              a.meleeT = 0;
            }
            p.lastHitBy = q; p.lastHitT = this.time;
            q.lastHitBy = p; q.lastHitT = this.time;
            const mx = (p.x + q.x) / 2, my = (p.y + q.y) / 2;
            this.particles.burst(mx, my, 16, { color: ['#fff', '#ffd23f'], speed: 380, size: 3, type: 'spark', life: 0.35 });
            this.flashes.push({ x: mx, y: my, t: 0, life: 0.18, r: 40 });
            this.hitstop = Math.max(this.hitstop, 0.08);
            this.shake = Math.max(this.shake, 6);
            if (this.audible) BB.Audio.play('clang');
          }
          continue;
        }
        if (q.shield) {
          this.popShield(q, p);
          q.vx = Math.cos(ang) * 380;
          q.vy = Math.sin(ang) * 380;
          q.stun = 0.15;
          continue;
        }
        this.kill(q, p, ang);
      }
    }

    popShield(p, by) {
      p.shield = false;
      p.flash = 0.2;
      p.lastHitBy = by;
      p.lastHitT = this.time;
      this.particles.ring(p.x, p.y - 6, '#2ec4b6', p.r * 2);
      this.particles.burst(p.x, p.y - 6, 14, { color: ['#2ec4b6', '#bff5ef', '#fff'], speed: 240, size: 4, life: 0.5 });
      this.hitstop = Math.max(this.hitstop, 0.05);
      if (this.audible) BB.Audio.play('shield');
      if (this.hooks.onChange) this.hooks.onChange(this);
    }

    explode(x, y, killer, spare) {
      const R = 90;
      this.flashes.push({ x, y, t: 0, life: 0.3, r: R, boom: true });
      this.particles.burst(x, y, 26, { color: ['#ffd23f', '#ff8a3d', '#ff5a36', '#fff'], speed: 420, size: 5, life: 0.6 });
      this.particles.burst(x, y, 12, { color: 'rgba(80,70,90,0.55)', speed: 120, size: 16, type: 'smoke', life: 0.9, drag: 3 });
      this.particles.ring(x, y, '#ffd23f', R * 0.8, 0.4);
      const g = this.stainCtx.createRadialGradient(x, y, 0, x, y, R * 0.7);
      g.addColorStop(0, 'rgba(40,25,30,0.45)');
      g.addColorStop(1, 'rgba(40,25,30,0)');
      this.stainCtx.fillStyle = g;
      this.stainCtx.beginPath();
      this.stainCtx.arc(x, y, R * 0.7, 0, TAU);
      this.stainCtx.fill();
      this.shake = Math.max(this.shake, 16);
      this.hitstop = Math.max(this.hitstop, 0.06);
      if (this.audible) BB.Audio.play('explode');
      for (const p of this.players) {
        if (!p.alive || p.falling || p === spare) continue;
        const d = Math.hypot(p.x - x, p.y - y);
        if (d < R + p.r * 0.5) {
          const ang = Math.atan2(p.y - y, p.x - x);
          if (p.shield) {
            this.popShield(p, killer);
            p.vx = Math.cos(ang) * 420;
            p.vy = Math.sin(ang) * 420;
          } else {
            this.kill(p, killer, ang);
          }
        }
      }
    }

    kill(victim, killer, ang) {
      if (!victim.alive) return;
      victim.alive = false;
      victim.aiming = false;
      const ch = victim.char;
      this.halves.push(new BB.Half(victim, -1, ang, ang), new BB.Half(victim, 1, ang, ang));
      this.particles.burst(victim.x, victim.y - 6, 22, { color: [ch.juice, ch.inside, U.shade(ch.juice, -0.2)], speed: 330, size: 5, life: 0.6, angle: ang, spread: 1.1 });
      this.particles.burst(victim.x, victim.y - 6, 8, { color: '#ffffff', speed: 500, size: 3, type: 'spark', life: 0.25 });
      this.flashes.push({ x: victim.x, y: victim.y, t: 0, life: 0.12, r: 46 });
      this.splat(victim.x, victim.y, ang, ch.juice);
      this.shake = Math.max(this.shake, 9);
      this.hitstop = Math.max(this.hitstop, 0.07);
      if (this.audible) BB.Audio.play('slice');
      this.award(killer, victim);
    }

    killByFall(p) {
      if (!p.alive) return;
      p.alive = false;
      this.splash(p.x, p.y, 1);
      const killer = p.lastHitBy && this.time - p.lastHitT < 2.5 ? p.lastHitBy : null;
      this.award(killer, p);
    }

    award(killer, victim) {
      if (killer && killer !== victim) {
        killer.score++;
        killer.roundKills++;
        this.roundPoints.set(killer, (this.roundPoints.get(killer) || 0) + 1);
        this.particles.text(killer.x, killer.y - 46, '+1', killer.color, 30);
        if (this.audible) setTimeout(() => BB.Audio.play('point'), 120);
      }
      if (this.phase === 'playing' && this.players.filter((p) => p.alive).length <= 1) {
        this.slowmoT = 1.0;
      }
      if (this.hooks.onChange) this.hooks.onChange(this);
    }

    splat(x, y, ang, color) {
      const ctx = this.stainCtx;
      ctx.fillStyle = U.rgba(color, 0.75);
      for (let i = 0; i < 9; i++) {
        const d = U.rand(0, 38);
        const a = ang + U.rand(-0.8, 0.8);
        const s = U.rand(4, 12) * (1 - d / 60);
        U.ellipse(ctx, x + Math.cos(a) * d, y + Math.sin(a) * d * 0.8, s, s * 0.7, a);
        ctx.fill();
      }
      U.ellipse(ctx, x, y + 4, 16, 10);
      ctx.fill();
    }

    splash(x, y, k) {
      const theme = this.arena.theme;
      if (theme.water) {
        this.particles.burst(x, y, Math.round(18 * k), { color: ['#ffffff', '#bfe9ff', theme.pit.fill], speed: 200, size: 4, life: 0.6, grav: 500, drag: 1 });
        this.particles.ring(x, y, 'rgba(255,255,255,0.9)', 26 * k, 0.5);
        if (this.audible) BB.Audio.play('splash');
      } else {
        this.particles.burst(x, y, Math.round(12 * k), { color: ['#c99a6a', '#8a5a3a'], speed: 80, size: 8, type: 'smoke', life: 0.8 });
      }
    }

    separatePlayers() {
      const ps = this.players;
      for (let i = 0; i < ps.length; i++) {
        const a = ps[i];
        if (!a.alive || a.falling) continue;
        for (let j = i + 1; j < ps.length; j++) {
          const b = ps[j];
          if (!b.alive || b.falling) continue;
          const dx = b.x - a.x, dy = b.y - a.y;
          const d = Math.hypot(dx, dy);
          const min = a.r + b.r;
          if (d >= min || d < 0.001) continue;
          const push = (min - d) / 2;
          a.x -= (dx / d) * push; a.y -= (dy / d) * push;
          b.x += (dx / d) * push; b.y += (dy / d) * push;
        }
      }
    }

    updatePowerupSpawns(dt) {
      if (!this.cfg.powerups) return;
      this.puTimer -= dt;
      if (this.puTimer > 0) return;
      this.puTimer = U.rand(7, 11);
      if (this.powerups.length >= 2) return;
      const pt = this.arena.randomFloorPoint((q) =>
        this.players.every((p) => !p.alive || Math.hypot(p.x - q.x, p.y - q.y) > 140) &&
        this.powerups.every((u) => Math.hypot(u.x - q.x, u.y - q.y) > 120));
      if (!pt) return;
      this.powerups.push(new BB.PowerUp(U.choice(BB.POWERUP_TYPES), pt.x, pt.y));
      this.particles.ring(pt.x, pt.y - 10, '#ffffff', 30);
      if (this.audible) BB.Audio.play('spawnpu');
    }

    updatePowerups(dt) {
      for (const u of this.powerups) {
        u.t += dt;
        for (const p of this.players) {
          if (!p.alive || p.falling) continue;
          if (Math.hypot(p.x - u.x, p.y - u.y) > p.r + 18) continue;
          u.dead = true;
          if (u.type === 'shield') p.shield = true;
          else p.powerup = u.type;
          this.particles.text(p.x, p.y - 50, BB.POWERUPS[u.type].name + '!', BB.POWERUPS[u.type].color, 22);
          this.particles.burst(u.x, u.y - 10, 14, { color: [BB.POWERUPS[u.type].color, '#fff'], speed: 200, size: 4, life: 0.5 });
          if (this.audible) BB.Audio.play('powerup');
          if (this.hooks.onChange) this.hooks.onChange(this);
          break;
        }
      }
      this.powerups = this.powerups.filter((u) => !u.dead);
    }

    // ------------------------------------------------------------------------
    // Rendering

    render(ctx) {
      if (!this.arena) return;
      ctx.save();
      if (this.shake > 0.3 && BB.Settings.data.shake) {
        ctx.translate(U.rand(-1, 1) * this.shake, U.rand(-1, 1) * this.shake);
      }
      const arena = this.arena;
      arena.drawBase(ctx);
      arena.drawAnimated(ctx, this.time);
      ctx.drawImage(this.stain, 0, 0);

      for (const r of this.rangs) if (!r.flying) r.draw(ctx);
      for (const u of this.powerups) u.draw(ctx, this.time);

      const sorted = [];
      for (const p of this.players) if (p.alive) sorted.push({ y: p.y, k: 0, o: p });
      for (const pr of arena.props) sorted.push({ y: pr.y + 4, k: 1, o: pr });
      for (const h of this.halves) sorted.push({ y: h.y, k: 2, o: h });
      sorted.sort((a, b) => a.y - b.y);
      for (const s of sorted) {
        if (s.k === 0) s.o.draw(ctx, this);
        else if (s.k === 1) arena.drawProp(ctx, s.o);
        else s.o.draw(ctx);
      }

      for (const p of this.players) if (p.alive && p.meleeT > 0) this.drawSwoosh(ctx, p);
      for (const r of this.rangs) if (r.flying) r.draw(ctx);

      arena.drawBushes(ctx);

      const h = this.human;
      if (h && h.alive && h.inBush && !this.demo) {
        ctx.save();
        ctx.globalAlpha = 0.5;
        BB.drawCharacter(ctx, h.char, h.x, h.y, h.r, { facing: h.facing, time: this.time, moving: h.moving, walkPhase: h.walkPhase, ring: h.color, noShadow: true });
        ctx.restore();
      }

      this.particles.draw(ctx);
      for (const f of this.flashes) {
        const k = 1 - f.t / f.life;
        ctx.globalAlpha = k * (f.boom ? 0.85 : 0.9);
        ctx.fillStyle = f.boom ? '#fff4c2' : '#ffffff';
        U.ellipse(ctx, f.x, f.y, f.r * (1.2 - k * 0.4), f.r * (1.2 - k * 0.4));
        ctx.fill();
      }
      ctx.globalAlpha = 1;

      if (!this.demo) {
        for (const p of this.players) if (p.alive && !p.falling) this.drawMarker(ctx, p);
        if (h && h.alive && h.aiming) this.drawAimGuide(ctx, h);
      }
      ctx.restore();

      if (!this.demo) this.drawOverlayText(ctx);
      if (this.slowmoT > 0) {
        const vg = ctx.createRadialGradient(BB.W / 2, BB.H / 2, BB.H * 0.35, BB.W / 2, BB.H / 2, BB.W * 0.65);
        vg.addColorStop(0, 'rgba(0,0,0,0)');
        vg.addColorStop(1, `rgba(20,10,30,${Math.min(0.45, this.slowmoT * 0.5)})`);
        ctx.fillStyle = vg;
        ctx.fillRect(0, 0, BB.W, BB.H);
      }
      if (h && !this.demo && !this.paused && this.phase !== 'results') this.drawCrosshair(ctx, h);
    }

    drawSwoosh(ctx, p) {
      const t = 1 - p.meleeT / TUNE.meleeActive;
      const R = p.meleeReach + 4;
      const a0 = p.facing - p.swingDir * TUNE.meleeArc;
      const a1 = p.facing - p.swingDir * TUNE.meleeArc + p.swingDir * TUNE.meleeArc * 2 * U.easeOutCubic(t);
      const cy = p.y - 8;
      ctx.save();
      ctx.globalAlpha = 0.75 * (1 - t * 0.5);
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(p.x, cy, R, a0, a1, p.swingDir < 0);
      ctx.arc(p.x, cy, R * 0.55, a1, a0, p.swingDir > 0);
      ctx.closePath();
      ctx.fill();
      ctx.globalAlpha = 0.6 * (1 - t * 0.5);
      ctx.strokeStyle = p.color;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(p.x, cy, R, a0, a1, p.swingDir < 0);
      ctx.stroke();
      ctx.restore();
    }

    drawMarker(ctx, p) {
      if (p.inBush && p !== this.human) return;
      const x = p.x, y = p.y - p.r * 2.5 + Math.sin(this.time * 4 + p.slot) * 1.5;
      ctx.save();
      ctx.fillStyle = p.color;
      ctx.strokeStyle = INK;
      ctx.lineWidth = 2;
      ctx.lineJoin = 'round';
      if (p === this.human) {
        ctx.font = '15px "Lilita One", sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        U.roundRect(ctx, x - 17, y - 21, 34, 18, 6);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = '#fff';
        ctx.fillText('YOU', x, y - 11.5);
        ctx.fillStyle = p.color;
      }
      ctx.beginPath();
      ctx.moveTo(x - 6, y - 2);
      ctx.lineTo(x + 6, y - 2);
      ctx.lineTo(x, y + 6);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      // dash cooldown pip for the player
      if (p === this.human && p.dashCd > 0) {
        const cd = p.powerup === 'turbo' ? TUNE.dashCooldown * 0.5 : TUNE.dashCooldown;
        ctx.strokeStyle = 'rgba(255,255,255,0.85)';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(p.x, p.y + p.r * 0.75, p.r * 1.25, Math.PI * 0.15, Math.PI * 0.15 + (Math.PI * 0.7) * (1 - p.dashCd / cd));
        ctx.stroke();
      }
      ctx.restore();
    }

    drawAimGuide(ctx, p) {
      const f = p.facing;
      const cx = p.x, cy = p.y - 8;
      ctx.save();
      // charge ring
      ctx.lineWidth = 5;
      ctx.strokeStyle = 'rgba(42,31,61,0.5)';
      ctx.beginPath();
      ctx.arc(cx, cy, p.r * 1.75, 0, TAU);
      ctx.stroke();
      const full = p.aimCharge >= 1;
      ctx.strokeStyle = full && Math.floor(this.time * 12) % 2 ? '#ffffff' : p.color;
      ctx.beginPath();
      ctx.arc(cx, cy, p.r * 1.75, -Math.PI / 2, -Math.PI / 2 + TAU * p.aimCharge);
      ctx.stroke();
      if (BB.Settings.data.aimGuide) {
        const range = BB.throwRange(p.aimCharge);
        let end = range;
        for (let s = p.r; s <= range; s += 6) {
          if (this.arena.solidAt(cx + Math.cos(f) * s, p.y + Math.sin(f) * s, 4)) { end = s; break; }
        }
        ctx.lineCap = 'round';
        const dots = Math.floor((end - p.r - 10) / 14);
        for (let i = 0; i <= dots; i++) {
          const s = p.r + 14 + i * 14;
          const x = cx + Math.cos(f) * s, y = cy + Math.sin(f) * s;
          ctx.fillStyle = INK;
          U.ellipse(ctx, x, y, 4.5, 4.5);
          ctx.fill();
          ctx.fillStyle = '#fff';
          U.ellipse(ctx, x, y, 2.8, 2.8);
          ctx.fill();
        }
        const ex = cx + Math.cos(f) * end, ey = cy + Math.sin(f) * end;
        ctx.strokeStyle = INK;
        ctx.lineWidth = 5;
        ctx.beginPath();
        ctx.arc(ex, ey, 10, 0, TAU);
        ctx.stroke();
        ctx.strokeStyle = p.color;
        ctx.lineWidth = 3;
        ctx.stroke();
      }
      ctx.restore();
    }

    drawCrosshair(ctx, p) {
      const { x, y } = BB.Input.mouse;
      ctx.save();
      ctx.lineCap = 'round';
      for (const [col, w] of [[INK, 5], [p.alive ? p.color : '#ffffff', 2.5]]) {
        ctx.strokeStyle = col;
        ctx.lineWidth = w;
        ctx.beginPath();
        ctx.arc(x, y, 9, 0, TAU);
        ctx.moveTo(x - 15, y); ctx.lineTo(x - 11, y);
        ctx.moveTo(x + 11, y); ctx.lineTo(x + 15, y);
        ctx.moveTo(x, y - 15); ctx.lineTo(x, y - 11);
        ctx.moveTo(x, y + 11); ctx.lineTo(x, y + 15);
        ctx.stroke();
      }
      ctx.restore();
    }

    bigText(ctx, text, y, size, color, scale = 1, alpha = 1) {
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.translate(BB.W / 2, y);
      ctx.scale(scale, scale);
      ctx.rotate(-0.04);
      ctx.font = `${size}px "Lilita One", sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.lineJoin = 'round';
      ctx.fillStyle = INK;
      ctx.fillText(text, 4, size * 0.09);
      ctx.lineWidth = size * 0.12;
      ctx.strokeStyle = INK;
      ctx.strokeText(text, 0, 0);
      ctx.fillStyle = color;
      ctx.fillText(text, 0, 0);
      ctx.restore();
    }

    drawOverlayText(ctx) {
      if (this.phase === 'countdown') {
        const step = Math.min(2, Math.floor(this.phaseT / COUNT_STEP));
        const local = (this.phaseT - step * COUNT_STEP) / COUNT_STEP;
        const s = U.easeOutBack(Math.min(1, local * 3));
        if (step === 0 && this.round > 0) this.bigText(ctx, 'Round ' + this.round, BB.H / 2 - 110, 44, '#ffffff', 1, 1);
        this.bigText(ctx, String(3 - step), BB.H / 2, 140, '#ffd23f', s, 1 - Math.max(0, local - 0.7) * 2);
      } else if (this.phase === 'playing' && this.fightT > 0) {
        const k = 1 - this.fightT / 0.8;
        this.bigText(ctx, 'FIGHT!', BB.H / 2, 130, '#ff6fa5', U.easeOutBack(Math.min(1, k * 4)), Math.min(1, this.fightT * 3));
      } else if (this.phase === 'roundEnd') {
        const k = Math.min(1, this.endT * 3);
        const alive = this.players.filter((p) => p.alive);
        const label = this.timeUp ? 'TIME!' : alive.length === 1 ? alive[0].name + ' survives!' : 'Total wipeout!';
        this.bigText(ctx, label, BB.H / 2 - 40, 72, '#ffd23f', U.easeOutBack(k), k);
      }
      if (this.phase === 'playing' && this.roundTime > ROUND_TIME - 15) {
        const left = Math.ceil(ROUND_TIME - this.roundTime);
        this.bigText(ctx, '0:' + String(left).padStart(2, '0'), 112, 34, left <= 5 ? '#ff4d4d' : '#ffffff');
      }
    }
  }

  BB.Game = Game;
})();
