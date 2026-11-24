# DRIVELLA — Rendering Architecture

Current reference: **v0.18.24 / BUILD 090**  
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
- The light direction is currently fixed to the renderer's key-light direction `(-0.48, 0.82, 0.30)`.
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

When adding a new material mode, define its casting, receiving, AO, and transparency behaviour in the shader and in this table.

## Current limitations / future work

- The shadow system uses one camera-adaptive directional shadow map, not cascaded shadow maps (CSM). A multi-cascade system may be considered if distant shadow detail becomes important.
- Transparent and alpha-cutout shadow casting is not implemented. Current casters are solid opaque geometry selected by material and alpha.
- PCSS is a bounded blocker-search approximation, not physically accurate penumbra from arbitrary area lights.
- SSAO is half-resolution and screen-space; it can miss off-screen occluders and may require tuning for unusually large or thin objects.
- The map and post-process passes add GPU work. Any future change to resolution, sample count, or extra passes should be evaluated against frame time.
- The light direction is currently fixed; if dynamic sun or multiple lights are introduced, shadow-camera generation and receiver sampling must be updated together.

**Maintenance rule:** preserve the shared scene pipeline and central material policy. Future environment additions should become shadow casters and AO participants by using the normal scene draw functions, not by receiving bespoke shadow code.
