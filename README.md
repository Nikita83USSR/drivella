# DRIVELLA — Synthwave Drift Racing

A browser-based synthwave drift-racing prototype with a custom low-poly 3D car, a procedural neon environment, and a hand-built WebGL renderer.

> **Status:** Playable prototype under active development. Current renderer reference: **v0.18.44 / BUILD 110**.

## Current game

- Custom WebGL 1 renderer for the 3D vehicle, road, garage, and procedural environments.
- All four wheels animate as a single rolling assembly: tyre, brake disc, alloy spokes, and hub share one spin phase, with the rotation direction matched to forward travel.
- Windshield, rear and side glazing now show stronger view-dependent synthwave environment reflections: a blue sky gradient, magenta horizon, cyan neon bands, and garage-light specular response. This is a procedural reflection approximation, not ray-traced or screen-space reflection.
- A reusable four-slot local-light system supports point and cone spot sources with colour, range falloff, material-albedo diffuse response and restrained specular highlights. Two narrow, near-white garage spotlights use the shared shader path; no fake translucent beam shafts or floor patches are drawn.
- Glass (material mode 3) and painted body (material mode 4) use separate fragment-shader branches; the glass condition is explicitly bounded so it cannot capture the painted clear-coat material.
- Garage local lights illuminate the material response rather than adding unfiltered colour over the surface. Their contribution remains independent of the directional shadow multiplier; local-light shadow casting and occlusion are not implemented.
- Front wheels visibly steer with the same speed-sensitive input angle used by the driving physics; inner and outer wheels use a small Ackermann angle correction, while the rear wheels remain fixed.
- Canvas 2D overlay for the synthwave sunset.
- Four camera modes, acceleration, braking, steering, drifting, and handbrake handling. During a race, hold and drag the left mouse button to temporarily look around; releasing it immediately restores the selected automatic camera. Press **C** to cycle camera modes.
- Procedural city, coastline, palms, mountains, road markings, and neon roadside elements.
- Dynamic directional shadows with a shared opaque-scene caster path, PCSS-style soft filtering, and camera-adaptive coverage. BUILD 110 fixes the shadow pass so opaque garage/track geometry is included; translucent and emissive effects remain excluded by the central material policy.
- Two animated, shader-based headlight spotlights track the pop-up lamp mechanism and illuminate ordinary world materials. CPU-side mesh/cone culling skips per-pixel lighting outside the beams. BUILD 102 corrects two-sided diffuse response so the road surface receives the beams and removes the obsolete translucent polygon-beam meshes. BUILD 103 restores compact white-blue upper-headlight lens glints using the same lightweight Canvas 2D profile as the indicators, at slightly higher intensity; the former large bloom, blur, long streaks, diffraction and chromatic ghosts remain removed. A live FPS meter and F3 renderer diagnostics are available in the garage and during races; **H** temporarily toggles diffuse spotlight illumination for testing.
- Emissive front, rear, and indicator lamps. Compact screen-space glints are used for the upper headlights, lower auxiliary lamps, rear lamps and indicators; only the expensive oversized upper-headlight flare treatment is disabled. Rear red lamps and LED bars brighten smoothly while the brake pedal or handbrake is held.
- Half-resolution full-scene SSAO with a restrained contact-only strength, a separate car contour pass, and layered neon underglow. BUILD 109 removes a world-coordinate animated highlight that previously slid across vehicle parts as the chassis rotated.
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
| C | Cycle camera mode while driving | 
| Hold + drag left mouse button | Temporary free-look; release to return to automatic camera |
| L | Toggle headlights |
| K | Toggle wireframe |
| F3 | Toggle debug panel |
| H | Diagnostic: toggle headlight diffuse lighting | 


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
- [x] Build a reusable four-slot local-light shader and use it for the two coloured garage spotlights.
- [x] Make environment reflections clearly visible on the windshield, rear glass and side glazing.
- [ ] Add selected local lights to track and environment props, using the shared four-slot source format.
- [ ] Improve emissive materials and introduce a controlled bloom pipeline.
- [ ] Improve painted-body and road reflections beyond the procedural glass environment.
- [ ] Add atmospheric depth and final image grading.

### Later stages

- Expand the track, biomes, roadside props, and garage environment.
- Add opponent traffic, racing challenges, collision feedback, and progression.
- Improve mobile controls and responsive presentation.

## Tech

Vanilla HTML, CSS, and JavaScript. The main 3D scene uses a custom WebGL 1 renderer; Canvas 2D is used for the sunset overlay.

## License

No license has been added yet. All rights reserved by the repository owner unless a license is added explicitly.
