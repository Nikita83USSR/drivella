# DRIVELLA — Rendering Architecture

Current reference: **v0.18.61 / BUILD 127**  
Main renderer: `index.html` — custom WebGL 1 renderer, no external rendering engine.

**Release marker policy:** every published renderer/game change increments `BUILD` in `index.html` and updates the visible HUD, boot screen, README, and this document in the same release. Increment the patch version with the build when appropriate. Never publish a renderer change while leaving the visible build number unchanged.

This document records the rendering decisions that future vehicle, environment, lighting, and effects work must preserve. The goal is a reusable scene pipeline: new world geometry should take part in shadows and ambient occlusion automatically when it uses the shared draw path.

## Frame pipeline

The render loop currently runs these passes in order:

1. `renderShadowMap()` — render the full-scene solar map and garage spotlight maps into packed-depth textures. When `FX.vehicleShadows` is enabled, also render a 1024² packed-depth PCF receiver map using only selected vehicle detail casters; the normal/road/biome environment pass is skipped for this secondary map.
2. `drawWorld()` — render the visible scene using the active driving or garage camera and sample the shadow map on receiving materials.
3. `renderCarOutlines()` — when either `FX.ssao` or `FX.outlines` is enabled, render the half-resolution normal/depth mask and full-resolution car mask, then composite each effect independently using `uAOEnabled` and `uOutlinesEnabled`.
4. `drawSun()` — draw the 2D synthwave sun overlay.

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
- **Sun disc / vehicle lens flares:** `FX.sunDisc` hides only the 2D synthwave sunset drawing; it does not remove `SUN_LIGHT`, its material illumination or cast shadows. `FX.lensFlares` independently gates the Canvas 2D vehicle-lamp optical overlay.
- **Underglow / tyre contact:** `FX.underglow` gates the red floor pool and side neon rails (material modes 5 and 6). `FX.tireContact` separately gates the four procedural tyre-contact ovals (material mode 7).

The F4 panel exposes all 16 controls and includes a reset-to-defaults action. These settings are runtime-only: a page reload restores `FX_DEFAULTS`. Music, volume and sound-effect settings remain in the existing Options menu and are not part of the graphics panel.

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

## GPU sun, atmospheric rays and optical-effects roadmap — planned Stage 2 priority

The current sunset disc is a Canvas 2D overlay behind the transparent WebGL scene, and vehicle lens flares are drawn on a separate Canvas 2D overlay above it. These are existing implementations, not GPU effects. The next major graphics task is to consolidate the sun and optical pipeline on the GPU before adding many more environment lights or expanding the scene.

### Target visual

- Preserve the authored sunset identity: clean horizontal cutout bands, warm orange through red/pink into magenta, a crisp circular silhouette, and a strong but controlled outer glow.
- Add a layered solar corona: bright inner rim, irregular animated plasma filaments, fine radial spikes, and longer intermittent rays. Rays should have subtle motion and intensity variation rather than random flicker.
- Add atmospheric light shafts / god rays that extend from the sun into the scene. They must be depth/occlusion-aware: opaque buildings, mountains, palms and other geometry should interrupt or attenuate shafts; rays must not look like a flat overlay.
- Add restrained optical diffraction, anamorphic streaks, concentric rings and chromatic lens ghosts. Their position, scale and intensity must respond to camera orientation and source visibility.
- Add atmospheric scattering and horizon haze to blend the sun into the sky and distant environment while keeping car and road contrast readable.
- Drive the visible solar source and outdoor illumination from the same SUN_LIGHT record. If sun position or direction is animated later, the visual disc, rays, material key light and shadow camera must all follow that source.

### Implementation sequence

1. **GPU sun disc and corona:** replace Canvas 2D sunset drawing with a procedural WebGL shader layer. Reproduce the existing striped disc and gradient first, then add corona, animated radial filaments and fine rays. Keep the current look as the baseline; do not replace it with an unstriped photorealistic sun.
2. **Depth-aware GPU god rays:** render a compact occlusion mask for the sun-facing opaque scene, then generate radial light scattering toward the projected sun position. Start at quarter resolution (or lower), use a bounded sample count and a small number of blur/composite passes. Buildings and terrain must occlude shafts. Avoid full-resolution high-sample ray marching.
3. **GPU bloom and glare:** add a thresholded, downsampled bloom chain for the sun, emissive lamps and selected neon. Composite with controlled intensity so highlights glow without washing out the image. Reuse the bloom result for solar corona and headlight glare where practical.
4. **GPU lens optics:** migrate existing Canvas 2D vehicle flare profiles to shader compositing: anamorphic streak, diffraction spikes, rings and chromatic ghost shapes. Preserve source-specific profiles and camera-facing/visibility rules; do not restore the old oversized headlight flare.
5. **Atmospheric integration and grading:** add distance/horizon scattering and final colour grading after sun, occlusion and bloom are stable. Keep fog/scattering depth-aware and preserve the neon palette.
6. **Retire overlays only after parity:** remove old Canvas 2D sun and flare paths only after GPU versions match or exceed their visual quality and pass performance comparison. Retain a fallback if a required GPU capability is unavailable.

### Performance and compatibility rules

- Keep the renderer WebGL 1 compatible initially; use shader passes and framebuffer textures supported by the current renderer. WebGL 2 must not be a prerequisite for this visual upgrade.
- Run god rays and bloom at quarter/half resolution, not full resolution. Use bounded samples, separable blur where appropriate, and avoid redundant full-screen passes.
- Reuse existing scene depth/normal or a dedicated low-resolution occlusion mask where possible. Do not rerender the full scene at full resolution solely for decorative glow.
- Keep expensive rays and diffraction configurable by quality tier. The sun disc and compact corona should remain available on lower settings.
- Profile GPU frame time and total FPS with effects individually enabled/disabled in garage and driving. Do not recreate the severe frame-time spike previously seen with oversized front-headlight flares.
- Compare at the same camera, resolution and scene: baseline, GPU sun only, sun plus rays, and full optics.

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
- Stage 2 still needs a controlled bloom pipeline, selected track/environment light sources, improved painted-body and road reflections, and atmospheric depth / final grading.

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
