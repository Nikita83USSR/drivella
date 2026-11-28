# DRIVELLA Engine Lab

This is an isolated browser-only migration test. It does not replace the existing game at the repository root.

Published preview: [DRIVELLA 3D Engine Lab](https://nikita83ussr.github.io/drivella/engine-lab/). Open it from the main menu's **ЭКСПЕРИМЕНТ** entry; use the link in the upper-left panel to return to the stable game.

## Controls and visual style

- Drive with **W/A/S/D** or the arrow keys; Space is the handbrake.
- Orbit the camera with the mouse only; the mouse wheel controls zoom.
- Terrain keeps the 10 m minor / 50 m major neon grid.
- World objects retain their own source hues and material identity: green foliage, brown wood and shores, blue-gray stone, water, road markings and amber tunnel warnings.
- Object colors receive a hue-preserving brightness/saturation lift; each streamed mesh emits a matching glow tint. The Countach keeps its original material palette.
- The asphalt, shoulders and neutral-white lane markings match the stable game's dark road palette, have no emission, and are excluded from the world glow. Separate raised cyan-blue kerbs glow to match the major terrain grid; they are visual-only and do not alter tyre collision.
- Legacy-style graphics are restored with Babylon-native post-processing: scene bloom, SSAO, screen-space reflections, directional shadows, the horizon sunset disc and aura, atmospheric perspective over distant scenery, occlusion-aware volumetric sun rays, lens flares, car headlamps, red underbody lighting, wheel contact shadows, Countach silhouette outlines and local track lights. Use **FX / F4** to toggle the effects.

## Local build

Requirements: Node.js 22+ and npm.

\`\`\`sh
npm install
npm run build:engine
\`\`\`

The build produces:
- \`vendor/drivella-engine.js\`: tree-shaken Babylon.js runtime plus the local app.
- \`vendor/HavokPhysics.wasm\`: Havok WebAssembly runtime.
- \`licenses/\`: redistribution notices for Babylon.js and Havok.

Serve the repository over HTTP (for example \`npx http-server .\`) and open \`/engine-lab/\`. Do not open the page with \`file://\`; browsers restrict ES modules, WebAssembly and service workers on file URLs.

## Runtime guarantees

- No public CDN imports or remote asset URLs.
- Havok resolves its WASM from the same directory as the local engine bundle.
- If Havok is unavailable, the 3D renderer remains active in reduced mode and retries the local WASM.
- The service worker caches successfully downloaded same-origin files for later launches.
- Future optional assets will be loaded independently and must have procedural/low-detail fallbacks.

The GitHub Actions workflow builds the runtime bundle, runs a headless browser smoke test, and commits the generated runtime files back to the branch that triggered the build (including the published main branch). npm is a build-time source only; players do not contact npm.
