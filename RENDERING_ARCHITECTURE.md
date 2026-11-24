# DRIVELLA — Rendering Architecture

Current reference: **v0.18.34 / BUILD 100**  
Main renderer: `index.html` — custom WebGL 1 renderer, no external rendering engine.

This document records the rendering decisions that future vehicle, environment, lighting, and effects work must preserve. The goal is a reusable scene pipeline: new world geometry should take part in shadows and ambient occlusion automatically when it uses the shared draw path.

## Frame pipeline

The render loop currently runs these passes in order:

1. `renderShadowMap()` — render eligible opaque scene geometry from the directional-light view into a packed-depth shadow map.
2. `drawWorld()` — render the visible scene using the active driving or garage camera and sample the shadow map on receiving materials.
3. `renderCarOutlines()` — render a half-resolution normal/depth mask for the complete opaque scene, render a separate full-resolution mask for car contours, then composite full-scene AO and car-only ink edges.
4. `drawSun()` — draw the 2D synthwave sun overlay.

The scene is intentionally drawn through the same `drawWorld()` path in the normal and shadow passes. Do not build one-off shadow meshes or hard-code a shadow for every new prop.

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
- **BUILD 100 headlight isolation diagnostics:** `H` disables only the upper pop-up headlight diffuse contribution by setting its per-mesh intensity to zero; the physical pop-up modules, emissive lamp cores and optical flare remain active. `J` disables only the two upper-headlight screen-space lens-flare sources; diffuse spotlight illumination and other lamp flares remain active. The F3 panel reports the active `GARAGE` / `ROAD` scene, both diagnostic states, pop-up deployment, draw calls, and mesh-culling counts. The debug panel is intentionally visible in garage mode so the scene state can be checked there.
- **Current garage-scene limitation:** `garageMode` does select a separate branch in `drawWorld()` and suppresses the road grid, road segments and biomes. However, that branch is currently only a dark oversized floor, a small layered circular display platform, and two ceiling-light fixtures with vertical beams. It is not yet a fully modelled enclosed showroom. The default orbit camera looks downward toward the car and the fixtures at Y≈5.8 m sit above its visible vertical frustum, so they are mostly or entirely out of view. The flat floor can look like a plain road surface, but the road geometry is not being drawn in garage mode. A proper visible garage enclosure, wall/ceiling architecture, and camera-framed lighting remain future work.
- Because the lighting is evaluated in the shared material shader, new opaque environment meshes on the normal `drawWorld()` path receive the headlight illumination without per-object light code.
- The existing translucent road beam meshes remain as a visual beam layer; they are not the source of surface illumination.

This is a stylized real-time spotlight approximation, not a physically calibrated automotive photometric model. The two headlight sources do **not** yet create their own shadow maps, volumetric scattering, or reflective light transport. Painted car body and glass retain their dedicated material shader paths and do not receive this diffuse spotlight contribution in this iteration.

### Emissive lamps and camera-dependent lens flare

Vehicle lamp surfaces use material mode **8**. The main fragment shader outputs their authored colour as emission and bypasses directional shadow response and ordinary diffuse/specular lighting. The shared shadow-caster rule already accepts only material modes below 4.5, so emissive lamps do not cast solid shadows or enter the opaque scene AO capture. Mode 8 is intentionally separate from mode 7, which remains the procedural tyre-contact overlay.

The sunset background remains on the `sun` canvas behind the transparent WebGL `scene` canvas. Vehicle lens flares are now drawn on a separate transparent `flare` canvas at z-index 2, above the 3D scene (z-index 1) and below the HUD (z-index 3). This prevents vehicle and environment geometry rendered by WebGL from covering the optical glare, while keeping the sunset itself behind the world. The overlay is resized with the other canvases, uses the same device-pixel-ratio transform, and is cleared each frame before the projected sources are drawn.

The `flare` canvas draws its lens-flare overlay after the 3D and outline passes. BUILD 095 reduced the main pop-up headlight glare after the earlier profile proved too large and bright: its peak intensity, bloom radius, anamorphic streak, white centre and diffraction rays were restrained together. Its concentric optical rings use wider, low-opacity strokes with Canvas 2D blur, and rings around chromatic ghost reflections are also softened. BUILD 096 reduced the secondary sources as well: lower fog lamps, front and rear indicators, and rear tail-lamp lens flares now have lower overall intensity, smaller bloom radius, shorter and thinner anamorphic streaks, and more restrained diffraction and ghost reflections. These source-specific profiles still depend on camera-facing angle and distance. BUILD 097 adds brake-responsive rear lamps. A smoothed `brakeLight` value is driven by forward brake input (`S` / down arrow while moving forward) or the handbrake (Space); reverse acceleration does not trigger the brake lights. The rear red lamp panels, six LED bars and their additive red halo increase their emissive colour while braking, then return smoothly to the normal running-light level after release. Rear tail-lamp lens flare intensity rises slightly with the same brake state. This is a visual lamp response; it does not alter vehicle braking physics. The effect projects transformed pop-up headlamp centres, lower front lamps, front indicators, rear lamp clusters, and rear indicators using the active camera view-projection matrix. Front and rear indicators use the same blink phase and steering-side selection as their 3D lamp surfaces.

This is a stylized screen-space glare effect rather than a physically simulated lens. It uses camera-facing direction and clip-range visibility, but does not yet test whether an unrelated object fully occludes a lamp. It does not add additional shadow maps or volumetric scattering.

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
- The main directional shadow light remains fixed; the new headlight spotlights illuminate surfaces but do not cast independent shadows. If dynamic sun or additional shadow-producing lights are introduced, shadow-camera generation and receiver sampling must be updated together.
- Stage 2 still needs reusable garage/environment light sources, a general-purpose bloom pipeline, improved road/body/glass reflections, and atmospheric depth / grading.

**Maintenance rule:** preserve the shared scene pipeline and central material policy. Future environment additions should become shadow casters and AO participants by using the normal scene draw functions, not by receiving bespoke shadow code.
