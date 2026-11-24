# DRIVELLA — Synthwave Drift Racing

A browser-based synthwave drift-racing prototype with a custom low-poly 3D car, a procedural neon environment, and a hand-built WebGL renderer.

> **Status:** Playable prototype under active development. Current renderer reference: **v0.18.53 / BUILD 119**.
> **Release identification:** every published game change increments the visible BUILD number in the HUD and startup screen; README and rendering architecture are updated in the same release.

## Current game

- **BUILD 115:** replace depth-interpolated shadow filtering with true 16-tap PCF: the vehicle receiver map uses `NEAREST`, compares each packed depth sample before averaging visibility, uses `highp` fragment arithmetic when available, and snaps the directional shadow projection to whole map texels to reduce shimmer while turning. The 2048² receiver target has a device-limit / allocation fallback. All painted body surfaces share the same filter and fixed bias; the full-scene road-shadow and garage spotlight filters are unchanged.
- **BUILD 116:** reduce fine self-shadow streaking on the side panels with a bounded slope-scaled receiver bias (larger for grazing side faces, smaller on sun-facing surfaces). The rear-quarter side-vent frame no longer casts into the body self-shadow map because it sits nearly flush with the flank. It remains visible; garage spotlight caster behavior and full-scene road shadows are unchanged.
- **BUILD 117:** add an interactive **F4 Visual Effects** panel with independent toggles for car ink outlines, SSAO, wireframe, solar/world shadows, vehicle self-shadows, glass reflections, paint highlights, lamp emission, pop-up headlights, headlight illumination, garage spotlights and their shadows, the sunset disc, vehicle lens flares, underglow and tyre-contact shadows. Settings apply immediately; existing `K`, `L` and `H` shortcuts stay synchronized with the panel.
- **BUILD 118:** reduce the vehicle self-shadow receiver map from 2048² to 1024² and render it from vehicle detail casters only; the road grid, biome and environment meshes are skipped during this secondary pass. The F4 self-shadow checkbox now truly skips receiver-map allocation/rendering when off. This removes the redundant full-scene 2048² pass that had become a major frame-time cost. The main 2048² world-shadow map remains unchanged.
- **BUILD 119:** add F3 pass profiling. CPU timings are recorded for shadow generation, main world rendering, post-processing (SSAO/ink outlines), and total JavaScript frame work. When the browser exposes `EXT_disjoint_timer_query`, asynchronous GPU timings for the same three render passes are shown; unavailable GPU timer support is reported rather than blocking the frame.
- Custom WebGL 1 renderer for the 3D vehicle, road, garage, and procedural environments.
- All four wheels animate as a single rolling assembly: tyre, brake disc, alloy spokes, and hub share one spin phase, with the rotation direction matched to forward travel.
- Windshield, rear and side glazing now show stronger view-dependent synthwave environment reflections: a blue sky gradient, magenta horizon, cyan neon bands, and garage-light specular response. This is a procedural reflection approximation, not ray-traced or screen-space reflection.
- A reusable four-slot local-light system supports point and cone spot sources with colour, range falloff, material-albedo diffuse response and restrained specular highlights. The two garage spotlights use the shared shader path and each has a separate shadow map generated from that fixture's actual position, direction, cone and range. No fake translucent beam shafts or floor patches are drawn.
- Glass (material mode 3) and painted body (material mode 4) use separate fragment-shader branches; the glass condition is explicitly bounded so it cannot capture the painted clear-coat material.
- Garage local lights illuminate the material response rather than adding unfiltered colour over the surface. Each garage spotlight also casts a real scene shadow from its own light-space camera; its contribution is multiplied by its matching shadow visibility.
- Front wheels visibly steer with the same speed-sensitive input angle used by the driving physics; inner and outer wheels use a small Ackermann angle correction, while the rear wheels remain fixed.
- Canvas 2D overlay for the synthwave sunset.
- Four camera modes, acceleration, braking, steering, drifting, and handbrake handling. During a race, hold and drag the left mouse button to temporarily look around; releasing it immediately restores the selected automatic camera. Press **C** to cycle camera modes.
- Procedural city, coastline, palms, mountains, road markings, and neon roadside elements.
- Source-bound shadows use one declared outdoor sun source (`SUN_LIGHT`) for both material lighting and the directional shadow camera; its direction points forward along the road with no arbitrary lateral offset. The full 2048² solar map keeps the complete car as a caster for road/world shadows. A separate vehicle-receiver map targets 2048² (with device-limit / allocation fallback) and uses the same sun matrix plus a nine-point circular packed-depth PCF filter. All painted vehicle receivers use the same fixed depth bias and up to 66% shadow attenuation, avoiding surface-dependent VSM light bleeding between the bumper, sides, roof and spoiler. The cabin, pillars, spoiler, lamp pods, front bumper crease and wheels cast onto the body; the continuous hull, rear fascia, exact overlays, side-vent slats and thin door seams are excluded from body self-shadowing while still casting into the full-scene solar map. Garage spotlight behavior remains unchanged. Garage spotlight maps keep their separate per-source caster policy. In the garage, each of the two spotlights gets its own cached 1024² perspective shadow map from the declared fixture position, direction, cone and range. Glass/translucent/emissive materials remain excluded by the central caster policy.
- Two animated, shader-based headlight spotlights track the pop-up lamp mechanism and illuminate ordinary world materials. CPU-side mesh/cone culling skips per-pixel lighting outside the beams. BUILD 102 corrects two-sided diffuse response so the road surface receives the beams and removes the obsolete translucent polygon-beam meshes. BUILD 103 restores compact white-blue upper-headlight lens glints using the same lightweight Canvas 2D profile as the indicators, at slightly higher intensity; the former large bloom, blur, long streaks, diffraction and chromatic ghosts remain removed. A live FPS meter and F3 renderer diagnostics are available in the garage and during races; **H** temporarily toggles diffuse spotlight illumination for testing.
- Emissive front, rear, and indicator lamps. Compact screen-space glints are used for the upper headlights, lower auxiliary lamps, rear lamps and indicators; only the expensive oversized upper-headlight flare treatment is disabled. Rear red lamps and LED bars brighten smoothly while the brake pedal or handbrake is held.
- Half-resolution full-scene SSAO with a restrained contact-only strength, a separate car contour pass, and layered neon underglow. BUILD 109 removes the world-coordinate animated highlight; BUILD 111 also removes the remaining mesh-local red lower-side mask that created inconsistent patches on separate bumper and rear-quarter parts.
- Speed / distance HUD, boot screen, garage, options, and optional local soundtrack.
- No external rendering engine, JavaScript libraries, fonts, CDNs, or runtime network dependencies.

## Rendering architecture

See **[RENDERING_ARCHITECTURE.md](RENDERING_ARCHITECTURE.md)** before changing the renderer or adding environment geometry.

The document records the frame pipeline, source registry, per-light shadow-map assignment, automatic caster classification, PCSS/VSM/PCF filtering, full-scene SSAO, material modes, known limitations, and the rules for adding opaque casters and real light sources.

**Important extension rule:** new opaque meshes must be created through `mesh(vertices)` and drawn through the shared `drawWorld()` scene path. To add a shadow-casting source, register its real position/direction/range/cone and give it a matching shadow camera and map; do not reuse the sun matrix for a garage/spot source or invent a direction solely for shadow rendering. The architecture guide documents the two existing shadow-source paths and the current two-slot local-spot limit.

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
| F4 | Open / close visual effects menu; toggle effects with the mouse |


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
- [x] Bind outdoor shadows to the actual sun source and garage spot shadows to each fixture's own position, direction and cone; isolate vehicle self-shadow receivers from the main car shell.
- [x] Make environment reflections clearly visible on the windshield, rear glass and side glazing.
- [ ] **Priority: GPU synthwave sun and optical-effects pipeline.** Replace the Canvas 2D sunset with a procedural WebGL sun while preserving its striped orange/red/magenta disc; add a layered solar corona, animated radial rays and fine spikes.
- [ ] **Depth-aware mini-RTX god rays.** Generate sun shafts from a low-resolution scene-occlusion mask so buildings, mountains and palms interrupt the rays; use bounded radial scattering at quarter resolution.
- [ ] **GPU bloom and lens optics.** Add controlled thresholded bloom, anamorphic streaks, diffraction spikes, optical rings and chromatic ghosts; migrate current Canvas 2D vehicle flare profiles without restoring oversized headlight glare.
- [ ] **Atmospheric scattering and final grading.** Add depth-aware horizon haze and atmospheric light integration while preserving road/car readability and the synthwave palette.
- [ ] Add selected local lights to track and environment props, using the shared four-slot source format.
- [ ] Improve painted-body and road reflections beyond the procedural glass environment.
- [ ] Add instanced rendering for repeated road markings, lamps, vegetation and environment props to reduce CPU draw-call overhead across normal, shadow and AO passes.
- [ ] Move high-count particle simulation to GPU only when effects and profiling justify it; keep vehicle physics and gameplay state on CPU.

### Later stages

- Expand the track, biomes, roadside props, and garage environment.
- Add opponent traffic, racing challenges, collision feedback, and progression.
- Improve mobile controls and responsive presentation.

## Tech

Vanilla HTML, CSS, and JavaScript. The main 3D scene uses a custom WebGL 1 renderer; Canvas 2D is used for the sunset overlay.

## License

No license has been added yet. All rights reserved by the repository owner unless a license is added explicitly.
