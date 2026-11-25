# DRIVELLA — Synthwave Drift Racing

A browser-based synthwave drift-racing prototype with a custom low-poly 3D car, a procedural neon environment, and a hand-built WebGL renderer.

> **Status:** Playable prototype under active development. Current renderer reference: **v0.19.29 / BUILD 195**.
> **Release identification:** every published game change increments the visible BUILD number in the HUD and startup screen; README and rendering architecture are updated in the same release.

## Current game

- **BUILD 115:** replace depth-interpolated shadow filtering with true 16-tap PCF: the vehicle receiver map uses `NEAREST`, compares each packed depth sample before averaging visibility, uses `highp` fragment arithmetic when available, and snaps the directional shadow projection to whole map texels to reduce shimmer while turning. The 2048² receiver target has a device-limit / allocation fallback. All painted body surfaces share the same filter and fixed bias; the full-scene road-shadow and garage spotlight filters are unchanged.
- **BUILD 116:** reduce fine self-shadow streaking on the side panels with a bounded slope-scaled receiver bias (larger for grazing side faces, smaller on sun-facing surfaces). The rear-quarter side-vent frame no longer casts into the body self-shadow map because it sits nearly flush with the flank. It remains visible; garage spotlight caster behavior and full-scene road shadows are unchanged.
- **BUILD 117:** add an interactive **F4 Visual Effects** panel with independent toggles for car ink outlines, SSAO, wireframe, solar/world shadows, vehicle self-shadows, glass reflections, paint highlights, lamp emission, pop-up headlights, headlight illumination, garage spotlights and their shadows, the sunset disc, vehicle lens flares, underglow and tyre-contact shadows. Settings apply immediately; existing `K`, `L` and `H` shortcuts stay synchronized with the panel.
- **BUILD 118:** reduce the vehicle self-shadow receiver map from 2048² to 1024² and render it from vehicle detail casters only; the road grid, biome and environment meshes are skipped during this secondary pass. The F4 self-shadow checkbox now truly skips receiver-map allocation/rendering when off. This removes the redundant full-scene 2048² pass that had become a major frame-time cost. The main 2048² world-shadow map remains unchanged.
- **BUILD 119:** add F3 pass profiling. CPU timings are recorded for shadow generation, main world rendering, post-processing (SSAO/ink outlines), and total JavaScript frame work. When the browser exposes `EXT_disjoint_timer_query`, asynchronous GPU timings for the same three render passes are shown; unavailable GPU timer support is reported rather than blocking the frame.
- **BUILD 195:** extend the shared ANGLE instancing path to the garage showroom. The two overhead LED fixtures are split into one opaque housing/support cube batch and one emissive lens batch; six palms use one trunk batch, one emissive ring batch and three canopy-mesh batches; the two perimeter neon rails use one emissive cube batch. Per-instance colour, yaw and material are retained, including material 8 on the light lenses and rings. The shared path keeps per-object shadow/AO/headlight culling and falls back to ordinary draws if ANGLE instancing is unavailable. The real garage spotlight source registry and its cone/shadow setup are unchanged. F3 reports showroom batch/instance counts; performance still needs target-GPU measurement.
- **BUILD 194:** extend the shared ANGLE instancing path to repeated biome geometry. City blocks (including their material-8 emissive windows) are submitted as one ordered cube batch; coastline shelves/water strips, palm trunks and the three canopy mesh variants are grouped into per-mesh batches. A new per-instance material attribute keeps emissive windows distinct from ordinary surfaces. Shadow-frustum, AO visibility and headlight-cone culling remain per object. F3 reports biome batches/instances. Production GLSL and a GPU pixel fixture verify per-instance colour/material routing; target-GPU frame-time still needs local measurement.
- **BUILD 193:** batch the repeated outdoor ground/grid, road slabs, cyan/magenta edge rails, dashed lane markers and roadside posts as one ordered ANGLE_instanced_arrays draw using the existing cube mesh. At the start reference position, 192 individual road-object submissions become one draw call in the normal, solar-shadow and scene-AO passes. Per-instance colour preserves the original order and palette; scale, position, normals, shadow-frustum culling and headlight-cone culling remain active. Browsers without the WebGL 1 ANGLE extension use the original per-object draw fallback. F3 reports the batch/instance count. Production-shader and GPU pixel regressions pass on Chromium SwiftShader; GTX 1650 performance still requires local measurement.
- **BUILD 192:** add depth-aware distance/horizon haze and restrained saturation/contrast/shadow grading inside the existing material shader. No additional framebuffer or post-process pass; emissive/neon branches bypass the grade, and the garage receives the grade without outdoor fog. F4 toggle and F3 state are available. Production shader and pixel fixtures pass; target-GPU frame-time is not yet measured.
- **BUILD 191:** move vehicle lamp orbs, diffraction rays, streaks, subtle projector rings and chromatic ghosts from the separate Canvas 2D overlay to a single batched WebGL draw on the existing scene context. Preserve the Countach projector hinge, measured bumper lamps, rear lens anchors, facing/distance attenuation, turn-signal blink and brake response. The F4 toggle remains independent; F3 reports active sources/quads. Scene Bloom is now 20% below its BUILD 189 baseline (tight: 0.976; wide: 0.576). GLSL compile and synthetic GPU pixel checks pass; in-game appearance and GTX 1650 frame-time still require validation.
- **BUILD 190:** reduce the two general-purpose scene Bloom composite gains by 10% from the BUILD 189 baseline (tight: 1.22 → 1.098; wide: 0.72 → 0.648). Bright-pass threshold, blur radii, quarter-resolution targets, and the independent Sun Bloom/God Rays paths are unchanged.
- **BUILD 189:** add a thresholded, screen-wide GPU Bloom. Capture the finished scene into a full-resolution colour/depth target, extract highlights with a soft threshold and blur them through separate tight and wide Gaussian scales at quarter resolution. Composite the original scene with the two glow levels; expose an independent F4 toggle and F3 status. Sun Bloom and God Rays remain separate effects. The later BUILD 190/191 tuning leaves this pass at 80% of the original composite energy.
- **BUILD 188:** restore the GPU sunset in the garage and enable the same depth-aware Sun Bloom/God Rays path there. Expand the garage into a three-car effects showroom with two additional copies built from the production Countach meshes, individual neon display plinths, three low-poly houses and six 3D palms. Widen garage orbit/zoom framing for whole-scene inspection; driving mode and physics are unchanged.
- **BUILD 187:** refine the God Rays source sampling. Each ray now checks the visible portion of the solar rim in its own direction, so an occluded sun centre no longer suppresses rays from exposed disc edges. Increase the effect's energy by 10%; keep the same 24 radial samples and quarter-resolution target.
- **BUILD 186:** add depth-aware solar God Rays. The quarter-resolution WebGL pass samples the existing half-resolution visible-scene mask along 24 radial steps toward the GPU sun; solid foreground geometry blocks the destination and attenuates rays behind occluders. The effect has an independent F4 toggle and appears in F3 diagnostics. GLSL/pixel regression verifies the synthetic occlusion case; visual balance and GTX 1650 frame-time still require in-game validation.
- **BUILD 184:** add a restrained four-ray cross flare to each deployed Countach pop-up headlight. The rays are projected from the same hinge- and side-mount-transformed projector centres as the headlight glow, so the cross follows the lamp as it opens. The larger upper-headlight anamorphic streak, broad diffraction and lens ghosts remain disabled.
- **BUILD 183:** reposition the Countach rear lamp optical effects to the imported `bodyTail` lens bars. The red source lenses retain brake-responsive brightness; the outer rear bar on each side receives a separate amber turn-signal overlay. Move front turn indicators to the two existing outboard lower-bumper lamp pads; the inner pair remains white auxiliary lamps. The Canvas 2D flare sources use the same measured lamp centres. No body, bumper or source-model geometry is edited.
- Custom WebGL 1 renderer for the 3D vehicle, road, garage, and procedural environments. Repeated road and biome geometry use ordered ANGLE_instanced_arrays batches where available, with per-instance colour/material routing and a standard WebGL draw fallback. The optional screen-wide scene Bloom uses an RGBA8 full-resolution capture plus quarter-resolution bright-pass and two Gaussian blur levels; this is a display-space screen effect, not an HDR render pipeline.
- All four wheels animate as a single rolling assembly: tyre, brake disc, alloy spokes, and hub share one spin phase, with the rotation direction matched to forward travel.
- Windshield, rear and side glazing now show stronger view-dependent synthwave environment reflections: a blue sky gradient, magenta horizon, cyan neon bands, and garage-light specular response. This is a procedural reflection approximation, not ray-traced or screen-space reflection.
- A reusable four-slot local-light system supports point and cone spot sources with colour, range falloff, material-albedo diffuse response and restrained specular highlights. The two garage spotlights use the shared shader path and each has a separate shadow map generated from that fixture's actual position, direction, cone and range. No fake translucent beam shafts or floor patches are drawn.
- Glass (material mode 3) and painted body (material mode 4) use separate fragment-shader branches; the glass condition is explicitly bounded so it cannot capture the painted clear-coat material.
- Garage local lights illuminate the material response rather than adding unfiltered colour over the surface. Each garage spotlight also casts a real scene shadow from its own light-space camera; its contribution is multiplied by its matching shadow visibility.
- Front wheels visibly steer with the same speed-sensitive input angle used by the driving physics; inner and outer wheels use a small Ackermann angle correction, while the rear wheels remain fixed.
- GPU shader-rendered striped synthwave disc with a three-layer radial corona in the same bounded WebGL draw, before opaque scene geometry; the original Canvas2D disc + halo remains the comparison and initialization fallback.
- Four camera modes, acceleration, braking, steering, drifting, and handbrake handling. During a race, hold and drag the left mouse button to temporarily look around; releasing it immediately restores the selected automatic camera. Press **C** to cycle camera modes.
- Procedural city, coastline, palms, mountains, road markings, and neon roadside elements.
- The garage is also a 3D effects showroom: three production Countach models, neon houses and palm trees share the scene renderer, directional shadows, ambient-occlusion mask and solar occlusion path. Drag to orbit the whole display, use the wheel to change distance, and open F4/F3 for effects and renderer diagnostics.
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
- [~] **Stage 2 / item 1: smooth GPU sun aura and disc-localized light wrap (BUILD 149–154).** BUILD 154 removes the plasma ribbons and narrow yellow ring. The disc now has a continuous multi-layer warm glow: orange close to the sun, coral through the middle and magenta farther out, with only a slow overall pulse. The object light-wrap uses three spatial scales to create a wider, softer transition along silhouettes crossing the disc instead of a thin yellow stripe. It reuses the existing scene mask and one bounded sun draw call. Target-browser visual balance and FPS validation remain part of final sign-off.
- [ ] **Add selected local lights to track and environment props**, using the shared four-slot source format.
- [ ] Improve painted-body and road reflections beyond the procedural glass environment.

### Stage 3 — Atmosphere and cinematic lighting

- [~] **Depth-aware solar God Rays — BUILD 188 (directional source refinement in BUILD 187).** Quarter-resolution scattering with 24 occlusion samples through the existing scene mask. Each ray samples the solar rim along its own direction; the effect now runs in the garage as well as on the road, using the same visible-geometry mask so houses, palms and cars can occlude the sun. Intensity remains 10% above BUILD 186. Synthetic cross-occluder and production shader tests pass; visual balance and GTX 1650 frame-time still need in-game confirmation.
- [~] **Thresholded GPU Bloom — BUILD 189; intensity tuned in BUILDS 190/191.** Capture the completed frame, apply a soft bright-pass threshold, then blur the extracted highlights into two controlled Gaussian scales at 25% resolution. Composite energy is now 20% below the BUILD 189 starting point; threshold, sampling and blur radii are unchanged. Synthetic pixel tests verify extraction; visual balance and GTX 1650 frame-time remain for in-game validation.
- [~] **GPU lens optics — BUILD 191.** Vehicle lamp optics now use the existing WebGL context and one batched screen-space quad draw instead of a Canvas 2D overlay. Preserve world-projected Countach lamp anchors, compact pop-up headlight cross rays, rear/front streaks and ghosts; add very restrained projector rings. Production shader compilation and a GPU pixel fixture pass; in-game appearance and GTX 1650 performance still need sign-off.
- [~] **Atmospheric integration and final grading — BUILD 192.** Depth-aware distance/horizon haze and a restrained saturation/contrast/shadow grade are implemented in the production material shader. The garage keeps the grade but bypasses outdoor fog; emissive and neon branches remain untinted. Visual stage accepted; target-GPU frame-time still needs measurement.

### Rendering and performance work
- [~] **GPU instancing — BUILDS 193–195.** BUILD 193 batches the ground/grid, asphalt, edge rails, lane markings and roadside posts. BUILD 194 adds city blocks, emissive windows, coastline and palms. BUILD 195 batches the showroom's repeated LED fixtures, six palms and perimeter neon rails. All reuse the generic mesh-instancing path with per-instance colour/material and per-object shadow/AO/headlight culling. Remaining work: only additional high-count environment props that profiling shows are worth batching.
- [ ] Move high-count particle simulation to GPU only when effects and profiling justify the complexity; keep vehicle physics and gameplay state on the CPU.

### Later stages

- Expand the track, biomes, roadside props, and garage environment.
- Add opponent traffic, racing challenges, collision feedback, and progression.
- Improve mobile controls and responsive presentation.

## Tech

Vanilla HTML, CSS, and JavaScript. The main 3D scene uses a custom WebGL 1 renderer; the synthwave sun is a shader-rendered background element in the main scene pass, with the previous Canvas2D sun retained as an A/B fallback; vehicle lens optics are rendered by the main WebGL context.

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


- **BUILD 136 — imported Countach pop-up headlamp rig:** save the full BUILD 135 `index.html` as `backups/index_BUILD135_before_countach_headlight_rig_BUILD136.html`. Correct the imported lamp stow/deploy direction: the authored imported optical pose uses **+45° X when stowed** and **0° X when deployed**. A single `countachHeadlightAngle()` / `countachHeadlightHinge()` transform now drives the imported lens geometry, volumetric pod meshes, spotlight placement/direction and lens flares; the legacy procedural fallback retains its own original hinge convention. The original `headlampL` / `headlampR` source parts are shallow convex twin-lens surfaces, not complete deep housings. Keep those source lenses, add a tapered 3D black pod shell behind each pair, and add separate extruded metal collars around each of the four optical faces. The lens flare overlay uses four individual local bulb centres from the decoded source geometry instead of one midpoint per pod. The existing shader still uses one broad spotlight origin per pod for performance, positioned at the pair centre and transformed by the same hinge. Version `v0.18.70` / `BUILD 136`. Browser visual fit and the deployed/stowed clearance still require in-game inspection; syntax was checked before commit.


- **BUILD 137 — unified Countach pop-up modules and lightweight lights:** preserve BUILD 136 as `backups/index_BUILD136_before_unified_headlamp_and_lighting_simplification_BUILD137.html`. Each side is now drawn through `drawCountachHeadlampAssembly()` with one shared rigid matrix for the deep housing, body-colour upper skin, metal collars and the original two-lens source mesh. The upper skin follows the imported bonnet rise from the rear hinge to the front of the pod; it masks the optics while stowed, while the same assembly raises to expose the four forward-facing lamps. H now controls only lens emission and a compact Canvas2D halo. Remove the expensive GLSL `calcHeadlightEnergy()` path, headlight position/direction uniforms, per-mesh cone culling and Stage 2 shader spotlight uploads. No per-fragment or per-object real-time headlight illumination is performed; the visible lamp effect uses emissive lens surfaces plus four screen-space 2D glows, slightly larger than the indicator effect. This deliberately restores the lightweight BUILD 102/103-style approach to prevent headlight-on FPS loss. Version `v0.18.71` / `BUILD 137`.


### BUILD 138 — GLSL startup fix

Removed an accidental closing brace after the fragment-shader varying declarations. The brace had been left behind when the previous build removed the per-fragment headlight-lighting function, causing WebGL to abort fragment-shader compilation at startup. No rendering or vehicle behavior was intentionally changed in this fix.


### BUILD 139 — Legacy pop-up headlamp assembly restored

The original seven-part dual-projector pop-up lamp assembly (wedge housing, front plate, bezel, lens, projector rings, emissive cores and painted cap) replaces the imported Countach optic render path. A fixed per-side mounting transform aligns the legacy module to the Countach lamp footprint and compensates for the legacy 45° optical-face orientation. The existing Countach hinge axis, eased `headlightDeploy` animation, `L` toggle and low-cost emissive/2D flare behavior remain shared; imported Countach headlamp meshes are no longer drawn, preventing stacked optics. No dynamic per-fragment headlight illumination was reintroduced.


### BUILD 140 — Countach lamp seating and source-optic suppression

Lower the complete restored seven-part headlamp module by 0.0206 game units (about 2 cm) so the closed painted cap sits closer to the imported bonnet. The same mount matrix continues to drive the housing, front plate, bezel, lens, projector rings, cores, cap and flare positions; the hinge axis and easing are unchanged. The importer now explicitly skips the source model's `headlampR` and `headlampL` meshes so the old fixed optics cannot be reintroduced above the replacement module. Version `v0.18.74` / `BUILD 140`. Source-level JavaScript syntax validation passed; visual seating still needs an in-game check.


### BUILD 141 — Remove legacy triangular hood lamp covers

Removed only the two disconnected triangular painted hood-cap shells from the imported Countach `bodyPaint` mesh. The loader filters triangles by their verified vertex-space bounds; the two shells contain 29 triangles each (58 total). The independent black/plastic hood meshes, Countach body shell, restored DRIVELLA seven-part pop-up headlamp assemblies, shared hinge, and lens flares are not modified. Version `v0.18.75` / `BUILD 141`.


### BUILD 142 — Remove old front headlamp overlays and fit the closed lamp caps

Removed only the two approved front-facing Countach lamp overlays from `bodyPlastic`: 48 triangles on the left and 48 on the right (96 total). The import loader records the removal count as `window.DRIVELLA_OLD_FRONT_HEADLAMP_OVERLAYS_REMOVED`. The independent DRIVELLA replacement assembly remains intact.

Refitted each moving painted cap against the exact closed Countach hinge + lamp-mount transform. The cap's upper skin is solved against `hoodSurfaceY` and overlaps the bonnet by 3 mm; its 40 mm return closes the perimeter. This makes the cap cover the old overlay opening and sit against the hood while remaining part of the animated lamp pod. The shared mount constants are used by both the fitted cap and visible lamp assembly. Version `v0.18.76` / `BUILD 142`.


### BUILD 143 — Countach loader regression fix

Fixed the BUILD 142 import regression: the counter for the two removed front headlamp overlays is now declared inside the per-part import scope before triangle filtering. Previously, the first matching overlay referenced an undeclared variable, threw a `ReferenceError`, and caused `loadCountachModel()` to abort; the renderer then entered its procedural fallback branch, making the older car appear. The imported Countach now completes loading while retaining the approved 96-triangle overlay removal and fitted moving lamp caps. No body geometry, wheel rig, hinge, animation, or lighting behavior was rolled back. Version `v0.18.77` / BUILD 143. All embedded JavaScript blocks passed syntax compilation after the fix; confirm the rendered car in the browser.


### BUILD 144 — Countach headlamp seam fit, lower body-colour pads and BUILD 122 glow

The moving upper lamp caps are rebuilt after the Countach import completes. Their perimeter and centre are fitted against the actual imported `bodyPaint` triangles in X/Z space, selecting the upper hood surface and following the nearest real mesh edge where an opening remains. This replaces the earlier generic `hoodSurfaceY` approximation for the imported Countach and keeps the existing 3 mm overlap and shared hinge/mount transform. The caps remain part of the moving lamp pods; no static filler slab or change to the radiator is added.

Separated exactly eight `bodyBlack` triangles (four per side) that form the small lower pads directly beneath the pop-up headlamps. These triangles are drawn with the existing body colour and paint material; all other black front details, central radiator, bumper, fog lamps and splitter remain in their original materials. The count is exposed as `window.DRIVELLA_LOWER_HEADLAMP_BLACK_PANELS_RECOLORED`.

Restored the BUILD 122 front-headlamp glow profile: one soft white-blue screen-space source per headlamp, centred on each current twin-projector pod and transformed by its actual Countach mount. This uses the existing Canvas2D lens-flare pass, not dynamic per-fragment lighting or a new shadow/light pass. Version `v0.18.78` / BUILD 144.


### BUILD 145 — Restore pop-up lamp cap geometry after BUILD 144 regression

Reverted only the imported-surface cap sampler/rebuild introduced in BUILD 144. Its nearest-edge fallback could select an unrelated lower body face near the front of the hood, pulling a cap vertex down by about 0.4 game units and visibly distorting the moving lid. Restored the previously validated BUILD 143 `makeLampCap()` geometry and immutable cap meshes. Retained the eight lower lamp-pad triangles rendered in body paint and the two-source BUILD 122-style white-blue headlight glow. Version `v0.18.79` / BUILD 145. JavaScript syntax validation and GitHub Pages deployment passed. The remaining upper seam is not claimed fixed; geometry should be targeted from a current in-game view before another cap change.


### BUILD 146 — Conservative moving headlamp-cap rear extension

Save BUILD 145 as `backups/index_BUILD145_before_rear_cap_extension_BUILD146.html`. Extend the rear edge of each painted moving lamp cap by 0.060 local Z units (about 0.034 game units after the existing mount Z scale). The extra painted area is part of the same cap mesh, so it uses the existing Countach hinge and mount and moves with the headlamp assembly. Do not change the optical projectors, pod housing, lens positions, hinge pivot/angle, headlight glow, lower red pads, grille, bumper or other front details. The existing `hoodSurfaceY()` cap fit remains in place; this is a conservative geometry trial, not a claim of verified visual closure. Version `v0.18.80` / BUILD 146. JavaScript syntax validation passed; closed and fully deployed visual clearance still requires in-game inspection.


### BUILD 147 — Restore the original Countach hood panels as moving headlamp caps

Save BUILD 146 as `backups/index_BUILD146_before_original_moving_cap_restore_BUILD147.html`. During Countach import, the exact 58 triangles previously filtered from the two disconnected painted hood-cap panels are now retained separately: 29 triangles per side. A strict count/vertex-buffer guard rejects an incomplete extraction. The panels are no longer drawn as part of the static body; they are drawn as the painted moving caps. Their original body-space vertices are mapped into the legacy lamp's stowed local space with the inverse of the exact closed Countach hinge+mount transform, then submitted through the current hinge+mount transform. At the closed pose, this reproduces the original panel coordinates; during deployment, the full source mesh moves rigidly with the lamp pod. The approximate `makeLampCap()` remains only as the procedural fallback. Projectors, housing, lens/bezel, hinge pivot and easing, glow, lower red pads, radiator, bumper and other body geometry are unchanged. The inverse-transform numerical check returned a maximum closed-pose point drift below 1e-15 game units and preserved sampled edge length in the open pose. JavaScript syntax passed; the final in-game closed seam and full-open clearance still need user visual confirmation. Version `v0.18.81` / BUILD 147.


### BUILD 148 — Align source lamp lids to the open-pose datum

Save BUILD 147 as `backups/index_BUILD147_before_headlamp_cap_open_pose_alignment_BUILD148.html`. The original imported Countach cap panels are authored in the fully open/deployed pose, not the closed/stowed pose. BUILD 147 incorrectly used the inverse closed assembly transform, so the panels began at their already-raised source pose and were rotated farther upward during deployment. BUILD 148 changes only the cap reference transform: precompute the inverse of the existing open lamp mount (`countachLegacyHeadlampMount`) and submit each source cap through `current hinge × mount × inverse(open mount)`. At full deployment the cap returns to its authored pose; at rest the existing +45° hinge rotates the panel down by the same motion as the lamp assembly. The lamp hinge, mount constants, easing curve, projector and housing meshes, and lighting are unchanged. Numerical checks on both sides show effectively zero open-pose drift and a 0.137 game-unit downward shift at a representative front-edge point in the closed pose. JavaScript syntax passed; final visual mating/clearance needs in-game inspection. Version `v0.18.82` / BUILD 148.


### BUILD 149 — WebGL synthwave sun and initial corona

Save BUILD 148 as `backups/index_BUILD148_before_gpu_sun_BUILD149.html`. Add a compact procedural WebGL sun shader to the existing renderer/context. The shader draws only a bounded quad around the projected disc at the beginning of the main `drawWorld()` pass, before opaque scene geometry, so the car and environment naturally occlude the sun. Preserve the orange/red/magenta gradient, clipped horizontal bands, breathing pulse, moving scan line and thin disc rim; add a restrained animated corona with an inner ring, irregular filaments and radial spikes. No second WebGL context, full-screen render pass, new dependency or change to vehicle lens flares is introduced. F4 now includes a GPU-sun checkbox: enabled uses WebGL; disabled runs the preserved original Canvas2D sun for A/B comparison. The Canvas2D path also remains the automatic fallback if the shader cannot initialize. JavaScript syntax compilation passed; final visual quality and FPS comparison still require inspection in the running game. Version `v0.18.83` / BUILD 149.


### BUILD 150 — Occlusion-aware sun aura wrap

Save BUILD 149 as `backups/index_BUILD149_before_sun_aura_wrap_BUILD150.html`. Extend the GPU sun halo with a wider, low-intensity falloff and add a screen-space silhouette-wrap term to the existing outline/AO composite shader. The term samples the already-rendered half-resolution full-scene normal/depth mask, estimates the visible geometry edge direction, and adds a subtle animated orange-to-magenta rim around nearby silhouettes, stronger on the side facing the sun. The solar disc itself remains behind opaque geometry; the rim is a restrained screen-space light-wrap approximation, not true volumetric scattering. Add the F4 `Обтекание ауры объектами` toggle, enabled by default. Reuse the current AO scene mask and fullscreen composite; when both SSAO and ink outlines are off, render only the half-resolution scene mask needed for the aura and skip the full-resolution car-outline mask. JavaScript syntax validation passed; browser shader compilation, in-game appearance and FPS still require target-browser inspection. Version `v0.18.84` / BUILD 150.

### BUILD 151 — Wider GPU sun aura and stronger silhouette wrap

Save BUILD 150 as `backups/index_BUILD150_before_sun_aura_scale_BUILD151.html`. Expand the bounded GPU sun quad and its normalized shader coordinates from 2.6 to 5.2 sun radii. Widen the broad radial falloff to approximately twice its previous reach and raise its peak contribution modestly; extend the corona fade with the expanded aura. The existing screen-space occluder-wrap composite now evaluates out to 5.2 sun radii and uses a slightly stronger contour response. The shader still uses the existing WebGL context, one sun draw call and the existing half-resolution AO scene mask; no new framebuffer or scene-capture pass is added. Because the quad covers more pixels, compare F3 GPU world/post timing and FPS in-game. The disc, stripes, pulse, projected position, vehicle flares and obstruction-mask capture are otherwise unchanged. Version `v0.18.85` / BUILD 151.

### BUILD 152 — Disc-localized luminous sun wrap

Save BUILD 151 as `backups/index_BUILD151_before_sun_disc_light_wrap_BUILD152.html`. Replace the broad 5.2-radius silhouette tint with a wrap that evaluates only within 1.24 solar-disc radii and fades at the disc edge (0.96–1.22 radii). The existing half-resolution scene mask is sampled at a sharp near radius and a wider spill radius to estimate the visible occluder edge; a source-facing term and slow pulse shape the result. Use a bright warm-white/gold core fading toward orange/magenta, then composite it as a premultiplied luminous overlay with `ONE / ONE_MINUS_SRC_ALPHA` so the rim adds light rather than darkening the scene. The normal SSAO/ink contribution is preserved in the same composite. No additional scene capture, framebuffer, texture, or full-screen pass is introduced. The sun disc itself remains behind opaque geometry; only its actual overlap with a foreground silhouette receives the wrap. Version `v0.18.86` / BUILD 152. Validate the rendered edge, shader compilation and FPS in the target browser.

### BUILD 153 — Layered dynamic GPU solar corona

Save BUILD 152 as `backups/index_BUILD152_before_dynamic_solar_corona_BUILD153.html`. Replace the barely visible uniform halo with a layered animated corona in the existing bounded WebGL sun fragment shader: a narrow gold-white inner ring, a hot orange near-disc glow, two irregular plasma ribbons whose radii move with coherent angular waves, fine and broad radial spikes, and a slower red/magenta outer haze. The overall luminance breathes gently while the angular structures move smoothly rather than flickering randomly. Preserve the striped sunset disc, its dimensions, scan line and screen position. Foreground geometry still occludes the sun and its background aura in the regular scene depth pass; BUILD 152's separate light-wrap remains restricted to silhouettes crossing the disc. Retain one existing sun draw call and add an early shader return beyond 3.72 radii to skip unnecessary corona math. No extra framebuffer or full-screen pass is introduced. JavaScript syntax validation passed; WebGL shader compilation, actual visual quality and FPS must be confirmed in the target browser. Version `v0.18.87` / BUILD 153.

### BUILD 154 — Smooth solar aura and soft object light-wrap

Save BUILD 153 as `backups/index_BUILD153_before_smooth_solar_aura_BUILD154.html`. Remove all moving plasma ribbons, angular streaks and the narrow gold-white ring from the GPU sun shader. Replace them with a continuous radial light field: a stronger near-disc orange glow, a broader coral middle layer and a soft magenta outer falloff, modulated only by a restrained slow pulse. Remove the extra bright disc-edge border so the aura reads as a volume of light rather than a yellow outline. For occluders, replace the two-scale thin contour with three scene-mask gradient scales (fine, medium and wide); combine their directional response into a broader warm-core / orange-spill / rose-haze light-wrap that remains gated to the solar disc and its immediate fringe. Keep premultiplied compositing and preserve the existing SSAO/ink contribution. The half-resolution AO/normal-depth mask is reused; no new framebuffer, scene capture or full-screen pass is added. The shader quad and single sun draw call remain bounded at 3.8 radii with an early return beyond 3.72. JavaScript syntax and source checks passed; WebGL compilation, in-game light quality and FPS still need target-browser validation. Version `v0.18.88` / BUILD 154.


### BUILD 155 — Separate soft solar aura and smooth object light-wrap

BUILD 154 is preserved at `backups/index_BUILD154_before_canvas_solar_aura_BUILD155.html`. Split the visible sun into two cooperating layers: the bounded WebGL shader now draws only the striped disc, while a dedicated Canvas2D radial gradient draws the broad orange/coral/magenta aura on the existing lower canvas beneath the transparent WebGL scene. Opaque scene geometry naturally covers the background aura, so the glow is continuous without drawing over the car or relying on the low-resolution silhouette mask. When GPU sun is disabled or unavailable, the existing Canvas2D fallback still draws both disc and halo.

For occluder light-wrap, replace hard binary `step()` samples of the half-resolution scene mask with linearly filtered smooth coverage, then evaluate fine, medium and wide gradients at broader offsets. Reduce the maximum composite opacity and soften the warm-to-rose palette to avoid a hard yellow pixel contour. The same AO target and post composite are reused; no new framebuffer or scene capture is added. JavaScript syntax/source checks are required; shader runtime, actual in-game edge quality and FPS still need browser validation. Version `v0.18.89` / BUILD 155.


### BUILD 156 — Restored radial sun aura and circular silhouette wrap

BUILD 155 is preserved at `backups/index_BUILD155_before_radial_sun_wrap_BUILD156.html`. Restore the sun's broad radial corona directly in the existing bounded GPU sun shader, alongside (but alpha-separated from) the striped disc. The halo uses overlapping exponential radial falloffs in warm orange, coral and magenta with a low-amplitude pulse and a smooth outer fade. The disc remains a single bounded draw before opaque scene geometry, so both disc and halo are naturally occluded by foreground objects. The Canvas2D fallback remains unchanged and is selected whenever GPU sun is disabled or unavailable.

Replace the axis-aligned 3/4-sample silhouette gradients with a circular 12-tap ring filter over the existing half-resolution scene mask. Two ring radii create a narrow and a wider soft edge response; the centre/ring coverage difference is smoothly ramped and restricted to the solar disc footprint. The same mask target and composite pass are reused, but the radial filter performs more texture samples in the active sun region, so compare F3 post timing and in-game FPS. JavaScript/source checks passed; GLSL runtime compilation, visual edge smoothness and performance still require browser validation. Version `v0.18.90` / BUILD 156.


### BUILD 157 — Stronger radial bloom and blurred silhouette light-wrap

BUILD 156 is preserved at `backups/index_BUILD156_before_soft_solar_bloom_BUILD157.html`. Increase the radial sun aura to three overlapping exponential falloffs with a stronger warm inner bloom and a broad magenta outer haze. Keep the aura in the same bounded GPU sun draw, behind opaque scene geometry; preserve the striped disc, pulse, and Canvas2D fallback.

Replace the prior 12-point ring-contrast detector with a two-scale circular blur field over the existing half-resolution scene mask. Each scale samples 16 evenly spaced directions; the filtered coverage difference between the centre and blurred neighbourhood forms a soft silhouette band. The vector sum of the same circular samples estimates the edge's outward direction so the wrap is stronger on source-facing edges. The result is still an image-space approximation, not physical light transport. No new framebuffer, scene capture, or fullscreen pass is added, but the active sun region now has 32 mask samples per output pixel; compare in-game F3 post GPU timing and FPS. JavaScript parsing and source invariants passed; shader compile and rendered smoothness require target-browser verification. Version `v0.18.91` / BUILD 157.


### BUILD 158 — Unified solar palette and surface-only soft light-wrap

BUILD 157 is preserved at `backups/index_BUILD157_before_surface_only_sun_wrap_BUILD158.html`. Reduce the sun corona radius and brightness so it remains a compact glow adjacent to the disc rather than a large fog bank. Define one shared solar colour ramp (hot orange → coral → magenta) and use it for both the disc aura and the foreground-object wrap.

Replace the sparse circular ring detector with a weighted 5×5 Gaussian convolution of the existing linearly filtered half-resolution scene mask. Use only the positive centre-minus-blurred-coverage difference, multiplied by centre coverage, so the highlight is drawn on the inside surface of the silhouette and does not create a matching outside halo rectangle. Estimate source-facing direction from the smooth mask gradient. The existing AO target and post composite are reused; no new framebuffer or scene pass is added. The Gaussian kernel uses 25 mask samples in the solar source region; compare F3 post timing and FPS. JavaScript parsing and source invariants passed; GLSL runtime compilation and in-game visual quality remain to be verified. Version `v0.18.92` / BUILD 158.


### BUILD 159 — Shared radial aura falloff for sun and occluders

BUILD 158 is preserved at `backups/index_BUILD158_before_shared_solar_falloff_BUILD159.html`. Remove the narrow single-colour silhouette stripe by eliminating the centre-minus-blurred-coverage threshold. The sun disc aura and foreground-object wrap now use the same `solarAuraColor(t)`, `solarAuraEnergy(radialOffset)` and `solarAuraPulse(time)` functions: identical three-stage orange/coral/magenta falloff and slow pulse. For objects, one 5×5 Gaussian sample of the existing linearly filtered half-resolution scene mask (radius 4.2) estimates continuous interior distance from the silhouette using a logarithmic mapping of the blurred coverage. The same radial energy curve then fades smoothly inward across the object surface; a soft mask-gradient term retains source-facing bias and the existing solar-disc gate prevents unrelated geometry from glowing. The prior 25 Gaussian taps plus four gradient taps are retained; no new framebuffer or render pass is added. JavaScript parsing and source checks passed; GLSL runtime compilation, in-game appearance and FPS require target-browser verification. Version `v0.18.93` / BUILD 159.


### BUILD 160 — Outward, far-side halo on solar occluders

BUILD 159 is preserved at `backups/index_BUILD159_before_outward_occluder_halo_BUILD160.html`. Correct the wrap direction and remove the condition that suppressed an exterior halo. In screen UV coordinates, the scene-mask coverage gradient points from empty pixels into the object; `-maskGradient` is therefore the silhouette's outward normal. The vector from the pixel to the sun is `toSun`, so the far-side outward direction is `-toSun`; `awayFacing` now weights the halo with `dot(outward, -toSun)` rather than the sun-facing normal. Build the halo outside the silhouette from `sceneGaussian5(vUv, 2.75) * (1.0 - centerCoverage)`, then map that soft outer coverage to the same radial distance, colour and energy functions used by the solar disc. This intentionally places the glow outside the object instead of multiplying by the object's own coverage. Expand the screen-space source gate to 2.50–4.25 solar radii so the far edges of large buildings are not discarded merely because they lie outside the disc. Reuse the existing half-resolution scene mask and composite shader; no new framebuffer or pass. JavaScript parsing and source invariants passed; GLSL runtime, actual visual quality and FPS still require target-browser testing. Version `v0.18.94` / BUILD 160.

<!-- Pages redeploy trigger for BUILD160; no game assets changed. -->


### BUILD 161 — Solar aura follows the contact line inside occluders

BUILD 160 is preserved at `backups/index_BUILD160_before_inner_surface_solar_wrap_BUILD161.html`. Replace the exterior, away-facing halo with an interior surface light-wrap. The screen-space normal still comes from the negative scene-mask coverage gradient; the desired visible face points toward the sun, so use `dot(outward, toSun)`. Reuse the linearly filtered half-resolution scene mask and 5×5 Gaussian sample (radius 2.75) to estimate how far a pixel lies inside the silhouette: `inwardDistance = max(0, (-log(1 - blurredCoverage) - ln(2)) * 0.27)`. Multiply the centre coverage by `solarAuraEnergy(inwardDistance)` to confine a smooth gradient to the inside edge and fade it into the object's surface.

The light's source direction is not reversed or remapped: evaluate `sourceRadialOffset = max(sourceDistance - 1, 0)` and pass this through the same `solarAuraEnergy`, `solarAuraColor` and `solarAuraPulse` used by the solar disc. Thus the hue and energy follow the same radial wavefront from the sun, while the inward edge falloff only deposits that light on the object's visible surface at the contact line. The active source region is limited to 1.98 sun radii, matching the sun shader's corona extent; no exterior halo or opposite-side glow is drawn. Reuse the existing mask and fullscreen composite; no new framebuffer, scene capture or render pass is added. JavaScript syntax and source invariants passed; GLSL runtime, in-game appearance and FPS require target-browser validation. Version `v0.18.95` / BUILD 161.


### BUILD 162 — F4 solar-aura debug overlay

BUILD 161 is preserved at `backups/index_BUILD161_before_sun_aura_debug_overlay_BUILD162.html`. Add an opt-in `sunAuraDebug` switch to the F4 effects panel, disabled by default. When enabled, reuse the existing full-scene half-resolution mask and fullscreen post composite to display an unmistakable diagnostic visualization of the actual inner-surface aura field: a bright contact band at the silhouette, repeated contour stripes that show the decay depth into the object, and a heat colour shifting from the solar hue at contact toward cyan farther inward. The debug shader is composited after the 3D world, so these marks remain visible over the occluding geometry. The existing foreground `#flare` canvas receives a source-center crosshair, labelled `SOURCE // SUN`, concentric radial falloff guides and outward arrowheads, all drawn after the scene and lens flares so the source and propagation direction are always visible in front of objects. No extra canvas, WebGL target, framebuffer or render pass is added; the mask and post composite are reused. The diagnostic is off by default and can be toggled in F4. JavaScript syntax and source invariants passed; GLSL runtime and target-browser appearance remain to be verified. Version `v0.18.96` / BUILD 162.


### BUILD 165 — Object-surface aura diagnostics

Correct the BUILD 162 diagnostic so it no longer draws guide rings, radial arrows or a source label around the solar disc. The F4 test is now restricted to the scene geometry: a bright warm contact edge marks the sun-facing side of an occluding object, inward chevrons show the direction of propagation into its silhouette, and contour bands shift from warm to cyan as the aura fades across the surface. The diagnostic remains in the existing fullscreen post composite after the 3D world; no extra canvas, mask, framebuffer or render pass is introduced. The test remains off by default. JavaScript parsing and source invariants pass; WebGL shader compilation and in-game appearance still require target-browser validation. Version `v0.18.99` / BUILD 165.


### BUILD 166 — Direct solar light wrap

The object aura no longer uses the half-resolution AO mask or a post-process edge reconstruction. It is computed directly for each visible environment fragment using the same projected sun centre/radius as the disc, with view-grazing emphasis at silhouettes. F4's object test paints visible fragments in the solar zone magenta through the same direct shader path. JavaScript syntax and source wiring are checked; WebGL runtime compilation and in-browser appearance still need confirmation. Version `v0.19.00` / BUILD 166.


### BUILD 167–171 — Inner-surface solar aura

The sun disc and corona are now composited through a depth-tested visible-scene mask, so they are hidden by foreground geometry. The object aura was then corrected: BUILD 167's exterior bloom and square blur were removed. BUILD 171 uses a circular mask sample field and an inward-only surface falloff. A separate ray toward the sun selects the lit contact side, leaving the opposite edge and exterior unlit.

The Playwright/Chromium regression extracts and runs the exact production sun and bloom shaders on a semi-transparent synthetic occluder. BUILD 171 passed the pixel checks: inner edge brightness 365, inward samples 300 and 127, blocked sun 27, visible sun 372, with zero alpha outside and on the opposite edge. It also checks shader compilation/linkage, framebuffers, JavaScript syntax, F4 wiring and WebGL errors. The fixture is a production-shader regression test, not a full race-game visual run on the target GPU. Version `v0.19.05` / BUILD 171.


### BUILD 172–178 — Multi-scale inner-surface solar Bloom

BUILD 172 moves the visible GPU sun disc/corona into a half-resolution source target using the depth-tested scene-visibility mask, then applies a separable Gaussian blur before compositing light onto the occluder's inward-facing surface. BUILD 173 adds distinct tight and wide Gaussian scales. The first blend was intentionally rejected by the pixel regression because its wide contribution and composite gain saturated the alpha cap, making several inward samples equally bright. BUILD 174–175 reduced the wide-layer balance and composite gain, but the directional gate still produced a broad plateau.

BUILD 176 replaces the single long source-ray lookup with three progressively farther mask samples toward the sun (4, 12 and 20 half-resolution texels), weighted 0.52 / 0.30 / 0.18. This makes the light-wrap strength decay with depth into the silhouette rather than treating a whole strip as equally sun-facing. BUILD 177 extends the wide blur reach. BUILD 178 sets the tight/wide mix to 0.90 / 0.46, tight/wide radii to 3.4 / 12.0 times DPR, and composite gain/cap to 1.50 / 0.46. The result retains a defined contact edge and adds a broader soft inner tail; the exterior and opposite edge remain unlit.

The regression executes the production WebGL 1 sun, Gaussian-blur and object-composite shaders on a synthetic translucent occluder. BUILD 178 passes shader compilation/linkage, framebuffer, JavaScript, direction, fade, locality and occlusion checks. Measured RGB sums are 156 at the sunward inner edge, 97 at the shoulder, 61 at the mid-fade and 17 deeper inside; outside and opposite-side alpha are zero. The sun remains blocked behind the occluder (27) while visible beside it (372). This is a deterministic production-shader regression, not a full race-game run or visual confirmation on the target GPU. BUILD 172–177 source snapshots are preserved in `backups/`. Version `v0.19.12` / BUILD 178.


### BUILD 180 — Restore Countach headlights, lower lamps and vehicle self-shadowing

The imported Countach no longer relies on the old procedural-car headlight coordinates. The material shader again receives two dynamic light sources, whose positions and forward directions are calculated from the same rigid hinge + per-side mount transforms used to draw the two moving pop-up headlamp assemblies. The two beams use a soft cone, a gradual 38–57 unit distance fade, and per-mesh cone culling so distant/out-of-cone geometry does not pay the lighting cost. The lighting toggle remains connected to **H / F4**.

The two imported Countach lower-bumper lamp pads are located directly from the compressed source mesh. Four small framed lenses are placed at the two pads on each side, with matching flare positions using the same four centre coordinates. The upper and lower flare points therefore track the new car geometry rather than the previous vehicle's nose.

The secondary vehicle self-shadow map is generated only when **Самозатенение автомобиля** is enabled in F4. Restore the opaque Countach body, wheel assemblies and selected details as solar-shadow casters; keep emissive lens surfaces out of the depth map. The F4 description now reflects the working feature rather than the old deferred status.

The BUILD 180 regression compiles the production WebGL 1 material, bloom and sun shaders, verifies the headlight uniforms/cone and shared pop-up transform wiring, checks that opaque body/wheel casters are enabled and emissive lower lenses are not casters, and decodes the actual compressed Countach geometry. It confirms four lower-lamp centres sit within the eight source bumper-pad triangles. The shader/geometry regression and Pages deployment passed. This is a code/GLSL/geometry regression, not a full visual run on the user's target GPU. BUILD 179 is preserved at `backups/index_BUILD179_before_headlight_and_shadow_restore_BUILD180.html`. Version `v0.19.14` / BUILD 180.
\n\n### BUILD 181 — Softer, longer-range Countach headlight falloff\n\nReduce the dynamic headlight contribution substantially: source intensity changes from 3.8 to 1.25, the material contribution from 1.38 to 0.92, and the diffuse response is capped at 0.82 with a smaller ambient floor. This is intended to stop nearby road and object surfaces from being overexposed while keeping a visible cool-white beam.\n\nReplace the relatively abrupt 38–57 unit distance fade with a broad 28–100 unit smooth fade, while slightly softening and widening the angular transition from `smoothstep(0.78,0.985)` to `smoothstep(0.60,0.94)`. The CPU mesh culler follows the same 100-unit limit and wider cone, so surfaces within the new beam are not prematurely excluded. Lamp positions, Countach hinge transforms, pop-up animation and H/F4 controls are unchanged.\n\nThe production regression now verifies the lower energy, expanded distance fade, cone transition and matching CPU culling values, while compiling/linking the actual production material shader and retaining the solar Bloom pixel tests and Countach lower-lamp geometry checks. It does not render a complete drive scene or certify appearance on the user's GPU. BUILD 180 is preserved at `backups/index_BUILD180_before_soft_headlight_falloff_BUILD181.html`. Version `v0.19.15` / BUILD 181.\n

### BUILD 182 — Selectable Sun Bloom quality in F4

Add a live **Качество Sun Bloom** selector to the F4 effects panel. **Performance** remains the default and keeps the previous half-resolution two-scale/five-sample path. **High** uses a two-thirds-resolution source, three Gaussian scales and a nine-sample separable kernel. **Ultra** uses three-quarter resolution, four scales (including a broad atmospheric layer) and a thirteen-sample kernel. The selected profile reallocates only its own targets when changed; it does not require a reload. Resetting F4 returns the quality to Performance.

The post composite accepts up to four scale textures and applies profile-specific gains. Unused middle/atmosphere samplers bind the tight layer with zero gain, so Performance keeps its original two-layer contribution. All modes continue to use the depth-tested visible-sun source, progressive sun-facing ray field, object coverage gate and inward-only composite. F3 reports the selected profile.

The regression compiles the production WebGL 1 shaders, renders the existing Performance pixel fixture, executes the nine- and thirteen-sample Gaussian branches, checks all three resolution profiles and their F4 wiring, and retains Countach/headlight and solar Bloom geometry/pixel checks. These tests validate shader and source behaviour but do not establish a measured frame-time budget on a GTX 1650/1660. Version `v0.19.16` / BUILD 182.


### BUILD 183 — Countach rear lamps and lower-bumper turn indicators

The front turn indicators now occupy the two outboard lenses in the existing four-lamp lower bumper row: `[-0.944,0.621,2.588]` and `[0.944,0.621,2.588]`. The two inboard lenses at `x=±0.739` stay white as auxiliary/fog lamps. The dark frames and lens quads are fitted to the measured sloped bumper-pad normal; the bumper mesh and the source Countach asset are unchanged.

The imported `bodyTail` contains three vertical red lens bars on each side, on `z=-2.6039`. The middle bar remains the red running/brake light and keeps its existing brake-responsive material. The outermost bar on each side is reused as the amber turn indicator via a thin duplicate of its two source triangles, offset 0.004 world units rearward. No new rear panel or body modification is introduced.

Vehicle lens-flare points are moved onto the same lower front lamps and rear lens bars. The regression decodes the original compressed Countach model, checks the front bumper-pad fit and rear source triangles, parses the complete production inline JavaScript, compiles the production WebGL 1 shaders and loads the actual game page to confirm both rear indicator meshes are created. The automated test does not replace visual inspection in the browser on the target GPU. BUILD 182 is preserved at `backups/index_BUILD182_before_vehicle_lamp_repositioning_BUILD183.html`. Version `v0.19.17` / BUILD 183.


### BUILD 184 — Compact cross flare for the Countach pop-up headlights

Each of the two upper pop-up headlight projectors now receives a compact four-ray cross: a horizontal ray, a shorter vertical ray and two restrained diagonals. The flare uses the existing camera projection, the same per-projector world position and the same facing/distance/intensity gates as the soft headlight glow, so it follows the mechanical hinge through deployment instead of remaining at a fixed point.

Only the cross strokes are added. The existing upper-headlight broad halo remains unchanged, and the larger anamorphic streak, long diffraction treatment and chromatic ghost layers remain bypassed to avoid restoring the old expensive glare profile. The regression checks the four ray axes/lengths/widths and verifies the feature remains in the headlight-only branch before the existing `continue` that skips the larger optical treatment. Version `v0.19.18` / BUILD 184. BUILD 183 is preserved at `backups/index_BUILD183_before_pop_up_headlight_cross_flare_BUILD184.html`.


### BUILD 185 — Softer horizontal and vertical pop-up headlight cross rays

Tune only the horizontal and vertical rays of the BUILD 184 four-ray cross. The horizontal length factor changes from 2.55 to 2.10 and its half-width from 0.050 to 0.038; the vertical length changes from 1.48 to 1.15 and its half-width from 0.042 to 0.032. Their individual central energy is reduced from 0.24 to 0.16. The two diagonal rays retain their BUILD 184 length, width and energy. The cross remains attached to the animated pop-up projector points; all other lamp effects are unchanged. The production regression checks the exact tuned profile and parses the full game script. BUILD 184 is preserved at `backups/index_BUILD184_before_cross_ray_tuning_BUILD185.html`. Version `v0.19.19` / BUILD 185.
