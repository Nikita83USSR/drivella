# DRIVELLA — Rendering Architecture

Current reference: **v0.19.25 / BUILD 191**  
Main renderer: `index.html` — custom WebGL 1 renderer, no external rendering engine.

**Release marker policy:** every published renderer/game change increments `BUILD` in `index.html` and updates the visible HUD, boot screen, README, and this document in the same release. Increment the patch version with the build when appropriate. Never publish a renderer change while leaving the visible build number unchanged.

This document records the rendering decisions that future vehicle, environment, lighting, and effects work must preserve. The goal is a reusable scene pipeline: new world geometry should take part in shadows and ambient occlusion automatically when it uses the shared draw path.

## Frame pipeline

When `FX.sceneBloom` is enabled, the main `drawWorld()` pass renders to a full-resolution RGBA8 colour texture with a matching depth renderbuffer instead of directly to the default framebuffer. The frame is then thresholded and composited back before the existing sun/SSAO/outline post-process. With this toggle off, the main pass goes directly to the default framebuffer and the capture target is bypassed.

The render loop currently runs these passes in order:

1. `renderShadowMap()` — render the full-scene solar map and garage spotlight maps into packed-depth textures. When `FX.vehicleShadows` is enabled, also render a 1024² packed-depth PCF receiver map using only selected vehicle detail casters; the normal/road/biome environment pass is skipped for this secondary map.
2. `drawWorld()` — render the visible scene using the active driving or garage camera, sample the shadow map on receiving materials, and draw the striped GPU sun disc plus radial corona before opaque scene geometry on the main framebuffer.
3. `renderCarOutlines()` — render the half-resolution full-scene normal/depth/visibility mask for SSAO, solar occlusion, quarter-resolution God Rays and/or GPU Sun Bloom. God Rays sample the mask along 24 bounded radial steps toward the projected sun and write a quarter-resolution shaft texture; the existing fullscreen composite adds the shafts only where the destination remains visible background. Sun Bloom still renders the visible sun through that mask into its selected source target, runs the chosen separable Gaussian layers, and composites the result onto the inward-facing, sunward portion of the occluder. The full-resolution car mask is rendered only when ink outlines are enabled. The scene mask remains active when SSAO and ink outlines are disabled if the sun is using occlusion, God Rays or Bloom.
4. `drawSun()` — when GPU sun is disabled or unavailable, draw the complete Canvas2D disc + halo fallback. This canvas is no longer used for vehicle-lamp optics.
5. `renderVehicleLensFlaresGPU()` — project the existing Countach light-source anchors through the active camera, apply source-facing and distance attenuation, then send all visible optical elements through one dynamic vertex buffer and one additive WebGL draw on the main scene canvas. It runs after the world and outline composites so the optical overlay remains above the 3D scene.

The scene is intentionally drawn through the same `drawWorld()` path in the normal, directional-shadow, and scene-AO passes. The shared-scene gate is `if (!outlinePass || aoScenePass)`: it includes opaque world geometry during the shadow pass and the full-scene AO capture, while the separate car-contour pass draws only car parts. `shadowCasterAllowed()` remains the single policy for excluding translucent and emissive materials. Do not build one-off shadow meshes or hard-code a shadow for every new prop.

## Visual effects console — BUILD 117

`F4` opens/closes the in-game visual effects panel. All entries are mouse-operable checkboxes and changes apply immediately without pausing the simulation. The `FX` object is the live effect-state registry; `FX_DEFAULTS` defines the reset state. The panel does not replace the existing keyboard shortcuts: `K` (wireframe), `L` (pop-up headlights) and `H` (headlight diffuse lighting) update the same registry and keep their checkboxes synchronized. `F3` remains the renderer diagnostics panel. In BUILD 119, F3 also shows CPU milliseconds for the full JS frame, shadow pass, main world pass and post-processing pass. If WebGL exposes `EXT_disjoint_timer_query`, it shows asynchronous GPU milliseconds for shadow, world and post passes; query results are polled later and never synchronously waited on. If the extension is unavailable, the GPU row reports `TIMER UNSUPPORTED`.

### Independent effect controls

- **Car ink outlines:** `FX.outlines` gates the car-only edge / roof-seam composite. The mask pass can still run when SSAO is enabled, but outline opacity is zero when disabled.
- **SSAO:** `FX.ssao` independently gates the half-resolution full-scene contact-occlusion contribution. It is not a cast shadow and does not change the solar or garage shadow maps.
- **Wireframe:** `FX.wireframe` mirrors the existing `wireframeMode` state. It remains a diagnostic car-mesh display; when active, ink outlines are suppressed, while SSAO may remain enabled.
- **Solar world shadows / vehicle self-shadows:** `FX.worldShadows` controls the full-scene solar receiver path. `FX.vehicleShadows` controls whether the separate 1024² vehicle-only receiver target is allocated/used and whether its secondary pass runs; when off, no vehicle self-shadow map is rendered.
- **Glass reflections:** `FX.glassReflections` bypasses the procedural environment-reflection glass branch and outputs the authored glass base colour.
- **Paint highlights:** `FX.paintHighlights` gates the painted-body clear-coat, sun/cool-fill glints, rim sheen and showroom paint highlight.
- **Lamp emission:** `FX.lampEmission` controls the material-mode-8 emissive output for vehicle lamps and the garage fixture lenses; disabling it leaves a dim authored lamp surface.
- **Pop-up headlights and headlight illumination:** `FX.headlights` mirrors the existing `headlightsUp` deployment target (`L`); `FX.headlightLighting` mirrors `headlightLightingEnabled` (`H`). Mechanical deployment and diffuse beam illumination are separate switches.
- **Garage spotlights / garage spotlight shadows:** `FX.garageSpotlights` controls whether the garage's two real local-light sources are uploaded; `FX.garageSpotShadows` independently enables their cached per-source shadow maps and receiver visibility.
- **Sun disc / vehicle lens flares:** `FX.sunDisc` hides only the 2D synthwave sunset drawing; it does not remove `SUN_LIGHT`, its material illumination or cast shadows. `FX.lensFlares` independently gates the batched GPU vehicle-lamp optical overlay.
- **Underglow / tyre contact:** `FX.underglow` gates the red floor pool and side neon rails (material modes 5 and 6). `FX.tireContact` separately gates the four procedural tyre-contact ovals (material mode 7).

The F4 panel exposes 22 effect checkboxes plus the separate Sun Bloom quality selector, and includes a reset-to-defaults action.

## Garage effects showroom — BUILD 188

The garage is a three-car scene for visual-effects inspection, not a static menu backdrop.

- The centre display uses the existing Countach; two additional cars reuse the same imported production body, wheel, mirror, lamp and tail-light meshes. They receive distinct paint tints so paint response and reflections can be compared side by side.
- Separate neon plinths sit under the replica cars. Three low-poly gabled houses and six palms are real scene meshes built with the shared cube, cylinder, palm-leaf and house-roof geometry.
- These objects are drawn through `drawWorld()`, so they take part in the normal material pass, the full-scene directional shadow map and the half-resolution scene visibility / AO mask. Their visible silhouettes can occlude the GPU sun, Sun Bloom and God Rays. They are not separate screen-space pictures or hand-painted shadows.
- The garage keeps the F4 effect registry and F3 diagnostics. GPU Sun, Sun Bloom and depth-aware God Rays are enabled by the same post-processing path used on the road; the garage is no longer excluded from `sunOcclusionActive` or the God Rays pass.
- The sun uses a garage-specific screen anchor and a smaller radius so it sits above the showroom skyline. The Canvas2D fallback uses the same placement if GPU Sun initialization is unavailable.
- Dragging the garage canvas orbits the entire display around the centre car. The default orbit distance is wider to frame all three cars; the mouse wheel supports a broad zoom range for closer material and lamp inspection.

The additional geometry is limited to the garage branch. The driving track, vehicle physics, road camera presets and outdoor sun placement remain unchanged. The two local garage spotlights still use their existing per-source shadow-map policy.

## Thresholded scene Bloom — BUILD 189

The general-purpose scene Bloom is independent of the sun-specific inner-surface Bloom and solar God Rays.

- `FX.sceneBloom` is an F4 checkbox and is enabled by default. Turning it off bypasses the scene colour capture and returns the world pass to direct rendering.
- With the effect active, the completed opaque/translucent scene is captured at full canvas resolution into an RGBA8 colour texture plus a `DEPTH_COMPONENT16` renderbuffer. The same finished frame is reused; the 3D scene is not rendered a second time for Bloom.
- A soft bright-pass extraction samples the final scene colour on a quarter-resolution target. The peak RGB channel is tested against a threshold of **0.72** with a **0.20** soft knee, so subdued surfaces are rejected while mid-to-high highlights enter the Bloom contribution.
- The bright-pass texture feeds two separable Gaussian levels using the shared 5-tap blur: a tight radius of **2.2** and a broader radius of **8.0** at the quarter-resolution target. One full-resolution composite copies the original scene and adds both glow levels.
- The bright-pass, blur and composite targets are independent of `sunBloomTargets`. The older Sun Bloom continues to project a sun-derived glow onto the sun-facing side of occluding geometry; God Rays continue to sample the half-resolution geometry mask. Both effects can be enabled or disabled separately from scene Bloom.
- If the quarter-resolution Bloom targets cannot be allocated, a simple scene-colour copy preserves the captured frame without glow. If the full-resolution colour/depth target cannot be allocated, the frame falls back to the original direct-to-screen world pass.
- F3 reports the scene Bloom capture/target state, and its GPU post timing includes the threshold/blur/composite work. The full-resolution colour/depth capture costs additional GPU memory; final visual tuning and GTX 1650 frame-time validation remain open.

This is a display-space screen effect over the renderer's RGBA8 output, not a floating-point HDR pipeline. It extracts bright portions of the already shaded scene, including emissive vehicle lamps, neon geometry and the sun where it intersects the 3D scene colour; the separate procedural GPU sun and its Sun Bloom/God Rays remain on their existing paths.

### BUILD 190 — restrained scene Bloom intensity

Reduce only the two final composite gains by 10%: the tight glow changes from **1.22** to **1.098**, and the wide glow from **0.72** to **0.648**. The bright-pass threshold (**0.72**), soft knee (**0.20**), quarter-resolution extraction/blur targets, Gaussian radii (**2.2 / 8.0**), capture path, fallback handling, Sun Bloom and God Rays are unchanged. This lowers the energy of the low-resolution glow without altering its sampling or blur footprint. In-game visual confirmation and GTX 1650 frame-time validation remain pending.

### BUILD 191 — scene Bloom strength

The two general-purpose scene Bloom gains are reduced to **0.976** (tight) and **0.576** (wide), which is 80% of their BUILD 189 baseline values (**1.22 / 0.72**) and therefore 20% lower overall. BUILD 190 first moved them to 90%; BUILD 191 applies the additional 10 percentage points of the original baseline. Threshold (**0.72**), knee (**0.20**), quarter-resolution target, Gaussian radii (**2.2 / 8.0**) and all Sun Bloom/God Rays paths are unchanged.

## GPU Lens Optics — BUILD 191

- The old #flare Canvas2D overlay has been removed. GPU lens optics use the existing main WebGL 1 context and render onto the scene canvas after drawSun() and the world/outline composites; no extra GL context or full-screen render target is allocated.
- renderVehicleLensFlaresGPU() retains the current source generation and world projection for the Countach pop-up projectors, four measured lower front lamps, rear lamp bars and turn-signal points. Facing-angle and distance attenuation, brake-level response and steering-side signal blinking remain source-driven.
- A per-frame CPU batch creates screen-space quads for haze, tapered diffraction rays, anamorphic streaks, optical cores and chromatic ghosts. The compact upper projector profile keeps the four-ray cross and uses only very faint concentric rings; it does not add the broad horizontal streak used by the lower/rear optical sources.
- The dynamic vertex buffer uses one gl.bufferData(..., DYNAMIC_DRAW) update and one gl.drawArrays() for all visible optical elements. The F4 lensFlares toggle remains independent. F3 reports whether the GPU shader initialized and the active source/quad counts.
- The Canvas2D #sun canvas remains only for the sunset disc fallback; it is not part of the vehicle lens-optics pass. Production GLSL compile/link and an isolated GPU pixel/falloff fixture are included in regression. Final visual tuning and GTX 1650 frame-time validation still require in-game confirmation.

## Frame profiler — BUILD 119

The F3 diagnostics panel now separates CPU command-generation time from actual GPU execution time so renderer regressions can be isolated instead of inferred from effect toggles.

- **CPU frame:** JavaScript time from the beginning of `frame()` through scene/UI updates, excluding browser idle time and deferred GPU completion.
- **CPU shadow / world / post:** CPU time spent submitting `renderShadowMap()`, `drawWorld()`, and `renderCarOutlines()` respectively.
- **GPU shadow / world / post:** `EXT_disjoint_timer_query` measurements around those same passes when available. Results are polled asynchronously via `QUERY_RESULT_AVAILABLE_EXT`; the renderer never calls `gl.finish()` or waits synchronously for the GPU. Disjoint/invalid samples are discarded.
- GPU values are an exponentially smoothed recent sample (65% previous, 35% new). They may display `--` while the first queries complete. If the extension is missing, F3 reports `TIMER UNSUPPORTED`.
- Enable F3 only while diagnosing: the timer queries are created only while the panel is open, keeping normal play free of query-object overhead.

How to interpret: high CPU shadow time with low GPU time indicates JavaScript/draw-call submission overhead; high GPU shadow time points to shadow-map raster work. High GPU world time points to scene shading/fill-rate or the main material shader. High GPU post time points to the normal/depth mask, SSAO, ink-outline and fullscreen composite passes. Compare these figures at the same scene, camera, resolution and FX settings.

## Camera controls — BUILD 101

- The four existing automatic camera presets remain the base camera modes. `C` cycles to the next preset; the existing `1`–`4` direct selection shortcuts remain supported.
- In driving mode, holding the left mouse button on the WebGL scene canvas captures pointer movement. Horizontal drag temporarily rotates the active camera around the car; vertical drag changes its pitch. Both camera position and target are rotated around the car origin, preserving each preset's intended viewing distance and composition.
- Releasing the mouse button, cancelling the pointer, or losing window focus clears the temporary offsets immediately. The active preset then resumes following vehicle heading, so no free-camera state is retained after release. This interaction does not change vehicle steering or physics.
- Garage pointer dragging remains assigned to the existing garage orbit controls; the driving free-look handler ignores garage mode.

- BUILD 101 driving mouse-look now returns smoothly instead of snapping: once the left mouse button is released, yaw and pitch offsets decay exponentially at 17 s⁻¹ and are cleared once imperceptibly small. The selected automatic camera then resumes tracking vehicle heading. `C` cycles the four presets; direct `1`–`4` selection is retained.

## Dynamic directional shadows

The outdoor shadow source is a real, explicit source record:

```js
const SUN_LIGHT = {
  id: 'sun',
  type: 'directional',
  direction: [0, 0.75, 0.6614378],
  castsShadow: true
};
```

- `direction` points **from the scene toward the sun**. World +Z is the front of the car and the road direction; the current sun direction therefore comes from ahead and above, with no arbitrary left/right offset.
- The same `SUN_LIGHT.direction` drives the material key-light uniform and the directional shadow-camera placement. Do not keep a separate hard-coded direction in the receiver shader or shadow matrix.
- The packed-depth format is WebGL 1 compatible: an RGBA colour texture plus a `DEPTH_COMPONENT16` renderbuffer. Depth is packed into the red/green channels.
- The light-space orthographic bounds adapt to viewport aspect ratio, active camera mode, driving look-ahead, and garage zoom. The camera follows the vehicle and shifts its focus forward in driving cameras.
- Each mesh receives a local `boundsRadius` when `mesh(data)` is created. Each shadow pass transforms that bound and culls meshes outside its current light frustum before issuing draw calls.
- The full solar map is **2048 × 2048** and includes the complete opaque car and world. World/road receivers sample this map, so the vehicle continues to cast a real shadow onto the road and the environment.
- A separate **1024 × 1024 vehicle self-shadow receiver map** uses the same solar source and light-space matrix. It is generated only while `FX.vehicleShadows` is enabled. Unlike the full scene map, this secondary pass intentionally contains only selected opaque vehicle detail casters; the road grid, biome and other world geometry are skipped. Vehicle materials sample this map instead of the full map. The continuous main hull, rear fascia, duplicate glints, side-vent slats and thin door-seam overlays are excluded; cabin, pillars, spoiler, lamp pods, front bumper crease, splitter, wheels and other raised details remain eligible casters.
- Both solar maps use the same source and projection. The world map is rendered each frame; the smaller vehicle-only receiver map is rendered only when the F4 self-shadow option is on. It uses the `vehicle-self-only` caster mode and a dedicated depth-PCF filter; it is not a second light or a different shadow direction.

### Automatic caster classification

The central material policy remains `shadowCasterAllowed(color, material)`:

- Opaque standard materials cast when their colour alpha is at least **0.78**.
- Material mode **3** (glass) does not cast an opaque silhouette by default.
- Material modes **5 and 6** (underglow pools and side neon rails) do not cast.
- Material mode **7** (procedural tyre-contact overlay) does not cast.
- Material mode **8** (emissive vehicle lamps) does not cast.
- Fading or translucent elements below the alpha cutoff do not cast until they become sufficiently opaque.

Receiving is independent of casting. Regular world materials and painted vehicle materials sample their appropriate solar map; glass receives a reduced solar response. Emissive and tyre-contact modes bypass solar shadow reception.

### Vehicle self-shadow isolation — BUILD 113–118

- The full solar map keeps every eligible car mesh as a caster. This preserves the complete car silhouette on the road and nearby world geometry.
- The vehicle-receiver map stores packed 16-bit depth in a `NEAREST` texture and uses true 16-tap PCF: each depth texel is compared with the receiver first, then the 16 binary visibility results are averaged. Two concentric eight-point rings use radii of 2.25 and 5.0 texels. This avoids interpolating unrelated depths across geometric edges before comparison, as well as the VSM light bleeding and diagonal sampling patterns seen in earlier revisions. The 1024² target reduces render-target fill cost; the dedicated pass skips all road, biome and other world geometry. The shared filter and constant receiver bias make shadow density consistent across differently oriented body panels.
- Vehicle helper calls cast into this map by default when the material is opaque. The continuous main hull, rear fascia, spoiler's duplicate glint overlay, side-vent decorative slats and thin door-seam overlays are excluded from the vehicle receiver map. The slats and seams still cast into the full world solar map, while remaining excluded from garage spot maps exactly as before so the existing garage result is unchanged. Cabin, pillars, spoiler blade, pop-up housings/caps, front bumper crease, splitter, wheels and other raised opaque parts can cast sunlight shadows onto the body.
- `vehicleShadowCaster=true` remains a separate flag for the `vehicle-details` policy used by garage spotlight shadow passes. `vehicleSolarShadowCaster` controls outdoor solar self-shadow casters. Set the latter to `false` only for base hull surfaces, exact overlays, or parts whose cast would be geometrically invalid.
- The vehicle receiver uses a bounded slope-scaled depth bias: `max(0.00030, 0.00090 × (1 - abs(dot(N, SUN_LIGHT.direction))))`. This is deliberately larger on grazing side panels, where the fixed BUILD 115 bias allowed self-shadow acne to appear as fine streaks, and smaller on surfaces facing the sun. The 16 PCF comparisons and weights remain identical for every painted receiver; full occlusion reduces visibility by 66%, independent of panel orientation.
- **BUILD 114:** replaced the VSM receiver with packed-depth PCF after testing exposed light bleeding and directional banding on the car. The receiver map targets 2048² and uses one fixed bias and 66% maximum attenuation. The full-scene solar PCSS map and both garage spotlight PCF maps are unchanged.
- **BUILD 115:** corrected the receiver filtering order. The car map now uses `NEAREST`; each of 16 packed-depth samples is compared before visibility is averaged. The former `LINEAR` depth interpolation could blend depths from opposite sides of a silhouette before the comparison, which is not equivalent to bilinear PCF and can produce edge ripples. The fragment shader uses `highp` when supported so the packed 16-bit depth decode retains precision. The sun's orthographic projection is also snapped to whole receiver-map texels in clip-space to prevent sub-texel shadow-map swimming during vehicle movement and turns. The road/world PCSS map and garage spotlight filtering remain unchanged.
- **BUILD 118 performance correction:** the earlier 2048² vehicle receiver map was an additional full-scene shadow pass every frame. That duplicated the road grid, biomes and environment draw path and rendered four times as many receiver-map pixels as a 1024² target. The receiver is now 1024² and uses a `vehicle-self-only` pass: `drawWorld()` skips the environment branch, and `bindMesh()` accepts only eligible vehicle casters. The F4 checkbox now controls target creation/use and the render pass itself, not merely the shader's receiver lookup. The main 2048² world-shadow map and garage spotlight maps are unchanged.
- **BUILD 116:** reintroduced a bounded slope-scaled receiver bias only for vehicle self-shadowing. The side-facing panels receive up to `0.00090` depth bias instead of the fixed `0.00034` used in BUILD 115, while front-facing surfaces retain a much smaller bias. The rear-quarter side-vent frame was also excluded from the vehicle receiver map because it sits almost flush with the body panel; it remains visible, and its garage caster state is unchanged. The full-scene road-shadow PCSS and garage spotlight PCF paths are untouched.

This is a practical single-vehicle policy. If traffic or multiple interacting cars are added, use per-object caster/receiver layers so other cars can cast onto this car without allowing arbitrary parts of the same car to self-shadow.

## Stage 2 — Dynamic headlight illumination

The first Stage 2 lighting layer adds two local spotlight sources for the pop-up headlight assemblies:

- Each light position is calculated from the same rigid hinge transform used to animate the triangular headlight pods. It follows the car's world position, yaw, body roll, and deployment angle.
- The light direction is transformed from the lamp's stowed optical axis through the hinge rotation, then receives a small downward aim correction. Light intensity eases in with the pop-up animation.
- The main material shader evaluates each light using a cone cutoff, distance fade, distance attenuation, and the receiver normal. The resulting cool-white/blue diffuse contribution is applied to ordinary world materials using their world position and normal.
- **Shadow policy:** the animated pop-up headlights are currently illumination-only shader sources. They do not cast shadow maps. Do not let the headlight source positions or directions influence the outdoor solar shadow matrix; adding headlight shadows requires registering each headlamp as its own spot source with a matching light-space camera and map.
- **BUILD 098 fragment-cost optimization:** the two-source lighting calculation is now a dedicated shader function called only by the ordinary lit-world and generic lit-material branches. Dedicated painted-body and glass branches no longer calculate a light result they immediately discarded. A zero-intensity early return removes spotlight work when the pop-up lamps are off. A squared-distance check skips each source at 42 world units or farther, where the existing range fade is already exactly zero. For contributing fragments, the receiver normal is normalized once for both sources, the already-normalized shared light direction is used directly, and attenuation reuses squared distance. Both original light positions and the original cone thresholds, 28–42 unit fade, attenuation coefficient, diffuse response, and intensity multiplier are retained; no lower-resolution lighting, merged light source, or reduced light range is used.
- **BUILD 099 mesh-level light culling:** before each normal-pass draw of a material that receives dynamic light, the CPU transforms the mesh's precomputed bounding-sphere radius into world scale and tests the sphere against both spotlight cones and the original 42-unit limit. Objects fully outside both beams receive zero headlight intensity for that draw, allowing the shader's zero-intensity early return to skip the per-fragment calculations. The cone test uses the original outer cutoff (`cos = 0.91`) and expands the cone by the mesh radius, so boundary-intersecting meshes are retained. The wide base-ground mesh is excluded from redundant light evaluation. This changes neither the beam shape nor any in-beam pixel's lighting math; there is no downsampling or light-range reduction. The debug panel reports eligible meshes tested and culled.
- **BUILD 099 FPS meter:** the always-running frame loop updates a compact on-screen FPS indicator in both garage and gameplay. FPS is measured from real `performance.now()` elapsed time rather than the clamped physics delta, so long frames are reflected accurately.
- **BUILD 100–102 headlight diagnostics and fixes:** `H` disables only the upper pop-up headlight diffuse contribution by setting its per-mesh intensity to zero; the physical pop-up modules and emissive lamp cores remain active. The oversized upper-headlight screen-space flare sources were removed in BUILD 102, while smaller lower-front, rear and indicator flares remain. BUILD 103 restores two compact upper-headlight glints using the same lightweight `kind:'signal'` Canvas 2D profile as the indicators, with a cool white-blue tint and approximately 23% greater authored source power than the turn-signal profile. They use the compact secondary-source haze, short streak, two small rays and minimal secondary ghosts; they do not re-enable the former main-headlight radius, long anamorphic streak, extra diffraction rays, blurred concentric rings or four larger chromatic ghosts. BUILD 102 also removed the legacy translucent polygon beam meshes and changed spotlight diffuse response to `abs(dot(normal, lightDirection))`. The latter is intentional for this renderer's two-sided cube winding: the cube top-face normals point down, so a one-sided positive dot product prevented the asphalt top surface from receiving the headlights. The cone shape, range, source positions, culling and full-resolution shader illumination remain unchanged. The F3 panel reports the active `GARAGE` / `ROAD` scene, H diagnostic state, pop-up deployment, draw calls, and mesh-culling counts. The debug panel remains available in garage mode.
- **Current garage-scene limitation:** `garageMode` selects a separate branch in `drawWorld()` and suppresses the road grid, road segments and biomes. The branch is still a dark floor and a small layered circular display platform rather than a fully modelled enclosed showroom. Two compact suspended LED fixtures sit on an upper support rail near Y≈5.1 m. Their shader illumination and their two independent shadow maps use the same source records; shadows are projected from each fixture's real position, direction, cone cutoff and range. No translucent shaft or fake floor patch participates in the lighting or shadow system. The flat floor can still read like a road because walls and a ceiling are not yet modelled. A proper enclosed showroom and camera-framed architecture remain future work.
- Because the headlight lighting is evaluated in the shared material shader, new eligible opaque environment meshes on the normal `drawWorld()` path receive the beam illumination without per-object light code.
- The obsolete translucent polygon beam meshes were removed in BUILD 102. The road receives the actual shader spotlight contribution; there is no legacy triangle beam under the bumper.
- BUILD 106 adds a separate reusable local-light path for garage and future environment fixtures. Unlike the pop-up headlight contribution, this path is evaluated in the world, painted-body, glass and generic lit-material branches.

The pop-up headlight pair remains a stylized real-time spotlight approximation, not a physically calibrated automotive photometric model. Those two headlight sources do **not** create their own shadow maps or volumetric scattering, and their diffuse contribution remains restricted to the ordinary world-material path. Painted body and glass use dedicated shader branches; the separate BUILD 106 garage local lights can illuminate those branches, but this does not mean the headlight beams now cast light onto the car itself.

### Emissive lamps and camera-dependent lens flare

Vehicle lamp surfaces use material mode **8**. The main fragment shader outputs their authored colour as emission and bypasses directional shadow response and ordinary diffuse/specular lighting. The shared shadow-caster rule already accepts only material modes below 4.5, so emissive lamps do not cast solid shadows or enter the opaque scene AO capture. Mode 8 is intentionally separate from mode 7, which remains the procedural tyre-contact overlay.

The sunset background remains on the `sun` canvas behind the transparent WebGL `scene` canvas. Vehicle lens flares are now drawn on a separate transparent `flare` canvas at z-index 2, above the 3D scene (z-index 1) and below the HUD (z-index 3). This prevents vehicle and environment geometry rendered by WebGL from covering the optical glare, while keeping the sunset itself behind the world. The overlay is resized with the other canvases, uses the same device-pixel-ratio transform, and is cleared each frame before the projected sources are drawn.

The `flare` canvas draws its lens-flare overlay after the 3D and outline passes. BUILD 095 reduced the main pop-up headlight glare after the earlier profile proved too large and bright: its peak intensity, bloom radius, anamorphic streak, white centre and diffraction rays were restrained together. Its concentric optical rings use wider, low-opacity strokes with Canvas 2D blur, and rings around chromatic ghost reflections are also softened. BUILD 096 reduced the secondary sources as well: lower fog lamps, front and rear indicators, and rear tail-lamp lens flares now have lower overall intensity, smaller bloom radius, shorter and thinner anamorphic streaks, and more restrained diffraction and ghost reflections. These source-specific profiles still depend on camera-facing angle and distance. BUILD 097 adds brake-responsive rear lamps. A smoothed `brakeLight` value is driven by forward brake input (`S` / down arrow while moving forward) or the handbrake (Space); reverse acceleration does not trigger the brake lights. The rear red lamp panels, six LED bars and their additive red halo increase their emissive colour while braking, then return smoothly to the normal running-light level after release. Rear tail-lamp lens flare intensity rises slightly with the same brake state. This is a visual lamp response; it does not alter vehicle braking physics. The remaining effect projects lower auxiliary front lamps, front indicators, rear lamp clusters, and rear indicators using the active camera view-projection matrix. BUILD 102 removed the expensive oversized upper pop-up headlight profile after its per-frame Canvas 2D gradients, blurred rings, diffraction strokes and chromatic ghosts caused an excessive frame-time increase. BUILD 103 restores only two compact upper-headlight glints through the same lightweight secondary-source profile used by the indicators; their colour is cool white-blue and their authored power is slightly higher. The emissive 3D lamp cores and actual shader spotlights remain unchanged. Front and rear indicators use the same blink phase and steering-side selection as their 3D lamp surfaces.

This is a stylized screen-space glare effect rather than a physically simulated lens. It uses camera-facing direction and clip-range visibility, but does not yet test whether an unrelated object fully occludes a lamp. It does not add additional shadow maps or volumetric scattering.

## Stage 3 — Atmosphere and cinematic lighting

The synthwave sunset is a procedural WebGL shader drawn in a bounded quad during the main scene pass, before opaque geometry. The original Canvas 2D sun remains available for A/B comparison and as an initialization fallback. Vehicle lens flares are still drawn on a separate transparent Canvas 2D overlay above the scene. This stage adds depth-aware solar shafts first, then a general thresholded Bloom path, GPU lens optics, and finally atmospheric integration and grading. Existing fallbacks remain until visual and performance parity are confirmed.

### Target visual

- Preserve the authored sunset identity: clean horizontal cutout bands, warm orange through red/pink into magenta, a crisp circular silhouette, and a strong but controlled outer glow.
- Use a continuous, layered solar aura: warm near-disc glow, broad coral falloff and soft magenta outer haze. Avoid hard yellow rings and decorative plasma filaments; keep only a subtle slow intensity pulse.
- Add atmospheric light shafts / god rays that extend from the sun into the scene. They must be depth/occlusion-aware: opaque buildings, mountains, palms and other geometry should interrupt or attenuate shafts; rays must not look like a flat overlay.
- Add restrained optical diffraction, anamorphic streaks, concentric rings and chromatic lens ghosts. Their position, scale and intensity must respond to camera orientation and source visibility.
- Add atmospheric scattering and horizon haze to blend the sun into the sky and distant environment while keeping car and road contrast readable.
- Drive the visible solar source and outdoor illumination from the same SUN_LIGHT record. If sun position or direction is animated later, the visual disc, rays, material key light and shadow camera must all follow that source.

### Implementation sequence

1. **[~] Smooth GPU sun aura and disc-localized object light-wrap — BUILD 149–154.** The continuous radial aura and screen-space inner-surface wrap are implemented. Their final colour balance and performance remain subject to target-browser validation; this is not physical volumetric transport.
2. **[~] Depth-aware solar God Rays — BUILD 186.** The new WebGL 1 pass uses the existing half-resolution scene-visibility mask and samples 24 points from each quarter-resolution output pixel toward the projected sun. Geometry in that path reduces transmission; a destination pixel covered by an opaque scene surface receives no shaft, so foreground silhouettes interrupt the visible rays rather than being painted over. Each output ray samples three positions along the solar rim and inward toward the disc centre in its own direction; exposed rim sectors can therefore emit rays even when the centre is hidden. The ray field uses a restrained orange-to-magenta palette, a soft angular beam pattern and a subtle pulse. Its target is quarter width/height (one sixteenth of full-resolution pixel count); it reuses the existing post composite and adds no world pass or shadow map. It is a screen-space volumetric-light approximation, not a true 3D volume or hardware ray tracing. Automated GLSL/pixel tests check FBO creation, an unobstructed path, an occluded path, and no light drawn on the occluder; the user's full scene and GTX 1650 frame-time still require visual validation.
3. **GPU bloom and glare:** add a thresholded, downsampled bloom chain for the sun, emissive lamps and selected neon. Composite with controlled intensity so highlights glow without washing out the image. Reuse the bloom result for solar corona and headlight glare where practical.
4. **GPU lens optics:** migrate existing Canvas 2D vehicle flare profiles to shader compositing: anamorphic streak, diffraction spikes, rings and chromatic ghost shapes. Preserve source-specific profiles and camera-facing/visibility rules; do not restore the old oversized headlight flare.
5. **Atmospheric integration and grading:** add distance/horizon scattering and final colour grading after sun, occlusion and bloom are stable. Keep fog/scattering depth-aware and preserve the neon palette.
6. **Retire overlays only after parity:** remove old Canvas 2D sun and flare paths only after GPU versions match or exceed their visual quality and pass performance comparison. Retain a fallback if a required GPU capability is unavailable.

### Performance and compatibility rules

- Keep the renderer WebGL 1 compatible initially; use shader passes and framebuffer textures supported by the current renderer. WebGL 2 must not be a prerequisite for this visual upgrade.
- God Rays render at 25% width and height with 24 radial occlusion samples. Reuse the existing half-resolution scene mask; do not rerender geometry or create another shadow map for shafts. The quarter-resolution God Rays target is composited through the existing full-screen post pass on texture unit 6, within WebGL 1's eight-unit minimum.
- Reuse existing scene depth/normal or a dedicated low-resolution occlusion mask where possible. BUILD 150–152 derive the solar light-wrap silhouette from the half-resolution AO scene mask; when SSAO and ink outlines are both off, render only this half-resolution mask and skip the full-resolution car-outline mask. The wrap remains gated to the projected solar disc and uses premultiplied compositing. The same scene-mask capture now supplies God Rays occlusion without an additional world capture.
- FX.sunGodRays is an independent F4 checkbox, enabled by default on the road and inactive in the garage. Disabling Sun Bloom does not disable God Rays; disabling God Rays leaves the sun disc and Sun Bloom intact. F3 reports the God Rays state. Settings are runtime-only and reset to FX_DEFAULTS on page reload.
- Keep expensive rays and diffraction configurable by quality tier. The sun disc and compact corona should remain available on lower settings.
- Profile GPU frame time and total FPS with effects individually enabled/disabled in garage and driving. Do not recreate the severe frame-time spike previously seen with oversized front-headlight flares.
- Compare at the same camera, resolution and scene: baseline, GPU sun only, sun plus rays, and full optics. The automated SwiftShader pixel regression is deterministic but is not a substitute for FPS and image inspection on the target GTX 1650/1660.

### Related GPU-rendering optimizations

After the sun/optics pipeline is stable, prioritize instanced rendering for repeated road markings, lamps, vegetation and other repeated props. It can reduce CPU draw-call overhead, especially because scene geometry is replayed in multiple shadow/AO passes. Keep unique car geometry and physics on their existing paths. Move particle simulation to GPU only when particle counts justify the complexity; vehicle physics and gameplay state remain CPU-owned.

**Important distinction:** the target is convincing real-time ray-like lighting ("mini RTX" in appearance), not hardware ray tracing or path tracing. WebGL shader-based screen-space scattering cannot reproduce full ray-traced global illumination or illuminate hidden/off-screen geometry. The occlusion mask and registered SUN_LIGHT source must keep the effect tied to the actual scene and light.

## BUILD 111–113 — Vehicle surface artifacts and source-bound shadows

- BUILD 111 removed the mesh-local red lower-side paint mask, whose coordinate range restarted on each independent mesh and produced mismatched patches on the front bumper and rear quarter.
- BUILD 112 restored 50% vehicle shadow reception but reintroduced the car's own overlapping geometry into the receiver map; the stronger receiver bias only reduced the resulting mosaic instead of separating real shadows from self-shadowing.
- BUILD 113 initially split the full world solar map from a vehicle-receiver map, but the latter still included selected raised car details and the self-shadow mosaic remained.
- The next revision briefly restored only the spoiler as a solar self-caster; this proved too restrictive because other raised parts lost their sun shadows.
- The packed-depth PCF revision replaces the prior VSM receiver after vehicle shadows showed surface-dependent light bleeding and diagonal banding. Opaque car details cast by default, while the continuous hull, rear fascia, duplicate overlays, side-vent slats and door seams are explicitly excluded. The independent `vehicleShadowCaster` flag continues to control local spotlight shadows.

## Reusable local lighting — BUILD 106 / source-bound garage shadows — BUILD 113

A shared local-light evaluator is available independently of the directional sun source.

- The shader supports **four simultaneous local sources** through fixed-size uniform arrays: position + range, RGB colour + power, and direction + cone cutoff.
- A source with a direction is a spotlight; a source without a direction is treated as a point light. Both use the same material-aware diffuse response, range fade and distance attenuation.
- Each source contributes diffuse energy modulated by the receiving material's base colour plus a restrained view-dependent specular highlight. Emissive lamps, outlines, shadow depth and tyre-contact overlays keep their dedicated paths.
- Source configuration stays in JavaScript world coordinates. `uploadLocalLights(sources)` clears unused slots and uploads active records once per scene draw.
- **Garage sources:** two narrow near-white spotlights at approximately `(-3.8, 4.48, 0.75)` and `(3.8, 4.48, 0.75)`. Each has a 9.5-unit range, a real inward/downward direction, a cone cutoff of 0.82, and its own `shadowSlot` (0 or 1).
- **BUILD 113 spot shadow generation:** `spotShadowMatrix(light)` constructs a perspective camera from that source's position, normalized direction, cone cutoff and range. The matching 1024² packed-depth map is rendered with the shared `drawWorld()` caster path and sampled only by that light's diffuse/specular contribution. The local receiver uses a bounded 2 × 2 PCF filter. The two garage maps are cached while the fixture/source and caster transforms are unchanged.
- **Cache invalidation:** `localShadowSignature(light)` includes the light parameters and current animated car pose values relevant to the garage fixtures. If other scene geometry or transforms are added/moved, call `invalidateShadowCaches()` so the next garage render rebuilds the local maps.
- The local source registry is currently enabled for the garage scene. Track and roadside local lights remain inactive until selected environment fixtures are authored.

The shader's **four local-light slots are not four shadow slots**. Only slots 0 and 1 currently have local shadow samplers. Before enabling shadows on another source, extend the map target, light-space matrix uniform, sampler, receiver function, and source-slot mapping. A point light cannot use one perspective map: it needs an omnidirectional cubemap or six-face shadow implementation. Until that exists, point sources may illuminate materials but must keep `castsShadow:false`.

## BUILD 109–113 render consistency cleanup

- The material-mode-1 animated highlight previously used `vWorldPos.z`. It caused a stripe to slide across independent vehicle meshes as the chassis yaw changed; the world-space animation was removed.
- The garage UI overlay gradient was reduced so it no longer veils the scene behind the text panel. SSAO opacity was reduced and remains contact-only shading, not a cast-light shadow.
- Directional shadow casting, normal rendering and full-scene AO use the shared opaque world-scene branch. BUILD 110 corrected the guard that skipped garage/track environment geometry during the shadow pass.
- BUILD 109 reduced excessive light colour wash by making local-light diffuse response material-albedo-aware and tightening spot falloff. The translucent garage shafts/floor patches were removed; fixture housings use the same scene path as other opaque objects.
- BUILD 113 centralized the outdoor shadow source in `SUN_LIGHT`; the same direction drives key-material lighting and the solar shadow-camera matrix. It also separated the world solar map from the vehicle receiver-safe map and added source-specific garage spotlight maps.
- `NON_SHADOW_FILL_DIRECTION` is an explicitly named artistic specular fill. It is not registered as a cast-light source, does not receive a shadow map, and must never be used to generate a shadow matrix. The material-only fill sheen and showroom highlight are stylized appearance terms, not physical shadow sources.

## Procedural glass reflections — BUILD 106

Material mode **3** now produces a more visible synthwave environment reflection on the windshield, rear glass, and four side panes.

BUILD 107 explicitly bounds the glass fragment branch to `2.5 < materialMode < 3.5`. Painted clear-coat material mode **4** therefore reaches its own dedicated paint shader instead of being captured by the glass condition. Keep the glass and painted-body material ranges separate when adding future shader modes.

- The reflection direction is derived from the camera-to-surface view vector and the glass normal, so the reflected response changes with camera movement rather than staying painted onto the window.
- The procedural environment combines a deep blue sky gradient with a magenta horizon band, cyan and purple neon bands, a restrained directional sun highlight, and a small direction-dependent neon variation.
- Reflection blend begins at approximately **0.54** and increases toward **0.88** at grazing view angles. This makes the environment visibly readable from ordinary driving cameras as well as close garage inspection.
- The general local-light evaluator also adds a view-dependent coloured specular response to glass when garage spotlights are active.

This is an intentional stylized environment-reflection approximation. It is **not** a cubemap, ray-traced reflection, or screen-space reflection (SSR): individual buildings and roadside objects are not reproduced as exact reflected geometry. Future reflection work still includes painted-body response and road/asphalt reflection.

## Solar and spotlight shadow filtering

The full-scene directional solar map uses a bounded Percentage-Closer Soft Shadows (PCSS) approximation:

1. A **3 × 3 blocker search** estimates the average depth of geometry between the light and receiver.
2. The depth separation between blocker and receiver determines a variable penumbra radius.
3. A second **3 × 3 comparison filter** samples using that radius; the radius is clamped to avoid unstable or excessively broad shadows.
4. A normal-dependent bias reduces self-shadow acne.

The vehicle-receiver solar map uses **packed-depth Percentage-Closer Filtering (PCF)**. Its RGBA8 texture stores 16-bit depth in the red/green channels and uses `NEAREST` sampling. For each of the 16 taps, the shader decodes one depth value and performs the receiver-depth comparison first; only the resulting shadow/visibility values are averaged. The taps form two concentric eight-point rings at 2.25 and 5.0 texels, yielding a rounder soft footprint without mixing foreground and background depths before comparison. Fragment arithmetic uses `highp` when supported by the device. The vehicle map targets 2048² (up from 1024²), with a device-limit / allocation fallback to 1024². Every car receiver uses the same `0.00034` depth bias and 66% maximum shadow attenuation. The light-space projection translation is snapped to the receiver-map texel grid to reduce temporal shimmer as the following shadow camera tracks the car. The full-scene solar map and garage spot maps retain their existing PCSS and 2 × 2 PCF filters, respectively.

The garage spot maps use a cheaper **2 × 2 PCF** filter at each registered light's own perspective projection. Their receiver bias uses `abs(dot(N, L))`, matching the two-sided material convention used by the solar receiver. Their bias and visibility are applied to that specific spot contribution in `evalLocalLight()`; a garage lamp must not reuse the sun's matrix or its shadow result.

## Full-scene SSAO and car contours

The two effects use separate masks so environment geometry does not acquire the car's black outline treatment:

- **Scene AO mask:** half the canvas width and height, containing encoded world-space normals in RGB and normalized view depth in alpha. It is rendered from the same opaque scene geometry as the shadow caster policy.
- **Car contour mask:** full resolution and car-only. It preserves the existing normal/depth edge detection and the explicit roof seam treatment.
- The fullscreen composite samples the car mask for ink contours and the scene mask for SSAO. Near and farther screen-space samples estimate depth discontinuities and normal creases; the resulting darkening is clamped to 0.12 alpha in BUILD 109 so AO remains local contact shading instead of a broad dim veil.
- Glass, translucent fades, neon, and contact-shadow overlays are omitted from the opaque AO mask to avoid false occlusion.
- The four procedural tyre-contact ovals (material mode 7) and the SSAO composite are ambient/contact shading approximations. They are intentionally not directional cast shadows and do not claim to come from the sun or a garage spotlight; all actual cast-shadow silhouettes must come from a registered light and its own shadow map.

SSAO is screen-space: it only sees geometry represented in the current camera's normal/depth buffer. It cannot infer hidden geometry behind the camera or off-screen. It is a local contact/crease approximation, not global illumination.

## Vehicle wheel animation — BUILD 104

The four wheels use one rolling phase derived from the accumulated forward travel:

`wheelSpin = garageMode ? 0 : -distance / WHEEL_RADIUS`

- `drawCarPart()` applies the same wheel-local rotation to both `wheel` and `wheelFace` meshes.
- The tyre, brake-disc face, alloy spoke face, and centre/hub details must all receive the exact same `wheelSpin` argument. Omitting it from any `wheelFace` call leaves that visible part stationary.
- The wheel's local Y axis is mapped to the vehicle's transverse axis by the `rotateZ(Math.PI / 2)` transform. The negative sign is intentional: with forward travel along world +Z, it produces the physically correct rolling direction at the tyre contact patch.
- Wheels remain stationary in the garage. Do not introduce per-wheel offsets or independent spin phases unless a future feature explicitly requires wheel slip or differential behaviour.

## Front-wheel steering — BUILD 105

Only the front axle (`z > 0`) steers. The rear axle remains aligned with the chassis. The visual front-wheel angle is driven by the same filtered, speed-sensitive steering angle used by the vehicle dynamics:

`baseAngle = steer * 0.32 / (1 + abs(speed / 3.6) / 115)`

- `getSteeringAngle()` is the shared source for the physics yaw target and visible front-wheel orientation. Keep these in sync; do not add a separate visual-only input curve.
- `getFrontWheelSteerAngle(side)` applies a small Ackermann correction. The wheel on the inside of a turn receives a slightly larger angle than the outside wheel, using a 3.275 m wheelbase and 2.21 m track.
- The four visible components of each front wheel (tyre, brake face, alloy spokes and hub) must share one steering angle and pivot. `steeringPivotX` rotates the component offsets as part of the complete wheel assembly instead of rotating each component around its own centre.
- Steering is applied around the local vertical axis before the axle/spin transform. Keep the wheel spin and steer transforms separate: spin is around the axle; steering changes the axle orientation.
- Garage wheels stay straight. Do not apply front steering to the rear axle.

## Shared draw path — rules for future objects

For a new environment object to participate automatically:

1. Build its mesh with `mesh(vertices)`. This also calculates its local `boundsRadius` for shadow-frustum culling.
2. Draw it from the world-scene section of `drawWorld()` or a scene function called there.
3. Use the shared `draw()` helper (or the existing car helpers where appropriate). Do not draw it directly outside the scene pipeline.
4. Use an opaque standard material and alpha ≥ 0.78 when it should cast a solid shadow. The central classification automatically excludes glass and emissive material modes.
5. Keep glow, beams, particles, transparent water, and other translucent effects on their emissive/translucent material path; they should not become opaque shadow casters.
6. Opaque vehicle details cast into the outdoor packed-depth PCF receiver map by default through the shared car helpers. Explicitly opt out base hull surfaces, rear fascia surfaces that overlap the hull, exact duplicate overlays, side-vent decorative slats and thin door-seam overlays by passing `vehicleSolarShadowCaster=false`. The separate `vehicleShadowCaster=true` flag controls vehicle details in local spotlight maps. The full world solar map already includes the complete car for road/world shadows.
7. Add shadow-casting lights through the real source registry: `SUN_LIGHT` for the outdoor directional source, or a registered spotlight with a dedicated source-specific matrix and map. Never create a new shadow direction independently of the light that illuminates the material.

The same scene call is replayed during the full solar maps, spotlight maps and full-scene AO capture. Caster policy is selected per target: `all` for the full solar map, `vehicle-solar-details` for the car's packed-depth PCF receiver map, and `vehicle-details` for local spotlight maps. No hand-painted shadow decals or one-off object shadows are required.

## Material mode reference

The numeric `materialMode` is shared by the main shader and draw helpers:

| Mode | Current role | Shadow behaviour |
|---:|---|---|
| 0 | Standard matte / basic world geometry | Casts and receives when opaque |
| 1 | Stylized lit surface | Casts and receives when opaque |
| 2 | Specular / metallic-style surface | Casts and receives when opaque |
| 3 | Glass / reflective glazing | Receives reduced shadows; no opaque cast |
| 4 | Painted body / satin clear-coat | Casts and receives |
| 5 | Disc-based underglow pool | No cast, no receive |
| 6 | Linear neon side rails | No cast, no receive |
| 7 | Tyre contact shadow overlay | No cast, no receive |
| 8 | Emissive vehicle lamp surfaces | No cast, no receive |

When adding a new material mode, define its casting, receiving, AO, and transparency behaviour in the shader and in this table.

## Current limitations / future work

- Outdoor directional shadows currently use one camera-adaptive solar source rather than cascaded shadow maps (CSM); distant coverage may need cascades as the road/environment expands.
- Opaque casters are supported. Transparent and alpha-cutout shadow casting is not implemented; glass, translucent fades, emissive lamps, underglow and tyre-contact overlays intentionally do not cast.
- The sun uses a 2048² world map plus a separate 2048² vehicle-receiver-safe map. The second map adds GPU raster and memory cost; profile frame time if caster counts or map sizes grow.
- Two local spotlight shadow slots are implemented for the garage fixtures at 1024² each. The four-slot local-light shader does not imply four shadow maps.
- Point lights do not cast shadows yet; they require omnidirectional/cubemap or six-face support. The animated pop-up headlight spots currently illuminate materials but do not have independent shadow maps.
- The full-scene solar map uses bounded PCSS, the vehicle self-shadow receiver uses 16-tap circular PCF over `NEAREST` packed depth with texel-snapped projection, and garage spot maps use bounded 2 × 2 PCF. These are real-time approximations, not physically exact area-light solutions.
- SSAO is half-resolution and screen-space. It is a contact/crease effect, not a cast-light shadow and not global illumination.
- The main shader also has an explicitly non-shadowing specular fill direction. It is a style-only fill term and must not be treated as a shadow source.
- The four-source material lighting and two-source local shadow arrays add per-fragment work. Additional shadow slots require matching matrices, samplers and receiver logic.
- The glass reflection is a procedural view-dependent approximation, not SSR or a cubemap. Painted-body and road/asphalt reflections still need work.
- BUILD 149–154 add the GPU sun disc, a continuous multi-layer aura and screen-space object light-wrap. BUILD 154 removes the decorative plasma arcs and narrow yellow border, strengthens the broad radial near/mid/far glow, and replaces the thin edge tint with fine/medium/wide scene-mask gradients. The wrap remains limited to actual solar-disc overlap plus a narrow fringe and uses premultiplied compositing. Both effects are screen-space lighting approximations, not true volumetric light transport. Confirm target-browser shader compilation, visual balance and GPU/Canvas2D frame timing in-game. Depth-aware god rays, controlled bloom, selected track/environment light sources, improved painted-body and road reflections, and atmospheric depth / final grading remain future work.

**Maintenance rule:** preserve the shared scene pipeline and central material policy. Future environment additions should become shadow casters and AO participants by using the normal scene draw functions, not by receiving bespoke shadow code.


## BUILD 120 — uniform vehicle self-shadow

The vehicle-only solar receiver still uses its separate 1024² packed-depth map and the same directional sun projection. Its receiver filter is now deliberately simpler: four depth comparisons in a compact cross around the projected receiver, averaged into a single uniform shadow amount (maximum darkening 42%). This replaces the previous two-ring 16-tap PCF footprint and removes the layered, highly detailed penumbra pattern. The filter change affects only vehicle self-shadowing; full-scene road/environment solar shadows and garage spotlight shadows retain their existing filters. The goal is a cleaner, more even contact shade on the body, not a physically varying penumbra.


## BUILD 121 — binary monochrome vehicle self-shadow

Vehicle self-shadowing now uses a single packed-depth lookup and one binary receiver comparison. A receiver pixel is either lit normally or multiplied by one fixed visibility value (0.58); there is no multi-tap filtering, penumbra, or intermediate shadow tone. The resulting shadow is a flat monochrome region with a hard contour. This change is isolated to the vehicle self-shadow receiver path; world/road solar shadows and garage spot shadows are unchanged.


## BUILD 122 — cabin outer-shell cleanup and backup

Before modifying vehicle geometry, the complete BUILD 121 `index.html` was preserved at `backups/index_BUILD121_pre_vehicle_cleanup.html`. The cabin hull is now generated in `outerSkinOnly` mode: only the upper exterior ring faces are retained; lower inner sidewall/underside faces and front/rear end caps are omitted because the main body hull already covers that volume. The windshield/side glass, visible window surrounds, roofline and painted outer A/B-pillar joins remain. The retained cabin exterior still participates in the vehicle self-shadow caster pass. This removes coincident hidden surfaces rather than indiscriminately deleting visible exterior trim.


## BUILD 123 — shared-coordinate cabin rebuild

Before the rebuild, the complete BUILD 122 source was backed up to `backups/index_BUILD122_pre_cabin_rebuild.html`. The old cabin used an independent `cabinProfile`, a separately interpolated shell, separately positioned A/B-pillar quads, side panes generated from another set of rails, and a rear glass plane whose endpoints did not share the body profile. That duplicate shell is removed entirely.

The rebuilt cabin has one roof mesh with fixed front/rear stations. The windshield corners share the roof's front edge and the body profile's upper points. The rear glass shares the roof's rear edge and the rear deck's actual top-profile points. Left/right side glass is generated by `makeBodySideBand()` directly from the same `bodyProfile` shoulder/upper coordinates and the same wheel-arch-added Z stations used by `makeCarHull()`. Each continuous pane exactly covers the side strip intentionally omitted from the body hull; the B-pillar is a narrow outer overlay on top of the sealed glass, avoiding a split or seam in the underlying pane. Mirrored left/right geometry comes from one helper, so its station positions and slopes stay symmetric. The body hull's left shoulder-to-upper strip now uses the same mirrored triangle diagonal as the right strip, and the glass helper uses that exact triangulation on both sides. Exterior A/C pillars and roof rails use matching shared corner coordinates. The old cabin shell and unused legacy window frames/ink meshes are no longer drawn or retained as cabin geometry.

The roof remains an opaque vehicle shadow caster. Glass and trim rails do not add separate vehicle shadow casters, avoiding extra overlapping shadow silhouettes.


## BUILD 126 — actual cabin apertures and lowered pop-up lamps

The BUILD 123 cabin pass still left the body-profile roof and upper side faces behind the new roof/glass assembly. BUILD 126 corrects the source topology instead of adding another overlay. `makeCarHull()` now accepts a `roofOpening` interval and adds both interval endpoints to its longitudinal station set. In the body pass it omits the shoulder-to-upper and upper-to-top side faces on both sides (`j=4,5,8,9`) over the cabin opening, and omits the two original roof strips (`j=6,7`) only under the raised roof footprint (`z=-1.42..0.275`). This prevents partial residual faces at the opening ends and removes the old inner body roof.

The left/right side glass is now built as a full trapezoidal cabin surface: the lower edge follows the body shoulder profile from `z=0.945` to `z=-1.6375`; the upper edge follows the exact raised roof-rail stations from `z=0.275` to `z=-1.42`. Intermediate samples include both sets of profile breakpoints, so the panes follow the same piecewise-linear curves as the body and roof. A/B/C pillars are generated from these same matched top/bottom points and offset slightly outboard of the glass; roof rails are likewise placed outside the glazing and drawn after it. The front windscreen meets the front body shoulder and front roof corner; the rear screen meets the rear roof edge and rear deck.

The full pop-up lamp assembly is lowered by `POP_LAMP_DROP=-0.16`. This translation is shared by the drawn lamp meshes, the world-space headlight positions/direction setup, and the lens-flare projection, preventing the lights, illumination and optical effects from drifting apart. At full deployment, the transformed face normal remains aligned with vehicle-forward `+Z` (with the existing slight downward beam bias).


## BUILD 127 — deferred vehicle self-shadow, planar side glass, full pop-up travel

Vehicle self-shadowing is disabled in `FX_DEFAULTS` so normal driving no longer uses the unfinished car-only shadow pass. The F4 Visual Effects panel retains its `vehicleShadows` checkbox, unchecked on startup and explicitly labelled `ОТЛОЖЕНО` until the shadow contour/artifact work is revisited. The full-scene/world shadow setting is independent and unchanged.

Each side window is now a single flat quadrilateral, triangulated into exactly two coplanar triangles. It is no longer subdivided along the body profile. The upper edge is straight and level at `y=1.205`, half-width `0.84` (the windscreen's upper half-width is `0.80`); the lower edge is straight and level at `y=0.90`, half-width `1.08`. The two side panes are exact left/right mirrors, with parallel longitudinal edges. A geometry check confirms each pane is coplanar (two triangles, six vertices; numerical plane error below `3e-17`). Cabin roof station widths and side-rail positions are constant so the upper glass edge meets the same straight roof rail. The front windscreen lower corners and rear screen lower corners now share the matching side-glass corner coordinates.

The previous `POP_LAMP_DROP=-0.16` translation was removed from the rendered lamp assembly, world-space headlight coordinates, and flare projection. The lamp optic is now a flat XZ-plane panel flush with the hood surface while stowed (`hoodSurfaceY + 0.003`). Its face normal is downward (`[0,-1,0]`), and the hinge rotates by `-90°` at full deployment so the deployed normal points along vehicle-forward `+Z`. The same 90° angle is used for the lamp meshes, light-source direction, and lens-flare projection. The old 45° diagonal optical panel is removed.


## BUILD 128 — restore BUILD 122 volumetric pop-up headlamps and hood fit

BUILD 127 replaced the prior angled optical face with an XZ-plane panel and changed the hinge travel to 90°. That was an unwanted shape change: the lamp assembly no longer had the three-dimensional wedge and angled projector face that were present in BUILD 122. BUILD 128 restores the complete lamp geometry from the saved `backups/index_BUILD122_pre_cabin_rebuild.html` source: triangular housing walls, the 45° optical plane, separate front plate and bezel, lens, paired projector rings/cores, and the painted pop-up lid.

The assembly is fitted to the current hood profile rather than translated as a whole. `makeLampCap()` continues to sample `hoodSurfaceY(x,z)` for every lid vertex and places the painted lid at `+0.003` above the hood. The hidden housing and optical face are recessed by `0.037` beneath that surface (`lampRearPoint()` and `lampFrontPoint()`), so the lid closes flush while the real volume remains attached underneath it. The hinge remains at `z=2.30`, with its height anchored to `hoodSurfaceY(0.65, POP_HINGE_Z)+0.003`; no `-0.16` global drop is applied.

All three transform paths now agree with the original design: `drawCarHingedMesh()`, the world-space spotlight setup, and the projected lamp/flare setup use the same smoothed `-45°` X-axis deployment. The stowed optical normal is `[0,-POP_LAMP_DIAG,+POP_LAMP_DIAG]`; the `-45°` rotation turns it to vehicle-forward `+Z`. This restores the former shape and beam direction together, rather than rotating a flat panel through 90°. BUILD 128 is `v0.18.62` / `BUILD 128`.


## BUILD 129 — body aperture fitted to planar side glass and glass-to-roof seams

BUILD 127's side panes are intentionally single planar quadrilaterals, but the body hull still removed the old profile-derived shoulder/upper/top strips. Those old ring vertices did not lie on the new flat glass plane, which left visible gaps between the outer body and side windows. BUILD 129 changes the body aperture boundary rather than adding a decorative patch over the gap.

`makeCarHull()` now accepts `fitWindowPlane`. For each body-profile ring within the side-glass longitudinal extent, it computes the upper Y boundary from the actual four-corner window polygon's Z slice (`cabinWindowUpperYAt`) and maps Y to the glass plane's X coordinate (`cabinWindowXAtY`). The positive-side shoulder vertex (`ring[4]`) is the lower pane boundary; the positive roof-edge vertex (`ring[6]`) is the upper boundary; `ring[5]` is placed midway inside the removed opening. The negative-side vertices (`ring[10]`, `ring[8]`, `ring[9]`) mirror those values exactly. The existing shoulder-to-roof face strips remain removed, so the surviving painted side skin now terminates at the pane rather than at the former curved profile. Both top and bottom glass endpoints, plus the two upper edge endpoints, are inserted into the body's longitudinal station set so the short front and rear taper regions are represented without interpolation across a corner.

The side-glass upper corners move to `y=1.209`, `z=0.270` at the front and `z=-1.415` at the rear. They extend 5 mm inward under the roof's former end stations (`z=0.275` and `z=-1.42`) and sit 4 mm above the roof side edge (`y=1.205`) to avoid a raster crack. The windshield now uses the same upper front corners as the side panes, and the rear screen uses the same upper rear corners; both lower corners already share the corresponding side-pane lower vertices. The four pane corners remain coplanar, and left/right side glass remains mirrored. The body fit uses the pane's true rear taper direction as well as the front taper, so the lower rear corner closes to a point at `z=-1.6375`.


## BUILD 130 — remove residual body roof beneath front and rear glazing

BUILD 129 aligned the body-side window openings and moved the upper glass corners under the raised roof, but the `makeCarHull()` call still limited the original body-roof cut to `[-1.42, 0.275]`, the length of the roof panel alone. The windshield and rear screen extend beyond those stations down to their lower corners (`z=0.945` and `z=-1.6375`). Consequently, the original body hull still emitted roof strips in the front and rear glazing spans. Those leftover body polygons could appear through or beside the end glass, with the asymmetry most noticeable at the left edge.

BUILD 130 changes the `roofOpening` argument to `[CABIN_GLASS_REAR_BOTTOM_Z, CABIN_GLASS_FRONT_BOTTOM_Z]`, covering the complete cabin and both windscreen footprints. The existing `makeCarHull()` roof-strip removal for both top halves (`j=6` and `j=7`) now suppresses every longitudinal roof segment beneath the side glazing, windshield, rear screen, and raised roof. The front and rear glass remain the visible closure surfaces; the hood and rear deck outside their lower edges are retained. The raised roof mesh itself, planar side windows, and BUILD 129 body-to-side-glass fit are unchanged. BUILD 130 is `v0.18.64` / `BUILD 130`.


## Driving physics — full rotation and persistent arcade drift (BUILD 131)

The vehicle heading `carYaw` is an accumulated angle, not a steering-angle clamp. Do not clamp it to a small range: `drawWorld()`, the vehicle transforms, shadow focus and lamp transforms all consume the same heading, and the rotation matrices handle angles beyond (2\pi). The yaw-rate ceiling is `±2.4 rad/s`; ordinary steering still uses `getSteeringAngle()` and retains the previous `±0.82 rad/s` yaw-target limit. The `1.45×` yaw-target boost is applied only after drift lock engages, so normal steering does not become more sensitive. SPACE with a steering direction adds a short yaw impulse, allowing a deliberate 360° spin while the player holds the turn.

Drift handling has its own persistent state:
- `driftLocked` becomes active when SPACE and steering are applied above roughly 29 km/h, or when a high-speed slide exceeds the natural-drift threshold.
- `driftDirection` stores the turn direction that initiated the slide. Releasing SPACE or the steering key does not clear the lock.
- While locked, rear lateral grip is deliberately low (`0.36`); applying the opposite steering direction is treated as countersteer and raises grip to `5.2`. Countersteer authority scales down as the slip angle approaches neutral, avoiding a violent snap into an opposite spin.
- The lock ends after countersteer recentres or slightly crosses the slip angle, or when speed falls below the low-speed threshold. A `0.75 s` re-arm cooldown prevents the same recovery input from instantly creating a second automatic drift.
- Lateral velocity is limited to `0.60 × forward speed`. The HUD retains the DRIFT state after the handbrake is released; F3 exposes lock state, slip angle and yaw rate for handling diagnostics.

Keep ordinary steering and drift recovery as separate response paths. Do not reintroduce a hard bound on `carYaw`; tune yaw response, rear grip, and countersteer recovery instead. BUILD 131 is `v0.18.65` / `BUILD 131`.



## Vehicle movement and NFS-style drift model — BUILD 132

The car is simulated in its own horizontal body frame. `speed / 3.6` is longitudinal velocity (V_{long}) along the nose; `lateralVelocity` is transverse velocity (V_{lat}), positive toward the car's local right side. The slip angle is:

`slipAngle = atan2(Vlat, max(2, abs(Vlong)))`

The front-axle lateral demand is derived from the actual speed-sensitive steering angle and the 3.275 m wheelbase, capped at 10.5 m/s². It follows the steered front wheels. The rendered front wheels also receive a small slip-angle countersteer overlay (`0.28×` in DRIFT and `0.42×` in RECOVERY), so the visible steering rack reflects the automatic correction without changing the physics yaw controller a second time. Rear-axle lateral damping is selected by a four-state controller:

| State | Rear lateral damping | Behaviour |
|---|---:|---|
| GRIP | 9.0 | Both axles hold the line; slip is removed quickly |
| INITIATION | 0.12 | A brief yaw impulse and almost-free rear axle break traction |
| DRIFT | 0.24 | Front steering controls the nose while the tail slides outward |
| RECOVERY | 0.24 → 10.0 over 0.38 s | Rear grip returns progressively while the nose aligns with the velocity vector |

### State transitions and driver inputs

- **Initiation:** a SPACE key-down produces one 160 ms handbrake pulse; with steering at speed it starts an initiation and a yaw impulse. A sharp steering input above the lateral-demand threshold or braking while turning can also initiate the slide. Holding SPACE does not hold the rear axle permanently locked.
- **Sustained drift:** once slip exceeds 7° after the initiation phase, the state latches into DRIFT. Releasing SPACE does not end it. Steering in the direction of the current rotation adds yaw and increases the slip; opposite steering adds countersteer authority and reduces the angle.
- **Auto-countersteer:** when the player releases the steering key, a softer slip-angle alignment term turns the nose toward the velocity vector. This lets the car continue sliding along an arc before grip is restored, rather than snapping straight or spinning indefinitely.
- **Transition:** while countersteering, if the slip angle crosses through neutral and continues to the other side, the controller starts a new initiation in the opposite direction. Releasing countersteer near neutral instead allows Recovery to complete.
- **Recovery:** with the steering released, or after the driver has reduced slip below 11°, rear damping rises to grip level over 0.38 s. GRIP is restored when slip is below 10° and yaw rate is below 0.28 rad/s; a 1.2 s failsafe prevents a stuck recovery state. Slip above 76° or speed below 10.5 m/s also forces recovery. Yaw acceleration is progressively reduced as slip approaches 60°.
- **Pedals:** engine acceleration acts on (V_{long}), so throttle pushes along the vehicle's nose even when the velocity vector points elsewhere. Drift drag rises with slip when the driver lifts. The normal brake adds front load and a yaw impulse while steering, making brake-turn initiation possible. A no-steer handbrake tap during DRIFT adds a short lateral velocity impulse without forcing a new nose angle.

### World-space integration

The body-frame velocities are rotated by the current, unbounded `carYaw` to obtain one world velocity:

`VworldX = Vlong·sin(yaw) + Vlat·cos(yaw)`

`VworldZ = Vlong·cos(yaw) − Vlat·sin(yaw)`

Both world coordinates are integrated from this same vector using `WORLD_MOTION_SCALE = 0.432`. The previous implementation advanced world Z from scalar throttle speed regardless of vehicle heading; do not reintroduce that split. A 360° rotation now carries the car around the corresponding world-space arc instead of leaving its trajectory pointed down the original road axis.

`distance` is the car's world-Z track coordinate and may decrease when it travels backward. `travelDistance` is the non-decreasing odometer accumulated from the world-velocity magnitude. `wheelTravel` integrates longitudinal body travel and drives the rolling angle of all four wheels. The speedometer and engine/skid audio use the magnitude of the complete velocity vector, not just its longitudinal projection.

Keep the four-state drift controller, body-frame velocity and shared X/Z world integration together. Vehicle rendering, headlights, shadows and chase camera continue to use the same `carYaw` heading. BUILD 132 is `v0.18.66` / `BUILD 132`.


## Countach-inspired DRIVELLA GTS body and wheel animation — BUILD 133

The exterior remains the custom procedural DRIVELLA GTS mesh family. The visual design is being corrected toward the low-poly Countach reference (3DShinobi, Sketchfab, CC Attribution): a longer tapered front wedge, broad rear haunches, low flat canopy, wider front/rear panels and large side air intakes. This is a geometry rebuild from profile/quad/ribbon meshes, not an import of the Sketchfab source file. Keep the public-facing DRIVELLA name.

### Shared body and glazing geometry

The main hull is still generated by `makeCarHull(bodyProfile, ...)`. The Countach pass updates `bodyProfile` to widen the rear shoulder and wheel-area sections, lower and flatten the canopy, and preserve a shallow nose wedge. The roof and glazing are updated from the same dimensions:
- `CABIN_ROOF_STATIONS` defines the roof side rail and crown.
- `CABIN_GLASS_TOP_*` and `CABIN_GLASS_BOTTOM_*` define the planar side windows and the shared windshield/rear-window corners.
- `cabinRoofAt()`, `cabinSidePairAt()`, pillar builders and the projected front roof seam must use those same shared stations.
- The side-intake quads are mirrored from one pair of points; rear fascia, front grille and splitter widths follow the new body cross-section.
- Wheel-arch overlays and arch ink are widened together with the rear haunch profile. Do not change the hull width alone or old trim may float beyond the new silhouette.

### Pop-up headlamps — preserve the existing mechanism

BUILD 133 deliberately keeps the working twin pop-up lamp assembly rather than making a new static light:
- Each pod retains a chamfered wedge housing, a separate hood-profile cap, front plate/bezel, lens and two projector rings/cores.
- `POP_HINGE_Z`, `POP_HINGE_Y`, `lampFrontPoint()` and `lampRearPoint()` anchor the closed assembly to `hoodSurfaceY()`.
- The lid remains a small positive offset above the hood; the housing and optical plane remain recessed below it.
- `drawCarHingedMesh()`, the world-space headlight sources and the lens-flare transform must continue to use the same eased `-45°` X-axis deployment and identical hinge pivot. The visible optics, spot direction and flare projection therefore stay attached through the complete animation.
- When adjusting hood stations, update `hoodSurfaceY()` through the profile; do not add a global lamp translation or move only the drawn meshes.

### Four independent animated wheel assemblies

The four wheels are keyed `fl`, `fr`, `rl`, `rr` in `wheelTravel`. Each physics tick estimates the longitudinal contact velocity at that wheel from the rigid-body velocity and yaw:
`localForward = vLong - yawRate · localX`
`localSide = lateralVelocity + yawRate · axleZ`

For front wheels, this local contact velocity is projected onto the steered wheel direction using the same Ackermann angle as the rendered wheel. Its accumulated distance advances that wheel's own `wheelSpin = -wheelTravel[key] / WHEEL_RADIUS`. Left/right wheels can therefore rotate at different rates while cornering or drifting; do not replace the four values with one shared scalar travel distance.

`drawCarPart()` treats the tyre cylinder, tread patches and alloy faces as parts of the same rotating wheel assembly. The front brake caliper is a suspension-fixed component: it receives the front steering pivot but zero wheel spin. The wheel face geometry now has a stepped dish, multi-spoke design, lug details and centre cap. The tread is built from repeating low-poly blocks around the tyre circumference and spans the full tyre width. Keep all rotating details on the same spin argument, and keep brake hardware stationary relative to the hub/suspension.

The front axle continues to use `getFrontWheelSteerAngle(side)`, including Ackermann correction and BUILD 132's visual auto-countersteer overlay. Garage mode keeps all four wheels stationary and straight. BUILD 133 is `v0.18.67` / `BUILD 133`.


## Imported Countach model — BUILD 135

The active car renderer now uses the imported low-poly Countach source mesh by 3DShinobi (Sketchfab, CC BY). The previous procedural BUILD 133 car renderer remains intact as a fallback if the local model asset cannot be decoded. Do not remove that fallback until the imported path has been visually validated on the target browsers.

### Offline geometry payload

The model is bundled locally; runtime does not download a GLB/GLTF or depend on a model-loading library.

- `assets/countach_model_0.js` declares `DRIVELLA_COUNTACH_META` and initializes `DRIVELLA_COUNTACH_DATA`.
- `assets/countach_model_0a.js` through `0d.js`, `1.js`, `2.js` and `3a.js` through `3d.js` append the Base64 payload in order. Keep the synchronous script include order in `index.html`; reordering or omitting any chunk corrupts the stream.
- The payload is deflate-compressed. `loadCountachModel()` uses the browser's native `DecompressionStream('deflate')`, verifies the decoded byte count against metadata, reads quantized signed 16-bit vertex positions and unsigned 16-bit indices, expands indexed triangles into the renderer's flat `mesh()` input and uploads them through the existing WebGL path.
- The raw geometry is 78,636 bytes. Position quantization is 1e-4 game units. Geometry is grouped by source object/material so body paint, plastic, black trim, metal, tail panel, front details, mirrors, exhausts, lamps, tyres and rims can be styled independently without adding another renderer.
- The runtime asset is self-contained and offline. If the model is updated, regenerate the metadata and all payload chunks from the source together; never hand-edit Base64 fragments. Verify every chunk against the generated source and confirm the decoded byte count before committing.

### Imported wheel assemblies

The source model provides separate front and rear tyre/rim geometry. The renderer instantiates four assemblies at the source wheel centres:

- Half-track: 0.9274 game units.
- Front axle Z: +1.6402; rear axle Z: -1.6422.
- Wheel radius for travel-to-spin conversion: 0.4.
- Wheelbase: 3.2824 game units.

The left assemblies are mirrored from the right-side mesh about local X. The mirror operation reverses triangle winding; preserve that correction or face culling/normals will be wrong. Since the mirrored wheel axle points in the opposite X direction, left wheel spin uses the opposite sign from the right. Do not apply one global spin sign to all four source wheels.

Each assembly still uses its own `wheelTravel.fl/fr/rl/rr`. The front wheels apply the existing `getFrontWheelSteerAngle(side)` pivot, so Ackermann steering and the visual countersteer remain connected to the imported geometry. Tyre, rim and front inner wheel-detail meshes share the same wheel rotation. The rear source has no `extra_NoMaterial` part; do not draw that optional part for the rear axle.

### Imported pop-up headlights and lighting

The imported `headlampL` and `headlampR` are separate meshes. They rotate around local hinge Y=0.76, Z=2.30. Their authored pose is already forward-facing, so the imported transform is intentionally different from the old procedural lamp geometry:

- Stowed: +45° around local X.
- Deployed: 0° around local X.
- Interpolation: smoothstep from `headlightDeploy`.

The imported mesh transform, world spotlight origins/direction and lens-flare source positions all use the same eased hinge. Keep these three paths synchronized whenever the hinge or lamp anchor is moved. Lamp anchor centres are approximately X=±0.84984, Y=0.76117, Z=2.46559. The old procedural lamp assembly retains its original -45° deployment transform only in the fallback path.

### Source attribution

Original model: [Low Poly Lamborghini Countach](https://sketchfab.com/3d-models/low-poly-lamborghini-countach-c9b28a4ad5c74649a09afa613dd3fae1), by 3DShinobi, Sketchfab, CC BY. The in-game HUD displays this attribution and links to the source. The model geometry, materials, mirroring and rig integration are modified for DRIVELLA.


### BUILD 136 — volumetric imported pop-up headlamps

The imported source's `headlampL` and `headlampR` parts are shallow convex optical surfaces containing two round lamps per side; they are not the full-depth lift-up pods. BUILD 136 preserves those source meshes and adds a tapered, chamfered 3D housing behind each pair, plus separate extruded metal collars around the four lens rims. The pod extends rearward to the transverse hinge line at local `Y=0.76`, `Z=2.30`; its broad front face remains behind the imported lens surfaces so the original convex geometry is still visible.

The imported Countach pose convention is:

- Stowed: **+45° about local X**. The optical face tips down and the pod folds rearward beneath the bonnet line.
- Deployed: **0° about local X**. The twin lenses face forward along local +Z.
- Motion: smoothstep interpolation from `headlightDeploy`.

Use `countachHeadlightAngle()` and `countachHeadlightHinge()` as the shared transform source for the visible pod shell, metal collars, imported lenses and world-space headlight system. Do not reintroduce the BUILD 135 negative-angle geometry transform: that made the pod lift farther upward when the user pressed `L`. The older procedural fallback uses a separate legacy hinge convention and must not be changed to match the imported mesh.

The four screen-space lens-flare origins use the decoded local centres of the four source optical discs. The current WebGL shader keeps one broad local spotlight origin per paired pod (two spot origins total) for bounded per-pixel cost; those origins sit at the pair centres, and use the same shared hinge and forward direction. If increasing to four real shader spotlights in a later build, update the GLSL uniforms, mesh-culling bounds and diagnostics together, and profile the GPU cost before keeping the change.

A backup of the complete BUILD 135 page is stored at `backups/index_BUILD135_before_countach_headlight_rig_BUILD136.html`. BUILD 136 passed JavaScript syntax validation, but in-browser visual alignment, full hide/raise travel and beam projection remain runtime checks.


### BUILD 137 — one-piece Countach headlamp assemblies and emissive-only lighting

`drawCountachHeadlampAssembly()` computes the vehicle/headlight hinge matrix once per pod and submits all pod parts against that same transform: the tapered housing, body-colour top skin, the two metal collars and the original imported twin-lens mesh. Both sides therefore share one rigid kinematic assembly; do not add independent pivots or local offsets to any of these pieces. The painted upper skin follows the imported hood rise from the hinge line at Z=2.30 to the front edge at Z=2.451, and is drawn above the housing shell. It conceals the folded optical faces when stowed; as the pod rotates to its deployed position, the lens faces become visible together with the lifted housing.

**Headlight rendering policy:** BUILD 137 intentionally removes the dynamic world-space headlight lights from the WebGL path. The `calcHeadlightEnergy()` GLSL function, all headlight position/direction/intensity uniforms, their JavaScript bindings, per-mesh cone culling and Stage 2 uniform uploads are removed. H now only switches emissive lens brightness and a compact Canvas2D radial halo at the four real optical centres. The headlight halo is slightly larger than turn-signal/taillight halos but does not cast a beam on the road or run lighting calculations for each world fragment. This is a deliberate performance trade-off to restore the light-weight emissive treatment used in the earlier BUILD 102/103 phase. The general garage spotlights and solar/vehicle shadows remain independent and unchanged.

The full BUILD 136 page is preserved at `backups/index_BUILD136_before_unified_headlamp_and_lighting_simplification_BUILD137.html`. BUILD 137 passed JavaScript syntax validation and source-level checks for removal of the old headlight shader references. Visual stow/deploy fit and real-device FPS still require an in-game check.


### BUILD 138 — GLSL startup fix

Removed an accidental closing brace after the fragment-shader varying declarations. The brace had been left behind when the previous build removed the per-fragment headlight-lighting function, causing WebGL to abort fragment-shader compilation at startup. No rendering or vehicle behavior was intentionally changed in this fix.


### BUILD 139 — Legacy pop-up headlamp assembly restored

The original seven-part dual-projector pop-up lamp assembly (wedge housing, front plate, bezel, lens, projector rings, emissive cores and painted cap) replaces the imported Countach optic render path. A fixed per-side mounting transform aligns the legacy module to the Countach lamp footprint and compensates for the legacy 45° optical-face orientation. The existing Countach hinge axis, eased `headlightDeploy` animation, `L` toggle and low-cost emissive/2D flare behavior remain shared; imported Countach headlamp meshes are no longer drawn, preventing stacked optics. No dynamic per-fragment headlight illumination was reintroduced.


### BUILD 140 — Countach headlamp seating cleanup

The legacy pop-up assembly mount is lowered by an additional 0.0206 game units relative to BUILD 139. All seven visible pieces and the two-projector flare anchors continue to share the same per-side mount and animated Countach hinge. During Countach model loading, source meshes named `headlampR` and `headlampL` are skipped; this prevents the imported static optics from being available to later draw paths. No body, bumper, fog-lamp, wheel, steering or lighting-shader geometry is altered. JavaScript syntax validation passed. Validate the closed cap/bonnet seam and the full open/close animation in the garage.


### BUILD 141 — Remove legacy triangular hood lamp covers

At Countach import, skip only `bodyPaint` triangles whose three vertices fall inside the verified bounds of the two isolated old upper headlamp cover shells. This removes 29 triangles on each side (58 total) from the painted body mesh. Do not filter `bodyPlastic`, `bodyBlack`, or the restored DRIVELLA pop-up lamp assembly. Hinge transform, headlamp mount offset, projector cores, flare anchors and emission behavior remain exactly as in BUILD 140.


### BUILD 142 — Old lamp face removal and fitted bonnet closure

The Countach `bodyPlastic` import filter now drops only the two old front headlamp panels whose three vertices lie on the verified `z=2.4561` plane and within the lamp-face bounds. Source-mesh verification found exactly 48 triangles per side; runtime count is exposed as `window.DRIVELLA_OLD_FRONT_HEADLAMP_OVERLAYS_REMOVED`. No other `bodyPlastic` triangles, painted body triangles, lower fog lamps, bumpers, or the restored DRIVELLA lamp meshes are affected.

The existing animated painted cap is now fitted in inverse space against the exact stowed hinge + mount transform. For each upper perimeter vertex and center, solve local Y so its transformed world position sits 3 mm inside `hoodSurfaceY`. This closes the exposed hood/headlamp seam in the stowed pose without adding a static patch; the cap remains rigidly attached to the pod and follows the existing open animation. The mount parameters are centralized so the fit transform and visible assembly cannot drift apart.


### BUILD 143 — Preserve imported Countach after front-overlay filtering

The BUILD 142 front-overlay filter incremented `removedOldFrontOverlays` without declaring it. Because the error occurred during the import loop, `loadCountachModel()` caught a `ReferenceError` and left `countachModelReady` false; the vehicle renderer consequently selected its legacy procedural fallback. BUILD 143 declares the counter within the current part's import scope alongside the triangle write cursor and existing hood-cap counter. The two bodyPlastic overlay groups remain the only newly filtered geometry (48 triangles per side); all remaining Countach meshes and the replacement lamp assemblies continue through the imported-model draw branch. The Countach geometry assets, wheel centers, wheel animation, lamp mounting transform, hinge, flare behavior and rendering pipeline are unchanged.


### BUILD 144 — Imported-surface headlamp caps, lower lamp-pad material split and legacy glow

After Countach decoding, retain the filtered `bodyPaint` source triangles as a temporary CPU-side surface query. Rebuild both moving lamp caps from that mesh: sample the upper body surface at each transformed cap outline/centre point, interpolate over the actual triangles, and use the nearest mesh edge for points on the removed-panel boundary. The existing closed hinge and per-side mount are unchanged; the cap keeps its 3 mm body overlap and 40 mm return. This removes the generic-profile mismatch that could leave a visible seam above the lamps.

In the imported `bodyBlack` part, split only the eight verified lower lamp-pad triangles (four on either side; all vertices within X ±0.62…1.07, Y 0.57…0.68 and Z 2.47…2.71). Store them as `frontLowerPaint` and draw with `C.body` plus `PAINT_MATERIAL`. Do not recolour the remaining `bodyBlack` geometry or the central intake/radiator assembly.

The two current lamp pods now emit one BUILD 122-style white-blue Canvas2D glow each, centred at the paired-projector datum and transformed through `countachLegacyHeadlampMount(side)`. The existing facing, distance, anamorphic bloom and flare compositor are reused; no dynamic fragment spotlight or shadow work returns. BUILD 144 keeps the imported Countach draw branch, wheel rig, pop-up hinge and existing body geometry filters.


### BUILD 145 — Revert unsafe hood-surface cap sampler

Removed the BUILD 144 `countachBodyPaintSurfaceYAt()` query and post-import cap reconstruction. The fallback selected an unrelated lower `bodyPaint` edge around Y≈0.3435 where the hood sample was unavailable (the cap's expected world height was around Y≈0.72). This broke the cap's local vertex fit. Restore the exact BUILD 143 moving-cap mesh construction using the pre-existing `hoodSurfaceY()` profile and shared Countach hinge/mount. Retain `frontLowerPaint` extraction/draw (8 lower pad triangles) and the BUILD 122 one-source-per-headlamp Canvas2D glow. The upper hood seam remains pending a targeted visual fit; do not alter the complete cap surface again without checking the actual in-game gap.


### BUILD 146 — Rearward extension of moving Countach lamp caps

BUILD 145 is preserved at `backups/index_BUILD145_before_rear_cap_extension_BUILD146.html`. The `makeLampCap()` perimeter now reaches 0.060 local Z units farther rearward (approximately 0.034 game units after `COUNTACH_LAMP_MOUNT_SCALE_Z`). This is a footprint-only extension of the painted cap mesh: it is still submitted through the same `countachHeadlightHinge()` and `countachLegacyHeadlampMount(side)` matrix as the original cap. The two projector centres, front plate, bezel, lenses, rings, cores, housing, hinge pivot, easing curve, glow anchors and lower red-pad extraction are unchanged. The cap continues to use the existing guarded `hoodSurfaceY()` fit; do not reintroduce the BUILD 144 unconstrained all-body nearest-edge fallback. BUILD 146 is a conservative visual-fit trial: syntax and source-level invariants are checked, but its final closed seam and full-open hood clearance must be inspected in the running game before further extension.


### BUILD 147 — Exact imported Countach cap panels on the moving lamp rig

BUILD 146 is preserved at `backups/index_BUILD146_before_original_moving_cap_restore_BUILD147.html`. The Countach import filter still removes only the two disconnected `bodyPaint` hood-cap shells, but now also copies their original triangle data into two dedicated meshes. The import is guarded: exactly 58 triangles must be found, with 29 triangles / 261 scalar vertex values on each side, or Countach loading is rejected rather than silently producing a partial cap. At render time, the original body-space cap mesh is transformed by `vehicleWorld * hingeCurrent * mount * inverse(hingeClosed * mount)`. `inverse(hingeClosed * mount)` is precomputed from the same centralized closed transform used by the lamp rig. Thus at `headlightDeploy=0`, the product collapses to the original body-space transform, restoring the source panel coordinates exactly; as `headlightDeploy` changes, only the existing rigid hinge rotates the panel with the complete lamp module. The original panels are not scaled or vertex-edited. The generated legacy `makeLampCap()` is retained for the procedural fallback only. Do not alter projector meshes or hinge/mount constants as part of any further cap fit. The inverse matrix was checked numerically for both sides (identity/product and restored-point drift below 1e-15); sampled edge lengths remain unchanged at full deployment. Syntax/source checks pass, but final visual seam closure and collision clearance must still be inspected in the running game.


### BUILD 148 — Source pop-up caps use the deployed pose as their datum

BUILD 147 is preserved at `backups/index_BUILD147_before_headlamp_cap_open_pose_alignment_BUILD148.html`. The original body-painted Countach lamp-cap panels were treated as if their authored body-space coordinates represented the stowed pose. The observed behavior showed the opposite: they represent the fully deployed/open pose. For the cap meshes only, precompute `inverse(countachLegacyHeadlampMount(side))` and render with `vehicleWorld * hingeCurrent * mount * inverse(openMount)`. Since the full headlight rig is `hingeCurrent * mount`, the mount cancels for the source body-space cap, leaving exactly the same hinge motion around the existing pivot: at `headlightDeploy=1`, the cap returns to its source/open coordinates; at `headlightDeploy=0`, the shared +45° closed transform lowers it into the stowed position. This removes the previous `inverse(closedHinge * mount)` reference error that made source-open caps begin high and lift farther. The actual headlight mesh mount, pivot, easing, optical parts and flare transforms are untouched. Both sides were numerically checked: open-pose point drift below 1e-15 and a representative front cap vertex drops 0.137 game units in the closed pose. This is a source-level transform check only; inspect the rendered body seam and deployed clearance in game.


### BUILD 149 — WebGL synthwave sun and initial corona

The main renderer now has a small dedicated sun shader and quad buffer on its existing WebGL 1 context. `drawWorld()` draws the sun after clearing the main framebuffer and before opaque scene geometry; shadow-map and AO/outline replays are explicitly excluded. The vertex shader bounds work to a rectangle extending 2.6 sun radii around the projected source rather than processing the full screen. The fragment shader preserves the established orange/red/magenta vertical gradient, the nine clipped horizontal slices, two luminous cuts, travelling scan line, breathing scale, halo and rim. It adds a restrained animated corona ring, irregular radial filaments and narrow/broad radial spikes. The shader writes premultiplied alpha and uses `ONE / ONE_MINUS_SRC_ALPHA` blending so the transparent scene canvas composites correctly. F4 exposes `FX.sunGpu` for A/B testing: off selects the preserved Canvas2D disc; a shader/program/buffer initialization failure also leaves that fallback active. The separate Canvas2D vehicle flare pass is unchanged. The shader adds no context, dependency, framebuffer or extra full-screen pass. JavaScript syntax compilation passed; inspect visual layering, stripe appearance and F3/FPS on the target browser before declaring the stage item fully complete.


### BUILD 150 — Occlusion-aware sun aura wrap

BUILD 149 is preserved at `backups/index_BUILD149_before_sun_aura_wrap_BUILD150.html`. Extend the procedural GPU sun with a broad, low-intensity radial aura. The existing `renderCarOutlines()` post composite now also uses the half-resolution full-scene AO normal/depth texture (`aoTarget`) to estimate visible geometry silhouette gradients inside the sun halo footprint. The gradient gives an approximate screen-space outward direction; its alignment with the projected sun direction modulates a narrow orange-to-magenta contour glow with a restrained pulse. This creates a light-wrap impression around foreground silhouettes while the actual solar disc remains behind opaque scene geometry. It is deliberately a screen-space approximation and does not claim volumetric or physically correct scattering. `FX.sunAuraWrap` is independent in F4 and enabled by default with GPU sun. The AO scene mask is retained for wrap even if the user disables both SSAO and ink outlines; in that case the half-resolution mask is drawn but the full-resolution car-outline target/pass is skipped. The default path reuses the existing AO capture and post composite, adding no additional scene capture or full-screen composite. JavaScript syntax validation passed; WebGL shader compilation, in-game edge quality and performance remain to be confirmed in the target browser.

### BUILD 151 — Wider GPU sun aura and stronger silhouette wrap

BUILD 150 is preserved at `backups/index_BUILD150_before_sun_aura_scale_BUILD151.html`. Expand the GPU sun quad and normalized shader coordinates from 2.6 to 5.2 sun radii. The broad radial falloff is widened to approximately twice its previous reach, with a modest increase in peak contribution; the softer halo and corona fade also extend across the expanded region. In the existing outline/AO composite, extend the sun-distance gate and aura envelope from 2.8 to 5.2 sun radii and slightly increase the contour response. The actual disc remains drawn before opaque scene geometry, so foreground objects still cover it; the edge wrap continues to use the existing half-resolution full-scene normal/depth mask and remains a screen-space approximation. No new WebGL context, framebuffer, scene capture, or render pass is introduced, but the larger quad can increase fragment work and must be profiled in-game. The disc geometry, striped bands, pulse, scan line, vehicle lens-flare pass, and obstacle-mask generation are unchanged. Version `v0.18.85` / BUILD 151.

### BUILD 152 — Disc-localized luminous sun wrap

BUILD 151 is preserved at `backups/index_BUILD151_before_sun_disc_light_wrap_BUILD152.html`. Replace its broad 5.2-radius contour tint with a localized screen-space light-wrap. The shader evaluates silhouette gradients only for pixels within 1.24 sun radii and fades the wrap over 0.96–1.22 radii; geometry edges elsewhere in the surrounding sun region no longer receive the effect. Near and far samples of the existing half-resolution full-scene normal/depth mask supply the crisp rim and wider spill terms. Their combined outward direction is compared with the vector toward the sun, producing a stronger source-facing response. A slow pulse and warm-white/gold-to-orange/magenta gradient give the rim a luminous appearance. The composite output is now premultiplied and uses `ONE / ONE_MINUS_SRC_ALPHA`; this lets the wrap add bright colour energy without the former dark/grey overlay, while the existing black SSAO and ink layers retain their appearance. The mask capture, framebuffer count and number of fullscreen composites are unchanged. This is still a screen-space approximation and must be visually validated for actual object silhouettes, shader compilation and GPU frame time. Version `v0.18.86` / BUILD 152.

### BUILD 153 — Layered dynamic GPU solar corona

BUILD 152 is preserved at `backups/index_BUILD152_before_dynamic_solar_corona_BUILD153.html`. Replace the flat, weak radial halo with several deliberately separated energy layers in the existing sun fragment shader: a narrow inner gold-white ring at the solar limb; a brighter orange near-field glow; two irregular plasma ribbons with angularly varying radii and coherent slow motion; fine and broad radial rays; and a diffuse red/magenta outer haze. Low-frequency breathing changes total intensity while nested circular harmonics move the structures smoothly without a seam at the angular wrap. The disc colour, stripe geometry, disc radius, scan line, projected position and pre-opaque draw order remain unchanged. The existing uBreathe/uGlowPulse controls continue to drive the disc and halo. The vertex quad and one-draw-call path are retained; fragment processing returns before the more expensive polar functions beyond 3.72 radii. No new texture, framebuffer or scene pass is added. Opaque foreground objects continue to hide the background aura through the regular scene depth test, and BUILD 152's separately composited edge wrap stays disc-localized. This is a stylized real-time corona effect, not physical plasma simulation or volumetric light transport. JavaScript parsing passed; compile and inspect the WebGL shader and compare in-game FPS before declaring the effect visually complete. Version `v0.18.87` / BUILD 153.

### BUILD 154 — Smooth solar aura and soft object light-wrap

BUILD 153 is preserved at `backups/index_BUILD153_before_smooth_solar_aura_BUILD154.html`. Remove the angular plasma ribbons, their radial spikes and the sharp gold-white border around the disc. Replace these with a continuous radial light field in the existing sun fragment shader: a high-energy orange inner falloff, a broad coral middle layer and a diffuse magenta outer haze, all driven by a slow low-amplitude pulse. The disc gradient, horizontal cuts, scan line, radius and projected position remain unchanged. The object-wrap composite now samples the existing half-resolution scene mask at fine, medium and wide offsets (1.20, 3.60 and 7.80 scene texels). Their gradient magnitudes and source-facing direction are combined into a wider luminous transition with a warm core, orange spill and rose-coloured outer haze. The effect is still gated to the solar disc plus a narrow fringe, rather than colouring nearby geometry indiscriminately. Premultiplied output and the existing SSAO/ink composite are preserved. No framebuffer, texture, scene capture or extra full-screen pass is added; the sun stays on one bounded draw call and the 3.8-radius quad returns early beyond 3.72. JavaScript parsing passed; actual WebGL shader compilation, rendered bloom/edge quality and target-browser FPS must be checked in-game. Version `v0.18.88` / BUILD 154.


### BUILD 155 — Separate soft solar aura and smooth object light-wrap

BUILD 154 is preserved at `backups/index_BUILD154_before_canvas_solar_aura_BUILD155.html`. The GPU sun fragment shader now owns only the striped disc and its moving scan highlight; it no longer tries to create the surrounding halo in the same premultiplied WebGL quad. A new `drawSunCanvasAura()` renders a broad radial orange/coral/magenta gradient on the existing `#sun` canvas, which is already layered below `#scene`. This separation restores a genuinely smooth continuous aura while retaining natural scene occlusion: opaque WebGL geometry covers the lower Canvas2D glow. The GPU-off / initialization-failure Canvas2D fallback remains complete and unchanged.

The existing AO scene-mask wrap now uses a `sceneCoverage()` smoothstep over the linearly filtered mask alpha rather than hard binary `step()` tests. Fine, medium and wide gradient offsets are broadened, edge strengths are smoothly ramped, and wrap opacity/palette are restrained to avoid discrete pixel-like yellow lines. It still reuses the same half-resolution AO target and fullscreen composite; no new capture or framebuffer is introduced. JavaScript source validation can confirm the surrounding script, but WebGL shader compilation, perceived bloom and edge quality, and FPS must be checked in the target browser. Version `v0.18.89` / BUILD 155.


### BUILD 156 — Restored radial sun aura and circular silhouette wrap

BUILD 155 is preserved at `backups/index_BUILD155_before_radial_sun_wrap_BUILD156.html`. Reintroduce the broad solar aura in the existing GPU sun fragment shader rather than relying on a lower Canvas2D layer. The halo is calculated from radial distance to the disc edge using three overlapping exponential falloffs, a subdued time pulse, warm-to-magenta colour interpolation and a smooth fade before the bounded quad edge. Its alpha is composited premultiplied with the disc. The sun remains one bounded GPU draw before opaque scene geometry, which preserves natural depth occlusion; the Canvas2D fallback path is untouched.

The previous four-axis scene-mask gradient created a cross/square-like edge response. It is replaced by `sceneRingMean()`, a 12-direction circular filter at two radii (3.5 and 8 AO texels). Smooth mask coverage and the difference between centre coverage and circular-ring coverage estimate a soft radial silhouette band without axis-aligned lobes. The existing AO framebuffer and full-screen post composite are reused; no new framebuffer or scene capture is added. Texture sample count is higher within the sun gate, so frame timing needs a browser check. JavaScript parsing and source invariants passed; WebGL shader compile, rendered smoothness and FPS remain to be verified in-game. Version `v0.18.90` / BUILD 156.


### BUILD 157 — Stronger radial bloom and blurred silhouette light-wrap

BUILD 156 is preserved at `backups/index_BUILD156_before_soft_solar_bloom_BUILD157.html`. Strengthen the GPU sun's three radial exponential layers and broaden the outer fade while retaining the single bounded draw call, existing alpha compositing, disc geometry and depth order. Foreground opaque geometry continues to cover the disc and aura naturally. The Canvas2D path remains the complete fallback.

Replace the 12-sample ring contrast with a two-scale, 16-direction-per-scale circular blur field over `aoTarget`. Each filtered ring returns both mean scene coverage and a directional coverage vector. The absolute difference between centre coverage and the blurred values creates the soft edge band on both sides of the silhouette; the directional vector selects the rim facing the solar source. The output remains restricted to the disc footprint and reuses the existing scene mask and post composite. It is a screen-space approximation; the additional 32 texture samples per affected output pixel should be profiled. JavaScript source parsing and invariants passed; WebGL compilation, in-game light-wrap smoothness and FPS remain unverified in the target browser. Version `v0.18.91` / BUILD 157.


### BUILD 158 — Unified solar palette and surface-only soft light-wrap

BUILD 157 is preserved at `backups/index_BUILD157_before_surface_only_sun_wrap_BUILD158.html`. The sun fragment shader uses a compact three-layer radial corona with a shorter outer fade. Its solar colour ramp is factored into `solarAuraColor(t)`: orange at the hot inner edge, coral through the middle and magenta at the soft outer falloff.

The outline/AO composite defines the same `solarAuraColor(t)` and uses it for the foreground light-wrap, keeping both effects in one visual palette. Replace sparse ring taps with a weighted 5×5 Gaussian convolution (`[1,4,6,4,1]` separable weights) over the existing linearly filtered half-resolution scene mask. A positive centre-minus-blurred-coverage term, multiplied by centre coverage, confines the wrap to the interior edge of visible geometry instead of outlining both sides of the silhouette. A smooth mask gradient chooses the source-facing side. The existing AO target and one post composite are reused; no framebuffer or render pass is added. The 25 Gaussian mask samples execute only within the existing solar source gate. JavaScript parsing/source invariants pass; target-browser GLSL compilation, actual visual smoothness and FPS remain unverified. Version `v0.18.92` / BUILD 158.


### BUILD 159 — Shared radial aura falloff for sun and occluders

BUILD 158 is preserved at `backups/index_BUILD158_before_shared_solar_falloff_BUILD159.html`. The former object wrap used `max(centerCoverage - blurredCoverage, 0)` followed by a steep `smoothstep(0.012, 0.34, ...)`; that threshold concentrated the energy into a thin, almost uniform contour. Remove that edge-band threshold. Both shaders now define identical `solarAuraColor(t)`, `solarAuraEnergy(radialOffset)` and `solarAuraPulse(time)` functions. The three exponential components and outer fade used around the disc are therefore exactly the same as those used on foreground silhouettes.

For the object path, sample the existing linearly filtered half-resolution scene mask once with the 5×5 Gaussian kernel at radius 4.2. Map the blurred interior coverage to a continuous screen-space distance estimate with `max(0, (-log(1 - coverage) - ln(2)) * 0.27)`, clamping coverage away from the logarithmic singularity. Feed this estimate into the same radial energy and colour functions; multiply by centre coverage, a smooth source-facing mask-gradient term, the existing sun-distance gate and the same slow pulse. This produces a broad, graded glow on the source-facing interior of the occluder rather than a thresholded outline. The previous 25 Gaussian reads and four gradient reads remain; no additional texture, framebuffer, render pass or scene draw is introduced. JavaScript syntax/source invariants pass; browser GLSL compilation, visual edge quality and FPS still require in-game verification. Version `v0.18.93` / BUILD 159.


### BUILD 160 — Outward, far-side halo on solar occluders

BUILD 159 is preserved at `backups/index_BUILD159_before_outward_occluder_halo_BUILD160.html`. Fix the direction and placement of the screen-space wrap. The mask-coverage gradient points from the background toward the object's filled interior, therefore its negative is the outward silhouette normal. `toSun` points from the current pixel to the solar centre; the desired far-side normal points away from the source, so use `dot(outward, -toSun)`. The former expression selected the source-facing side.

The prior `centerCoverage * ...` factor also forced the glow to zero outside the object's silhouette. Replace the interior-only field with an exterior halo field: `outerCoverage = sceneGaussian5(vUv, 2.75) * (1 - centerCoverage)`. Map this continuously decaying filtered coverage to `haloDistance`, then feed it into the same `solarAuraEnergy`, `solarAuraColor` and `solarAuraPulse` functions as the disc. This preserves the same colour, radial falloff and animation while making the glow visible in the background outside the object. Expand the per-pixel source gate from 1.20 to 4.25 solar radii (with a smooth 2.50–4.25 fade), so distant silhouette edges of a large building can still receive the halo when the building overlaps the solar disc. All work stays in the existing fullscreen composite and reuses the existing half-resolution scene mask; no extra target, render pass or scene capture is introduced. JavaScript syntax and static invariants pass; WebGL compilation, visual result and performance need in-browser validation. Version `v0.18.94` / BUILD 160.


### BUILD 161 — Solar aura follows the contact line inside occluders

BUILD 160 is preserved at `backups/index_BUILD160_before_inner_surface_solar_wrap_BUILD161.html`. Replace the exterior away-facing wrap with a source-facing internal surface glow. The mask coverage gradient points from empty background into the filled silhouette; `-maskGradient` is the outward screen-space normal. The object face exposed to the sun therefore uses `dot(outward, toSun)`, not the reversed `dot(outward, -toSun)` introduced in BUILD160.

Estimate inner distance from the silhouette from the existing linearly filtered half-resolution scene mask using one 5×5 Gaussian convolution at radius 2.75: `inwardDistance = max(0, (-log(1 - blurredCoverage) - ln(2)) * 0.27)`. Multiplying `centerCoverage` by `solarAuraEnergy(inwardDistance)` keeps the wrap inside the visible geometry and smoothly fades it away from the contact boundary into the object's surface. The light source's radial propagation is kept unchanged: calculate `sourceRadialOffset = max(sourceDistance - 1, 0)` and reuse the same `solarAuraEnergy`, `solarAuraColor`, and `solarAuraPulse` that produce the disc's halo. The inner edge falloff controls only how deeply the contact light travels into the object; source distance controls its brightness and hue. Restrict processing to 1.98 solar radii, corresponding to the current corona reach, and remove all exterior-only mask math. The existing half-resolution mask and fullscreen composite remain the only resources/passes used. JavaScript syntax and static checks pass; browser GLSL compilation, visual result and FPS remain to be verified. Version `v0.18.95` / BUILD 161.


### BUILD 162 — F4 solar-aura debug overlay

BUILD 161 is preserved at `backups/index_BUILD161_before_sun_aura_debug_overlay_BUILD162.html`. Introduce an opt-in `FX.sunAuraDebug` switch in the F4 effects menu. When active, it forces the existing half-resolution scene-mask capture even when normal sun wrap is disabled, but it reuses the existing AO target and fullscreen outline composite. A new `uSunAuraDebug` shader uniform enables an overlay based on the exact inner-wrap quantities: scene coverage, the 5×5 Gaussian estimate of inward distance, source radial energy and source-facing normal. The contact edge is highlighted; repeated contour stripes encode the direction and depth of attenuation into the object's surface; a warm-to-cyan colour ramp makes the decrease visible. As part of the post composite, this diagnostic layer is drawn after the 3D world and is not occluded by the object being inspected.

The existing `#flare` Canvas2D overlay draws a sun-center crosshair and `SOURCE // SUN` label, concentric radial guide rings, 16 outward arrows and a `RAYS → DECAY` legend. The overlay is drawn after the scene and optical flares, therefore it remains in the foreground. This adds no canvas, texture, framebuffer, scene capture or render pass. The default remains off. JavaScript syntax/source invariants pass; WebGL shader compilation and visual inspection must be confirmed in the target browser. Version `v0.18.96` / BUILD 162.


### BUILD 163 — Object-surface aura diagnostics

The F4 aura test is now object-only. Remove the BUILD 162 `#flare` overlay that drew circles and outward arrows around the sun. The diagnostic shader now renders a bright contact edge on the sun-facing silhouette, repeated chevrons pointing along the inward screen-space direction, and contour bands fading from warm at contact toward cyan deeper inside the occluding geometry. A high-intensity contact marker identifies the source edge on the object itself. The overlay remains part of the existing fullscreen post composite, after the 3D scene and depth test; the normal solar-disc aura is unchanged. No canvas, texture, framebuffer or render pass is added. The test remains disabled by default. JavaScript parsing and source invariants pass; target-browser GLSL compilation and visual inspection remain outstanding. Version `v0.18.97` / BUILD 163.


### BUILD 164 — Staged object-mask and aura-flow diagnostics

BUILD 163 is preserved at `backups/index_BUILD163_before_mask_flow_diagnostics_BUILD164.html`. Keep the existing F4 object-aura test, but add a selectable diagnostic stage so each prerequisite can be inspected independently: (01) full visible-scene geometry mask, rendered magenta without sun or normal gating; (02) the intersection of that mask with the projected solar-radius gate, colour-coded by source distance; (03) the screen-space silhouette normal, coloured green when it faces the projected sun and red when it faces away, without the solar-radius gate; and (04) inward distance from the silhouette, false-coloured orange-to-cyan across the full object mask without source-facing rejection. The original combined contact/flow view remains stage 00. This separates mask capture, sun projection, normal orientation and inward-distance estimation, so a missing stage identifies the failing subsystem. The debug mask capture can run independently of the GPU sun toggle; the normal aura retains its original GPU-sun requirement. All stages reuse the existing AO target and fullscreen composite; no extra canvas, framebuffer, texture or pass is added. Source-level JavaScript and static checks are required; target-browser shader compile and visual confirmation remain outstanding. Version `v0.18.98` / BUILD 164.


### BUILD 165 — Preserve crossfading scenery in the solar-aura mask

BUILD 164 is preserved at `backups/index_BUILD164_before_aura_mask_alpha_filter_fix_BUILD165.html`. The full-scene mask previously reused `shadowCasterAllowed()`, a shadow-map policy that rejects materials with alpha below 0.78 and glass. That is not a valid visibility rule for the solar-aura mask: the procedural biomes crossfade by passing their current weight as mesh alpha, so mountains/buildings disappear from the mask during much of each transition even though they remain visibly rendered. Add a dedicated `sceneMaskAllowed()` rule (`material < 4.5` and alpha at least 0.035) for the shared AO/aura scene capture. Keep `shadowCasterAllowed()` unchanged for the actual shadow-map pass, so shadow casting behaviour is not altered. The staged F4 diagnostics remain available to verify full-scene mask, solar gate, normal direction and inward distance independently. JavaScript parse and source invariants must pass; confirm the mask and aura visually in the target browser. Version `v0.18.99` / BUILD 165.


### BUILD 166 — Direct per-fragment solar surface wrap

BUILD 165 is preserved at `backups/index_BUILD165_before_direct_surface_aura_BUILD166.html`. Replace the unstable AO-mask / Gaussian-blur / screen-gradient aura path with a direct calculation in the normal environment fragment shader. Each visible environment fragment compares its `gl_FragCoord` against the exact projected solar-disc centre and radius returned by `getSunScreenMetrics()`. A soft radial field gates the effect to the solar disc and nearby corona; surface-facing response uses the existing world-space key-light direction, and a view-grazing factor strengthens the wrap near object silhouettes. The result is added to the fragment's regular lit colour before the normal scene depth test/compositing completes. Because it runs while the object itself is rasterized, only visible frontmost object fragments can receive the effect; no secondary scene mask, downsampled AO texture, Gaussian convolution, reconstructed normal or post-process aura composite is involved. F4's `sunAuraDebug` now uses this same direct shader path to paint visible environment fragments within the projected solar zone bright magenta, independent of normal/directional weighting, providing a hard proof that the object pixels are reaching the shader. The old post-process sun-wrap/debug uniforms are forced off and `renderCarOutlines()` is again limited to SSAO and vehicle ink outlines. No new canvas, texture, framebuffer or render pass is added. JavaScript parsing and source wiring checks pass; actual WebGL shader compilation and browser visuals still require runtime validation. Version `v0.19.00` / BUILD 166.


### BUILD 167–171 — Depth-occluded sun and inner-surface aura

BUILD 167 corrected the sun's draw order. The GPU sun quad is no longer drawn before the environment with depth testing disabled. When the outdoor GPU sun is active, `renderCarOutlines()` first renders a half-resolution depth-tested visible-scene mask into the existing `aoTarget`. Cross-fading environment meshes are included by `sceneMaskAllowed()`. The GPU sun then samples this mask and suppresses its alpha and premultiplied colour wherever visible geometry occupies the pixel. This prevents the disc and corona from shining through scenery. The same mask capture runs even if SSAO and ink outlines are disabled, because the sun needs it.

The first BUILD 167 object bloom implementation was incorrect: it included an exterior `outerBloom` contribution and used a square 5×5 Gaussian kernel. That implementation is superseded and must not be used as the reference. BUILD 168 removed the exterior contribution and the square kernel. The current BUILD 171 implementation uses a circular multi-ring scene-mask sample field. Bloom is gated by the current object's coverage, and its falloff is derived from the mask's inward distance. No exterior bloom term exists.

Direction is determined independently from the inward distance. For each candidate pixel, the shader samples the visible-scene mask along a short ray toward the projected sun. The difference between current object coverage and coverage farther along that ray selects the sun-facing contact side. This avoids inferring light direction from the gradient of a broad, blurred mask, which incorrectly illuminated the opposite side in BUILD 170. The F4 diagnostic visualizes this same inner-surface bloom field: warm colour begins at the solar contact side and fades toward cyan deeper into the silhouette. The bloom itself is only composed where the object mask is present.

The current regression page extracts the actual production main-material, outline/bloom and GPU-sun shader expressions from `index.html`, compiles and links them under WebGL 1, and renders a synthetic translucent occluder through the production sun and bloom programs. Pixel readback separately checks occlusion, the sun-facing inner edge, the inward fade, no bloom outside the silhouette, no bloom on the opposite edge, and locality. BUILD 171 passed all checks. The sampled RGB brightness sums were: blocked sun 27, visible sun 372, inner edge 365, 15-pixel inward sample 300, deeper sample 127; outside and opposite-edge alpha were both 0. The same run verified complete mask/bloom framebuffers, JavaScript parsing, F4 wiring, shader linkage and zero WebGL errors.

The synthetic fixture is a deterministic graphics regression test, not a full run of the racing game or a substitute for visual review on the target GPU. It does, however, execute the exact production sun and bloom shaders rather than a duplicate test formula. No additional full-scene render target is introduced beyond the existing AO mask. The BUILD 170 and BUILD 171 source backups are preserved in `backups/`. Version `v0.19.05` / BUILD 171.


### BUILD 172–178 — Multi-scale inner-surface solar Bloom

BUILD 172 adds a dedicated half-resolution source target for the visible GPU sun. The sun shader samples the depth-tested scene-visibility mask, so occluded disc/corona pixels are not written into the Bloom source. A separable Gaussian filter softens this visible source before the object composite.

BUILD 173 adds a tight and a wide Gaussian scale. Its first mix/gain was too strong: multiple inward samples reached the output alpha cap, flattening the profile. The regression caught this; that version is not the final tuning. BUILD 174–175 balanced the layer contribution and gain but the single long source-ray sample still selected a broad, nearly uniform strip. BUILD 176 replaces it with three scene-mask samples toward the projected sun at 4, 12 and 20 half-resolution texels. Their uncovered fractions are weighted 0.52, 0.30 and 0.18, respectively, producing a progressive directional falloff. BUILD 177 extends the measured inward reach. BUILD 178 uses tight/wide Gaussian radii 3.4 / 12.0 times DPR and combines them with weights 0.90 / 0.46; composite gain is 1.50 with a 0.46 alpha cap.

The final composite is gated by current object coverage and the progressive source-ray field. It therefore deposits the blurred visible solar light inside the occluder, not outside it or on the opposite edge. F4 retains independent Bloom enable/debug controls.

The production-shader regression in Chromium/WebGL 1 passed all checks for shader compilation/linkage, target completeness, JavaScript parsing, visible-sun occlusion, progressive source direction, monotonic inward fade, wide-body presence, no exterior aura, no opposite-edge aura and no WebGL errors. Measured RGB sums: sunward inner edge 156, shoulder 97, mid-fade 61, deeper sample 17; exterior and opposite-side alpha 0; blocked/visible sun 27 / 372. The fixture is synthetic and does not replace visual validation of the complete racing scene on the target GPU. Backups for BUILD 172 through 177 are retained under `backups/`. Version `v0.19.12` / BUILD 178.


### BUILD 180 — Countach headlight and self-shadow restoration

The imported Countach's two upper headlight optical points are derived from the same world vehicle transform, animated 45-degree pop-up hinge, and side-specific `countachLegacyHeadlampMount()` used by the visible headlamp pod. The headlight shader receives the transformed left/right position and transformed lens normal. Its per-surface energy combines a soft angular cone, an inverse-square-like distance attenuation, a 38–57 unit smooth range fade and a modest diffuse floor; a bounding-sphere / cone test suppresses lighting on meshes which cannot intersect either beam. This restores road/environment illumination without reintroducing fixed coordinates from the prior car model.

Four lower lamps are constructed as framed/lensed quads directly over the imported Countach's two black lower-front bumper pads per side. Their centre positions are `[-0.944,0.621,2.588]`, `[-0.739,0.623,2.588]`, `[0.739,0.623,2.588]` and `[0.944,0.621,2.588]`; the light-flare overlay uses these same centres and the measured bumper normal. The geometry regression decodes the actual compressed source mesh and confirms all four positions are inside the original bumper-pad bounds (eight source triangles).

The F4 vehicle self-shadow toggle controls the dedicated secondary `vehicleShadowTarget` pass. Restore the imported body paint, plastic, black trim, lower body, metal details, mirrors, exhausts and all four wheel assemblies as `vehicleSolarShadowCaster` participants, so they are included by the `vehicle-self-only` pass. Emissive headlight/fog lenses and emissive rear lamp surfaces remain excluded. The F4 text no longer describes the feature as deferred.

BUILD 180 passed Chromium/WebGL 1 production shader compilation/linkage, JavaScript parsing, the existing inner-surface solar Bloom pixel regression, headlight/shadow feature invariants and imported Countach lower-pad geometry checks. GitHub Pages deployment passed. These checks validate production shader syntax, data wiring and geometry placement; they do not replace a full visual review of the running race on the target GPU. The pre-change source is preserved at `backups/index_BUILD179_before_headlight_and_shadow_restore_BUILD180.html`.
\n\n### BUILD 181 — Reduced headlight energy and extended soft falloff\n\nThe Countach headlight sources retain the exact BUILD 180 world transforms, including the animated pop-up hinge and side-specific lamp mount. Only the beam response changes. Source intensity is reduced from 3.8 to 1.25, the final material contribution changes from 1.38 to 0.92, and the diffuse term is capped at 0.82 with a 0.10 floor. The intended result is a restrained road illumination rather than an overexposed, sharply bounded patch.\n\nThe angular cone changes to `smoothstep(0.60,0.94, dot(headlightDir,-toLight))`, giving the edge a wider interpolation interval. The range fade changes from 38–57 to 28–100 world units, and distance attenuation is slightly less steep (`1 / (1 + distanceSquared * 0.0018)`). The shader's distance guard is 100 units. `headlightAffectsMesh()` uses the same 100-unit axial limit and a 1.36 cone-radius slope, preventing CPU-side mesh rejection from clipping the expanded light field.\n\nNo lamp mesh, source position, flare, pop-up timing, headlight toggle or car geometry changes in this build. The regression checks source-level energy/falloff/culler invariants and compiles/links the production WebGL 1 material shader; the existing solar Bloom pixel and Countach geometry tests remain enabled. This is not a complete in-game visual capture or a substitute for checking the user's GPU. BUILD 180 is preserved at `backups/index_BUILD180_before_soft_headlight_falloff_BUILD181.html`.\n

### BUILD 182 — F4-selectable Sun Bloom quality profiles

The F4 menu has a live quality selector with three profiles. The default **Performance** profile preserves BUILD 181's previous 50% source resolution, two scales and five-sample Gaussian path. **High** uses 67% source resolution, three scales (tight/mid/wide) and a nine-sample separable Gaussian. **Ultra** uses 75% source resolution, four scales (tight/mid/wide/atmosphere) and a thirteen-sample separable Gaussian. Layer radii are normalized against the old half-resolution texel scale, preserving comparable screen-space blur radii as source resolution changes.

Only the selected profile's framebuffer/texture set is allocated. A quality change disposes the former Sun Bloom targets and allocates the new source plus two ping-pong targets per layer. The renderer outputs the four possible layer textures to the post shader; per-profile gain uniforms allow Performance to keep middle/atmosphere gains at zero. The extra fragment samplers use texture units 4 and 5 (WebGL 1's minimum fragment texture unit guarantee is eight). The Gaussian shader selects the five-, nine- or thirteen-sample kernel by a uniform. The existing depth-tested solar source, mask occlusion, directional ray sampling, silhouette coverage gate and inward-only composite remain unchanged.

The selected quality is displayed in F3. Resetting visual effects restores Performance. The automated regression compiles and links the actual production WebGL 1 shaders, measures the existing Performance pixel fixture, executes both additional Gaussian branches, checks all profile definitions and F4 controls, and retains the Countach geometry/headlight checks. This is not an FPS benchmark on target consumer hardware; no GTX 1650/1660 timings are claimed.


## BUILD 183 — Countach rear lamps and low front turn indicators

The front bumper geometry and the imported Countach asset remain unchanged. The four existing lower-bumper lamp pads are used as the complete front lighting row. Their local centres are:

| Index | Centre | Role |
|---:|---|---|
| 0 | `[-0.944, 0.621, 2.588]` | Left outboard amber turn indicator |
| 1 | `[-0.739, 0.623, 2.588]` | Left inboard white auxiliary lamp |
| 2 | `[0.739, 0.623, 2.588]` | Right inboard white auxiliary lamp |
| 3 | `[0.944, 0.621, 2.588]` | Right outboard amber turn indicator |

The existing frames and lens quads are aligned to the measured bumper normal `[0, 0.925, 0.38]`. Turn signal lens emission follows the existing blink phase and steering-side selection. The two inner lamps retain their white emissive material. `drawVehicleLensFlares()` projects only the inner pair as white fog sources and uses the exact outboard lens centres for amber indicator flares.

The imported `bodyTail` source part is a 12-triangle red rear-lens assembly at `z=-2.6039`, spanning `x=-1.079..1.079` and `y=0.7616..0.8695`. Each side has three vertical lens bars. The complete original mesh remains the red tail/brake surface and keeps the smoothed brake-level colour response. The two triangles forming the outermost bar on each side are duplicated into a separate turn-signal mesh and translated only `-0.004` on local Z so they sit just behind the original lens plane. A selected side renders amber on the active blink phase; the inactive state is a dark amber lens. No rear fascia, bumper or body mesh is reshaped. The screen-space tail and rear indicator glare use optical points centred on the matching source bars.

`loadCountachModel()` validates that it extracts exactly two triangles for each rear signal side before marking the imported model ready. The automated regression additionally checks the original four bumper pads and eight source triangles, both rear source bars, flare-point bounds, the complete production script's syntax, production WebGL 1 shader compilation, and runtime creation of the two rear-signal meshes. This covers source geometry, parsing and loading; it is not a visual certification on the target GPU.


## BUILD 184 — Compact cross flare on deployed upper headlights

`drawVehicleLensFlares()` already calculates two independent upper-headlight sources from the current `headlightDeploy` hinge and per-side `countachLegacyHeadlampMount(side)` transform. The projected source point is therefore the actual centre of each moving projector. BUILD 184 adds a small cross directly after the existing soft radial veil for `kind==='headlight'` sources only.

The cross uses four tapered line gradients in screen space: horizontal `2.55 × radius`, vertical `1.48 × radius`, and two diagonal rays `0.78 × radius`; their half-width factors are `0.050`, `0.042`, and `0.027`. Their central energy is `0.24 ×` the already bounded source intensity. This keeps the cross readable without reviving the longer anamorphic streak or the larger lens-optics stack. The existing `if(main) continue` still bypasses the old full flare treatment after drawing the new cross; tail and indicator flare paths are unchanged.

The automated source regression checks the exact four-ray profile and confirms the cross stays within the upper-headlight source branch. The production WebGL shader tests, complete inline-script syntax check and decoded Countach lamp-placement geometry checks remain active. The check validates source wiring and JavaScript parsing rather than visual appearance on the user's GPU.


## BUILD 185 — Tune horizontal and vertical rays in the upper-headlight cross

The four-ray cross remains source-local to each moving pop-up projector. This pass changes only the two orthogonal rays. Their profile now uses horizontal length/half-width factors `2.10 / 0.038` (previously `2.55 / 0.050`) and vertical factors `1.15 / 0.032` (previously `1.48 / 0.042`). Their separate central intensity multiplier is `0.16` (previously `0.24`). The diagonal rays remain `0.78 / 0.027` with multiplier `0.24`, preserving their existing subtle star shape.

The line renderer now carries an individual energy value per ray. Projector positions, brightness/facing falloff, bloom veil, deployment animation, and all non-headlight lamp sources are unchanged. The automated production test verifies the exact per-ray profile and compiles/parses the existing production renderer. It checks source behavior, not the visual result on the user's physical display.



## BUILD 186 — Depth-aware quarter-resolution solar God Rays

The road scene now has an independent FX.sunGodRays effect, enabled by default and controlled from F4. It is gated by the GPU sun/disc path and is intentionally inactive in the garage. The renderer reuses the existing half-resolution, depth-tested scene visibility mask rather than rendering the world a second time.

renderGodRays() allocates a quarter-width/quarter-height RGBA target and evaluates a bounded 24-step radial visibility integral toward the projected sun for each output pixel. Geometry in the ray path reduces the transmitted energy; the destination coverage gate prevents a shaft from being drawn over an opaque foreground surface. A five-point source-visibility gate suppresses rays when the solar source is blocked. The beam pattern has broad and fine angular modulation, a slow low-amplitude pulse, and a restrained orange-to-magenta colour transition.

The resulting premultiplied texture is sampled by the existing post composite on texture unit 6. Sun Bloom and God Rays have independent enable flags; when Sun Bloom is off, its samplers are bound to the existing scene mask with zero gains, so the Bloom path does not need to allocate targets just to composite rays. The effect adds one quarter-resolution shader draw and one small colour target, but no additional scene geometry pass, full-resolution capture, or shadow map. F3 reports the active state and target scale.

The regression compiles/links the production God Rays shader under WebGL 1 and renders it against a synthetic occluder. It verifies that clear paths produce rays, the path through geometry is attenuated, an occluding destination remains dark, and the framebuffer has the expected quarter-resolution dimensions. The complete production inline script and existing sun/Bloom/Countach checks remain part of the suite. These automated checks do not establish visual quality or frame-time on the user's physical GTX 1650; both still require in-game confirmation.

## BUILD 187 — Directional solar-rim sampling and 10% stronger God Rays

BUILD 186 used one global source-visibility estimate based on the disc centre and four cardinal samples. That gate could suppress all shafts when a foreground silhouette covered those five sample positions, even if diagonal or other rim sections of the sun remained exposed.

BUILD 187 replaces that global estimate with a per-output-ray source lookup. The shader calculates the radial direction from the projected sun to the destination pixel, selects a source point on the solar rim in that same direction, and checks three points from that rim location back toward the disc centre. The 24-step visibility integral now terminates at the directional source point, so the ray path and the emitting part of the solar disc agree. Rays can continue from an exposed rim sector while a different sector or the central disc is occluded. Opaque geometry still attenuates the path and blocks the destination.

The authored ray strength rises from 0.22 to 0.242 (+10%). Quarter-resolution output, 24 integration steps, angular modulation, colour palette, low-amplitude pulse, F4 independence and the existing post-composite remain unchanged.

The regression adds a cross-shaped synthetic occluder covering the source centre and all four cardinal source samples while leaving diagonal solar-rim sectors exposed. It checks that a diagonal clear path still receives rays, in addition to the earlier clear-path, occluded-path, destination-mask, framebuffer, existing Bloom and Countach checks. This validates the directional source rule, not the final artistic appearance or physical-GPU frame time.
