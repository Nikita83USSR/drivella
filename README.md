# DRIVELLA — Synthwave Drift Racing

A browser-based synthwave drift-racing prototype with a custom low-poly 3D car, a procedural neon environment, and a hand-built WebGL renderer.

> **Status:** Playable prototype under active development. Current renderer reference: **v0.18.32 / BUILD 098**.

## Current game

- Custom WebGL 1 renderer for the 3D vehicle, road, garage, and procedural environments.
- Canvas 2D overlay for the synthwave sunset.
- Four camera modes, acceleration, braking, steering, drifting, and handbrake handling.
- Procedural city, coastline, palms, mountains, road markings, and neon roadside elements.
- Dynamic directional shadows with automatic environment participation, PCSS-style soft filtering, and camera-adaptive coverage.
- Two animated, shader-based headlight spotlights that illuminate ordinary world materials and track the pop-up lamp mechanism; BUILD 098 avoids unused per-pixel light work and skips pixels outside the existing 42-unit light radius without reducing the spotlight profile.
- Emissive front, rear, and indicator lamps with controlled camera-facing screen-space lens flares, a restrained anamorphic streak, softened translucent optical rings, star diffraction and chromatic ghost reflections. Rear red lamps and LED bars brighten smoothly while the brake pedal or handbrake is held.
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

### Stage 1 — Volume and depth

Core implementation completed: adaptive directional shadows, PCSS-style filtering, full-scene SSAO, and procedural tyre contact shadows. See the rendering architecture document for remaining advanced extensions and limitations.

### Stage 2 — Lighting and material response

- [x] Add two dynamic headlight spotlights tied to the animated pop-up headlight assembly.
- [x] Add self-emissive lamp materials and camera-dependent lens flares for headlights, tail lights, and turn indicators.
- [ ] Add reusable local lighting for garage fixtures and selected environment lights.
- [ ] Improve emissive materials and introduce a controlled bloom pipeline.
- [ ] Improve road, body, and glass reflections without breaking the shared scene renderer.
- [ ] Add atmospheric depth and final image grading.

### Later stages

- Expand the track, biomes, roadside props, and garage environment.
- Add opponent traffic, racing challenges, collision feedback, and progression.
- Improve mobile controls and responsive presentation.

## Tech

Vanilla HTML, CSS, and JavaScript. The main 3D scene uses a custom WebGL 1 renderer; Canvas 2D is used for the sunset overlay.

## License

No license has been added yet. All rights reserved by the repository owner unless a license is added explicitly.
