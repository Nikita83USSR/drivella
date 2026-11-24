# DRIVELLA — Synthwave Drift Racing

A browser-based synthwave drift-racing prototype with a custom low-poly 3D car, a procedural neon environment, and a hand-built WebGL renderer.

> **Status:** Playable prototype under active development. Current renderer reference: **v0.18.24 / BUILD 090**.

## Current game

- Custom WebGL 1 renderer for the 3D vehicle, road, garage, and procedural environments.
- Canvas 2D overlay for the synthwave sunset.
- Four camera modes, acceleration, braking, steering, drifting, and handbrake handling.
- Procedural city, coastline, palms, mountains, road markings, and neon roadside elements.
- Dynamic directional shadows with automatic environment participation, PCSS-style soft filtering, and camera-adaptive coverage.
- Half-resolution full-scene SSAO, separate car contour pass, and layered neon underglow.
- Speed / distance HUD, boot screen, garage, options, and optional local soundtrack.
- No external rendering engine, JavaScript libraries, fonts, CDNs, or runtime network dependencies.

## Rendering architecture

See **[RENDERING_ARCHITECTURE.md](RENDERING_ARCHITECTURE.md)** before changing the renderer or adding environment geometry.

The document records the frame pipeline, shadow-map implementation, automatic caster classification, PCSS approximation, full-scene SSAO, material modes, known limitations, and the rules that let future opaque scene objects cast shadows without per-object shadow code.

**Important extension rule:** new environment meshes must be created through `mesh(vertices)` and drawn through the shared `drawWorld()` scene path. The shadow and AO passes replay that same scene path; do not create one-off shadow decals or separate shadow maps for individual props.

## Run locally

Open `index.html` in a modern browser with WebGL 1 support. No build tools or installation are required.

## Controls

| Key | Action |
|---|---|
| W / ↑ | Accelerate |
| S / ↓ | Brake / reverse |
| A / ← | Steer left |
| D / → | Steer right |
| Space | Handbrake |
| M | Toggle music |
| 1–4 | Change camera |
| L | Toggle headlights |
| K | Toggle wireframe |
| F3 | Toggle debug panel |

## Music

Place up to four MP3 tracks in `assets/music/` and name them `1.mp3`, `2.mp3`, `3.mp3`, and `4.mp3`. Music is optional.

## GitHub Pages

The project is designed to publish directly from the `main` branch and repository root using GitHub Pages.

## Roadmap

- Continue improving the dynamic environment and its shadow / ambient-occlusion quality.
- Expand the track, biomes, roadside props, and garage environment.
- Improve material response, bloom, reflections, and post-processing.
- Add opponent traffic, racing challenges, collision feedback, and progression.
- Improve mobile controls and responsive presentation.

## Tech

Vanilla HTML, CSS, and JavaScript. The main 3D scene uses a custom WebGL 1 renderer; Canvas 2D is used for the sunset overlay.

## License

No license has been added yet. All rights reserved by the repository owner unless a license is added explicitly.
