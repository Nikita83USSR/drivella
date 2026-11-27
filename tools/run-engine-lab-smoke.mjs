import { createServer } from "node:http";
import { mkdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";

const root = process.cwd();
const port = 4173;
const mime = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".wasm": "application/wasm"
};

const server = createServer(async (req, res) => {
  try {
    const pathname = decodeURIComponent(new URL(req.url, "http://127.0.0.1").pathname);
    let filePath = path.resolve(root, "." + pathname);
    if (!filePath.startsWith(root)) {
      res.writeHead(403).end("Forbidden");
      return;
    }
    if (pathname.endsWith("/")) filePath = path.join(filePath, "index.html");
    const fileStat = await stat(filePath);
    if (!fileStat.isFile()) throw new Error("Not a file");
    const body = await readFile(filePath);
    res.writeHead(200, {
      "Content-Type": mime[path.extname(filePath)] || "application/octet-stream",
      "Content-Length": body.length,
      "Cache-Control": "no-store"
    });
    res.end(body);
  } catch {
    res.writeHead(404).end("Not found");
  }
});

const browser = await chromium.launch({
  headless: true,
  args: [
    "--enable-webgl",
    "--ignore-gpu-blocklist",
    "--use-gl=angle",
    "--use-angle=swiftshader",
    "--enable-unsafe-swiftshader"
  ]
});

let externalRequests = [];
let pageErrors = [];
let browserConsoleErrors = [];
try {
  await new Promise((resolve) => server.listen(port, "127.0.0.1", resolve));
  const page = await browser.newPage({ viewport: { width: 1024, height: 640 } });
  page.on("request", (request) => {
    const requestUrl = new URL(request.url());
    if (requestUrl.origin !== "http://127.0.0.1:" + port) externalRequests.push(request.url());
  });
  page.on("pageerror", (error) => pageErrors.push(String(error)));
  page.on("console", (message) => {
    if (message.type() === "error") browserConsoleErrors.push(message.text());
  });

  await page.goto("http://127.0.0.1:" + port + "/engine-lab/", { waitUntil: "load" });
  try {
    await page.waitForFunction(() => window.__DRIVELLA_LAB__?.ready === true, null, { timeout: 120000 });
  } catch (error) {
    const diagnostic = await page.evaluate(() => window.__DRIVELLA_LAB__ || null);
    await mkdir("artifacts", { recursive: true });
    await page.screenshot({ path: "artifacts/engine-lab-startup-timeout.png" }).catch(() => {});
    throw new Error("3D scene did not reach ready state. Diagnostic: " + JSON.stringify(diagnostic) + " · pageErrors=" + JSON.stringify(pageErrors) + " · " + String(error));
  }
  try {
    await page.waitForFunction(() => window.__DRIVELLA_LAB__?.physicsReady === true, null, { timeout: 90000 });
  } catch (error) {
    const diagnostic = await page.evaluate(() => window.__DRIVELLA_LAB__ || null);
    await mkdir("artifacts", { recursive: true });
    await page.screenshot({ path: "artifacts/engine-lab-physics-init-timeout.png" }).catch(() => {});
    throw new Error("Havok did not initialize. Diagnostic: " + JSON.stringify(diagnostic) + " · pageErrors=" + JSON.stringify(pageErrors) + " · " + String(error));
  }
  try {
    await page.waitForFunction(() => window.__DRIVELLA_LAB__?.probeStableFrames >= 30, null, { timeout: 60000 });
  } catch (error) {
    const diagnostic = await page.evaluate(() => window.__DRIVELLA_LAB__ || null);
    await mkdir("artifacts", { recursive: true });
    await page.screenshot({ path: "artifacts/engine-lab-physics-timeout.png" }).catch(() => {});
    throw new Error("Terrain collision probe did not settle. Diagnostic: " + JSON.stringify(diagnostic) + " · " + String(error));
  }
  try {
    await page.waitForFunction(() => window.__DRIVELLA_LAB__?.roadProbeStableFrames >= 30, null, { timeout: 60000 });
  } catch (error) {
    const diagnostic = await page.evaluate(() => window.__DRIVELLA_LAB__ || null);
    await mkdir("artifacts", { recursive: true });
    await page.screenshot({ path: "artifacts/engine-lab-road-physics-timeout.png" }).catch(() => {});
    throw new Error("Road asphalt collision probe did not settle. Diagnostic: " + JSON.stringify(diagnostic) + " · " + String(error));
  }

  const state = await page.evaluate(() => ({
    renderer: window.__DRIVELLA_LAB__.renderer,
    frames: window.__DRIVELLA_LAB__.frames,
    physicsMode: window.__DRIVELLA_LAB__.physicsMode,
    probeY: window.__DRIVELLA_LAB__.probeY,
    probeStableFrames: window.__DRIVELLA_LAB__.probeStableFrames,
    probeX: window.__DRIVELLA_LAB__.probeX,
    probeZ: window.__DRIVELLA_LAB__.probeZ,
    terrainYAtProbe: window.__DRIVELLA_LAB__.terrainYAtProbe,
    spatial: window.__DRIVELLA_LAB__.spatial,
    biomes: window.__DRIVELLA_LAB__.biomes,
    biomeTypes: window.__DRIVELLA_LAB__.biomeTypes,
    roadChunks: window.__DRIVELLA_LAB__.roadChunks,
    roadLength: window.__DRIVELLA_LAB__.roadLength,
    roadSampleCount: window.__DRIVELLA_LAB__.roadSampleCount,
    roadFurnitureChunks: window.__DRIVELLA_LAB__.roadFurnitureChunks,
    roadGuardrailSegments: window.__DRIVELLA_LAB__.roadGuardrailSegments,
    roadDrainageSegments: window.__DRIVELLA_LAB__.roadDrainageSegments,
    roadTransitionSegments: window.__DRIVELLA_LAB__.roadTransitionSegments,
    waterChunks: window.__DRIVELLA_LAB__.waterChunks,
    shoreChunks: window.__DRIVELLA_LAB__.shoreChunks,
    riverSegments: window.__DRIVELLA_LAB__.riverSegments,
    lakeTriangles: window.__DRIVELLA_LAB__.lakeTriangles,
    riverCount: window.__DRIVELLA_LAB__.riverCount,
    lakeCount: window.__DRIVELLA_LAB__.lakeCount,
    bridgeCrossingCount: window.__DRIVELLA_LAB__.bridgeCrossingCount,
    bridgeCandidateCount: window.__DRIVELLA_LAB__.bridgeCandidateCount,
    bridgePiers: window.__DRIVELLA_LAB__.bridgePiers,
    bridgeGirderSegments: window.__DRIVELLA_LAB__.bridgeGirderSegments,
    unresolvedWaterCrossings: window.__DRIVELLA_LAB__.unresolvedWaterCrossings,
    tunnelCount: window.__DRIVELLA_LAB__.tunnelCount,
    tunnelLength: window.__DRIVELLA_LAB__.tunnelLength,
    tunnelChunks: window.__DRIVELLA_LAB__.tunnelChunks,
    tunnelPortals: window.__DRIVELLA_LAB__.tunnelPortals,
    tunnelRibs: window.__DRIVELLA_LAB__.tunnelRibs,
    tunnelLights: window.__DRIVELLA_LAB__.tunnelLights,
    tunnelMinCover: window.__DRIVELLA_LAB__.tunnelMinCover,
    tunnelMeshCount: window.__DRIVELLA_LAB__.tunnelMeshCount,
    tunnelBodyCount: window.__DRIVELLA_LAB__.tunnelBodyCount,
    bridgeCrossings: window.__DRIVELLA_LAB__.bridgeCrossings,
    roadYAtProbe: window.__DRIVELLA_LAB__.roadYAtProbe,
    roadDistanceAtProbe: window.__DRIVELLA_LAB__.roadDistanceAtProbe,
    roadProbeY: window.__DRIVELLA_LAB__.roadProbeY,
    roadProbeX: window.__DRIVELLA_LAB__.roadProbeX,
    roadProbeZ: window.__DRIVELLA_LAB__.roadProbeZ,
    roadProbeYAtRoad: window.__DRIVELLA_LAB__.roadProbeYAtRoad,
    roadProbeDistanceToRoad: window.__DRIVELLA_LAB__.roadProbeDistanceToRoad,
    roadProbeStableFrames: window.__DRIVELLA_LAB__.roadProbeStableFrames,
    roadProbeTargetGrade: window.__DRIVELLA_LAB__.roadProbeTargetGrade
  }));

  if (state.frames < 30) throw new Error("Render loop did not advance enough frames.");
  if (!state.physicsMode.startsWith("havok")) throw new Error("Havok Physics V2 was not initialized.");
  if (state.probeStableFrames < 30) throw new Error("Physics probe did not settle after collision.");
  const probeClearance = state.probeY - 1.5 - state.terrainYAtProbe;
  if (!Number.isFinite(probeClearance) || probeClearance < -0.8 || probeClearance > 8) {
    throw new Error("Physics probe is not resting against the visible terrain surface: " + JSON.stringify({ probeClearance, state }));
  }
  if (!state.biomes || !state.biomeTypes || state.biomeTypes.length < 2) {
    throw new Error("The browser scene did not populate multiple biome regions: " + JSON.stringify(state));
  }
  const propCount = Object.values(state.biomes).reduce((sum, count) => sum + count, 0);
  if (propCount < 8) throw new Error("Biome decoration did not create enough world props: " + JSON.stringify(state.biomes));
  if (!Number.isFinite(state.roadLength) || state.roadLength < 1200 || state.roadChunks < 8) {
    throw new Error("The spline road was not streamed into the world chunks: " + JSON.stringify(state));
  }
  if (
    state.roadFurnitureChunks < 1
    || state.roadTransitionSegments < 1
    || state.roadDrainageSegments < 1
    || state.roadGuardrailSegments < 1
  ) {
    throw new Error("Roadside cut/fill, drainage and exposed-edge safety geometry was not generated: " + JSON.stringify(state));
  }
  if (
    state.riverCount < 2
    || state.lakeCount < 1
    || state.waterChunks < 1
    || state.shoreChunks < 1
    || state.riverSegments < 1
    || state.bridgeCrossingCount < 1
    || !Array.isArray(state.bridgeCrossings)
  ) {
    throw new Error("Streamed water bodies, shorelines or road-water crossing classification are incomplete: " + JSON.stringify(state));
  }
  if (
    state.unresolvedWaterCrossings !== 0
    || state.bridgeCandidateCount !== state.bridgeCrossingCount
    || state.bridgePiers < 4
    || state.bridgeGirderSegments < 6
    || !state.bridgeCrossings.every((crossing) =>
      Number.isFinite(crossing.minClearance)
      && crossing.minClearance >= 3.95
      && crossing.structure === "bridge-candidate"
      && crossing.sampleCount > 0
    )
  ) {
    throw new Error("At least one road-water crossing lacks safe raised-deck clearance: " + JSON.stringify(state.bridgeCrossings));
  }
  if (
    state.tunnelCount < 1
    || state.tunnelLength < 48
    || state.tunnelChunks < 1
    || state.tunnelMeshCount < 1
    || state.tunnelBodyCount < 1
    || state.tunnelPortals < state.tunnelCount * 2
    || state.tunnelRibs < 1
    || state.tunnelLights < 1
    || !Number.isFinite(state.tunnelMinCover)
    || state.tunnelMinCover < 7.8
  ) {
    throw new Error("Mountain tunnel bores, portals, lining or Havok collision are incomplete: " + JSON.stringify(state));
  }
  if (state.roadProbeStableFrames < 30) {
    throw new Error("Dedicated road probe did not settle on the asphalt collision mesh: " + JSON.stringify(state));
  }
  const roadProbeClearance = state.roadProbeY - 1 - state.roadProbeYAtRoad;
  if (
    !Number.isFinite(roadProbeClearance)
    || !Number.isFinite(state.roadProbeDistanceToRoad)
    || roadProbeClearance < -0.35
    || roadProbeClearance > 0.35
    || state.roadProbeDistanceToRoad > 2.5
  ) {
    throw new Error("Dedicated physics probe is not in contact with the asphalt surface: " + JSON.stringify({ roadProbeClearance, state }));
  }
  if (!Number.isFinite(state.roadProbeTargetGrade) || state.roadProbeTargetGrade > 0.20) {
    throw new Error("Road contact test selected a route point above the target grade: " + JSON.stringify(state));
  }
  if (!state.spatial || Object.values(state.spatial.axisCoverage).some((covered) => !covered)) {
    throw new Error("Spatial chunk coverage is incomplete in one or more XYZ directions.");
  }
  if (externalRequests.length) throw new Error("Third-party runtime requests detected: " + externalRequests.join(", "));
  if (pageErrors.length) throw new Error("Browser page errors: " + pageErrors.join(" | "));
  const unexpectedConsoleErrors = browserConsoleErrors.filter((message) => {
    const expectedWebGpuFallback = state.renderer.startsWith("WebGL")
      && message.includes("A fatal error occurred during WebGPU creation/initialization");
    return !expectedWebGpuFallback;
  });
  if (unexpectedConsoleErrors.length) {
    throw new Error("Unexpected browser console errors: " + unexpectedConsoleErrors.join(" | "));
  }

  await mkdir("artifacts", { recursive: true });
  await page.screenshot({ path: "artifacts/engine-lab-spatial-preview.png" });
  console.log("ENGINE LAB PASS", JSON.stringify(state));
  console.log("RUNTIME NETWORK PASS: same-origin requests only.");
} finally {
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
}
