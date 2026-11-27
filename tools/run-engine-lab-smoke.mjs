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
    await page.waitForFunction(() =>
      window.__DRIVELLA_LAB__?.vehicleReady === true
      && window.__DRIVELLA_LAB__?.vehicleWheelContacts === 4
      && window.__DRIVELLA_LAB__?.vehicleStableFrames >= 24,
      null, { timeout: 90000 }
    );
  } catch (error) {
    const diagnostic = await page.evaluate(() => window.__DRIVELLA_LAB__ || null);
    await mkdir("artifacts", { recursive: true });
    await page.screenshot({ path: "artifacts/engine-lab-vehicle-contact-timeout.png" }).catch(() => {});
    throw new Error("Countach did not settle on four independent wheel contacts. Diagnostic: " + JSON.stringify(diagnostic) + " · " + String(error));
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
  try {
    await page.waitForFunction(() =>
      window.__DRIVELLA_LAB__?.tunnelProbeStableFrames >= 30
      && Number.isFinite(window.__DRIVELLA_LAB__?.tunnelProbePeakY),
      null,
      { timeout: 60000 }
    );
  } catch (error) {
    const diagnostic = await page.evaluate(() => window.__DRIVELLA_LAB__ || null);
    await mkdir("artifacts", { recursive: true });
    await page.screenshot({ path: "artifacts/engine-lab-tunnel-physics-timeout.png" }).catch(() => {});
    throw new Error("Tunnel ceiling/road collision probe did not settle. Diagnostic: " + JSON.stringify(diagnostic) + " · " + String(error));
  }

  const sampleVehicle = () => page.evaluate(() => {
    const s=window.__DRIVELLA_LAB__;
    return {
      x:s.vehicleX,z:s.vehicleZ,yaw:s.vehicleYaw,unwrappedYaw:s.vehicleUnwrappedYaw,
      yawTurns:s.vehicleYawTurns,speedKmh:s.vehicleSpeedKmh,forwardSpeed:s.vehicleForwardSpeed,
      lateralSpeed:s.vehicleLateralSpeed,slipDegrees:s.vehicleSlipAngleDegrees,
      rearSlipDegrees:s.vehicleRearSlipAngleDegrees,yawRate:s.vehicleYawRate,
      steer:s.vehicleSteer,contacts:s.vehicleWheelContacts,roll:s.vehicleRoll,parked:s.vehicleParked
    };
  });
  const beforeDrive=await sampleVehicle();
  if(beforeDrive.speedKmh>1.0||beforeDrive.parked!==true)throw new Error("Vehicle must remain parked at its selected flat spawn point: "+JSON.stringify(beforeDrive));
  const handlingSamples={beforeDrive};
  await page.keyboard.down("w");
  await page.waitForTimeout(1850);
  handlingSamples.acceleration=await sampleVehicle();
  await page.keyboard.down("d");
  await page.waitForTimeout(1350);
  handlingSamples.corner=await sampleVehicle();
  await page.keyboard.down(" ");
  await page.waitForTimeout(900);
  handlingSamples.handbrake=await sampleVehicle();
  await page.keyboard.up("d");
  await page.keyboard.up(" ");
  await page.keyboard.down("a");
  await page.waitForTimeout(1100);
  handlingSamples.countersteer=await sampleVehicle();
  await page.keyboard.up("a");
  await page.keyboard.up("w");

  const spinStart=await sampleVehicle();
  await page.keyboard.down("w");
  await page.keyboard.down("d");
  await page.keyboard.down(" ");
  await page.waitForTimeout(650);
  await page.keyboard.up(" ");
  await page.waitForTimeout(3600);
  handlingSamples.spin=await sampleVehicle();
  await page.keyboard.up("d");
  await page.keyboard.up("w");
  await page.waitForTimeout(400);
  const finalVehicle=await sampleVehicle();
  console.log("VEHICLE HANDLING PHASES",JSON.stringify({
    ...handlingSamples,
    spinStart,
    spinYawDelta:finalVehicle.unwrappedYaw-spinStart.unwrappedYaw,
    finalVehicle
  }));

  const state = await page.evaluate(() => ({
    renderer: window.__DRIVELLA_LAB__.renderer,
    frames: window.__DRIVELLA_LAB__.frames,
    physicsMode: window.__DRIVELLA_LAB__.physicsMode,
    vehicleReady:window.__DRIVELLA_LAB__.vehicleReady,vehicleWheelbase:window.__DRIVELLA_LAB__.vehicleWheelbase,
    vehicleTrack:window.__DRIVELLA_LAB__.vehicleTrack,vehicleWheelRadius:window.__DRIVELLA_LAB__.vehicleWheelRadius,
    vehicleWheelContacts:window.__DRIVELLA_LAB__.vehicleWheelContacts,vehicleStableFrames:window.__DRIVELLA_LAB__.vehicleStableFrames,
    vehicleSpeedKmh:window.__DRIVELLA_LAB__.vehicleSpeedKmh,vehicleRoll:window.__DRIVELLA_LAB__.vehicleRoll,
    vehiclePitch:window.__DRIVELLA_LAB__.vehiclePitch,vehicleYaw:window.__DRIVELLA_LAB__.vehicleYaw,
    vehicleX:window.__DRIVELLA_LAB__.vehicleX,vehicleY:window.__DRIVELLA_LAB__.vehicleY,vehicleZ:window.__DRIVELLA_LAB__.vehicleZ,
    vehicleForwardSpeed:window.__DRIVELLA_LAB__.vehicleForwardSpeed,vehicleLateralSpeed:window.__DRIVELLA_LAB__.vehicleLateralSpeed,
    vehicleSlipAngleDegrees:window.__DRIVELLA_LAB__.vehicleSlipAngleDegrees,vehicleYawRate:window.__DRIVELLA_LAB__.vehicleYawRate,
    vehicleUnwrappedYaw:window.__DRIVELLA_LAB__.vehicleUnwrappedYaw,vehicleYawTurns:window.__DRIVELLA_LAB__.vehicleYawTurns,
    vehicleRearSlipAngleDegrees:window.__DRIVELLA_LAB__.vehicleRearSlipAngleDegrees,
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
    tunnelProbeY: window.__DRIVELLA_LAB__.tunnelProbeY,
    tunnelProbeYAtRoof: window.__DRIVELLA_LAB__.tunnelProbeYAtRoof,
    tunnelProbePeakY: window.__DRIVELLA_LAB__.tunnelProbePeakY,
    tunnelProbeStableFrames: window.__DRIVELLA_LAB__.tunnelProbeStableFrames,
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

  if(state.frames<30)throw new Error("Render loop did not advance enough frames.");
  if(!state.vehicleReady||state.vehicleWheelContacts!==4||state.vehicleStableFrames<24)throw new Error("Countach lost one or more independent wheel contacts: "+JSON.stringify(state));
  const travelled=Math.hypot(state.vehicleX-beforeDrive.x,state.vehicleZ-beforeDrive.z);
  const yawDelta=Math.abs(Math.atan2(Math.sin(state.vehicleYaw-beforeDrive.yaw),Math.cos(state.vehicleYaw-beforeDrive.yaw)));
  if(travelled<.55||state.vehicleSpeedKmh<1.5||yawDelta<.005)throw new Error("WASD failed to move and steer the Countach: "+JSON.stringify({beforeDrive,state,travelled,yawDelta}));
  if(!Number.isFinite(state.vehicleWheelbase)||Math.abs(state.vehicleWheelbase-3.282433711)>.002)throw new Error("Countach wheelbase mismatch: "+JSON.stringify(state));
  if(!Number.isFinite(state.vehicleTrack)||Math.abs(state.vehicleTrack-1.854847372)>.002)throw new Error("Countach track mismatch: "+JSON.stringify(state));
  if(!Number.isFinite(state.vehicleWheelRadius)||state.vehicleWheelRadius<.22||state.vehicleWheelRadius>.55)throw new Error("Tyre radius was not decoded from Countach geometry: "+JSON.stringify(state));
  if(Math.abs(state.vehicleRoll)>.18||Math.abs(state.vehiclePitch)>.32)throw new Error("Chassis roll/pitch exceeded controlled test limits: "+JSON.stringify(state));
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
  const tunnelPeakOffset = state.tunnelProbePeakY - state.tunnelProbeYAtRoof;
  if (
    state.tunnelProbeStableFrames < 30
    || !Number.isFinite(tunnelPeakOffset)
    || tunnelPeakOffset < -1.0
    || tunnelPeakOffset > 0.7
  ) {
    throw new Error("Upward physics probe did not strike and stop at the tunnel arch ceiling: "
      + JSON.stringify({ tunnelPeakOffset, state }));
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
  console.log("VEHICLE HANDLING ACCEPTANCE DATA",JSON.stringify(handlingSamples));
  console.log("RUNTIME NETWORK PASS: same-origin requests only.");
} finally {
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
}
