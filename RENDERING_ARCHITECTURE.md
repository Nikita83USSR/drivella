# DRIVELLA — Rendering Architecture

Current reference: **v0.18.42 / BUILD 108**  
Main renderer: `index.html` — custom WebGL 1 renderer, no external rendering engine.

This document records the rendering decisions that future vehicle, environment, lighting, and effects work must preserve. The goal is a reusable scene pipeline: new world geometry should take part in shadows and ambient occlusion automatically when it uses the shared draw path.

## Frame pipeline

The render loop currently runs these passes in order:

1. `renderShadowMap()` — render eligible opaque scene geometry from the directional-light view into a packed-depth shadow map.
2. `drawWorld()` — render the visible scene using the active driving or garage camera and sample the shadow map on receiving materials.
3. `renderCarOutlines()` — render a half-resolution normal/depth mask for the complete opaque scene, render a separate full-resolution mask for car contours, then composite full-scene AO and car-only ink edges.
4. `drawSun()` — draw the 2D synthwave sun overlay.

The scene is intentionally drawn through the same `drawWorld()` path in the normal and shadow passes. Do not build one-off shadow meshes or hard-code a shadow for every new prop.

## Camera controls — BUILD 101

- The four existing automatic camera presets remain the base camera modes. `C` cycles to the next preset; the existing `1`–`4` direct selection shortcuts remain supported.
- In driving mode, holding the left mouse button on the WebGL scene canvas captures pointer movement. Horizontal drag temporarily rotates the active camera around the car; vertical drag changes its pitch. Both camera position and target are rotated around the car origin, preserving each preset's intended viewing distance and composition.
- Releasing the mouse button, cancelling the pointer, or losing window focus clears the temporary offsets immediately. The active preset then resumes following vehicle heading, so no free-camera state is retained after release. This interaction does not change vehicle steering or physics.
- Garage pointer dragging remains assigned to the existing garage orbit controls; the driving free-look handler ignores garage mode.

- BUILD 101 driving mouse-look now returns smoothly instead of snapping: once the left mouse button is released, yaw and pitch offsets decay exponentially at 17 s⁻¹ and are cleared once imperceptibly small. The selected automatic camera then resumes tracking vehicle heading. `C` cycles the four presets; direct `1`–`4` selection is retained.

## Dynamic directional shadows

- Shadow map size: **2048 × 2048**.
- WebGL 1 compatible depth storage: an RGBA colour texture plus a `DEPTH_COMPONENT16` renderbuffer. The shader packs the depth value into the red/green channels; the receiver unpacks it for comparisons.
- The shadow pass calls `drawWorld()` with `shadowPass = true`. World geometry and car geometry are rendered from the same scene functions used by the visible pass.
- The main directional shadow light is currently fixed to the renderer's key-light direction `(-0.48, 0.82, 0.30)`.
- The light-space orthographic bounds adapt to viewport aspect ratio, active camera mode, driving look-ahead, and garage zoom. The map follows the vehicle and shifts its focus forward in driving cameras.
- Each mesh receives a local `boundsRadius` when `mesh(data)` is created. The shadow pass transforms this bound and culls meshes outside the current light frustum before issuing draw calls.
- The map is rebuilt each frame, so moving vehicles, changing geometry, and newly generated environment props are reflected without per-object shadow maps.

### Automatic caster classification

The single policy is centralized in `shadowCasterAllowed(color, material)`:

- Opaque standard materials cast when their colour alpha is at least **0.78**.
- Material mode **3** (glass) does not cast an opaque silhouette by default.
- Material modes **5 and 6** (underglow pools and side neon rails) are emissive effects and do not cast.
- Material mode **7** (procedural tyre contact shadow) does not cast.
- Fading or translucent scene elements below the alpha cutoff do not cast until they become sufficiently opaque.

Receiving is separate from casting. The main shader samples shadows for regular scene materials below mode 4.5; glass receives a reduced shadow response. Emissive and contact-shadow modes bypass shadow reception.

For future additions, keep this policy central. Do not add per-object shadow textures or hand-authored shadow decals. If a future material needs a different rule, extend the shared material classification deliberately and update this document.

## Stage 2 — Dynamic headlight illumination

The first Stage 2 lighting layer adds two local spotlight sources for the pop-up headlight assemblies:

- Each light position is calculated from the same rigid hinge transform used to animate the triangular headlight pods. It follows the car's world position, yaw, body roll, and deployment angle.
- The light direction is transformed from the lamp's stowed optical axis through the hinge rotation, then receives a small downward aim correction. Light intensity eases in with the pop-up animation.
- The main material shader evaluates each light using a cone cutoff, distance fade, distance attenuation, and the receiver normal. The resulting cool-white/blue diffuse contribution is applied to ordinary world materials using their world position and normal.
- **BUILD 098 fragment-cost optimization:** the two-source lighting calculation is now a dedicated shader function called only by the ordinary lit-world and generic lit-material branches. Dedicated painted-body and glass branches no longer calculate a light result they immediately discarded. A zero-intensity early return removes spotlight work when the pop-up lamps are off. A squared-distance check skips each source at 42 world units or farther, where the existing range fade is already exactly zero. For contributing fragments, the receiver normal is normalized once for both sources, the already-normalized shared light direction is used directly, and attenuation reuses squared distance. Both original light positions and the original cone thresholds, 28–42 unit fade, attenuation coefficient, diffuse response, and intensity multiplier are retained; no lower-resolution lighting, merged light source, or reduced light range is used.
- **BUILD 099 mesh-level light culling:** before each normal-pass draw of a material that receives dynamic light, the CPU transforms the mesh's precomputed bounding-sphere radius into world scale and tests the sphere against both spotlight cones and the original 42-unit limit. Objects fully outside both beams receive zero headlight intensity for that draw, allowing the shader's zero-intensity early return to skip the per-fragment calculations. The cone test uses the original outer cutoff (`cos = 0.91`) and expands the cone by the mesh radius, so boundary-intersecting meshes are retained. The wide base-ground mesh is excluded from redundant light evaluation. This changes neither the beam shape nor any in-beam pixel's lighting math; there is no downsampling or light-range reduction. The debug panel reports eligible meshes tested and culled.
- **BUILD 099 FPS meter:** the always-running frame loop updates a compact on-screen FPS indicator in both garage and gameplay. FPS is measured from real `performance.now()` elapsed time rather than the clamped physics delta, so long frames are reflected accurately.
- **BUILD 100–102 headlight diagnostics and fixes:** `H` disables only the upper pop-up headlight diffuse contribution by setting its per-mesh intensity to zero; the physical pop-up modules and emissive lamp cores remain active. The oversized upper-headlight screen-space flare sources were removed in BUILD 102, while smaller lower-front, rear and indicator flares remain. BUILD 103 restores two compact upper-headlight glints using the same lightweight `kind:'signal'` Canvas 2D profile as the indicators, with a cool white-blue tint and approximately 23% greater authored source power than the turn-signal profile. They use the compact secondary-source haze, short streak, two small rays and minimal secondary ghosts; they do not re-enable the former main-headlight radius, long anamorphic streak, extra diffraction rays, blurred concentric rings or four larger chromatic ghosts. BUILD 102 also removed the legacy translucent polygon beam meshes and changed spotlight diffuse response to `abs(dot(normal, lightDirection))`. The latter is intentional for this renderer's two-sided cube winding: the cube top-face normals point down, so a one-sided positive dot product prevented the asphalt top surface from receiving the headlights. The cone shape, range, source positions, culling and full-resolution shader illumination remain unchanged. The F3 panel reports the active `GARAGE` / `ROAD` scene, H diagnostic state, pop-up deployment, draw calls, and mesh-culling counts. The debug panel remains available in garage mode.
- **Current garage-scene limitation:** `garageMode` does select a separate branch in `drawWorld()` and suppresses the road grid, road segments and biomes. However, that branch is currently only a dark oversized floor, a small layered circular display platform, and two ceiling-light fixtures with vertical beams. It is not yet a fully modelled enclosed showroom. The default orbit camera looks downward toward the car and the fixtures at Y≈5.8 m sit above its visible vertical frustum, so they are mostly or entirely out of view. The flat floor can look like a plain road surface, but the road geometry is not being drawn in garage mode. A proper visible garage enclosure, wall/ceiling architecture, and camera-framed lighting remain future work.
- Because the headlight lighting is evaluated in the shared material shader, new eligible opaque environment meshes on the normal `drawWorld()` path receive the beam illumination without per-object light code.
- The obsolete translucent polygon beam meshes were removed in BUILD 102. The road receives the actual shader spotlight contribution; there is no legacy triangle beam under the bumper.
- BUILD 106 adds a separate reusable local-light path for garage and future environment fixtures. Unlike the pop-up headlight contribution, this path is evaluated in the world, painted-body, glass and generic lit-material branches.

The pop-up headlight pair remains a stylized real-time spotlight approximation, not a physically calibrated automotive photometric model. Those two headlight sources do **not** create their own shadow maps or volumetric scattering, and their diffuse contribution remains restricted to the ordinary world-material path. Painted body and glass use dedicated shader branches; the separate BUILD 106 garage local lights can illuminate those branches, but this does not mean the headlight beams now cast light onto the car itself.

### Emissive lamps and camera-dependent lens flare

Vehicle lamp surfaces use material mode **8**. The main fragment shader outputs their authored colour as emission and bypasses directional shadow response and ordinary diffuse/specular lighting. The shared shadow-caster rule already accepts only material modes below 4.5, so emissive lamps do not cast solid shadows or enter the opaque scene AO capture. Mode 8 is intentionally separate from mode 7, which remains the procedural tyre-contact overlay.

The sunset background remains on the `sun` canvas behind the transparent WebGL `scene` canvas. Vehicle lens flares are now drawn on a separate transparent `flare` canvas at z-index 2, above the 3D scene (z-index 1) and below the HUD (z-index 3). This prevents vehicle and environment geometry rendered by WebGL from covering the optical glare, while keeping the sunset itself behind the world. The overlay is resized with the other canvases, uses the same device-pixel-ratio transform, and is cleared each frame before the projected sources are drawn.

The `flare` canvas draws its lens-flare overlay after the 3D and outline passes. BUILD 095 reduced the main pop-up headlight glare after the earlier profile proved too large and bright: its peak intensity, bloom radius, anamorphic streak, white centre and diffraction rays were restrained together. Its concentric optical rings use wider, low-opacity strokes with Canvas 2D blur, and rings around chromatic ghost reflections are also softened. BUILD 096 reduced the secondary sources as well: lower fog lamps, front and rear indicators, and rear tail-lamp lens flares now have lower overall intensity, smaller bloom radius, shorter and thinner anamorphic streaks, and more restrained diffraction and ghost reflections. These source-specific profiles still depend on camera-facing angle and distance. BUILD 097 adds brake-responsive rear lamps. A smoothed `brakeLight` value is driven by forward brake input (`S` / down arrow while moving forward) or the handbrake (Space); reverse acceleration does not trigger the brake lights. The rear red lamp panels, six LED bars and their additive red halo increase their emissive colour while braking, then return smoothly to the normal running-light level after release. Rear tail-lamp lens flare intensity rises slightly with the same brake state. This is a visual lamp response; it does not alter vehicle braking physics. The remaining effect projects lower auxiliary front lamps, front indicators, rear lamp clusters, and rear indicators using the active camera view-projection matrix. BUILD 102 removed the expensive oversized upper pop-up headlight profile after its per-frame Canvas 2D gradients, blurred rings, diffraction strokes and chromatic ghosts caused an excessive frame-time increase. BUILD 103 restores only two compact upper-headlight glints through the same lightweight secondary-source profile used by the indicators; their colour is cool white-blue and their authored power is slightly higher. The emissive 3D lamp cores and actual shader spotlights remain unchanged. Front and rear indicators use the same blink phase and steering-side selection as their 3D lamp surfaces.

This is a stylized screen-space glare effect rather than a physically simulated lens. It uses camera-facing direction and clip-range visibility, but does not yet test whether an unrelated object fully occludes a lamp. It does not add additional shadow maps or volumetric scattering.

## Reusable local lighting — BUILD 106

A shared local-light evaluator is now available independently of the two moving headlight spotlights.

- The shader supports **four simultaneous local sources** through fixed-size uniform arrays: position + range, RGB colour + power, and direction + cone cutoff.
- A source with a direction is a spotlight; a source without a direction is treated as a point light. Both use the same range fade and distance attenuation.
- Each source contributes a two-sided diffuse response and a view-dependent specular highlight. The same evaluator is used by ordinary world materials, painted body materials, glass, and the generic lit-material branch. Emissive lamps, outlines, shadow depth, and tyre-contact overlays keep their dedicated paths.
- **BUILD 108 shadow interaction:** painted-body local-light response is added after the directional shadow multiplier. A garage spotlight can therefore brighten a body panel even when the main directional light places that panel in shadow; it does not inherit the sun-shadow attenuation.
- Source configuration stays on the JavaScript side in world coordinates. `uploadLocalLights(sources)` clears unused slots and uploads the active source records once per scene draw. New fixtures should add data to the source list rather than introducing one-off shader code.
- **Current garage sources:** two aimed spotlights, one cool cyan and one magenta, at approximately `(-4.7, 4.15, 1.1)` and `(4.7, 4.15, 1.1)`. Both have a 13-unit range and point inward toward the display car. Their visible fixtures and shafts were moved down from the old ceiling position to bring them closer to the garage camera framing.
- The local-light list is currently enabled for the garage scene only. Track and roadside sources remain inactive until selected environment objects are ready to use the same shared path.

These local sources **do not cast shadows** and do not perform occlusion against intervening geometry. They add direct stylized lighting and specular response only; the existing directional shadow map remains the only shadow-producing light. Keep the four-source limit in mind when adding more fixtures, and prefer selecting a few visually important lights rather than enabling every neon prop at once.

## Procedural glass reflections — BUILD 106

Material mode **3** now produces a more visible synthwave environment reflection on the windshield, rear glass, and four side panes.

BUILD 107 explicitly bounds the glass fragment branch to `2.5 < materialMode < 3.5`. Painted clear-coat material mode **4** therefore reaches its own dedicated paint shader instead of being captured by the glass condition. Keep the glass and painted-body material ranges separate when adding future shader modes.

- The reflection direction is derived from the camera-to-surface view vector and the glass normal, so the reflected response changes with camera movement rather than staying painted onto the window.
- The procedural environment combines a deep blue sky gradient with a magenta horizon band, cyan and purple neon bands, a restrained directional sun highlight, and a small direction-dependent neon variation.
- Reflection blend begins at approximately **0.54** and increases toward **0.88** at grazing view angles. This makes the environment visibly readable from ordinary driving cameras as well as close garage inspection.
- The general local-light evaluator also adds a view-dependent coloured specular response to glass when garage spotlights are active.

This is an intentional stylized environment-reflection approximation. It is **not** a cubemap, ray-traced reflection, or screen-space reflection (SSR): individual buildings and roadside objects are not reproduced as exact reflected geometry. Future reflection work still includes painted-body response and road/asphalt reflection.

## PCSS-style soft shadow filtering

The receiver uses a bounded Percentage-Closer Soft Shadows approximation:

1. A **3 × 3 blocker search** estimates the average depth of geometry between the light and receiver.
2. The depth separation between blocker and receiver determines a variable penumbra radius.
3. A second **3 × 3 comparison filter** samples using that radius; the radius is clamped to avoid unstable or excessively broad shadows.
4. A normal-dependent depth bias reduces self-shadow acne.

This is a practical screen-space/filtering approximation for the current single directional light, not a physically exact area-light simulation. Keep blocker and filter loops bounded for WebGL 1 compatibility.

## Full-scene SSAO and car contours

The two effects use separate masks so environment geometry does not acquire the car's black outline treatment:

- **Scene AO mask:** half the canvas width and height, containing encoded world-space normals in RGB and normalized view depth in alpha. It is rendered from the same opaque scene geometry as the shadow caster policy.
- **Car contour mask:** full resolution and car-only. It preserves the existing normal/depth edge detection and the explicit roof seam treatment.
- The fullscreen composite samples the car mask for ink contours and the scene mask for SSAO. Near and farther screen-space samples estimate depth discontinuities and normal creases; the resulting darkening is clamped.
- Glass, translucent fades, neon, and contact-shadow overlays are omitted from the opaque AO mask to avoid false occlusion.

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

The same scene call is replayed during the shadow pass and during the full-scene AO capture. No extra shadow-specific object placement is required.

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

- The shadow system uses one camera-adaptive directional shadow map, not cascaded shadow maps (CSM). A multi-cascade system may be considered if distant shadow detail becomes important.
- Transparent and alpha-cutout shadow casting is not implemented. Current casters are solid opaque geometry selected by material and alpha.
- PCSS is a bounded blocker-search approximation, not physically accurate penumbra from arbitrary area lights.
- SSAO is half-resolution and screen-space; it can miss off-screen occluders and may require tuning for unusually large or thin objects.
- The map and post-process passes add GPU work. Any future change to resolution, sample count, or extra passes should be evaluated against frame time.
- The main directional shadow light remains fixed. Neither the pop-up headlight spots nor the BUILD 106 local-light sources cast independent shadows; adding shadow-producing lights requires updating both shadow-camera generation and receiver sampling.
- Local lighting currently supports four sources at once and is enabled for the garage fixtures only. Selected track/environment lights still need to be authored and budgeted against the per-fragment cost.
- The glass reflection is a procedural view-dependent approximation, not SSR or a cubemap. Painted-body and road/asphalt reflections still need work.
- Stage 2 still needs a controlled bloom pipeline, selected track/environment light sources, improved painted-body and road reflections, and atmospheric depth / final grading.

**Maintenance rule:** preserve the shared scene pipeline and central material policy. Future environment additions should become shadow casters and AO participants by using the normal scene draw functions, not by receiving bespoke shadow code.
