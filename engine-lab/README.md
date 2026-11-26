# DRIVELLA Engine Lab

This is an isolated browser-only migration test. It does not replace the existing game at the repository root.

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

The GitHub Actions workflow builds the runtime bundle, runs a headless browser smoke test, and commits the generated runtime files back to this migration branch. npm is a build-time source only; players do not contact npm.
