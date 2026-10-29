# Boomerang Bites 🥟🥝

A chaotic top-down boomerang brawler for the browser — slice your snack-sized rivals with a quick swing or a charged throw. One hit and you're sliced!

Runs fully offline in the browser against bots. No build step, no dependencies: plain HTML, CSS and JavaScript (canvas + WebAudio).

## Play

- **Locally:** open `index.html` in a browser (double-click works), or serve the folder:
  ```bash
  python3 -m http.server 8000
  ```
  then visit http://localhost:8000.
- **GitHub Pages:** in the repository go to *Settings → Pages*, choose *Deploy from a branch*, pick the branch and `/ (root)`, and save. The game will be live at `https://<user>.github.io/<repo>/`.

## Controls (default — rebind any of them in Settings)

| Action | Default |
| --- | --- |
| Move | `W` `A` `S` `D` |
| Swing (melee slash, also deflects boomerangs) | Left mouse button |
| Aim & throw — hold to aim/charge, release to throw | Right mouse button (hold) |
| Dash | `Space` |
| Pause | `Esc` |

Keybinds accept any keyboard key or mouse button and are saved in your browser.

## Features

- **4 fighters:** Bao, Kiwi, Macaron and Radish — each gets sliced in half with its own filling.
- **3 arenas:** Sunny Kitchen (oil spills around a sink), Frosty Glade (slippery pond with ice holes), Sunset Canyon (bottomless chasm with two bridges). Pick one or shuffle every round.
- **Bots with 3 difficulties:** Easy, Normal and Hard — set per bot or for all at once. Add or remove bots for 1v1 up to free-for-all with 4.
- **5 power-ups:** Multi-Rang, Kaboom-Rang, Bubble Shield, Turbo and Big Rang.
- Bushes to hide in, dashing, deflecting, boomerang clashes, slow-mo final kills, score screens and a victory podium.
- Settings for keybinds, sound/music volume, screen shake, aim guide and an FPS counter.

## Project layout

```
index.html        page shell and menu markup
css/style.css     UI styling
js/util.js        constants & helpers
js/settings.js    saved settings, keybinds and input tracking
js/audio.js       synthesised sound effects and music
js/characters.js  fighter artwork
js/arenas.js      arena maps, collision and artwork
js/entities.js    players, boomerangs, power-ups, particles
js/ai.js          bot path-finding and behaviour
js/game.js        round/match simulation and rendering
js/ui.js          menus, HUD and overlays
js/main.js        boot and main loop
```

Inspired by the gameplay of *Boomerang Fu*; all characters, arenas, art and audio here are original.
