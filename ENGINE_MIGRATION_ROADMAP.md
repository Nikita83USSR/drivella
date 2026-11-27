# DRIVELLA — browser 3D engine migration

## Non-negotiable architecture

DRIVELLA remains a browser game. The game runs in the player's normal browser and is served from the DRIVELLA GitHub Pages origin. No desktop launcher, remote game server, third-party CDN, third-party asset host, remote API, or runtime dependency on another website is required.

All runtime files must be owned by this repository or by a GitHub Release belonging to this repository:
- Babylon.js runtime bundle and its required modules.
- Havok JavaScript loader and WebAssembly binary.
- Game bootstrap, shaders, loaders, workers and decoders.
- Vehicle, character, environment and prop models.
- Textures, audio, music, animation and world data.
- Licenses and notices for redistributable third-party components.

Third-party libraries are acceptable when their licenses permit redistribution and their runtime files are stored with DRIVELLA. Build-time package retrieval is not a player runtime dependency: the shipped browser build must request runtime resources only from the DRIVELLA GitHub Pages origin.

## Startup and incomplete downloads

The boot path is deliberately small. The browser must be able to open the game with the core renderer and boot files, then begin play without waiting for every optional asset.

- Required boot files: the local engine bundle, boot code and minimum scene data.
- Physics is initialized from the local Havok WASM file. If it is temporarily unavailable, the scene still opens in a clearly reported reduced mode and retries; physics-dependent gameplay must not pretend to be active until Havok is ready.
- Optional world chunks, high-resolution textures, extra vehicle models, music and cosmetic content load asynchronously.
- Missing optional files use procedural or lower-detail fallbacks. They must never block the whole game or produce a fatal startup error.
- A same-origin service worker caches successful downloads. A later launch should reuse cached files; failed downloads can be retried when connectivity returns.
- The asset manifest is versioned. Updates must not mix incompatible files from different builds.

GitHub Pages is the normal delivery route. If a future asset pack exceeds Pages/repository delivery constraints, it may be attached to a GitHub Release in this same repository. It must not be moved to an unrelated CDN or storage provider.

## Engine choice

- Renderer and scene graph: Babylon.js, pinned to 9.37.2 for the initial evaluation.
- Physics: Babylon Physics V2 with Havok WebAssembly, pinned to 1.3.14.
- WebGPU is attempted when available; WebGL is the compatibility fallback.
- The app and engine must be bundled and self-hosted. No import maps or bare module imports may resolve to a public CDN at runtime.

The first version is a compatibility and architecture proof, not a claim that the full game or vehicle simulation is already migrated.

## Migration plan

### 0 — Preserve the current game
- Keep the existing playable build and main branch intact.
- Keep the existing BUILD 219 environment PR isolated; it is not the new full-3D implementation and is not silently merged into this migration.
- Work on engine-migration-foundation and review each completed milestone before replacing the production entry point.

### 1 — Browser engine foundation (current milestone)
- Add a separate /engine-lab/ route that does not alter the current game's entry point.
- Bundle Babylon.js locally and store the built bundle in this repository.
- Store Havok's loader and WASM locally; initialize Physics V2 from the local WASM path.
- Demonstrate a genuinely three-dimensional height-field world, free orbit camera, rigid bodies, gravity and collision.
- Add a browser smoke test that verifies engine startup, physics movement, and absence of third-party network requests.
- Verify that if Havok cannot initialize, the scene still opens and reports reduced mode rather than crashing.

Acceptance:
- /engine-lab/ launches in a normal browser.
- Network inspection shows runtime assets requested only from the game's own origin.
- Havok starts from the repository's WASM file and a dynamic test body falls and collides with terrain.
- WebGPU or WebGL fallback is identified in diagnostics.
- The original game route is unchanged.

### 2 — Full 3D world system (in progress)

Implemented and covered by automated tests:

**Spatial world and terrain**
- [x] Deterministic XYZ chunk manager with a 420 m spherical availability radius and 128 m cells.
- [x] Chunk inclusion based on closest-point distance from the player to each 3D chunk volume.
- [x] Symmetric coverage tests for all six cardinal directions and diagonal chunks.
- [x] Stable coordinate-derived seeds and high/medium/low distance tiers.
- [x] Chunk lifetime independent of the camera frustum; looking away cannot evict nearby chunks.
- [x] Continuous world-space elevation, vertical Y-layer assignment, ridges and valleys.
- [x] Flat central start/garage area with broad relief beyond it.
- [x] Havok static collision attached to streamed terrain patches and disposed with their chunks.

**Biomes and natural objects**
- [x] Five biome classes currently present: forest, meadow, rocky, alpine and wetland.
- [x] Deterministic humidity/elevation/slope classification; repeated loads produce identical prop placements.
- [x] Procedural conifer trees, grass tufts, wetland reeds and low-poly rocks.
- [x] Per-chunk combined vegetation/rock geometry instead of a separate draw call for every plant or stone.
- [x] Distance LOD reduces biome placement counts on remote chunks.
- [x] Rock batches receive static Havok colliders.

**Spline road and physical surface**
- [x] Closed Catmull-Rom circuit with 604 samples and approximately 1,952 m route length.
- [x] Road is split across 17 spatial chunks and follows the terrain's world-space elevation profile.
- [x] Terrain corridor is cut/filled around the route using a closed-loop profile projection.
- [x] Maximum longitudinal grade is constrained to 20% across the entire closed loop, including the start/finish seam.
- [x] Batched asphalt, shoulders, edge lines and broken cyan centre markings.
- [x] Static Havok colliders attached to each streamed road chunk.
- [x] A dedicated dynamic box test confirms actual contact with the asphalt, within 35 cm of the surface and 2.5 m of the road centreline.
- [x] Tapered earth/gravel verges dress measurable cut/fill transitions and follow the banked shoulder cross-section.
- [x] Shallow drainage channels are generated only on the uphill side of significant road cuts.
- [x] Two-level metal guardrails and support posts are generated only where the terrain falls away by at least 2 m beyond the shoulder.
- [x] Roadside features are batched into streamed per-chunk meshes; shared edge profiles are cached instead of resampled for each chunk.
- [x] Node geometry tests validate finite vertices, complete triangles, transition strips, drainage channels, guardrail runs and posts.

**Hydrology, riverbeds and bridge spans**
- [x] Two deterministic river splines and two lake basins generated from repository-local world data.
- [x] River channels and lake beds carved into the terrain with smooth bank transitions.
- [x] Per-chunk batched water surfaces, river highlights, lake polygons and natural shoreline meshes.
- [x] Hydrology segment spatial index keeps terrain sampling local and deterministic.
- [x] Road-water crossings grouped and classified with measurable deck clearance.
- [x] Road profile automatically raises all three detected river crossings to at least 4 m of water clearance while preserving the closed-loop 20% grade limit.
- [x] Terrain under raised spans remains carved below the water surface; the elevated road deck is generated independently from the riverbed.
- [x] Bridge spans receive paired concrete girders and piers extending below the carved bed.
- [x] Node and browser tests verify open river channels, finite water/shore/bridge geometry, every crossing's clearance and the presence of girders and piers.

**Mountain tunnels and cuttings**
- [x] Sample the uncut terrain along the road to detect natural mountain overburden; exclude water crossings so bridges remain independent.
- [x] Detect four tunnel bores along the current circuit, approximately 1,170 m of total covered route, with eight entrance/exit portals.
- [x] Preserve the natural mountain surface as the tunnel roof using a spatially indexed corridor; do not flatten the route through the bore.
- [x] Build separate chunk-streamed inner arch liners, side walls, portal frames, transverse reinforcement ribs and local cyan light strips.
- [x] Suppress cut/fill verges, drainage channels and exposed-edge guardrails inside the tunnel bores.
- [x] Attach static Havok mesh colliders to all active tunnel lining chunks and dispose them with their streamed chunks.
- [x] Browser smoke launches a dynamic body upward from inside a tunnel; it strikes the arch at the expected clearance, then returns to the road and settles.
- [x] Node and browser tests validate finite bore geometry, eight portals, tunnel cover, streamed chunk coverage and physical roof contact.

**Automated validation**
- [x] Browser startup on WebGL 2, local Havok WASM, terrain collision and same-origin-only runtime requests.
- [x] XYZ coverage, terrain Y-layers, multiple biomes and deterministic prop placement.
- [x] Route geometry, road chunk coverage, 20% grade limit and physical road contact.

Still required:
- Add tidal/coastal zones, waterfalls, river rapids, and proper terrain/wetland blending around shorelines.
- Add tunnels, cuttings and retaining structures where terrain profiles require them.
- Replace the current low-poly bridge/shore placeholders with detailed authored modular assets and material passes.
- Generate city districts, detailed buildings, industrial zones, overpasses and other architecture as XYZ-streamed content.
- Add more varied tree silhouettes, shrub types, ground cover, and biome-specific texture detail.
- Move chunk generation and asset preparation off the render-critical path; add worker-backed asynchronous generation and bounded queues.
- Tie the chunk-manager center to the actual vehicle physics body rather than the current lab camera target.
- Add performance budgets, frustum/occlusion rendering (without coupling it to chunk lifetime), and further seam/collision regression tests.

### 3 — Vehicle and driving physics
- Port the existing DRIVELLA GTS visual model into the new Babylon scene while preserving its established silhouette and details.
- Build the car as a rigid-body chassis with a physically coherent centre of mass.
- Implement four independent suspension units, wheel contact, steering geometry, tire forces, braking, drivetrain and handbrake.
- Add controlled drift behaviour, countersteer response, collisions and recoverable rollovers.
- Keep visual wheels, physics wheels, shadows and road contact aligned.

### 4 — World interaction and characters
- Add reusable rigid-body props, breakable objects, traffic and physical obstacles.
- Add character controllers, skeleton-linked ragdoll bodies and joint constraints.
- Ensure physics LOD and object budgets keep simulation cost predictable.

### 5 — Content and visual migration
- Port the existing Countach-inspired car, garage, UI, music and effects into the new scene architecture.
- Rebuild materials, reflections, shadows, bloom, lighting and atmosphere on the new render path.
- Keep the existing game available until the new version passes functional and performance gates.

### 6 — Production cutover
- Test Chrome, Edge and Firefox, desktop and mobile, WebGPU and WebGL fallback.
- Profile representative low-, mid- and high-end GPUs.
- Confirm offline/cache behaviour, interrupted downloads, retry, version changes and rollback.
- Switch the root game entry point only after the new build is demonstrably playable and the user accepts it.

## Current status

The migration branch now contains the self-hosted Babylon.js/Havok runtime, deterministic XYZ chunk streaming, elevation-aware terrain, five observed biomes, a grade-limited 1.95 km road circuit, roadside safety details, two rivers, two lakes, three raised bridge spans and four mountain tunnel bores. The bridges and tunnels use streamed geometry and Havok collision, but remain procedural technical-preview structures rather than final authored assets. The production car, vehicle suspension/tire simulation, retaining structures, final environment art, traffic and ragdolls remain future milestones.


## Vehicle integration — Countach suspension and handling (prototype)

- Imported BUILD 218 Countach geometry is the authority; the older BUILD 021 blueprint is not used for vehicle dimensions.
- All eleven Countach data files are copied into `engine-lab/assets/`, loaded locally by the preview and cached locally by its service worker.
- Wheelbase and track are derived from Countach wheel-centre metadata; tyre radius is measured from the decoded tyre triangles.
- A hidden rigid chassis is sized from imported body bounds, has a lowered centre of mass, and drives four independent world-space wheel pivots.
- Each wheel has its own Havok raycast contact, spring/damper forces and suspension travel; front steering uses Ackermann geometry, rear-wheel drive and handbrake change rear-axle traction, and tire forces obey a friction-circle limit.
- World chunk streaming now follows the physical chassis rather than the orbit camera. Camera orbit stays independent as a presentation control.
- The prototype remains on `engine-migration-foundation`; production `main` is unchanged and no release cutover is implied.
