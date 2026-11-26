# DRIVELLA Windows edition — prototype

The browser game remains the default way to play. The Windows build is optional.

- The website keeps working as it does now.
- The main-menu PC download link points to the Windows installer published in GitHub Releases.
- The installed launcher keeps local game data under the user's LocalAppData folder.
- The CEF host serves local HTML/JS/assets through a loopback-only HTTP server. This is required because the game probes MP3 files with fetch HEAD requests; file:// does not provide normal HTTP semantics.
- CEF's browser and GPU subprocesses use the same DrivellaGame.exe. The executable exports NvOptimusEnablement=1 and AmdPowerXpressRequestHighPerformance=1.
- The updater downloads into a staging directory, validates Git blob SHA-1 values, and swaps active content only after every file is complete. A failed update must leave the previous version intact.

## Prototype limitation

The first CEF build currently runs with no_sandbox=true while validating the renderer and Optimus selection. This is not the final public-release security configuration. Before publishing a generally available installer, move to the supported CEF bootstrap/client-DLL sandbox architecture for current CEF versions and verify the GPU process still uses the exported high-performance-GPU hint.

## Build

The release workflow downloads the pinned CEF Windows x64 minimal distribution, builds DrivellaGame.exe, publishes the self-contained .NET launcher, and packages both with Inno Setup. The CEF runtime is large and is not checked into the game repository.
