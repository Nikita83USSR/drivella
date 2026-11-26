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

**Automated validation**
- [x] Browser startup on WebGL 2, local Havok WASM, terrain collision and same-origin-only runtime requests.
- [x] XYZ coverage, terrain Y-layers, multiple biomes and deterministic prop placement.
- [x] Route geometry, road chunk coverage, 20% grade limit and physical road contact.

Still required:
- Improve road shoulders, cut/fill edges, guardrails, drains and the transition between pavement and natural terrain.
- Add a water/coast system, rivers, lakes and proper wetland transitions.
- Add bridges and tunnels where road/terrain profiles require them.
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

The current branch contains the self-hosted engine, Havok runtime, tested XYZ chunk manager, elevation-aware terrain and the first deterministic biome/prop generation layer. The production car, final open-world content, vehicle simulation, traffic and ragdolls are still future milestones.
