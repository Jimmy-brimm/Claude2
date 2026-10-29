// Persistent settings (keybinds, audio, options) and raw input tracking.
(function () {
  'use strict';
  const BB = window.BB;

  const DEFAULTS = {
    binds: {
      up: 'KeyW',
      down: 'KeyS',
      left: 'KeyA',
      right: 'KeyD',
      melee: 'Mouse0',
      throw: 'Mouse2',
      dash: 'Space',
      pause: 'Escape',
    },
    sfx: 0.8,
    music: 0.45,
    shake: true,
    aimGuide: true,
    showFps: false,
  };

  const ACTIONS = [
    { id: 'up', label: 'Move up' },
    { id: 'down', label: 'Move down' },
    { id: 'left', label: 'Move left' },
    { id: 'right', label: 'Move right' },
    { id: 'melee', label: 'Swing (slash)' },
    { id: 'throw', label: 'Aim & throw (hold)' },
    { id: 'dash', label: 'Dash' },
    { id: 'pause', label: 'Pause' },
  ];

  const STORE_KEY = 'boomerang-bites.settings.v1';
  const clone = (o) => JSON.parse(JSON.stringify(o));

  const Settings = (BB.Settings = {
    ACTIONS,
    data: clone(DEFAULTS),

    load() {
      try {
        const saved = JSON.parse(localStorage.getItem(STORE_KEY) || 'null');
        if (saved) {
          this.data = Object.assign(clone(DEFAULTS), saved);
          this.data.binds = Object.assign(clone(DEFAULTS.binds), saved.binds || {});
        }
      } catch (e) { /* storage unavailable: keep defaults */ }
    },

    save() {
      try { localStorage.setItem(STORE_KEY, JSON.stringify(this.data)); } catch (e) { /* ignore */ }
    },

    resetBinds() {
      this.data.binds = clone(DEFAULTS.binds);
      this.save();
    },

    // Binding a code that another action already uses swaps the two.
    bind(action, code) {
      const binds = this.data.binds;
      const prev = binds[action];
      for (const a in binds) if (a !== action && binds[a] === code) binds[a] = prev;
      binds[action] = code;
      this.save();
    },
  });

  const KEY_NAMES = {
    Mouse0: 'LMB', Mouse1: 'MMB', Mouse2: 'RMB', Mouse3: 'Mouse 4', Mouse4: 'Mouse 5',
    Space: 'Space', Escape: 'Esc', Enter: 'Enter', Tab: 'Tab', Backspace: 'Backspace',
    ShiftLeft: 'L-Shift', ShiftRight: 'R-Shift', ControlLeft: 'L-Ctrl', ControlRight: 'R-Ctrl',
    AltLeft: 'L-Alt', AltRight: 'R-Alt', ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→',
    CapsLock: 'Caps', Backquote: '`', Minus: '-', Equal: '=', BracketLeft: '[', BracketRight: ']',
    Semicolon: ';', Quote: "'", Comma: ',', Period: '.', Slash: '/', Backslash: '\\',
  };

  Settings.keyName = function (code) {
    if (!code) return '—';
    if (KEY_NAMES[code]) return KEY_NAMES[code];
    if (code.startsWith('Key')) return code.slice(3);
    if (code.startsWith('Digit')) return code.slice(5);
    if (code.startsWith('Numpad')) return 'Num ' + code.slice(6);
    return code;
  };

  // ---------------------------------------------------------------------
  // Input: tracks which keys / mouse buttons are down, plus edge events.
  const Input = (BB.Input = {
    down: new Set(),
    pressed: new Set(),
    mouse: { x: BB.W / 2, y: BB.H / 2 },
    capture: null, // callback waiting for the next key / button (rebinding)
    lastCapture: 0,

    init(canvas, stage) {
      const isGameCode = (code) => Object.values(Settings.data.binds).includes(code);

      window.addEventListener('keydown', (e) => {
        if (this.capture) {
          e.preventDefault();
          this._finishCapture(e.code);
          return;
        }
        if (BB.inGame && (isGameCode(e.code) || e.code === 'Space' || e.code.startsWith('Arrow'))) e.preventDefault();
        if (e.repeat) return;
        this.down.add(e.code);
        this.pressed.add(e.code);
      });
      window.addEventListener('keyup', (e) => this.down.delete(e.code));

      window.addEventListener('mousedown', (e) => {
        const code = 'Mouse' + e.button;
        if (this.capture) {
          e.preventDefault();
          this._finishCapture(code);
          return;
        }
        this.down.add(code);
        this.pressed.add(code);
        if (BB.inGame && e.button !== 0) e.preventDefault();
      });
      window.addEventListener('mouseup', (e) => this.down.delete('Mouse' + e.button));
      window.addEventListener('mousemove', (e) => {
        const r = canvas.getBoundingClientRect();
        this.mouse.x = ((e.clientX - r.left) / r.width) * BB.W;
        this.mouse.y = ((e.clientY - r.top) / r.height) * BB.H;
      });
      stage.addEventListener('contextmenu', (e) => e.preventDefault());
      window.addEventListener('blur', () => this.down.clear());
      // Mouse 4/5 would otherwise navigate back/forward while rebinding or playing.
      window.addEventListener('auxclick', (e) => { if (BB.inGame) e.preventDefault(); });
    },

    _finishCapture(code) {
      const cb = this.capture;
      this.capture = null;
      // a captured mouse button is followed by a click event that the UI must ignore
      if (code.startsWith('Mouse')) this.lastCapture = performance.now();
      cb(code);
    },

    startCapture(cb) {
      this.capture = cb;
    },

    isDown(action) {
      return this.down.has(Settings.data.binds[action]);
    },

    wasPressed(action) {
      return this.pressed.has(Settings.data.binds[action]);
    },

    endFrame() {
      this.pressed.clear();
    },
  });
})();
