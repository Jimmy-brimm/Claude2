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

  BB.TEAMS = [
    { name: 'Red Team', colors: ['#ff4d4d', '#ff8a5c'] },
    { name: 'Blue Team', colors: ['#3d8bff', '#46c8f0'] },
  ];

  class Game {
    constructor(cfg, hooks) {
      this.cfg = Object.assign({ mode: 'ffa', win: 'kills', spawnRate: 1, friendlyFire: false, enabledPowerups: BB.POWERUP_TYPES }, cfg);
      this.hooks = hooks || {};
      this.demo = !!cfg.demo;
      this.teams = this.cfg.mode === 'teams';
      // team play always scores the last team standing
      this.scoring = this.teams ? 'last' : this.cfg.win;
      this.players = this.cfg.players.map((pc) => new BB.Player(pc.slot, pc));
      this.human = this.players.find((p) => !p.isBot) || null;
      this.teamScore = [0, 0];
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
      this.tiebreak = null;
      this.nextTiebreak = null;
    }

    get audible() {
      return !this.demo;
    }

    isAlly(a, b) {
      return this.teams && a && b && a !== b && a.team === b.team;
    }

    // Can `attacker` hurt `victim`? (self-harm is decided by each caller)
    canHarm(attacker, victim) {
      if (!attacker || !victim) return true;
      if (victim.isDecoy) return victim.owner !== attacker;
      if (this.isAlly(attacker, victim)) return !!this.cfg.friendlyFire;
      return true;
    }

    // Everything that can be sliced: fighters still in the round plus decoys.
    bodies() {
      const out = [];
      for (const p of this.players) if (p.alive && !p.benched) out.push(p);
      for (const d of this.decoys) if (d.alive) out.push(d);
      return out;
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
      this.hazards = [];
      this.decoys = [];
      this.particles = new BB.Particles();
      this.stainCtx.clearRect(0, 0, BB.W, BB.H);
      this.tiebreak = this.nextTiebreak;
      this.nextTiebreak = null;
      const order = U.shuffle([0, 1, 2, 3]);
      this.players.forEach((p, i) => {
        const s = this.arena.spawns[order[i]];
        p.reset(s.x, s.y, Math.atan2(BB.H / 2 - s.y, BB.W / 2 - s.x));
        if (this.tiebreak && !this.tiebreak.includes(p)) {
          p.alive = false;
          p.benched = true;
        }
      });
      this.phase = 'countdown';
      this.phaseT = 0;
      this.countShown = -1;
      this.roundTime = 0;
      this.fightT = 0;
      this.puTimer = this.nextPowerupDelay() * 0.6;
      this.endT = 0;
      this.timeUp = false;
      this.slowmoT = 0;
      this.hitstop = 0;
      this.roundPoints = new Map();
      this.roundTeamPoint = null;
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
        aimPoint: { x: I.mouse.x, y: I.mouse.y },
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
      for (const d of this.decoys) {
        if (d.alive) d.update(this, d.brain.think(this, dt), dt);
      }
      this.decoys = this.decoys.filter((d) => d.alive);
      this.separateBodies();
      this.resolveMelee();
      for (const r of this.rangs) this.updateRang(r, dt);
      this.resolveRangClashes();
      this.rangs = this.rangs.filter((r) => !r.dead);
      for (const p of this.players) {
        p.recalling = p.pullHeld && this.rangs.some((r) => r.owner === p && r.state === 'recall');
        p.steering = p.pullHeld && this.rangs.some((r) => r.owner === p && r.state === 'tk');
      }
      this.updateHazards(dt);
      this.updatePowerups(dt);
      for (const h of this.halves) h.update(dt, this.arena);
      this.halves = this.halves.filter((h) => !h.dead);
      this.particles.update(dt);
      for (const f of this.flashes) f.t += dt;
      this.flashes = this.flashes.filter((f) => f.t < f.life);

      if (this.phase === 'playing') {
        if (this.roundOver()) this.endRound();
      } else if (this.phase === 'roundEnd') {
        this.endT += dt;
        if (this.endT >= 1.7) this.finishRound();
      }
    }

    roundOver() {
      const alive = this.players.filter((p) => p.alive && !p.benched);
      if (this.teams) return new Set(alive.map((p) => p.team)).size <= 1;
      return alive.length <= 1;
    }

    endRound() {
      if (this.phase !== 'playing') return;
      this.phase = 'roundEnd';
      this.endT = 0;
      const alive = this.players.filter((p) => p.alive && !p.benched);
      for (const p of alive) {
        p.aiming = false;
        p.stats.survived++;
      }
      if (this.scoring === 'last' && !this.timeUp) {
        if (this.teams) {
          if (alive.length) {
            const t = alive[0].team;
            this.teamScore[t]++;
            this.roundTeamPoint = t;
            for (const p of alive) this.particles.text(p.x, p.y - 46, '+1', p.color, 30);
          }
        } else if (alive.length === 1) {
          this.adjustScore(alive[0], 1);
        }
      }
      if (this.hooks.onChange) this.hooks.onChange(this);
    }

    finishRound() {
      if (this.demo) {
        for (const p of this.players) { p.score = 0; p.powerups = []; p.shield = false; }
        this.startRound();
        return;
      }
      if (!this.teams && this.scoring === 'kills') {
        const max = Math.max(...this.players.map((p) => p.score));
        const top = this.players.filter((p) => p.score === max);
        this.nextTiebreak = max >= this.cfg.pointsToWin && top.length > 1 ? top : null;
      }
      this.phase = 'results';
      if (this.hooks.onRoundEnd) this.hooks.onRoundEnd(this);
    }

    // { team, name, color, members } for teams, or the winning Player.
    matchWinner() {
      const goal = this.cfg.pointsToWin;
      if (this.teams) {
        for (const t of [0, 1]) {
          if (this.teamScore[t] >= goal) {
            return { team: t, name: BB.TEAMS[t].name, color: BB.TEAMS[t].colors[0], members: this.players.filter((p) => p.team === t) };
          }
        }
        return null;
      }
      const max = Math.max(...this.players.map((p) => p.score));
      if (max < goal) return null;
      const top = this.players.filter((p) => p.score === max);
      return top.length === 1 ? top[0] : null;
    }

    adjustScore(p, delta) {
      const next = Math.max(0, p.score + delta);
      const d = next - p.score;
      p.score = next;
      if (d) this.roundPoints.set(p, (this.roundPoints.get(p) || 0) + d);
      if (delta > 0) {
        this.particles.text(p.x, p.y - 46, '+1', p.color, 30);
        if (this.audible) setTimeout(() => BB.Audio.play('point'), 120);
      } else if (delta < 0) {
        this.particles.text(p.x, p.y - 46, '-1', '#ff4d4d', 30);
      }
    }

    // ------------------------------------------------------------------------
    // Boomerangs

    throwRang(p, cmd) {
      const power = BB.throwPower(p.aimCharge);
      const n = p.has('multi') ? (p.has('explosive') || p.has('fire') ? 4 : 5) : 1;
      const group = { remaining: n, hit: false, size: n };
      // sideways movement at the moment of release curves the throw
      let curve = 0;
      const ml = Math.hypot(cmd.mx, cmd.my);
      if (ml > 0.2) {
        const ax = Math.cos(p.facing), ay = Math.sin(p.facing);
        curve = ((ax * cmd.my - ay * cmd.mx) / ml) * TUNE.curve;
      }
      for (let i = 0; i < n; i++) {
        const ang = p.facing + (i - (n - 1) / 2) * 0.2;
        let x = p.x + Math.cos(ang) * (p.r + 4), y = p.y + Math.sin(ang) * (p.r + 4);
        if (this.arena.solidAt(x, y, 4)) { x = p.x; y = p.y; }
        this.rangs.push(new BB.Rang(p, group, x, y, ang, power, curve));
      }
      p.held--;
      p.stats.throws++;
      p.squash = -0.15;
      if (this.audible) BB.Audio.play('throw');
    }

    updateRang(r, dt) {
      const arena = this.arena;
      const o = r.owner;
      r.t += dt;
      r.clashT = Math.max(0, r.clashT - dt);
      if (r.ignoreT > 0) r.ignoreT -= dt;

      // holding throw empty-handed: steer (telekinesis) or recall
      const pulling = o.pullHeld && o.alive && !o.falling;
      if (pulling) {
        if (o.has('telekinesis') && o.aimPoint && (r.state === 'out' || r.state === 'return' || r.state === 'tk')) r.state = 'tk';
        else if (r.state === 'dropped') r.state = 'recall';
      } else if (r.state === 'tk') {
        r.state = 'return';
        r.retT = 0.3;
      } else if (r.state === 'recall') {
        r.state = 'dropped';
        r.vx *= 0.2;
        r.vy *= 0.2;
      }

      if (r.state === 'out') {
        if (r.curve) {
          const a = Math.atan2(r.dirY, r.dirX) + r.curve * dt;
          r.dirX = Math.cos(a);
          r.dirY = Math.sin(a);
        }
        const sp = Math.max(0, r.speed0 * (1 - r.t / r.outTime));
        r.vx = r.dirX * sp;
        r.vy = r.dirY * sp;
        if (r.t >= r.outTime) {
          if (r.explosive && !r.exploded) this.explode(r);
          r.state = 'return';
          r.retT = 0;
        }
      } else if (r.state === 'return') {
        r.retT += dt;
        if (!o.alive || o.falling) {
          this.dropRang(r, r.vx * 0.25, r.vy * 0.25);
        } else {
          const dx = o.x - r.x, dy = o.y - r.y;
          const l = Math.hypot(dx, dy) || 1;
          const sp = Math.min(TUNE.rangReturnMax, 260 + r.retT * 1250);
          r.vx = (dx / l) * sp;
          r.vy = (dy / l) * sp;
        }
      } else if (r.state === 'tk') {
        let tx = o.aimPoint.x, ty = o.aimPoint.y;
        const ox = tx - o.x, oy = ty - o.y;
        const od = Math.hypot(ox, oy);
        if (od > TUNE.tkRadius) { tx = o.x + (ox / od) * TUNE.tkRadius; ty = o.y + (oy / od) * TUNE.tkRadius; }
        const dx = tx - r.x, dy = ty - r.y;
        const d = Math.hypot(dx, dy) || 1;
        const sp = Math.min(TUNE.tkSpeed, d * 8);
        r.vx = (dx / d) * sp;
        r.vy = (dy / d) * sp;
      } else if (r.state === 'recall') {
        const dx = o.x - r.x, dy = o.y - r.y;
        const l = Math.hypot(dx, dy) || 1;
        r.vx = (dx / l) * TUNE.recallSpeed;
        r.vy = (dy / l) * TUNE.recallSpeed;
      } else if (r.state === 'dropped') {
        const f = Math.exp(-6 * dt);
        r.vx *= f;
        r.vy *= f;
      }

      if (r.flying) {
        r.spin += dt * (r.state === 'recall' ? 14 : 24);
        r.trail.push({ x: r.x, y: r.y - 14 });
        if (r.trail.length > 7) r.trail.shift();
      } else {
        r.trail.length = 0;
      }

      // move in small steps so fast boomerangs never tunnel through walls;
      // a recalled boomerang floats back over everything
      const dist = Math.hypot(r.vx, r.vy) * dt;
      const n = Math.max(1, Math.ceil(dist / 6));
      for (let i = 0; i < n && !r.dead; i++) {
        r.x += (r.vx * dt) / n;
        r.y += (r.vy * dt) / n;
        if (r.state === 'recall') continue;
        const hit = arena.collideCircle(r, r.r * 0.7);
        if (hit) {
          this.rangHitWall(r, hit);
          break;
        }
      }
      if (r.dead) return;

      if (r.state === 'dropped' && arena.isPitAt(r.x, r.y)) {
        this.loseRang(r);
        this.splash(r.x, r.y, 0.5);
        return;
      }

      if (r.flying && (r.fire || r.ice)) {
        r.trailDist += dist;
        if (r.trailDist >= 22) {
          r.trailDist = 0;
          if (!arena.isPitAt(r.x, r.y) && !arena.solidAt(r.x, r.y)) {
            this.hazards.push({ type: r.fire ? 'fire' : 'ice', x: r.x, y: r.y, r: r.fire ? 17 : 22, t: 0, life: r.fire ? 3.2 : 6, owner: o, seed: Math.random() * 10 });
          }
        }
      }

      if (r.flying) {
        for (const b of this.bodies()) {
          if (!r.canHurt(b, this) || (r.ignoreT > 0 && r.ignore === b)) continue;
          if (Math.hypot(b.x - r.x, b.y - 4 - r.y) < b.r + r.r * 0.8) {
            this.rangHitBody(r, b);
            if (r.dead || !r.flying) return;
          }
        }
      }

      if (o.alive && !o.falling) {
        const d = Math.hypot(o.x - r.x, o.y - r.y);
        if ((r.state === 'return' || r.state === 'recall') && d < o.r + r.r + 8) this.catchRang(r, true);
        else if (r.state === 'dropped' && d < o.r + r.r + 10) this.catchRang(r, false);
      }
    }

    catchRang(r, caught) {
      const o = r.owner;
      r.dead = true;
      r.group.remaining--;
      if (r.group.remaining <= 0) {
        o.held = Math.min(o.maxRangs, o.held + 1);
        if (o.pullHeld) o.aimBlock = true;
        o.squash = 0.12;
        if (this.audible) BB.Audio.play(caught ? 'catch' : 'pickup');
        if (!caught) this.particles.ring(o.x, o.y, '#ffffff', 22);
      } else if (this.audible) {
        BB.Audio.play('pickup');
      }
    }

    // A piece that falls into a pit is gone; once the whole throw is accounted for it reappears in hand.
    loseRang(r) {
      r.dead = true;
      r.group.remaining--;
      if (r.group.remaining <= 0) r.owner.respawnQueue.push(1.0);
    }

    dropRang(r, vx, vy) {
      r.state = 'dropped';
      r.vx = vx;
      r.vy = vy;
    }

    rangHitWall(r, hit) {
      const vn = r.vx * hit.nx + r.vy * hit.ny;
      const bx = (r.vx - 2 * vn * hit.nx) * 0.3, by = (r.vy - 2 * vn * hit.ny) * 0.3;
      if (!r.flying) {
        if (vn < 0) { r.vx = bx; r.vy = by; }
        return;
      }
      if (r.explosive && !r.exploded) this.explode(r);
      this.particles.burst(r.x, r.y, 6, { color: ['#fff', '#ffe08a'], speed: 220, size: 3, type: 'spark', life: 0.25 });
      if (this.audible) BB.Audio.play('thud');
      // hitting anything solid knocks the boomerang to the floor
      this.dropRang(r, bx, by);
    }

    rangHitBody(r, b) {
      const o = r.owner;
      const ang = Math.atan2(r.vy, r.vx);
      if (b.shield) {
        this.popShield(b, o);
        const nx = r.x - b.x, ny = r.y - b.y;
        const l = Math.hypot(nx, ny) || 1;
        b.vx -= (nx / l) * 260;
        b.vy -= (ny / l) * 260;
        if (r.explosive && !r.exploded) this.explode(r, b);
        this.dropRang(r, (nx / l) * 220, (ny / l) * 220);
        return;
      }
      if (!r.group.hit && !b.isDecoy) {
        r.group.hit = true;
        o.stats.throwHits++;
      }
      if (r.explosive && !r.exploded) {
        this.explode(r);
        if (b.alive) this.kill(b, o, ang, 'explode');
        return;
      }
      this.kill(b, o, ang, 'throw', { dist: Math.hypot(b.x - r.startX, b.y - r.startY) });
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
            if (r.explosive && !r.exploded) this.explode(r);
            r.clashT = 0.25;
            this.dropRang(r, sx * 220, sy * 220);
          }
          break;
        }
      }
    }

    teleport(p) {
      const r = this.rangs.filter((x) => x.owner === p && !x.dead).sort((a, b) => a.id - b.id)[0];
      if (!r) return false;
      if (this.arena.isPitAt(r.x, r.y) || this.arena.solidAt(r.x, r.y, 6)) return false;
      this.particles.burst(p.x, p.y - 8, 14, { color: ['#b05cff', '#e3c4ff', '#fff'], speed: 200, size: 5, life: 0.45 });
      p.x = r.x;
      p.y = r.y;
      p.vx = p.vy = 0;
      this.arena.collideCircle(p, p.r);
      p.disguised = false;
      if (r.explosive && !r.exploded) r.exploded = true; // warping to it defuses the blast
      this.particles.burst(p.x, p.y - 8, 14, { color: ['#b05cff', '#e3c4ff', '#fff'], speed: 200, size: 5, life: 0.45 });
      this.particles.ring(p.x, p.y, '#b05cff', 30);
      this.catchRang(r, true);
      if (this.audible) BB.Audio.play('dash');
      return true;
    }

    spawnDecoy(p, dx, dy) {
      const d = new BB.Player(p.slot, { char: p.charIndex, name: p.name, isBot: true, difficulty: 'easy', isDecoy: true, team: p.team, color: p.color });
      d.owner = p;
      d.reset(p.x, p.y, p.facing);
      d.held = Math.max(1, p.held);
      d.brain.decoyDir = { x: -dy, y: dx };
      this.decoys.push(d);
      this.particles.burst(p.x, p.y - 8, 10, { color: 'rgba(255,255,255,0.9)', speed: 140, size: 7, type: 'smoke', life: 0.4 });
    }

    // ------------------------------------------------------------------------
    // Combat

    resolveMelee() {
      const hits = [];
      const bodies = this.bodies();
      for (const p of bodies) {
        if (p.falling || p.meleeT <= 0 || p.isDecoy) continue;
        const reach = p.meleeReach;
        // swat boomerangs out of the air
        for (const r of this.rangs) {
          if (!r.flying || r.clashT > 0 || r.owner === p) continue;
          const dx = r.x - p.x, dy = r.y - p.y;
          const d = Math.hypot(dx, dy);
          if (d > reach + r.r + 8) continue;
          if (Math.abs(U.angDiff(p.facing, Math.atan2(dy, dx))) > TUNE.meleeArc + 0.25) continue;
          r.clashT = 0.2;
          this.dropRang(r, Math.cos(p.facing) * 320, Math.sin(p.facing) * 320);
          p.stats.deflects++;
          this.particles.burst(r.x, r.y, 14, { color: ['#fff', '#ffd23f', p.color], speed: 360, size: 3, type: 'spark', life: 0.3 });
          this.flashes.push({ x: r.x, y: r.y, t: 0, life: 0.15, r: 34 });
          this.hitstop = Math.max(this.hitstop, 0.05);
          if (this.audible) BB.Audio.play('clang');
        }
        // slash fighters
        for (const q of bodies) {
          if (q === p || q.falling || p.meleeHits.has(q)) continue;
          if (!this.canHarm(p, q)) continue;
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
        if (!q.alive) continue;
        const mutual = hits.some(([a, b]) => a === q && b === p);
        const ang = Math.atan2(q.y - p.y, q.x - p.x);
        if (mutual) {
          // simultaneous slashes clang off each other
          if (p.slot < q.slot || q.isDecoy) {
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
        this.kill(q, p, ang, 'melee');
      }
    }

    popShield(p, by) {
      p.shield = false;
      p.flash = 0.2;
      p.fireGrace = 0.6;
      p.lastHitBy = by;
      p.lastHitT = this.time;
      this.particles.ring(p.x, p.y - 6, '#2ec4b6', p.r * 2);
      this.particles.burst(p.x, p.y - 6, 14, { color: ['#2ec4b6', '#bff5ef', '#fff'], speed: 240, size: 4, life: 0.5 });
      this.hitstop = Math.max(this.hitstop, 0.05);
      if (this.audible) BB.Audio.play('shield');
      if (this.hooks.onChange) this.hooks.onChange(this);
    }

    explode(r, spare) {
      r.exploded = true;
      const x = r.x, y = r.y, killer = r.owner;
      const R = 95 * (r.ice ? 1.35 : 1) * (r.group.size > 1 ? 0.7 : 1);
      const icy = r.ice;
      this.flashes.push({ x, y, t: 0, life: 0.3, r: R, boom: true, icy });
      const colors = icy ? ['#bff0ff', '#5fd0ff', '#ffffff'] : ['#ffd23f', '#ff8a3d', '#ff5a36', '#fff'];
      this.particles.burst(x, y, 26, { color: colors, speed: 420 * (R / 95), size: 5, life: 0.6 });
      this.particles.burst(x, y, 12, { color: icy ? 'rgba(220,245,255,0.7)' : 'rgba(80,70,90,0.55)', speed: 120, size: 16, type: 'smoke', life: 0.9, drag: 3 });
      this.particles.ring(x, y, icy ? '#bff0ff' : '#ffd23f', R * 0.8, 0.4);
      const g = this.stainCtx.createRadialGradient(x, y, 0, x, y, R * 0.7);
      g.addColorStop(0, icy ? 'rgba(190,235,255,0.5)' : 'rgba(40,25,30,0.45)');
      g.addColorStop(1, 'rgba(40,25,30,0)');
      this.stainCtx.fillStyle = g;
      this.stainCtx.beginPath();
      this.stainCtx.arc(x, y, R * 0.7, 0, TAU);
      this.stainCtx.fill();
      this.shake = Math.max(this.shake, 16);
      this.hitstop = Math.max(this.hitstop, 0.06);
      if (this.audible) BB.Audio.play('explode');
      for (const p of this.bodies()) {
        if (p.falling || p === spare) continue;
        if (p !== killer && !this.canHarm(killer, p)) continue;
        if (Math.hypot(p.x - x, p.y - y) >= R + p.r * 0.5) continue;
        const ang = Math.atan2(p.y - y, p.x - x);
        if (p.shield) {
          this.popShield(p, killer);
          p.vx = Math.cos(ang) * 420;
          p.vy = Math.sin(ang) * 420;
        } else {
          this.kill(p, killer, ang, 'explode', { icy });
        }
      }
    }

    kill(victim, killer, ang, cause, extra = {}) {
      if (!victim.alive) return;
      victim.alive = false;
      victim.aiming = false;
      victim.disguised = false;
      victim.burning = 0;
      if (victim.isDecoy) {
        this.particles.burst(victim.x, victim.y - 8, 16, { color: 'rgba(255,255,255,0.95)', speed: 200, size: 9, type: 'smoke', life: 0.6 });
        this.particles.text(victim.x, victim.y - 40, 'Decoy!', '#ffffff', 20);
        if (this.audible) BB.Audio.play('swing');
        return;
      }
      const ch = victim.char;
      const burnt = cause === 'burn';
      this.halves.push(new BB.Half(victim, -1, ang, ang, burnt), new BB.Half(victim, 1, ang, ang, burnt));
      const juice = extra.icy ? ['#ffffff', '#bff0ff', '#5fd0ff'] : burnt ? ['#3a2a2a', '#ff6a1c', '#ffd23f'] : [ch.juice, ch.inside, U.shade(ch.juice, -0.2)];
      this.particles.burst(victim.x, victim.y - 6, 22, { color: juice, speed: 330, size: 5, life: 0.6, angle: ang, spread: 1.1 });
      this.particles.burst(victim.x, victim.y - 6, 8, { color: '#ffffff', speed: 500, size: 3, type: 'spark', life: 0.25 });
      this.flashes.push({ x: victim.x, y: victim.y, t: 0, life: 0.12, r: 46 });
      this.splat(victim.x, victim.y, ang, burnt ? '#3a2a2a' : ch.juice);
      this.shake = Math.max(this.shake, 9);
      this.hitstop = Math.max(this.hitstop, 0.07);
      if (this.audible) BB.Audio.play('slice');
      this.award(killer, victim, cause, extra);
    }

    killByFall(p) {
      if (!p.alive) return;
      p.alive = false;
      p.burning = 0;
      this.splash(p.x, p.y, 1);
      if (p.isDecoy) return;
      const by = p.lastHitBy && this.time - p.lastHitT < 2.5 ? p.lastHitBy : null;
      this.award(by, p, 'fall');
    }

    award(killer, victim, cause, extra = {}) {
      victim.stats.deaths++;
      const kills = this.scoring === 'kills';
      if (!killer) {
        if (cause === 'fall') victim.stats.falls++; // no penalty for falling on your own
      } else if (killer === victim) {
        victim.stats.suicides++;
        if (kills) this.adjustScore(victim, -1);
      } else if (this.isAlly(killer, victim)) {
        killer.stats.teamKills++;
        if (kills) this.adjustScore(killer, -1);
      } else {
        killer.stats.kills++;
        if (cause === 'throw') {
          killer.stats.throwKills++;
          killer.stats.longestKill = Math.max(killer.stats.longestKill, extra.dist || 0);
        } else if (cause === 'melee') {
          killer.stats.meleeKills++;
        } else {
          killer.stats.otherKills++;
        }
        if (kills) this.adjustScore(killer, 1);
        // tie-breaker: the first slice wins it
        if (this.tiebreak && kills && this.phase === 'playing') {
          this.slowmoT = 1.0;
          this.endRound();
        }
      }
      if (this.phase === 'playing' && this.roundOver()) this.slowmoT = 1.0;
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

    separateBodies() {
      const ps = this.bodies();
      for (let i = 0; i < ps.length; i++) {
        const a = ps[i];
        if (a.falling) continue;
        for (let j = i + 1; j < ps.length; j++) {
          const b = ps[j];
          if (b.falling) continue;
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

    // ------------------------------------------------------------------------
    // Fire / ice trails

    onIce(x, y) {
      for (const h of this.hazards) if (h.type === 'ice' && Math.hypot(h.x - x, h.y - y) < h.r) return true;
      return false;
    }

    ignite(b, by) {
      if (b.burning > 0 || !b.alive || b.falling || b === by) return;
      if (!this.canHarm(by, b)) return;
      if (b.fireGrace > 0) return;
      if (b.shield) {
        this.popShield(b, by);
        return;
      }
      b.burning = 2.2;
      b.burnBy = by;
      b.disguised = false;
      if (this.audible) BB.Audio.play('ignite');
    }

    updateHazards(dt) {
      for (const h of this.hazards) h.t += dt;
      this.hazards = this.hazards.filter((h) => h.t < h.life);
      const bodies = this.bodies();
      for (const b of bodies) {
        if (b.fireGrace > 0) b.fireGrace -= dt;
        if (b.falling) continue;
        for (const h of this.hazards) {
          if (h.type !== 'fire' || h.t > h.life - 0.2) continue;
          if (Math.hypot(h.x - b.x, h.y - b.y) < h.r + b.r * 0.5) this.ignite(b, h.owner);
        }
      }
      for (const b of bodies) {
        if (!(b.burning > 0) || !b.alive) continue;
        for (const q of bodies) {
          if (q !== b && Math.hypot(q.x - b.x, q.y - b.y) < q.r + b.r + 2) this.ignite(q, b.burnBy);
        }
        b.burning -= dt;
        if (b.burning <= 0) this.kill(b, b.burnBy, U.rand(0, TAU), 'burn');
      }
    }

    // ------------------------------------------------------------------------
    // Power-ups: blue books spawn on the floor and grant a random power-up

    nextPowerupDelay() {
      const rate = this.cfg.spawnRate;
      return rate > 0 ? U.rand(8, 12) / rate : Infinity;
    }

    updatePowerupSpawns(dt) {
      if (!(this.cfg.spawnRate > 0) || !this.cfg.enabledPowerups.length) return;
      this.puTimer -= dt;
      if (this.puTimer > 0) return;
      this.puTimer = this.nextPowerupDelay();
      if (this.powerups.length >= 3) return;
      const pt = this.arena.randomFloorPoint((q) =>
        this.players.every((p) => !p.alive || Math.hypot(p.x - q.x, p.y - q.y) > 140) &&
        this.powerups.every((u) => Math.hypot(u.x - q.x, u.y - q.y) > 120));
      if (!pt) return;
      this.powerups.push(new BB.PowerUp(pt.x, pt.y));
      this.particles.ring(pt.x, pt.y - 10, '#4f9bff', 30);
      if (this.audible) BB.Audio.play('spawnpu');
    }

    updatePowerups(dt) {
      for (const u of this.powerups) {
        u.t += dt;
        for (const p of this.players) {
          if (!p.alive || p.falling || p.benched) continue;
          if (Math.hypot(p.x - u.x, p.y - u.y) > p.r + 18) continue;
          const options = this.cfg.enabledPowerups.filter((t) => (t === 'shield' ? !p.shield : !p.has(t)));
          if (!options.length) continue;
          const type = U.choice(options);
          u.dead = true;
          p.addPowerup(type);
          p.stats.powerups++;
          const def = BB.POWERUPS[type];
          this.particles.text(p.x, p.y - 50, def.name + '!', def.color, 22);
          this.particles.burst(u.x, u.y - 10, 14, { color: [def.color, '#4f9bff', '#fff'], speed: 200, size: 4, life: 0.5 });
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
      this.drawHazards(ctx);

      for (const r of this.rangs) if (!r.flying) r.draw(ctx);
      for (const u of this.powerups) u.draw(ctx, this.time);

      const sorted = [];
      for (const p of this.bodies()) sorted.push({ y: p.y, k: 0, o: p });
      for (const pr of arena.props) sorted.push({ y: pr.y + 4, k: 1, o: pr });
      for (const h of this.halves) sorted.push({ y: h.y, k: 2, o: h });
      sorted.sort((a, b) => a.y - b.y);
      for (const s of sorted) {
        if (s.k === 0) s.o.draw(ctx, this);
        else if (s.k === 1) arena.drawProp(ctx, s.o);
        else s.o.draw(ctx);
      }

      for (const p of this.bodies()) if (p.meleeT > 0) this.drawSwoosh(ctx, p);
      for (const r of this.rangs) if (r.flying) r.draw(ctx);

      arena.drawBushes(ctx);

      const h = this.human;
      if (h && h.alive && h.hidden && !this.demo) {
        ctx.save();
        ctx.globalAlpha = 0.5;
        BB.drawCharacter(ctx, h.char, h.x, h.y, h.r, { facing: h.facing, time: this.time, moving: h.moving, walkPhase: h.walkPhase, ring: h.color, noShadow: true });
        ctx.restore();
      }

      this.particles.draw(ctx);
      for (const f of this.flashes) {
        const k = 1 - f.t / f.life;
        ctx.globalAlpha = k * (f.boom ? 0.85 : 0.9);
        ctx.fillStyle = f.icy ? '#e6f9ff' : f.boom ? '#fff4c2' : '#ffffff';
        U.ellipse(ctx, f.x, f.y, f.r * (1.2 - k * 0.4), f.r * (1.2 - k * 0.4));
        ctx.fill();
      }
      ctx.globalAlpha = 1;

      if (!this.demo) {
        for (const p of this.bodies()) if (!p.falling) this.drawMarker(ctx, p);
        if (h && h.alive && h.aiming) this.drawAimGuide(ctx, h);
        if (h && h.alive && h.steering) this.drawTkRadius(ctx, h);
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

    drawHazards(ctx) {
      for (const hz of this.hazards) {
        const fadeIn = Math.min(1, hz.t / 0.15);
        const fadeOut = Math.min(1, (hz.life - hz.t) / 0.5);
        const a = fadeIn * fadeOut;
        if (hz.type === 'ice') {
          ctx.globalAlpha = a * 0.85;
          ctx.fillStyle = '#c9efff';
          U.ellipse(ctx, hz.x, hz.y, hz.r, hz.r * 0.8);
          ctx.fill();
          ctx.globalAlpha = a;
          ctx.fillStyle = 'rgba(255,255,255,0.9)';
          U.ellipse(ctx, hz.x - hz.r * 0.3, hz.y - hz.r * 0.25, hz.r * 0.3, hz.r * 0.12, -0.5);
          ctx.fill();
        } else {
          const tt = this.time * 10 + hz.seed;
          ctx.globalAlpha = a * 0.35;
          ctx.fillStyle = '#3a2a2a';
          U.ellipse(ctx, hz.x, hz.y + 3, hz.r, hz.r * 0.6);
          ctx.fill();
          for (let i = 0; i < 3; i++) {
            const fx = hz.x + Math.sin(tt + i * 2.1) * 5 + (i - 1) * 7;
            const fh = hz.r * (0.9 + Math.sin(tt * 1.3 + i) * 0.25) * a;
            ctx.globalAlpha = a;
            ctx.fillStyle = '#ff5a1c';
            ctx.beginPath();
            ctx.moveTo(fx - 6, hz.y + 2);
            ctx.quadraticCurveTo(fx - 7, hz.y - fh * 0.6, fx, hz.y - fh);
            ctx.quadraticCurveTo(fx + 7, hz.y - fh * 0.6, fx + 6, hz.y + 2);
            ctx.closePath();
            ctx.fill();
            ctx.fillStyle = '#ffd23f';
            U.ellipse(ctx, fx, hz.y - fh * 0.25, 3, fh * 0.3);
            ctx.fill();
          }
        }
      }
      ctx.globalAlpha = 1;
    }

    drawSwoosh(ctx, p) {
      const t = 1 - p.meleeT / TUNE.meleeActive;
      const R = p.meleeReach + 4;
      const a0 = p.facing - p.swingDir * TUNE.meleeArc;
      const a1 = p.facing - p.swingDir * TUNE.meleeArc + p.swingDir * TUNE.meleeArc * 2 * U.easeOutCubic(t);
      const cy = p.y - 8;
      ctx.save();
      ctx.globalAlpha = 0.6 * (1 - t * 0.5);
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(p.x, cy, R, a0, a1, p.swingDir < 0);
      ctx.arc(p.x, cy, R * 0.62, a1, a0, p.swingDir > 0);
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
      const isHuman = p === this.human;
      if (p.hidden && !isHuman) return;
      const x = p.x, y = p.y - p.r * 2.5 + Math.sin(this.time * 4 + p.slot) * 1.5;
      ctx.save();
      ctx.fillStyle = p.color;
      ctx.strokeStyle = INK;
      ctx.lineWidth = 2;
      ctx.lineJoin = 'round';
      if (isHuman) {
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
      if (isHuman && p.dashCd > 0) {
        ctx.strokeStyle = 'rgba(255,255,255,0.85)';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(p.x, p.y + p.r * 0.75, p.r * 1.25, Math.PI * 0.15, Math.PI * 0.15 + Math.PI * 0.7 * (1 - p.dashCd / TUNE.dashCooldown));
        ctx.stroke();
      }
      ctx.restore();
    }

    drawAimGuide(ctx, p) {
      const f = p.facing;
      const cx = p.x, cy = p.y - 8;
      ctx.save();
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

    drawTkRadius(ctx, p) {
      ctx.save();
      ctx.setLineDash([8, 10]);
      ctx.strokeStyle = U.rgba('#ff6fa5', 0.6);
      ctx.lineWidth = 2;
      U.ellipse(ctx, p.x, p.y, TUNE.tkRadius, TUNE.tkRadius);
      ctx.stroke();
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
        if (this.tiebreak) {
          this.bigText(ctx, 'Tiebreaker!', BB.H / 2 - 130, 52, '#ff6fa5');
          this.bigText(ctx, 'First slice wins', BB.H / 2 - 82, 30, '#ffffff');
        } else if (step === 0) {
          this.bigText(ctx, 'Round ' + this.round, BB.H / 2 - 110, 44, '#ffffff');
        }
        this.bigText(ctx, String(3 - step), BB.H / 2, 140, '#ffd23f', s, 1 - Math.max(0, local - 0.7) * 2);
      } else if (this.phase === 'playing' && this.fightT > 0) {
        const k = 1 - this.fightT / 0.8;
        this.bigText(ctx, 'FIGHT!', BB.H / 2, 130, '#ff6fa5', U.easeOutBack(Math.min(1, k * 4)), Math.min(1, this.fightT * 3));
      } else if (this.phase === 'roundEnd') {
        const k = Math.min(1, this.endT * 3);
        const alive = this.players.filter((p) => p.alive && !p.benched);
        let label;
        if (this.timeUp) label = 'TIME!';
        else if (this.teams && alive.length) label = BB.TEAMS[alive[0].team].name + ' wins the round!';
        else if (alive.length === 1) label = alive[0].name + ' survives!';
        else if (alive.length > 1) label = 'Slice!';
        else label = 'Total wipeout!';
        this.bigText(ctx, label, BB.H / 2 - 40, 64, '#ffd23f', U.easeOutBack(k), k);
      }
      if (this.phase === 'playing' && this.roundTime > ROUND_TIME - 15) {
        const left = Math.ceil(ROUND_TIME - this.roundTime);
        this.bigText(ctx, '0:' + String(left).padStart(2, '0'), 112, 34, left <= 5 ? '#ff4d4d' : '#ffffff');
      }
    }
  }

  BB.Game = Game;
})();
