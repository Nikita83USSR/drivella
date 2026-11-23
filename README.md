# DRIVELLA — Synthwave Drift Racing

A browser-based synthwave racing game prototype focused on stylish driving, neon atmosphere, and satisfying drift mechanics.

> **Status:** Early playable prototype. The project is actively evolving.

## Current prototype

- Procedural pseudo-3D neon road rendered with Canvas 2D.
- Synthwave sunset, mountains, city silhouettes, and glowing roadside elements.
- Player car with steering, acceleration, braking, and boost.
- Speed and distance HUD.
- Animated DRIVELLA boot / loading screen.
- Optional local soundtrack playlist.
- No external libraries, fonts, CDNs, or runtime network dependencies.

## Run locally

Simply open `index.html` in a modern browser. No build tools or installation are required.

## Controls

| Key | Action |
|---|---|
| W / ↑ | Accelerate |
| S / ↓ | Brake |
| A / ← | Steer left |
| D / → | Steer right |
| Space | Boost |
| M | Toggle music |

## Music

Place up to four MP3 tracks in `assets/music/` and name them `1.mp3`, `2.mp3`, `3.mp3`, and `4.mp3`. The game can cycle through the local tracks. Music is optional.

## GitHub Pages

1. Open **Settings → Pages** in this repository.
2. Select **Deploy from a branch**.
3. Choose **main** and **/(root)**, then save.
4. Wait for GitHub Pages to publish the site.

## Roadmap

- Refined drift / slide handling.
- Better track variety and road-side environments.
- Opponent traffic and racing challenges.
- Collision and feedback systems.
- Expanded menus, settings, and progression.
- Mobile touch controls and responsive polish.

## Tech

Vanilla HTML, CSS, and JavaScript. Rendering uses the browser Canvas 2D API.

## License

No license has been added yet. All rights reserved by the repository owner unless a license is added explicitly.
