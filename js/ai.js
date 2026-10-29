// Bot opponents: grid path-finding plus a small reactive combat brain.
(function () {
  'use strict';
  const BB = window.BB;
  const U = BB.util;
  const T = BB.TILE;

  // aimHold: how long a bot visibly winds up before releasing a throw (seconds)
  // aimLag: how far behind a moving target the bot's aim trails (seconds of smoothing)
  // aggression: chance to dash-slash in even when the target is armed
  const DIFF = (BB.BOT_DIFFICULTY = {
    easy: {
      label: 'Easy', react: 0.7, aimErr: 0.55, aimLag: 0.5, lead: 0, dodge: 0.1, deflect: 0,
      throwCd: [3.5, 5.5], aimHold: [0.7, 1.1], speed: 0.78, detect: 60, chargeErr: 0.35, meleeWind: 0.55,
      kite: 120, jitter: 0.55, rushDash: 0.15, aggression: 0.1, maxRange: 340, recall: 0.4,
    },
    normal: {
      label: 'Normal', react: 0.34, aimErr: 0.28, aimLag: 0.3, lead: 0.3, dodge: 0.4, deflect: 0.1,
      throwCd: [2.2, 3.6], aimHold: [0.45, 0.75], speed: 0.93, detect: 100, chargeErr: 0.22, meleeWind: 0.2,
      kite: 120, jitter: 0.25, rushDash: 0.5, aggression: 0.3, maxRange: 420, recall: 0.7,
    },
    hard: {
      label: 'Hard', react: 0.2, aimErr: 0.15, aimLag: 0.18, lead: 0.6, dodge: 0.7, deflect: 0.25,
      throwCd: [1.5, 2.6], aimHold: [0.35, 0.55], speed: 1, detect: 150, chargeErr: 0.12, meleeWind: 0.1,
      kite: 110, jitter: 0.1, rushDash: 0.9, aggression: 0.55, maxRange: 480, recall: 0.9,
    },
  });

  // ---------------------------------------------------------------------------
  // A* over the tile grid. Costs steer bots away from pit edges and slippery floor.

  function navCosts(arena) {
    if (arena._nav) return arena._nav;
    const cost = [];
    for (let ty = 0; ty < BB.ROWS; ty++) {
      const row = [];
      for (let tx = 0; tx < BB.COLS; tx++) {
        if (!arena.isWalkable(tx, ty)) { row.push(Infinity); continue; }
        let c = 1;
        const t = arena.tile(tx, ty);
        if (t === '_') c += 1.5;
        for (const [ox, oy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          if (arena.tile(tx + ox, ty + oy) === '~') c += 2.5;
          if (arena.tile(tx + ox, ty + oy) === '#') c += 0.3;
        }
        row.push(c);
      }
      cost.push(row);
    }
    arena._nav = cost;
    return cost;
  }

  function nearestWalkable(arena, tx, ty) {
    if (arena.isWalkable(tx, ty)) return [tx, ty];
    for (let r = 1; r < 4; r++) {
      for (let oy = -r; oy <= r; oy++) {
        for (let ox = -r; ox <= r; ox++) {
          if (arena.isWalkable(tx + ox, ty + oy)) return [tx + ox, ty + oy];
        }
      }
    }
    return null;
  }

  BB.findPath = function (arena, sx, sy, gx, gy) {
    const cost = navCosts(arena);
    const s = nearestWalkable(arena, Math.floor(sx / T), Math.floor(sy / T));
    const g = nearestWalkable(arena, Math.floor(gx / T), Math.floor(gy / T));
    if (!s || !g) return null;
    const W = BB.COLS;
    const key = (x, y) => y * W + x;
    const gScore = new Map([[key(s[0], s[1]), 0]]);
    const came = new Map();
    const open = [{ x: s[0], y: s[1], f: 0 }];
    const closed = new Set();
    const h = (x, y) => Math.hypot(x - g[0], y - g[1]);
    while (open.length) {
      let bi = 0;
      for (let i = 1; i < open.length; i++) if (open[i].f < open[bi].f) bi = i;
      const cur = open.splice(bi, 1)[0];
      const ck = key(cur.x, cur.y);
      if (closed.has(ck)) continue;
      closed.add(ck);
      if (cur.x === g[0] && cur.y === g[1]) {
        const path = [];
        let k = ck;
        while (k !== key(s[0], s[1])) {
          path.push({ x: ((k % W) + 0.5) * T, y: (Math.floor(k / W) + 0.5) * T });
          k = came.get(k);
        }
        return path.reverse();
      }
      for (let oy = -1; oy <= 1; oy++) {
        for (let ox = -1; ox <= 1; ox++) {
          if (!ox && !oy) continue;
          const nx = cur.x + ox, ny = cur.y + oy;
          const c = nx >= 0 && ny >= 0 && nx < W && ny < BB.ROWS ? cost[ny][nx] : Infinity;
          if (c === Infinity) continue;
          if (ox && oy && (cost[cur.y][nx] === Infinity || cost[ny][cur.x] === Infinity)) continue;
          const nk = key(nx, ny);
          const ng = gScore.get(ck) + c * (ox && oy ? 1.414 : 1);
          if (ng < (gScore.has(nk) ? gScore.get(nk) : Infinity)) {
            gScore.set(nk, ng);
            came.set(nk, ck);
            open.push({ x: nx, y: ny, f: ng + h(nx, ny) });
          }
        }
      }
    }
    return null;
  };

  // ---------------------------------------------------------------------------

  class Bot {
    constructor(player, diff) {
      this.p = player;
      this.diff = DIFF[diff] ? diff : 'normal';
      this.d = DIFF[this.diff];
      this.reset();
    }

    reset() {
      this.path = null;
      this.pathGoal = null;
      this.repathT = 0;
      this.target = null;
      this.retargetT = 0;
      this.throwCd = U.rand(this.d.throwCd[0], this.d.throwCd[1]) * 0.5;
      this.aimT = 0;
      this.aimDur = 0;
      this.aimErr = 0;
      this.meleeWind = -1;
      this.react = null;
      this.handled = new Map();
      this.dodgeT = 0;
      this.dodge = { x: 0, y: 0 };
      this.pendingDeflect = null;
      this.queuedDash = null;
      this.stuckT = 0;
      this.stuckRef = null;
      this.unstickT = 0;
      this.unstick = { x: 0, y: 0 };
      this.strafe = U.choice([-1, 1]);
      this.strafeT = U.rand(0.8, 2.2);
      this.wander = null;
      this.jitterA = 0;
      this.wantsRecall = Math.random() < this.d.recall;
      this.decoyT = 0.8;
    }

    think(game, dt) {
      const p = this.p, d = this.d;
      const cmd = { mx: 0, my: 0, aim: p.facing, melee: false, aimHeld: false, dash: false };
      if (game.phase !== 'playing') {
        cmd.aim = Math.atan2(BB.H / 2 - p.y, BB.W / 2 - p.x);
        return cmd;
      }
      if (p.isDecoy) return this.decoyThink(game, dt, cmd);
      this.throwCd -= dt;
      this.retargetT -= dt;
      this.repathT -= dt;
      this.dodgeT -= dt;
      this.unstickT -= dt;
      this.strafeT -= dt;
      if (this.strafeT <= 0) { this.strafe = -this.strafe; this.strafeT = U.rand(0.7, 2.2); }
      this.jitterA += U.rand(-3, 3) * dt;

      const arena = game.arena;
      const enemies = game.bodies().filter((q) => q !== p && q.owner !== p && !game.isAlly(p, q) && game.canHarm(p, q));

      // --- react to incoming boomerangs -----------------------------------
      const threat = this.findThreat(game);
      const now = game.time;
      if (threat && (!this.handled.has(threat) || now - this.handled.get(threat) > 0.7)) {
        this.handled.set(threat, now);
        if (!this.react) this.react = { rang: threat, t: d.react * U.rand(0.7, 1.3) };
      }
      if (this.react) {
        this.react.t -= dt;
        if (this.react.t <= 0) {
          this.respond(game, this.react.rang);
          this.react = null;
        }
      }

      let move = null;

      if (this.pendingDeflect) {
        const r = this.pendingDeflect.rang;
        this.pendingDeflect.t -= dt;
        if (!r.flying || r.dead || this.pendingDeflect.t <= 0 || !p.hasRang) {
          this.pendingDeflect = null;
        } else {
          const dist = Math.hypot(r.x - p.x, r.y - p.y);
          cmd.aim = Math.atan2(r.y - p.y, r.x - p.x);
          if (dist < p.meleeReach + r.r + 12 && p.meleeCd <= 0) {
            cmd.melee = true;
            this.pendingDeflect = null;
          }
        }
      }

      if (this.queuedDash) {
        cmd.dash = true;
        cmd.mx = this.queuedDash.x;
        cmd.my = this.queuedDash.y;
        this.queuedDash = null;
        return cmd;
      }

      // on fire: nothing to lose, charge the nearest enemy and share the flames
      if (p.burning > 0 && enemies.length) {
        const q = enemies.reduce((a, b) => (Math.hypot(a.x - p.x, a.y - p.y) < Math.hypot(b.x - p.x, b.y - p.y) ? a : b));
        cmd.aim = Math.atan2(q.y - p.y, q.x - p.x);
        move = this.goTo(game, q.x, q.y);
        if (move && Math.hypot(q.x - p.x, q.y - p.y) < 160 && p.dashCd <= 0) { cmd.dash = true; cmd.mx = move.x; cmd.my = move.y; return cmd; }
      }

      if (!move) {
        if (this.unstickT > 0) move = this.unstick;
        else if (this.dodgeT > 0) move = this.dodge;
        else if (!p.hasRang) {
          const f = this.fetchRang(game, enemies, cmd);
          if (f === 'recall') {
            cmd.aimHeld = true;
            return cmd;
          }
          if (cmd.dash) return cmd;
          move = f;
        }
      }

      // --- target & combat --------------------------------------------------
      if (this.retargetT <= 0 || !this.target || !this.target.alive) {
        this.target = this.pickTarget(game, enemies);
        this.retargetT = U.rand(0.6, 1.2);
      }
      const t = this.target;
      if (t && t.alive) {
        const dx = t.x - p.x, dy = t.y - p.y;
        const dist = Math.hypot(dx, dy);
        const los = arena.lineClear(p.x, p.y, t.x, t.y, 4);
        // the bot's aim trails behind where the target really is
        if (!this.track || this.trackOf !== t) {
          this.track = { x: t.x, y: t.y };
          this.trackOf = t;
        } else {
          const k = 1 - Math.exp(-dt / d.aimLag);
          this.track.x += (t.x - this.track.x) * k;
          this.track.y += (t.y - this.track.y) * k;
        }
        const toT = Math.atan2(this.track.y - p.y, this.track.x - p.x);
        if (!this.pendingDeflect) cmd.aim = toT;

        if (p.hasRang) {
          const reach = p.meleeReach + t.r + 4;
          if (dist < reach && p.meleeCd <= 0 && this.meleeWind < 0 && !p.aiming) {
            this.meleeWind = d.meleeWind * U.rand(0.6, 1.3);
          }
          if (this.meleeWind >= 0) {
            this.meleeWind -= dt;
            if (this.meleeWind < 0 && dist < reach + 12) {
              cmd.melee = true;
              cmd.aim = toT + U.rand(-1, 1) * d.aimErr * 0.5;
            }
          }

          if (p.aiming) {
            // keep winding up, tracking the target, then let go
            this.aimT += dt;
            cmd.aimHeld = this.aimT < this.aimDur;
            const lead = (dist / 600) * d.lead;
            const px = this.track.x + t.vx * lead, py = this.track.y + t.vy * lead;
            cmd.aim = Math.atan2(py - p.y, px - p.x) + this.aimErr;
            if (!cmd.aimHeld) {
              this.throwCd = U.rand(d.throwCd[0], d.throwCd[1]);
              this.releasing = true; // plant feet on release so the throw flies straight
            }
          } else if (los && dist > 140 && dist < d.maxRange && this.throwCd <= 0 && this.meleeWind < 0 &&
                     !(p.has('explosive') && dist < 170)) {
            const want = dist + 40;
            let c = 0;
            while (c < 1 && BB.throwRange(c) < want) c += 0.05;
            const hold = U.rand(d.aimHold[0], d.aimHold[1]);
            this.aimDur = Math.max(c * BB.TUNE.chargeTime, hold) * (1 + U.rand(-1, 1) * d.chargeErr);
            this.aimT = 0;
            this.aimErr = (Math.random() + Math.random() - 1) * d.aimErr;
            cmd.aimHeld = true;
          }

          if (!move) {
            const perp = { x: -dy / (dist || 1), y: dx / (dist || 1) };
            const towards = { x: dx / (dist || 1), y: dy / (dist || 1) };
            let keep = t.hasRang ? d.kite : 0;
            if (p.has('explosive')) keep = Math.max(keep, 180);
            // close the gap with a dash and slash out of it
            if (dist < 210 && dist > 60 && p.dashCd <= 0 && p.meleeCd <= 0 && los &&
                (!t.hasRang || Math.random() < d.aggression) && Math.random() < d.rushDash * dt * 3 &&
                this.safeStep(game, towards.x, towards.y, 110)) {
              cmd.dash = true;
              cmd.mx = towards.x; cmd.my = towards.y;
              this.meleeWind = U.rand(0.04, 0.12);
              return cmd;
            }
            if (!los || dist > 430) {
              move = this.goTo(game, t.x, t.y);
            } else {
              const radial = U.clamp((dist - keep) / 80, -1, 1);
              move = {
                x: towards.x * radial + perp.x * this.strafe * 0.7,
                y: towards.y * radial + perp.y * this.strafe * 0.7,
              };
            }
          }
        } else if (!move) {
          move = this.evade(game, enemies);
        }
      }

      // --- power-up books / wandering ----------------------------------------
      if (!move || (p.hasRang && !p.aiming)) {
        const pu = this.nearestPowerUp(game);
        if (pu) {
          const pd = Math.hypot(pu.x - p.x, pu.y - p.y);
          const td = t ? Math.hypot(t.x - p.x, t.y - p.y) : Infinity;
          if (pd < 300 && (pd < td * 0.8 || !t)) move = this.goTo(game, pu.x, pu.y);
        }
      }
      if (!move) {
        if (!this.wander || Math.hypot(this.wander.x - p.x, this.wander.y - p.y) < 30) this.wander = arena.randomFloorPoint();
        if (this.wander) move = this.goTo(game, this.wander.x, this.wander.y);
      }

      this.applyMove(game, cmd, move);
      if (this.releasing) {
        cmd.mx = cmd.my = 0;
        this.releasing = false;
      }
      // a fresh press is needed after catching while the button was held
      if (p.aimBlock) cmd.aimHeld = false;
      this.checkStuck(game, dt, cmd);
      return cmd;
    }

    applyMove(game, cmd, move) {
      const p = this.p, d = this.d;
      if (move) {
        let mx = move.x, my = move.y;
        if (d.jitter) {
          mx += Math.cos(this.jitterA) * d.jitter;
          my += Math.sin(this.jitterA) * d.jitter;
        }
        const l = Math.hypot(mx, my);
        if (l > 0.01) { mx /= l; my /= l; }
        const safe = this.safeDir(game, mx, my);
        cmd.mx = safe.x;
        cmd.my = safe.y;
      }
      // momentum on slippery floor heading for a pit: brake hard
      const fx = p.x + p.vx * 0.35, fy = p.y + p.vy * 0.35;
      if (game.arena.isPitAt(fx, fy)) {
        const sp = Math.hypot(p.vx, p.vy) || 1;
        cmd.mx = -p.vx / sp;
        cmd.my = -p.vy / sp;
      }
    }

    // Decoys just wander around looking busy; they never attack.
    decoyThink(game, dt, cmd) {
      const p = this.p;
      this.decoyT -= dt;
      this.repathT -= dt;
      let move;
      if (this.decoyT > 0 && this.decoyDir) {
        move = this.decoyDir;
      } else {
        if (!this.wander || Math.hypot(this.wander.x - p.x, this.wander.y - p.y) < 30) this.wander = game.arena.randomFloorPoint();
        move = this.wander ? this.goTo(game, this.wander.x, this.wander.y) : null;
      }
      if (move) cmd.aim = Math.atan2(move.y, move.x);
      this.applyMove(game, cmd, move);
      return cmd;
    }

    findThreat(game) {
      const p = this.p;
      let best = null, bt = Infinity;
      for (const r of game.rangs) {
        if (!r.canHurt(p, game)) continue;
        const rx = p.x - r.x, ry = p.y - r.y;
        const vv = r.vx * r.vx + r.vy * r.vy;
        if (vv < 400) continue;
        const tca = (rx * r.vx + ry * r.vy) / vv;
        if (tca < 0 || tca > 0.65) continue;
        const cx = rx - r.vx * tca, cy = ry - r.vy * tca;
        if (Math.hypot(cx, cy) < p.r + r.r + 18 && tca < bt) { bt = tca; best = r; }
      }
      return best;
    }

    respond(game, r) {
      const p = this.p, d = this.d;
      if (!r.flying) return;
      const dist = Math.hypot(r.x - p.x, r.y - p.y);
      if (p.hasRang && p.meleeCd <= 0 && Math.random() < d.deflect && dist < 220) {
        this.pendingDeflect = { rang: r, t: 0.6 };
        return;
      }
      const sp = Math.hypot(r.vx, r.vy) || 1;
      let px = -r.vy / sp, py = r.vx / sp;
      if ((p.x - r.x) * px + (p.y - r.y) * py < 0) { px = -px; py = -py; }
      if (!this.safeStep(game, px, py, 50)) { px = -px; py = -py; }
      if (Math.random() < d.dodge && p.dashCd <= 0 && this.safeStep(game, px, py, 110)) {
        this.queuedDash = { x: px, y: py };
      }
      this.dodgeT = 0.3;
      this.dodge = { x: px, y: py };
    }

    pickTarget(game, enemies) {
      const p = this.p, d = this.d;
      let best = null, bs = Infinity;
      for (const q of enemies) {
        const dist = Math.hypot(q.x - p.x, q.y - p.y);
        const visible = !q.hidden || dist < d.detect || q.meleeT > 0 || (q === this.target && dist < d.detect * 2);
        if (!visible) continue;
        let s = dist;
        if (!q.hasRang) s -= 90;
        if (q === this.target) s -= 70;
        if (game.arena.lineClear(p.x, p.y, q.x, q.y)) s -= 60;
        if (s < bs) { bs = s; best = q; }
      }
      return best;
    }

    // Empty-handed: walk to a dropped boomerang, recall it, or teleport to it.
    fetchRang(game, enemies, cmd) {
      const p = this.p;
      const mine = game.rangs.filter((r) => r.owner === p && !r.dead);
      const dropped = mine.filter((r) => r.state === 'dropped' || r.state === 'recall');
      const threat = this.nearestArmed(enemies, 240);
      if (dropped.length) {
        const r = dropped.reduce((a, b) => (Math.hypot(a.x - p.x, a.y - p.y) < Math.hypot(b.x - p.x, b.y - p.y) ? a : b));
        const dist = Math.hypot(r.x - p.x, r.y - p.y);
        if (p.has('teleport') && p.dashCd <= 0 && dist > 200 && !threat && !game.arena.isPitAt(r.x, r.y)) {
          cmd.dash = true;
          return null;
        }
        const allDown = mine.every((x) => x.state === 'dropped' || x.state === 'recall');
        if (this.wantsRecall && allDown && !threat && dist > 90) return 'recall';
        return this.goTo(game, r.x, r.y);
      }
      const back = mine.find((r) => r.state === 'return');
      if (back && !threat) {
        const dx = back.x - p.x, dy = back.y - p.y;
        const l = Math.hypot(dx, dy) || 1;
        return { x: dx / l, y: dy / l };
      }
      return this.evade(game, enemies);
    }

    nearestArmed(enemies, within) {
      const p = this.p;
      let best = null, bd = within;
      for (const q of enemies) {
        if (!q.hasRang || q.isDecoy) continue;
        const dd = Math.hypot(q.x - p.x, q.y - p.y);
        if (dd < bd) { bd = dd; best = q; }
      }
      return best;
    }

    evade(game, enemies) {
      const p = this.p;
      const q = this.nearestArmed(enemies, 280);
      if (!q) return null;
      const dx = p.x - q.x, dy = p.y - q.y;
      const l = Math.hypot(dx, dy) || 1;
      return { x: dx / l + (-dy / l) * this.strafe * 0.6, y: dy / l + (dx / l) * this.strafe * 0.6 };
    }

    nearestPowerUp(game) {
      const p = this.p;
      let best = null, bd = Infinity;
      for (const pu of game.powerups) {
        const dd = Math.hypot(pu.x - p.x, pu.y - p.y);
        if (dd < bd) { bd = dd; best = pu; }
      }
      return best;
    }

    goTo(game, x, y) {
      const p = this.p;
      const arena = game.arena;
      if (arena.walkClear(p.x, p.y, x, y)) {
        this.path = null;
        const dx = x - p.x, dy = y - p.y;
        const l = Math.hypot(dx, dy);
        return l < 4 ? null : { x: dx / l, y: dy / l };
      }
      const gk = Math.floor(x / T) + ',' + Math.floor(y / T);
      if (!this.path || this.repathT <= 0 || this.pathGoal !== gk) {
        this.path = BB.findPath(arena, p.x, p.y, x, y);
        this.pathGoal = gk;
        this.repathT = 0.5;
      }
      if (!this.path || !this.path.length) return null;
      while (this.path.length > 1 && arena.walkClear(p.x, p.y, this.path[1].x, this.path[1].y)) this.path.shift();
      let wp = this.path[0];
      if (Math.hypot(wp.x - p.x, wp.y - p.y) < 10) {
        this.path.shift();
        if (!this.path.length) return null;
        wp = this.path[0];
      }
      const dx = wp.x - p.x, dy = wp.y - p.y;
      const l = Math.hypot(dx, dy) || 1;
      return { x: dx / l, y: dy / l };
    }

    dangerAt(game, x, y) {
      if (game.arena.isPitAt(x, y)) return true;
      for (const h of game.hazards) {
        if (h.type === 'fire' && h.owner !== this.p && Math.hypot(h.x - x, h.y - y) < h.r + 10) return true;
      }
      return false;
    }

    safeStep(game, dx, dy, dist) {
      const p = this.p;
      for (let s = 12; s <= dist; s += 12) {
        const x = p.x + dx * s, y = p.y + dy * s;
        if (this.dangerAt(game, x, y)) return false;
        if (game.arena.solidAt(x, y, p.r * 0.8)) return s > 24;
      }
      return true;
    }

    safeDir(game, mx, my) {
      const p = this.p;
      const ok = (x, y) => {
        for (const s of [14, 26]) if (this.dangerAt(game, p.x + x * s, p.y + y * s)) return false;
        return true;
      };
      if (ok(mx, my)) return { x: mx, y: my };
      for (const a of [0.5, -0.5, 1, -1, 1.6, -1.6, 2.4, -2.4]) {
        const c = Math.cos(a), s = Math.sin(a);
        const x = mx * c - my * s, y = mx * s + my * c;
        if (ok(x, y)) return { x, y };
      }
      return { x: 0, y: 0 };
    }

    checkStuck(game, dt, cmd) {
      const p = this.p;
      this.stuckT += dt;
      if (this.stuckT < 0.7) return;
      this.stuckT = 0;
      const wanted = Math.hypot(cmd.mx, cmd.my) > 0.5;
      if (this.stuckRef && wanted && Math.hypot(p.x - this.stuckRef.x, p.y - this.stuckRef.y) < 10) {
        const a = U.rand(0, BB.TAU);
        this.unstick = { x: Math.cos(a), y: Math.sin(a) };
        this.unstickT = 0.4;
        this.path = null;
        this.wander = null;
      }
      this.stuckRef = { x: p.x, y: p.y };
    }
  }
  BB.Bot = Bot;
})();
