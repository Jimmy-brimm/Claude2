// Bot opponents: grid path-finding plus a small reactive combat brain.
(function () {
  'use strict';
  const BB = window.BB;
  const U = BB.util;
  const T = BB.TILE;

  const DIFF = (BB.BOT_DIFFICULTY = {
    easy: {
      label: 'Easy', react: 0.7, aimErr: 0.4, lead: 0, dodge: 0.1, deflect: 0,
      throwCd: [2.4, 4.0], speed: 0.75, detect: 60, chargeErr: 0.4, meleeWind: 0.6,
      kite: 140, jitter: 0.55, rushDash: 0, maxRange: 380,
    },
    normal: {
      label: 'Normal', react: 0.3, aimErr: 0.13, lead: 0.55, dodge: 0.45, deflect: 0.15,
      throwCd: [1.0, 1.9], speed: 0.93, detect: 100, chargeErr: 0.18, meleeWind: 0.22,
      kite: 170, jitter: 0.25, rushDash: 0.25, maxRange: 520,
    },
    hard: {
      label: 'Hard', react: 0.14, aimErr: 0.045, lead: 1, dodge: 0.8, deflect: 0.45,
      throwCd: [0.45, 1.0], speed: 1, detect: 150, chargeErr: 0.07, meleeWind: 0.08,
      kite: 200, jitter: 0.08, rushDash: 0.7, maxRange: 600,
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
      this.throwCd = U.rand(this.d.throwCd[0], this.d.throwCd[1]) * 0.6;
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
    }

    think(game, dt) {
      const p = this.p, d = this.d;
      const cmd = { mx: 0, my: 0, aim: p.facing, melee: false, aimHeld: false, dash: false };
      if (game.phase !== 'playing') {
        cmd.aim = Math.atan2(BB.H / 2 - p.y, BB.W / 2 - p.x);
        return cmd;
      }
      this.throwCd -= dt;
      this.retargetT -= dt;
      this.repathT -= dt;
      this.dodgeT -= dt;
      this.unstickT -= dt;
      this.strafeT -= dt;
      if (this.strafeT <= 0) { this.strafe = -this.strafe; this.strafeT = U.rand(0.7, 2.2); }
      this.jitterA += U.rand(-3, 3) * dt;

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

      const arena = game.arena;
      const enemies = game.players.filter((q) => q !== p && q.alive && !q.falling);
      let move = null;

      // pending deflection swing: wait until the rang is in reach
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

      if (this.unstickT > 0) {
        move = this.unstick;
      } else if (this.dodgeT > 0) {
        move = this.dodge;
      } else if (!p.hasRang) {
        move = this.fetchRang(game, enemies);
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
        const toT = Math.atan2(dy, dx);
        if (!this.pendingDeflect) cmd.aim = toT;

        if (p.hasRang) {
          // melee when close
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
            this.aimT += dt;
            cmd.aimHeld = this.aimT < this.aimDur;
            const lead = (dist / 750) * d.lead;
            const px = t.x + t.vx * lead, py = t.y + t.vy * lead;
            cmd.aim = Math.atan2(py - p.y, px - p.x) + this.aimErr;
            if (!cmd.aimHeld) this.throwCd = U.rand(d.throwCd[0], d.throwCd[1]);
          } else if (los && dist > 70 && dist < d.maxRange && this.throwCd <= 0 && this.meleeWind < 0 &&
                     !(p.powerup === 'explosive' && dist < 160)) {
            const want = dist + 40;
            let c = 0;
            while (c < 1 && BB.throwRange(c) < want) c += 0.05;
            this.aimDur = Math.max(0.02, c * BB.TUNE.chargeTime * (1 + U.rand(-1, 1) * d.chargeErr));
            this.aimT = 0;
            this.aimErr = (Math.random() + Math.random() - 1) * d.aimErr;
            cmd.aimHeld = true;
          }

          if (!move) {
            const perp = { x: -dy / (dist || 1), y: dx / (dist || 1) };
            const towards = { x: dx / (dist || 1), y: dy / (dist || 1) };
            let keep = t.hasRang ? d.kite : 0;
            if (p.powerup === 'explosive') keep = Math.max(keep, 180);
            if (!t.hasRang && dist < 220 && p.dashCd <= 0 && Math.random() < d.rushDash * dt * 3 && los &&
                this.safeStep(game, towards.x, towards.y, 100)) {
              cmd.dash = true;
              cmd.mx = towards.x; cmd.my = towards.y;
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

      // --- power-ups / wandering -------------------------------------------
      if (!move || (p.hasRang && !p.aiming)) {
        const pu = this.nearestPowerUp(game);
        if (pu) {
          const pd = Math.hypot(pu.x - p.x, pu.y - p.y);
          const td = t ? Math.hypot(t.x - p.x, t.y - p.y) : Infinity;
          if (pd < 300 && (pd < td * 0.8 || !t)) move = this.goTo(game, pu.x, pu.y);
        }
      }
      if (!move) {
        if (!this.wander || Math.hypot(this.wander.x - p.x, this.wander.y - p.y) < 30) {
          this.wander = arena.randomFloorPoint();
        }
        if (this.wander) move = this.goTo(game, this.wander.x, this.wander.y);
      }

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
      if (arena.isPitAt(fx, fy)) {
        const sp = Math.hypot(p.vx, p.vy) || 1;
        cmd.mx = -p.vx / sp;
        cmd.my = -p.vy / sp;
      }

      this.checkStuck(game, dt, cmd);
      return cmd;
    }

    findThreat(game) {
      const p = this.p;
      let best = null, bt = Infinity;
      for (const r of game.rangs) {
        if (!r.canHurt(p)) continue;
        const rx = p.x - r.x, ry = p.y - r.y;
        const vv = r.vx * r.vx + r.vy * r.vy;
        if (vv < 400) {
          if (Math.hypot(rx, ry) < p.r + r.r + 20 && r.state === 'return') return r;
          continue;
        }
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
        const visible = !q.inBush || dist < d.detect || q.meleeT > 0 || (q === this.target && dist < d.detect * 2);
        if (!visible) continue;
        let s = dist;
        if (!q.hasRang) s -= 90;
        if (q === this.target) s -= 70;
        if (game.arena.lineClear(p.x, p.y, q.x, q.y)) s -= 60;
        if (s < bs) { bs = s; best = q; }
      }
      return best;
    }

    fetchRang(game, enemies) {
      const p = this.p;
      const r = p.rang;
      if (r && r.state === 'dropped') return this.goTo(game, r.x, r.y);
      if (r && r.state === 'return') {
        const threat = this.nearestArmed(enemies, 200);
        if (!threat) {
          const dx = r.x - p.x, dy = r.y - p.y;
          const l = Math.hypot(dx, dy) || 1;
          return { x: dx / l, y: dy / l };
        }
      }
      return this.evade(game, enemies);
    }

    nearestArmed(enemies, within) {
      const p = this.p;
      let best = null, bd = within;
      for (const q of enemies) {
        if (!q.hasRang) continue;
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
      // skip ahead to the furthest waypoint we can walk straight to
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

    safeStep(game, dx, dy, dist) {
      const p = this.p;
      const arena = game.arena;
      for (let s = 12; s <= dist; s += 12) {
        const x = p.x + dx * s, y = p.y + dy * s;
        if (arena.isPitAt(x, y)) return false;
        if (arena.solidAt(x, y, p.r * 0.8)) return s > 24;
      }
      return true;
    }

    safeDir(game, mx, my) {
      const p = this.p;
      const arena = game.arena;
      const ok = (x, y) => {
        for (const s of [14, 26]) {
          if (arena.isPitAt(p.x + x * s, p.y + y * s)) return false;
        }
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
