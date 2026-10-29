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
| Swing (slash; also swats boomerangs out of the air) | Left mouse button |
| Charge & throw — hold to charge, release to throw | Right mouse button (hold) |
| Recall a dropped boomerang (empty-handed) | Right mouse button (hold) |
| Dash | `Space` |
| Pause | `Esc` |

Keybinds accept any keyboard key or mouse button and are saved in your browser.

## Rules

The rules follow *Boomerang Fu*'s as closely as its public documentation allows:

- **One hit kills.** A slash or a boomerang slices you in half (a Shield absorbs one hit).
- **Throwing:** hold to charge (longer = further and faster) and release. Moving sideways as you let go curves the throw. The boomerang flies out and comes back to you.
- **Drops and recall:** a boomerang that hits a wall, or gets swatted by a slash or another boomerang, falls to the floor. Walk over it, or hold throw with empty hands to recall it — you stand still while it floats back over walls, and it can slice anyone in its path.
- **Hazards:** fall into water or a chasm and you're out. Dashing carries you over gaps.
- **Scoring (Free for All):** *Most kills* (default): +1 per slice, −1 for killing yourself, no penalty for falling on your own, never below 0. *Last standing*: only the sole survivor scores, one point per round. Ties at the target go to a **tie-breaker round** between the tied players — first slice wins.
- **Teams:** 2 teams; the last team standing scores. Friendly fire is optional.
- **Power-ups** come from blue books. They last the whole match; you can hold 3 at once (plus a Shield) and a 4th replaces your oldest. Fire and Ice cancel each other. Spawn rate (Off / 0.5x / 1x / 2x) and every power-up can be toggled under *Rules*.
- **Match awards** (Sharpshooter, Sniper, Butterfingers…) are shown on the victory screen.

## Features

- **4 fighters:** Bao, Kiwi, Macaron and Radish — each gets sliced in half with its own filling. Fighters hold their boomerangs with little hands, wind up to throw and swing them like blades.
- **3 arenas:** Sunny Kitchen (oil spills around a sink), Frosty Glade (slippery pond with ice holes), Sunset Canyon (bottomless chasm with two bridges). Pick one or shuffle every round.
- **Bots with 3 difficulties:** Easy, Normal and Hard — set per bot or for all at once. They charge their throws visibly, recall dropped boomerangs, dodge and swat.
- **12 power-ups:** Caffeinated, Dash Through Walls, Teleport, Explosive Boomerang, Multi Boomerang, Fire Boomerang, Ice Boomerang, Disguise, Shield, Telekinesis, Decoy and Extra Boomerang.
- Bushes to hide in, slow-mo final kills, score screens and a victory podium.
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
