# DRIVELLA — Synthwave Drift Racing

A browser-based synthwave drift-racing prototype with a custom low-poly 3D car, a procedural neon environment, and a hand-built WebGL renderer.

> **Status:** Playable prototype under active development. Current renderer reference: **v0.18.61 / BUILD 127**.
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

- **BUILD 120:** simplify vehicle self-shadowing from the layered 16-tap circular PCF footprint to a compact four-tap cross filter with one restrained, uniform shadow tone. This is a visual simplification; the full-scene solar shadows and garage spot shadows are unchanged.

- **BUILD 121:** replace vehicle self-shadow filtering with a binary monochrome mask: one depth comparison per receiver pixel, one fixed shadow strength, and a hard contour. No PCF taps, penumbra, or internal tonal variation. This affects vehicle self-shadowing only.

- **BUILD 122:** save a complete pre-cleanup game backup at `backups/index_BUILD121_pre_vehicle_cleanup.html`. Rebuild the cabin mesh as an exterior-only shell: remove its lower inner sidewalls, underside faces and end caps that were hidden inside/overlapping the main body hull. The visible roof, window surround, outer pillars and glass remain. The cabin's exterior shell continues to cast vehicle self-shadows.

- **BUILD 123:** save `backups/index_BUILD122_pre_cabin_rebuild.html` before the cabin rebuild. Remove the independent cabin shell and replace it with one roof panel, shared-coordinate roof rails and A/C pillars. Generate continuous left/right side glass directly from the exact shoulder/upper strips removed from `bodyMesh`, using the same profile and wheel-arch stations. The windshield meets the front roof/body corners; the rear screen meets the roof and rear deck; the B-pillar overlays the sealed side glass. Left/right body-window strips use mirrored triangle diagonals to keep the glass topology symmetric. Obsolete cabin-profile, duplicate inner-shell and unused legacy window-frame geometry is removed.

- **BUILD 126:** save `backups/index_BUILD123_before_cabin_and_headlight_fix.html` before correcting the earlier cabin rebuild. The main body hull now removes both shoulder-to-roof side strips (left/right ring faces) and the old roof faces beneath the raised roof footprint; the roof opening endpoints are included in the body mesh station set to avoid partial leftover faces. Replace the former narrow side strips with complete glazing panels spanning body shoulder to roof rail, and align A/B/C pillars and roof rails just outside the glass. The previous duplicate body roof therefore no longer shows through the side windows. Lower the complete pop-up lamp assembly by `0.16` world units and apply the same offset to the actual headlight light positions and lens flares; the deployed optical normal remains forward along the vehicle's +Z axis.

- **BUILD 127:** save `backups/index_BUILD126_before_shadow_default_and_flat_glass.html`. Vehicle self-shadowing is off by default (`FX_DEFAULTS.vehicleShadows=false`) but remains available in F4, visibly marked **ОТЛОЖЕНО** until the contour/artifact work is revisited. Replace segmented side glazing with exactly one planar quadrilateral (two coplanar triangles) per side; upper and lower edges are straight and level, with upper half-width 0.84 vs 0.80 for the windscreen and lower half-width 1.08. The front and rear windscreens meet the corresponding side-glass corners, and the roof rails share the straight top edge. Rebuild pop-up optics to sit flush on the hood while stowed, rotate the complete assembly through 90° when deployed, and remove the erroneous -0.16 vertical offset from the mesh, headlight source, and flare transforms. The deployed beam points forward along vehicle +Z.

- **BUILD 128:** save `backups/index_BUILD127_before_restore_BUILD122_popups.html`. Restore the complete BUILD 122 volumetric pop-up headlights instead of the flat BUILD 127 optics: recessed 45° wedge housing, separate hood-profile lid, front plate, bezel, lenses and paired projector rings/cores. The painted lid follows `hoodSurfaceY` and sits just above the hood; the optical housing is recessed 0.037 below the hood surface. Restore the shared 45° hinge travel and matching forward-facing deployed beam for the meshes, world-space headlight spots and lens-flare normal. No arbitrary `-0.16` assembly translation is used.

- **BUILD 129:** save `backups/index_BUILD128_before_window_fit.html`. Rebuild the body window-aperture perimeter to meet the single planar side-glass quads: each body ring inside the window range computes its shoulder and roof-edge vertices from the exact glass-plane Z slice, and intermediate upper vertices remain inside the removed aperture. Add the side-glass top endpoints to the body station set. Match the windshield and rear-glass upper corners to the same side-glass corners; extend both upper edges 5 mm under the roof and raise them 4 mm above the roof edge to close the small top seams. The glass remains planar and mirrored.

- **BUILD 130:** save `backups/index_BUILD129_before_cabin_front_rear_aperture_fix.html`. Extend the original body-hull roof cut from the roof-panel-only interval to the full windscreen/cabin glazing footprint, `CABIN_GLASS_REAR_BOTTOM_Z..CABIN_GLASS_FRONT_BOTTOM_Z`. The front and rear glass already close those end spans; removing the residual original body-roof strips prevents their old cabin polygons from protruding through the left/front and rear glass junctions. The raised outer roof and glass geometry are otherwise unchanged.

- **BUILD 131:** save `backups/index_BUILD130_before_persistent_drift_spin_physics.html`. Remove the artificial `carYaw` clamp so the chassis can rotate continuously through 360°. Raise the yaw-rate ceiling and add a controllable handbrake yaw impulse for deliberate full spins, while preserving the former ±0.82 rad/s normal yaw target; the stronger 1.45× yaw response is applied only after drift lock engages. A SPACE + steering input above 28 km/h, or a sustained high-speed slip, engages a persistent drift lock. The lock survives handbrake release and keeps rear lateral grip low; countersteering progressively restores grip and exits the lock after the slip recentres/crosses through neutral. A short re-arm cooldown prevents the recovery phase from immediately relatching as a second drift. The HUD continues to show DRIFT after SPACE is released, and F3 debug telemetry now reports lock state, slip angle and yaw rate. Version `v0.18.65`.


- **BUILD 132:** save `backups/index_BUILD131_before_vector_bicycle_drift_physics.html`. Replace the spin-only road-forward movement with a body-frame velocity model: longitudinal speed follows the car's nose and lateral velocity represents slip. Front lateral force follows the steered front wheels; rear lateral damping is state-dependent for RWD arcade drift. The four states are Grip, Initiation, Sustained Drift and Recovery. Entry is triggered by a brief 160 ms handbrake tap while steering, a high-speed sharp steering input, or braking into a turn. Drift persists after handbrake release; steering into the turn increases yaw, countersteering reduces slip, and releasing the wheel invokes a softer automatic alignment. Holding countersteer through the neutral slip angle initiates the opposite drift. Throttle accelerates along the body-forward axis; drift drag slows the car when the driver lifts. World X and Z are integrated from the same rotated velocity vector, so a 360° rotation changes the actual travel path. The odometer tracks arc length separately from world Z, and wheel spin follows longitudinal wheel travel. Version `v0.18.66`.

- **BUILD 133:** save `backups/index_BUILD132_before_countach_body_and_wheels.html`. Rework the existing DRIVELLA GTS procedural body toward a low, angular Countach silhouette: longer tapered front wedge, wider rear haunches, flatter/lower canopy, broader front intake and rear fascia, plus larger side air intakes. Update body profile, roof stations, glazing corner coordinates, window pillars, arch outlines and front/rear trim together so dependent surfaces continue to meet. Preserve the previous dual pop-up lamp rig: shared 45° hinge, hood-sampled stow lids, recessed wedge housings, paired projector optics, and matching world-space spot/flare direction. Rebuild the wheel faces as deeper multi-spoke alloys with centre details and add tread blocks. Each wheel now accumulates its own rolling distance from local longitudinal velocity, lateral slip and yaw at its axle; all rotating tyre/rim/tread parts share that wheel's spin, the front axle continues to steer with Ackermann/countersteer, and brake calipers remain fixed to the suspension. DRIVELLA name and existing driving/drift physics are unchanged. Version `v0.18.67`.

  **Imported source model:** [Low Poly Lamborghini Countach](https://sketchfab.com/3d-models/low-poly-lamborghini-countach-c9b28a4ad5c74649a09afa613dd3fae1) by **3DShinobi**, Sketchfab, **CC BY**. BUILD 135 replaces the procedural Countach body with the actual imported mesh. The source geometry is bundled as offline chunks in `assets/countach_model_*.js`; the browser inflates and converts it into the existing WebGL mesh format at startup. Body/material parts, the two headlamp assemblies and the wheel parts remain separate. The in-game HUD links the source and displays the author/license credit. Geometry, materials, left/right mirroring, headlight deployment, wheel animation and integration are adapted for DRIVELLA.

- **BUILD 135:** preserve the BUILD 133 procedural renderer as a load-failure fallback, but make the imported 3DShinobi Countach mesh the active vehicle. Use only local JavaScript geometry assets at runtime: `countach_model_0.js` carries the part metadata and initializes the packed payload; `0a`–`0d`, `1`, `2` and `3a`–`3d` append the exact, ordered Base64 chunks. The payload is deflate-compressed indexed geometry (78,636 decoded bytes); vertices are quantized to 1e-4 game units and triangle indices are 16-bit. The startup loader inflates the payload, expands the indexed triangles into the renderer's existing `mesh()` format and creates GPU meshes without a remote model fetch or a new rendering dependency.
  
  Imported mesh parts are split by source material for body paint, black/plastic/metal trim, rear light panel, front detail, mirrors, exhausts, headlamp assemblies, tyres and rims. The left-side mirror and wheels are reflected on X with triangle winding corrected. The source model's wheelbase is 3.2824 game units, half-track 0.9274 and wheel radius 0.4. Each tyre/rim assembly follows its own `wheelTravel[fl|fr|rl|rr]`; because the left geometry is mirrored, its spin sign is reversed. The front axle retains Ackermann steering and visual countersteer.
  
  The imported headlamp meshes are separate. Their hinge is at local Y=0.76 / Z=2.30; the imported orientation requires a +45° X rotation when stowed and 0° when deployed, eased with smoothstep. The same hinge transform drives the visible lamp meshes, world-space spotlight origins/directions and lens flares. The prior procedural lamp and body render path remains available only as a fallback. Attribution is visible in the HUD: 3DShinobi · Sketchfab · CC BY. Version `v0.18.69` / `BUILD 135`.
