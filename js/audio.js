// Synthesised sound effects and a light background tune (WebAudio, no asset files).
(function () {
  'use strict';
  const BB = window.BB;

  const Audio = (BB.Audio = {
    ctx: null,
    sfxGain: null,
    musicGain: null,
    noiseBuf: null,
    musicOn: false,
    musicTimer: null,
    nextNoteTime: 0,
    step: 0,
    lastPlay: {},

    init() {
      if (this.ctx) return;
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      const ctx = (this.ctx = new AC());
      const master = ctx.createGain();
      master.gain.value = 0.9;
      const comp = ctx.createDynamicsCompressor();
      master.connect(comp);
      comp.connect(ctx.destination);
      this.sfxGain = ctx.createGain();
      this.musicGain = ctx.createGain();
      this.sfxGain.connect(master);
      this.musicGain.connect(master);
      const len = ctx.sampleRate;
      this.noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
      const d = this.noiseBuf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      this.applyVolumes();
    },

    unlock() {
      this.init();
      if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume();
    },

    applyVolumes() {
      if (!this.ctx) return;
      this.sfxGain.gain.value = BB.Settings.data.sfx;
      this.musicGain.gain.value = BB.Settings.data.music * 0.32;
    },

    tone(freq, dur, opts = {}) {
      const ctx = this.ctx;
      const t0 = ctx.currentTime + (opts.delay || 0);
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = opts.type || 'sine';
      osc.frequency.setValueAtTime(freq, t0);
      if (opts.to) osc.frequency.exponentialRampToValueAtTime(Math.max(20, opts.to), t0 + dur);
      const vol = opts.vol == null ? 0.3 : opts.vol;
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(vol, t0 + (opts.attack || 0.005));
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      osc.connect(g);
      g.connect(opts.out || this.sfxGain);
      osc.start(t0);
      osc.stop(t0 + dur + 0.05);
    },

    noise(dur, opts = {}) {
      const ctx = this.ctx;
      const t0 = ctx.currentTime + (opts.delay || 0);
      const src = ctx.createBufferSource();
      src.buffer = this.noiseBuf;
      const filt = ctx.createBiquadFilter();
      filt.type = opts.filter || 'bandpass';
      filt.Q.value = opts.q || 1;
      filt.frequency.setValueAtTime(opts.f0 || 1000, t0);
      if (opts.f1) filt.frequency.exponentialRampToValueAtTime(opts.f1, t0 + dur);
      const g = ctx.createGain();
      const vol = opts.vol == null ? 0.3 : opts.vol;
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(vol, t0 + (opts.attack || 0.01));
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      src.connect(filt);
      filt.connect(g);
      g.connect(opts.out || this.sfxGain);
      src.start(t0, Math.random() * 0.5);
      src.stop(t0 + dur + 0.05);
    },

    play(name) {
      if (!this.ctx || this.ctx.state !== 'running') return;
      // Throttle identical sounds that fire in the same instant.
      const now = this.ctx.currentTime;
      if (this.lastPlay[name] && now - this.lastPlay[name] < 0.03) return;
      this.lastPlay[name] = now;
      const v = (n) => n * (0.9 + Math.random() * 0.2);
      switch (name) {
        case 'throw':
          this.noise(0.28, { f0: 600, f1: 2400, q: 2.5, vol: 0.35 });
          this.tone(v(300), 0.18, { type: 'triangle', to: 520, vol: 0.08 });
          break;
        case 'swing':
          this.noise(0.14, { f0: 2400, f1: 900, q: 1.5, vol: 0.32 });
          break;
        case 'catch':
          this.tone(v(880), 0.09, { type: 'triangle', vol: 0.18 });
          this.tone(v(1320), 0.12, { type: 'triangle', vol: 0.14, delay: 0.05 });
          break;
        case 'pickup':
          this.tone(660, 0.1, { type: 'square', vol: 0.06 });
          this.tone(880, 0.12, { type: 'square', vol: 0.06, delay: 0.05 });
          break;
        case 'slice':
          this.noise(0.25, { f0: 3500, f1: 400, q: 0.8, vol: 0.5 });
          this.tone(v(180), 0.25, { type: 'sine', to: 50, vol: 0.5 });
          this.noise(0.3, { filter: 'lowpass', f0: 900, f1: 200, vol: 0.25, delay: 0.04 });
          break;
        case 'clang':
          this.tone(v(1500), 0.25, { type: 'square', vol: 0.07, to: 1300 });
          this.tone(v(2250), 0.3, { type: 'triangle', vol: 0.12 });
          this.noise(0.08, { f0: 5000, q: 3, vol: 0.2 });
          break;
        case 'thud':
          this.tone(v(140), 0.12, { type: 'sine', to: 70, vol: 0.3 });
          this.noise(0.08, { filter: 'lowpass', f0: 1200, vol: 0.15 });
          break;
        case 'dash':
          this.noise(0.18, { f0: 400, f1: 1600, q: 1.2, vol: 0.22 });
          break;
        case 'powerup':
          [523, 659, 784, 1046].forEach((f, i) => this.tone(f, 0.14, { type: 'square', vol: 0.07, delay: i * 0.06 }));
          break;
        case 'spawnpu':
          this.tone(500, 0.2, { type: 'sine', to: 1000, vol: 0.12 });
          break;
        case 'shield':
          this.tone(900, 0.3, { type: 'sine', to: 300, vol: 0.25 });
          this.noise(0.2, { f0: 3000, q: 4, vol: 0.15 });
          break;
        case 'explode':
          this.noise(0.9, { filter: 'lowpass', f0: 2000, f1: 80, vol: 0.8 });
          this.tone(90, 0.6, { type: 'sine', to: 30, vol: 0.6 });
          break;
        case 'splash':
          this.noise(0.5, { f0: 1200, f1: 300, q: 0.7, vol: 0.4 });
          this.tone(400, 0.25, { type: 'sine', to: 120, vol: 0.15 });
          break;
        case 'fall':
          this.tone(700, 0.6, { type: 'triangle', to: 120, vol: 0.18 });
          break;
        case 'count':
          this.tone(660, 0.18, { type: 'square', vol: 0.08 });
          break;
        case 'go':
          this.tone(988, 0.35, { type: 'square', vol: 0.09 });
          this.tone(1318, 0.35, { type: 'square', vol: 0.07, delay: 0.04 });
          break;
        case 'ui':
          this.tone(740, 0.06, { type: 'triangle', vol: 0.12 });
          break;
        case 'uiBack':
          this.tone(520, 0.07, { type: 'triangle', vol: 0.12 });
          break;
        case 'point':
          this.tone(784, 0.1, { type: 'triangle', vol: 0.15 });
          this.tone(1175, 0.18, { type: 'triangle', vol: 0.12, delay: 0.07 });
          break;
        case 'win':
          [523, 659, 784, 1046, 784, 1046].forEach((f, i) =>
            this.tone(f, i === 5 ? 0.6 : 0.16, { type: 'square', vol: 0.08, delay: i * 0.11 }));
          break;
      }
    },

    // ---- music: a gentle plucky loop scheduled ahead of time ----
    startMusic() {
      this.init();
      if (!this.ctx || this.musicOn) return;
      this.musicOn = true;
      this.nextNoteTime = this.ctx.currentTime + 0.1;
      this.step = 0;
      this.musicTimer = setInterval(() => this._schedule(), 50);
    },

    stopMusic() {
      this.musicOn = false;
      clearInterval(this.musicTimer);
    },

    _schedule() {
      if (!this.ctx || this.ctx.state !== 'running') return;
      const spb = 60 / 116 / 4; // sixteenth notes
      while (this.nextNoteTime < this.ctx.currentTime + 0.2) {
        this._note(this.step, this.nextNoteTime);
        this.nextNoteTime += spb;
        this.step = (this.step + 1) % 128;
      }
    },

    _note(step, t) {
      const ctx = this.ctx;
      const out = this.musicGain;
      const bar = Math.floor(step / 16) % 8;
      const s = step % 16;
      // C - Am - F - G, twice, second time with a lead melody
      const roots = [48, 45, 41, 43, 48, 45, 41, 43];
      const chords = [[0, 4, 7], [0, 3, 7], [0, 4, 7], [0, 4, 7]];
      const root = roots[bar];
      const chord = chords[bar % 4];
      const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);
      const pluck = (midi, dur, vol, type) => {
        const o = ctx.createOscillator();
        const g = ctx.createGain();
        o.type = type;
        o.frequency.value = mtof(midi);
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(vol, t + 0.008);
        g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
        o.connect(g);
        g.connect(out);
        o.start(t);
        o.stop(t + dur + 0.02);
      };
      if (s === 0 || s === 7 || s === 10) pluck(root - 12, 0.32, 0.5, 'sine');
      if (s % 2 === 0) {
        const arp = [0, 1, 2, 1, 2, 0, 1, 2];
        const n = root + 12 + chord[arp[(s / 2) % 8]];
        pluck(n, 0.16, 0.12, 'triangle');
      }
      if (s === 4 || s === 12) {
        const src = ctx.createBufferSource();
        src.buffer = this.noiseBuf;
        const f = ctx.createBiquadFilter();
        f.type = 'highpass';
        f.frequency.value = 6000;
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.12, t);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 0.06);
        src.connect(f); f.connect(g); g.connect(out);
        src.start(t, Math.random() * 0.5);
        src.stop(t + 0.08);
      }
      if (bar >= 4) {
        const melody = [
          [72, -1, 74, -1, 76, -1, -1, 79, -1, 76, -1, 74, 72, -1, -1, -1],
          [69, -1, 72, -1, 76, -1, -1, 74, -1, 72, -1, -1, 69, -1, -1, -1],
          [65, -1, 69, -1, 72, -1, 74, -1, 72, -1, 69, -1, 72, -1, -1, -1],
          [67, -1, 71, -1, 74, -1, -1, 79, -1, 77, -1, 74, 71, -1, -1, -1],
        ];
        const m = melody[bar - 4][s];
        if (m > 0) pluck(m, 0.22, 0.09, 'square');
      }
    },
  });
})();
