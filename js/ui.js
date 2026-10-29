// Menus, HUD and overlays (DOM), plus match setup and flow.
(function () {
  'use strict';
  const BB = window.BB;
  const U = BB.util;
  const $ = (id) => document.getElementById(id);
  const Settings = BB.Settings;

  const POINT_OPTIONS = [3, 5, 7, 10, 15];
  const CONFIG_KEY = 'boomerang-bites.setup.v1';
  const DIFFS = ['easy', 'normal', 'hard'];

  const defaultConfig = () => ({
    slots: [
      { type: 'human', char: 0 },
      { type: 'bot', char: 1, diff: 'normal' },
      { type: 'bot', char: 2, diff: 'normal' },
      { type: 'bot', char: 3, diff: 'normal' },
    ],
    points: 5,
    powerups: true,
    arena: 'shuffle',
  });

  const UI = (BB.UI = {
    screen: 'title',
    config: defaultConfig(),
    game: null, // active match
    demo: null, // attract-mode match behind the title screen
    settingsReturn: 'title',
    slotCanvases: [],
    hudCards: [],
    roundTimer: 0,
    victoryT: 0,

    init() {
      this.loadConfig();
      document.querySelectorAll('[data-go]').forEach((b) =>
        b.addEventListener('click', () => {
          this.sfx(b.classList.contains('back') ? 'uiBack' : 'ui');
          this.show(b.dataset.go);
        }));
      // Swallow the click that follows a mouse button being captured for rebinding.
      document.addEventListener('click', (e) => {
        if (performance.now() - BB.Input.lastCapture < 350) {
          e.stopPropagation();
          e.preventDefault();
        }
      }, true);

      this.initSelect();
      this.initArena();
      this.initSettings();
      this.initOverlays();
      this.buildHowTo();
      this.refreshKeyHints();
      this.startDemo();
      this.show('title');
    },

    sfx(name) {
      BB.Audio.play(name);
    },

    loadConfig() {
      try {
        const c = JSON.parse(localStorage.getItem(CONFIG_KEY) || 'null');
        if (c && Array.isArray(c.slots) && c.slots.length === 4) {
          this.config = Object.assign(defaultConfig(), c);
          this.config.slots[0].type = 'human';
        }
      } catch (e) { /* ignore */ }
    },

    saveConfig() {
      try { localStorage.setItem(CONFIG_KEY, JSON.stringify(this.config)); } catch (e) { /* ignore */ }
    },

    show(name) {
      this.screen = name;
      document.querySelectorAll('.screen').forEach((s) => s.classList.add('hidden'));
      const el = $('screen-' + name);
      if (el) el.classList.remove('hidden');
      if (name === 'select') this.buildSlots();
      if (name === 'arena') this.buildArenaCards();
      if (name === 'settings') this.buildBinds();
      if (name === 'howto') this.buildHowTo();
      if (name === 'title') this.refreshKeyHints();
    },

    activeGame() {
      if (this.game) return this.game;
      if (this.screen === 'title') return this.demo;
      return null;
    },

    // ---------------------------------------------------------------- select
    initSelect() {
      $('points-stepper').addEventListener('click', (e) => {
        const b = e.target.closest('.step-btn');
        if (!b) return;
        const i = POINT_OPTIONS.indexOf(this.config.points);
        const ni = U.clamp((i < 0 ? 1 : i) + +b.dataset.dir, 0, POINT_OPTIONS.length - 1);
        this.config.points = POINT_OPTIONS[ni];
        this.sfx('ui');
        this.refreshMatchSettings();
      });
      $('toggle-powerups').addEventListener('click', () => {
        this.config.powerups = !this.config.powerups;
        this.sfx('ui');
        this.refreshMatchSettings();
      });
      $('all-diff').addEventListener('click', (e) => {
        const b = e.target.closest('button');
        if (!b) return;
        for (const s of this.config.slots) if (s.type === 'bot') s.diff = b.dataset.diff;
        this.sfx('ui');
        this.buildSlots();
      });
    },

    refreshMatchSettings() {
      $('points-val').textContent = this.config.points;
      const t = $('toggle-powerups');
      t.textContent = this.config.powerups ? 'On' : 'Off';
      t.classList.toggle('on', this.config.powerups);
      const bots = this.config.slots.filter((s) => s.type === 'bot');
      const same = bots.length && bots.every((s) => s.diff === bots[0].diff) ? bots[0].diff : null;
      $('all-diff').querySelectorAll('button').forEach((b) => b.classList.toggle('sel', b.dataset.diff === same));
      this.saveConfig();
    },

    buildSlots() {
      const wrap = $('slots');
      wrap.innerHTML = '';
      this.slotCanvases = [];
      this.config.slots.forEach((s, i) => {
        const color = BB.PLAYER_COLORS[i];
        const ch = BB.CHARACTERS[s.char];
        const el = document.createElement('div');
        el.className = 'slot' + (s.type === 'off' ? ' off' : '');
        const head = s.type === 'human' ? 'P1 · You' : s.type === 'bot' ? 'CPU ' + (i + 1) : 'Empty';
        el.innerHTML = `
          <div class="slot-head" style="background:${s.type === 'off' ? '#9a90aa' : color}">${head}</div>
          <div class="slot-stage">
            <button class="arrow-btn l" data-d="-1">◀</button>
            <canvas width="352" height="352"></canvas>
            <button class="arrow-btn r" data-d="1">▶</button>
          </div>
          <div class="slot-name">${ch.name}</div>
          <div class="slot-desc">${ch.desc}</div>
          <div class="slot-controls"></div>`;
        const controls = el.querySelector('.slot-controls');
        if (s.type === 'human') {
          controls.innerHTML = `<span class="slot-tag">Keyboard & Mouse</span>`;
        } else if (s.type === 'bot') {
          controls.innerHTML = `
            <div class="pills">${DIFFS.map((d) => `<button data-diff="${d}" class="${s.diff === d ? 'sel' : ''}">${BB.BOT_DIFFICULTY[d].label}</button>`).join('')}</div>
            <button class="slot-toggle" data-act="remove">Remove bot</button>`;
        } else {
          controls.innerHTML = `<button class="slot-toggle" data-act="add">+ Add bot</button>`;
        }
        el.addEventListener('click', (e) => {
          const arrow = e.target.closest('.arrow-btn');
          const diff = e.target.closest('[data-diff]');
          const act = e.target.closest('[data-act]');
          if (arrow) {
            s.char = (s.char + +arrow.dataset.d + BB.CHARACTERS.length) % BB.CHARACTERS.length;
            this.sfx('ui');
            this.buildSlots();
          } else if (diff) {
            s.diff = diff.dataset.diff;
            this.sfx('ui');
            this.buildSlots();
          } else if (act) {
            if (act.dataset.act === 'add') {
              s.type = 'bot';
              s.diff = s.diff || 'normal';
            } else {
              const bots = this.config.slots.filter((x) => x.type === 'bot').length;
              if (bots <= 1) {
                el.animate([{ transform: 'translateX(-6px)' }, { transform: 'translateX(6px)' }, { transform: 'none' }], { duration: 200, iterations: 2 });
                return;
              }
              s.type = 'off';
            }
            this.sfx('ui');
            this.buildSlots();
          }
        });
        wrap.appendChild(el);
        this.slotCanvases.push({ canvas: el.querySelector('canvas'), slot: s, i });
      });
      this.refreshMatchSettings();
    },

    // ----------------------------------------------------------------- arena
    initArena() {
      $('btn-fight').addEventListener('click', () => {
        this.sfx('go');
        this.startMatch();
      });
    },

    buildArenaCards() {
      const wrap = $('arena-cards');
      if (!wrap.childElementCount) {
        const make = (id, name, desc, art) => {
          const card = document.createElement('div');
          card.className = 'arena-card';
          card.dataset.id = id;
          card.innerHTML = `<div class="check">✓</div>${art}<div class="arena-info"><div class="arena-name">${name}</div><div class="arena-desc">${desc}</div></div>`;
          card.addEventListener('click', () => {
            this.config.arena = id;
            this.saveConfig();
            this.sfx('ui');
            this.markArena();
          });
          wrap.appendChild(card);
          return card;
        };
        for (const d of BB.ARENA_DEFS) {
          const card = make(d.id, d.name, d.desc, '<canvas width="704" height="396"></canvas>');
          BB.getArena(d.id).drawPreview(card.querySelector('canvas'));
        }
        make('shuffle', 'Shuffle', 'A different arena every round.', '<div class="shuffle-art"><span>?</span></div>');
      }
      this.markArena();
    },

    markArena() {
      document.querySelectorAll('.arena-card').forEach((c) => c.classList.toggle('sel', c.dataset.id === this.config.arena));
    },

    // -------------------------------------------------------------- settings
    initSettings() {
      const sliders = [['vol-sfx', 'sfx'], ['vol-music', 'music']];
      for (const [id, key] of sliders) {
        const input = $(id);
        input.value = Math.round(Settings.data[key] * 100);
        $(id + '-val').textContent = input.value;
        input.addEventListener('input', () => {
          Settings.data[key] = input.value / 100;
          $(id + '-val').textContent = input.value;
          BB.Audio.applyVolumes();
          Settings.save();
        });
        input.addEventListener('change', () => this.sfx('ui'));
      }
      const toggles = [['opt-shake', 'shake'], ['opt-aim', 'aimGuide'], ['opt-fps', 'showFps']];
      for (const [id, key] of toggles) {
        const b = $(id);
        const sync = () => {
          b.textContent = Settings.data[key] ? 'On' : 'Off';
          b.classList.toggle('on', !!Settings.data[key]);
          $('fps').classList.toggle('hidden', !Settings.data.showFps);
        };
        sync();
        b.addEventListener('click', () => {
          Settings.data[key] = !Settings.data[key];
          Settings.save();
          sync();
          this.sfx('ui');
        });
      }
      $('btn-reset-binds').addEventListener('click', () => {
        Settings.resetBinds();
        this.sfx('ui');
        this.buildBinds();
        this.refreshKeyHints();
      });
      $('btn-settings-back').addEventListener('click', () => {
        BB.Input.capture = null;
        this.sfx('uiBack');
        if (this.settingsReturn === 'pause') {
          $('screen-settings').classList.add('hidden');
          this.screen = 'game';
          $('overlay-pause').classList.remove('hidden');
        } else {
          this.show('title');
        }
      });
    },

    buildBinds() {
      const list = $('bind-list');
      list.innerHTML = '';
      for (const a of Settings.ACTIONS) {
        const row = document.createElement('div');
        row.className = 'bind-row';
        row.innerHTML = `<span>${a.label}</span><button class="bind-btn">${Settings.keyName(Settings.data.binds[a.id])}</button>`;
        const btn = row.querySelector('button');
        btn.addEventListener('click', () => {
          list.querySelectorAll('.listening').forEach((b) => b.classList.remove('listening'));
          btn.classList.add('listening');
          btn.textContent = 'Press a key…';
          this.sfx('ui');
          BB.Input.startCapture((code) => {
            if (code !== 'Escape' || a.id === 'pause') Settings.bind(a.id, code);
            this.buildBinds();
            this.refreshKeyHints();
            this.sfx('pickup');
          });
        });
        list.appendChild(row);
      }
    },

    refreshKeyHints() {
      document.querySelectorAll('.kb[data-bind]').forEach((k) => {
        k.textContent = Settings.keyName(Settings.data.binds[k.dataset.bind]);
      });
    },

    buildHowTo() {
      const b = Settings.data.binds;
      const k = (a) => `<b class="kb">${Settings.keyName(b[a])}</b>`;
      $('howto-controls').innerHTML = `
        <li><span>Move</span><span>${k('up')} ${k('left')} ${k('down')} ${k('right')}</span></li>
        <li><span>Swing / deflect</span><span>${k('melee')}</span></li>
        <li><span>Aim (hold) &amp; throw (release)</span><span>${k('throw')}</span></li>
        <li><span>Dash</span><span>${k('dash')}</span></li>
        <li><span>Pause</span><span>${k('pause')}</span></li>
        <li><span>Aim direction</span><span>Mouse</span></li>`;
      const pl = $('howto-powerups');
      pl.innerHTML = '';
      for (const t of BB.POWERUP_TYPES) {
        const li = document.createElement('li');
        const c = U.makeCanvas(90, 90);
        const ctx = c.getContext('2d');
        ctx.scale(2, 2);
        ctx.fillStyle = '#fff';
        U.ellipse(ctx, 22.5, 22.5, 20, 20);
        ctx.fill();
        ctx.lineWidth = 3;
        ctx.strokeStyle = BB.POWERUPS[t].color;
        ctx.stroke();
        BB.drawPowerIcon(ctx, t, 22.5, 22.5, 24);
        li.appendChild(c);
        const d = document.createElement('div');
        d.innerHTML = `<b>${BB.POWERUPS[t].name}</b><span>${BB.POWERUPS[t].desc}</span>`;
        li.appendChild(d);
        pl.appendChild(li);
      }
    },

    // ------------------------------------------------------------- overlays
    initOverlays() {
      $('btn-resume').addEventListener('click', () => { this.sfx('ui'); this.setPaused(false); });
      $('btn-restart').addEventListener('click', () => { this.sfx('ui'); this.startMatch(); });
      $('btn-pause-settings').addEventListener('click', () => {
        this.sfx('ui');
        this.settingsReturn = 'pause';
        $('overlay-pause').classList.add('hidden');
        this.show('settings');
        this.screen = 'game-settings';
      });
      $('btn-quit').addEventListener('click', () => { this.sfx('uiBack'); this.quitToMenu(); });
      $('overlay-round').addEventListener('click', () => this.advanceRound());
      $('btn-rematch').addEventListener('click', () => { this.sfx('go'); this.startMatch(); });
      $('btn-change').addEventListener('click', () => { this.sfx('ui'); this.quitToMenu('select'); });
      $('btn-menu').addEventListener('click', () => { this.sfx('uiBack'); this.quitToMenu(); });
      window.addEventListener('blur', () => {
        if (this.game && this.screen === 'game' && !this.game.paused && this.game.phase !== 'results') this.setPaused(true);
      });
    },

    hideOverlays() {
      ['overlay-pause', 'overlay-round', 'overlay-victory'].forEach((id) => $(id).classList.add('hidden'));
    },

    setPaused(on) {
      if (!this.game) return;
      this.game.paused = on;
      $('overlay-pause').classList.toggle('hidden', !on);
      $('stage').classList.toggle('playing', !on);
      BB.inGame = !on;
      BB.Input.down.clear();
    },

    // --------------------------------------------------------------- matches
    buildPlayers(slots) {
      const players = [];
      slots.forEach((s, i) => {
        if (s.type === 'off') return;
        players.push({ slot: i, char: s.char, isBot: s.type === 'bot', difficulty: s.diff || 'normal', name: BB.CHARACTERS[s.char].name });
      });
      const seen = {};
      for (const p of players) {
        seen[p.name] = (seen[p.name] || 0) + 1;
        if (seen[p.name] > 1) p.name += ' ' + seen[p.name];
      }
      return players;
    },

    startDemo() {
      const chars = U.shuffle([0, 1, 2, 3]);
      const slots = chars.map((c) => ({ type: 'bot', char: c, diff: U.choice(['normal', 'hard']) }));
      this.demo = new BB.Game({ players: this.buildPlayers(slots), pointsToWin: 99, powerups: true, arena: 'shuffle', demo: true });
      this.demo.startRound();
    },

    startMatch() {
      this.hideOverlays();
      this.saveConfig();
      const cfg = {
        players: this.buildPlayers(this.config.slots),
        pointsToWin: this.config.points,
        powerups: this.config.powerups,
        arena: this.config.arena,
      };
      this.game = new BB.Game(cfg, {
        onChange: (g) => this.updateHud(g),
        onRoundStart: (g) => this.updateHud(g),
        onRoundEnd: (g) => this.showRoundResults(g),
      });
      document.querySelectorAll('.screen').forEach((s) => s.classList.add('hidden'));
      this.screen = 'game';
      $('hud').classList.remove('hidden');
      $('stage').classList.add('playing');
      BB.inGame = true;
      this.buildHud(this.game);
      this.hintT = 7;
      this.game.startRound();
    },

    quitToMenu(to = 'title') {
      this.game = null;
      BB.inGame = false;
      this.hideOverlays();
      $('hud').classList.add('hidden');
      $('stage').classList.remove('playing');
      this.show(to);
    },

    buildHud(game) {
      const wrap = $('hud-scores');
      wrap.innerHTML = '';
      this.hudCards = game.players.map((p) => {
        const card = document.createElement('div');
        card.className = 'score-card';
        card.innerHTML = `<canvas width="96" height="96"></canvas>
          <div><div class="sc-name" style="color:${p.color}">${p.isBot ? 'CPU' : 'YOU'}</div><div class="sc-score">0</div></div>
          <canvas class="sc-pu hidden" width="48" height="48"></canvas>
          <div class="sc-color" style="background:${p.color}"></div>`;
        BB.drawPortrait(card.querySelector('canvas'), p.charIndex, { size: 0.3, noShadow: true });
        wrap.appendChild(card);
        return { card, p, score: card.querySelector('.sc-score'), pu: card.querySelector('.sc-pu'), last: 0, puType: null };
      });
      $('hud-goal').textContent = `First to ${game.cfg.pointsToWin}`;
    },

    updateHud(game) {
      for (const h of this.hudCards) {
        const p = h.p;
        if (p.score !== h.last) {
          h.score.textContent = p.score;
          if (p.score > h.last) {
            h.card.classList.remove('bump');
            void h.card.offsetWidth;
            h.card.classList.add('bump');
          }
          h.last = p.score;
        }
        h.card.classList.toggle('dead', !p.alive);
        const pu = p.powerup || (p.shield ? 'shield' : null);
        if (pu !== h.puType) {
          h.puType = pu;
          h.pu.classList.toggle('hidden', !pu);
          if (pu) {
            const ctx = h.pu.getContext('2d');
            ctx.setTransform(1, 0, 0, 1, 0, 0);
            ctx.clearRect(0, 0, 48, 48);
            ctx.fillStyle = '#fff';
            U.ellipse(ctx, 24, 24, 21, 21);
            ctx.fill();
            ctx.lineWidth = 3;
            ctx.strokeStyle = BB.INK;
            ctx.stroke();
            BB.drawPowerIcon(ctx, pu, 24, 24, 24);
          }
        }
      }
    },

    showRoundResults(game) {
      BB.inGame = false;
      $('stage').classList.remove('playing');
      const winner = game.matchWinner();
      $('round-title').textContent = winner ? 'Match Point!' : 'Round ' + game.round;
      let sub;
      if (game.timeUp) sub = "Time's up!";
      else {
        const best = [...game.roundPoints.entries()].sort((a, b) => b[1] - a[1])[0];
        const alive = game.players.filter((p) => p.alive);
        if (best && best[1] >= 2) sub = `${best[0].name} sliced ${best[1]}!`;
        else if (alive.length === 1) sub = `${alive[0].name} was the last snack standing`;
        else sub = 'Everybody got sliced!';
      }
      $('round-sub').textContent = sub;
      const rows = $('round-rows');
      rows.innerHTML = '';
      for (const p of game.players) {
        const gained = game.roundPoints.get(p) || 0;
        const row = document.createElement('div');
        row.className = 'round-row';
        const total = Math.max(game.cfg.pointsToWin, p.score);
        let pips = '';
        for (let i = 0; i < total; i++) {
          const full = i < p.score;
          const isNew = full && i >= p.score - gained;
          pips += `<div class="pip ${full ? 'full' : ''} ${isNew ? 'new' : ''}" style="--c:${p.color};--d:${0.35 + (i - (p.score - gained)) * 0.15}s"></div>`;
        }
        row.innerHTML = `<canvas width="96" height="96"></canvas><div class="rr-name" style="color:${p.color}">${p.name}</div><div class="pips">${pips}</div><div class="rr-plus">${gained ? '+' + gained : ''}</div>`;
        BB.drawPortrait(row.querySelector('canvas'), p.charIndex, { size: 0.3, bg: '#f4eefa', mood: p.alive ? 'happy' : 'dizzy', noShadow: true });
        rows.appendChild(row);
      }
      $('overlay-round').classList.remove('hidden');
      this.roundTimer = winner ? 2.2 : 3.0;
    },

    advanceRound() {
      if (!this.game || this.game.phase !== 'results') return;
      $('overlay-round').classList.add('hidden');
      this.roundTimer = 0;
      const winner = this.game.matchWinner();
      if (winner) {
        this.showVictory(this.game, winner);
      } else {
        $('stage').classList.add('playing');
        BB.inGame = true;
        this.game.startRound();
      }
    },

    showVictory(game, winner) {
      this.victory = { winner, t: 0 };
      $('victory-title').textContent = `${winner.name} Wins!`;
      $('victory-title').style.color = winner.color;
      const rank = $('victory-rank');
      rank.innerHTML = '';
      const sorted = [...game.players].sort((a, b) => b.score - a.score);
      const places = ['1st', '2nd', '3rd', '4th'];
      sorted.forEach((p, i) => {
        const d = document.createElement('div');
        d.className = 'vr';
        d.innerHTML = `<span class="vr-place">${places[i]}</span><canvas width="96" height="96"></canvas><span style="color:${p.color}">${p.name}</span><span class="vr-score">${p.score}</span>`;
        BB.drawPortrait(d.querySelector('canvas'), p.charIndex, { size: 0.3, noShadow: true, mood: i === 0 ? 'happy' : 'idle' });
        rank.appendChild(d);
      });
      const conf = $('confetti');
      conf.innerHTML = '';
      const colors = ['#ff4d4d', '#3d8bff', '#33c46a', '#ffb81c', '#ff6fa5', '#a259ff'];
      for (let i = 0; i < 70; i++) {
        const c = document.createElement('i');
        c.style.left = Math.random() * 100 + '%';
        c.style.background = U.choice(colors);
        c.style.animationDuration = U.rand(2.2, 4.5) + 's';
        c.style.animationDelay = -U.rand(0, 4) + 's';
        c.style.transform = `rotate(${U.rand(0, 360)}deg)`;
        conf.appendChild(c);
      }
      $('overlay-victory').classList.remove('hidden');
      this.sfx(game.human === winner || !game.human ? 'win' : 'point');
    },

    // ----------------------------------------------------------------- tick
    tick(dt, now) {
      const t = now / 1000;
      // pause toggle
      if (this.game && BB.Input.wasPressed('pause') && !BB.Input.capture) {
        if (this.screen === 'game' && this.game.phase !== 'results' && $('overlay-victory').classList.contains('hidden')) {
          this.setPaused(!this.game.paused);
          this.sfx('ui');
        }
      }
      if (this.screen === 'select') {
        for (const s of this.slotCanvases) {
          BB.drawPortrait(s.canvas, s.slot.char, {
            time: t + s.i * 0.7,
            size: 0.27,
            blink: (t + s.i * 1.3) % 3.2 < 0.12,
            mood: s.slot.type === 'off' ? 'idle' : s.i === 0 ? 'happy' : 'angry',
            ring: s.slot.type === 'off' ? null : BB.PLAYER_COLORS[s.i],
          });
        }
      }
      if (this.roundTimer > 0) {
        this.roundTimer -= dt;
        if (this.roundTimer <= 0) this.advanceRound();
      }
      if (this.victory && !$('overlay-victory').classList.contains('hidden')) {
        this.victory.t += dt;
        BB.drawPortrait($('victory-portrait'), this.victory.winner.charIndex, {
          time: t, size: 0.27, mood: 'happy', moving: 1, walkPhase: t * 9, ring: this.victory.winner.color,
        });
      }
      if (this.game && this.screen === 'game') {
        const h = this.game.human;
        let hint = '';
        if (h && !h.alive && this.game.phase === 'playing') hint = 'Sliced! Hang tight until the round ends…';
        else if (this.hintT > 0) {
          this.hintT -= dt;
          const b = Settings.data.binds;
          hint = `Hold ${Settings.keyName(b.throw)} to aim, release to throw · ${Settings.keyName(b.melee)} to swing · ${Settings.keyName(b.dash)} to dash`;
        }
        const el = $('hud-hint');
        if (el.textContent !== hint) el.textContent = hint;
        if (this.hudCards.length && Math.floor(t * 10) !== this._hudTick) {
          this._hudTick = Math.floor(t * 10);
          this.updateHud(this.game);
        }
      }
    },
  });
})();
