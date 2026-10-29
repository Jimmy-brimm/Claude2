// Boot: sizing, audio unlock and the main loop.
(function () {
  'use strict';
  const BB = window.BB;
  const stage = document.getElementById('stage');
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  BB.pixelScale = 1;

  function resize() {
    const s = Math.min(window.innerWidth / BB.W, window.innerHeight / BB.H);
    const w = Math.floor(BB.W * s), h = Math.floor(BB.H * s);
    stage.style.width = w + 'px';
    stage.style.height = h + 'px';
    stage.style.fontSize = 16 * s + 'px';
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.max(1, Math.round(w * dpr));
    canvas.height = Math.max(1, Math.round(h * dpr));
    BB.pixelScale = canvas.width / BB.W;
  }

  BB.Settings.load();
  BB.Input.init(canvas, stage);
  window.addEventListener('resize', resize);
  resize();

  const unlock = () => {
    BB.Audio.unlock();
    BB.Audio.startMusic();
  };
  window.addEventListener('pointerdown', unlock);
  window.addEventListener('keydown', unlock);

  const start = () => {
    BB.UI.init();
    let last = performance.now();
    let fpsAcc = 0, fpsN = 0;
    const fpsEl = document.getElementById('fps');
    function loop(now) {
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      ctx.setTransform(BB.pixelScale, 0, 0, BB.pixelScale, 0, 0);
      const g = BB.UI.activeGame();
      if (g) {
        g.frame(dt);
        g.render(ctx);
      } else {
        ctx.fillStyle = '#241a36';
        ctx.fillRect(0, 0, BB.W, BB.H);
      }
      BB.UI.tick(dt, now);
      BB.Input.endFrame();
      fpsAcc += dt; fpsN++;
      if (fpsAcc > 0.5) {
        if (BB.Settings.data.showFps) fpsEl.textContent = Math.round(fpsN / fpsAcc) + ' fps';
        fpsAcc = 0; fpsN = 0;
      }
      requestAnimationFrame(loop);
    }
    requestAnimationFrame(loop);
  };

  // Wait briefly for the display font so canvas text renders in it from the first frame.
  const fontReady = document.fonts && document.fonts.load ? document.fonts.load('40px "Lilita One"') : Promise.resolve();
  Promise.race([fontReady, new Promise((r) => setTimeout(r, 1500))]).then(start, start);
})();
