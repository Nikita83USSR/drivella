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
  page.on("pageerror", (error) => pageErrors.push(error?.stack ?? String(error)));
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

  // Verify the legacy graphics stack while fully enabled, then lower the
  // headless SwiftShader workload for the separate Havok driving test.
  const initialEffects = await page.evaluate(() => {
    const state = window.__DRIVELLA_LAB__;
    return {
      ready: state?.legacyEffectsReady === true,
      effects: state?.legacyEffects ?? null,
      frames: state?.frames ?? 0
    };
  });
  const requiredEffects = ["bloomSupported", "ssao", "shadows", "sun", "sunFogExcluded", "atmosphere", "godRays", "lensFlares", "underglow", "outlines"];
  const missingEffects = requiredEffects.filter((name) => initialEffects.effects?.[name] !== true);
  if (!initialEffects.ready || missingEffects.length || initialEffects.effects?.bloom !== false
      || initialEffects.effects?.reflections !== false || initialEffects.effects?.reflectionsSupported !== true) {
    throw new Error("Native visual-effects stack did not initialize with the expected SSR-on-demand profile: "
      + JSON.stringify({ initialEffects, missingEffects }));
  }

  // SSR remains user-triggered and is verified as supported/default-off above.
  // Do not force its ray-march pass on SwiftShader: this software backend can
  // stall for tens of seconds even though native GPU builds run it normally.
  const reflectionTogglePass = {
    enabled: false,
    disabled: initialEffects.effects?.reflections === false,
    skippedOnSoftwareRenderer: true,
    reason: "SSR is on-demand; headless SwiftShader is not a representative GPU target."
  };

  // Keep the default visual effects verified above, then turn off the three
  // most expensive optional passes only for the software-rendered physics run.
  await page.locator("#fxToggle").click();
  for (const effect of ["ssao", "shadows", "godRays"]) {
    await page.locator('[data-effect="' + effect + '"]').uncheck();
  }
  await page.locator("#fxToggle").click();

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
    throw new Error("Countach did not settle on four independent wheel contacts. Diagnostic: " + JSON.stringify(diagnostic) + " · pageErrors=" + JSON.stringify(pageErrors) + " · consoleErrors=" + JSON.stringify(browserConsoleErrors) + " · " + String(error));
  }

  // Verify the actual pop-up hinge and light output separately: L deploys the
  // two modules, while H energizes the two vehicle-mounted projector beams.
  await page.keyboard.press("l");
  await page.waitForFunction(() => {
    const effects = window.__DRIVELLA_LAB__?.legacyEffects;
    return effects?.headlights === true && effects?.headlightDeploy >= 0.9;
  }, null, { timeout: 15000 });
  const deployedHeadlights = await page.evaluate(() => window.__DRIVELLA_LAB__?.legacyEffects ?? null);
  if (!deployedHeadlights || deployedHeadlights.headlightSourceCount !== 2 || deployedHeadlights.headlightOpticPartCount !== 12 || deployedHeadlights.headlightLighting !== false) {
    throw new Error("Pop-up headlight deployment state is incorrect: " + JSON.stringify(deployedHeadlights));
  }
  await page.keyboard.press("h");
  await page.waitForFunction(() => {
    const effects = window.__DRIVELLA_LAB__?.legacyEffects;
    return effects?.headlightLighting === true && effects?.headlightBeamIntensity > 5;
  }, null, { timeout: 8000 });
  await page.waitForFunction(() => {
    const effects = window.__DRIVELLA_LAB__?.legacyEffects;
    return effects?.lensFlareTextureKind === "canvas-png"
      && effects?.lensFlareSpriteCount >= 5
      && effects?.lensFlareTexturesReady === true
      && effects?.frontTurnSignalCount === 2
      && effects?.rearTurnSignalCount === 2
      && effects?.fogLampCount === 2
      && effects?.glassMeshCount === 1
      && effects?.headlampGlowMeshCount === 4
      && effects?.headlampGlowActiveCount === 4
      && effects?.vehicleOutlineMeshCount >= 20
      && effects?.vehicleOutlineWidth >= 0.075
      && (effects?.tailLampEmissive?.[0] ?? 0) > 0.3;
  }, null, { timeout: 12000 });
  const illuminatedState = await page.evaluate(() => ({
    effects: window.__DRIVELLA_LAB__?.legacyEffects ?? null,
    roadMaxSimultaneousLights: window.__DRIVELLA_LAB__?.roadMaxSimultaneousLights ?? 0
  }));
  const illuminatedHeadlights = illuminatedState.effects;
  const invalidHeadlightBeams = (illuminatedHeadlights?.headlightBeams ?? []).filter((beam) =>
    beam.intensity < 10 || beam.positionDistance > 4.0 || beam.forwardAlignment < 0.82 || beam.directionY > -0.05
  );
  if (illuminatedHeadlights?.headlightSourceCount !== 2 || illuminatedHeadlights?.headlightOpticPartCount !== 12
      || illuminatedHeadlights.headlightBeamIntensity < 10 || illuminatedHeadlights.headlightBeams?.length !== 2
      || invalidHeadlightBeams.length || !illuminatedHeadlights.headlightRoadPlugin
      || !illuminatedHeadlights.headlightRoadPluginActive
      || illuminatedHeadlights.headlightRoadMeshCount < 1
      || illuminatedHeadlights.headlightRoadObservableBindCount < 1
      || illuminatedHeadlights.headlightRoadUniformBindCount < 1
      || illuminatedHeadlights.headlightRoadIntensity < 1.8
      || illuminatedHeadlights.headlightRoadDirectionY > -0.05
      || illuminatedHeadlights.lensFlareTextureKind !== "canvas-png"
      || illuminatedHeadlights.lensFlareSpriteCount < 5
      || !illuminatedHeadlights.lensFlareTexturesReady
      || illuminatedHeadlights.frontTurnSignalCount !== 2
      || illuminatedHeadlights.rearTurnSignalCount !== 2
      || illuminatedHeadlights.fogLampCount !== 2
      || illuminatedHeadlights.glassMeshCount !== 1
      || illuminatedHeadlights.headlampGlowMeshCount !== 4
      || illuminatedHeadlights.headlampGlowActiveCount !== 4
      || illuminatedHeadlights.vehicleOutlineMeshCount < 20
      || illuminatedHeadlights.vehicleOutlineWidth < 0.075
      || (illuminatedHeadlights.tailLampEmissive?.[0] ?? 0) < 0.3
      || illuminatedState.roadMaxSimultaneousLights !== 10) {
    throw new Error("Both pop-up projectors and the dedicated road shader must be active, correctly aimed and bound: "
      + JSON.stringify({ illuminatedHeadlights, invalidHeadlightBeams, roadMaxSimultaneousLights: illuminatedState.roadMaxSimultaneousLights, pageErrors, browserConsoleErrors }));
  }
  await mkdir("artifacts", { recursive: true });
  await page.screenshot({ path: "artifacts/engine-lab-popup-headlights-preview.png" });
  await page.keyboard.press("h");
  await page.waitForFunction(() => window.__DRIVELLA_LAB__?.legacyEffects?.headlightLighting === false, null, { timeout: 5000 });
  await page.keyboard.press("l");
  await page.waitForFunction(() => {
    const effects = window.__DRIVELLA_LAB__?.legacyEffects;
    return effects?.headlights === false && effects?.headlightDeploy <= 0.1;
  }, null, { timeout: 15000 });
  console.log("POP-UP HEADLIGHTS PASS", JSON.stringify({ deployedHeadlights, illuminatedHeadlights }));

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
      bodyMass:s.vehicleBodyMass,gravityFactor:s.vehicleGravityFactor,physicsStep:s.vehiclePhysicsStep,physicsSubStep:s.vehiclePhysicsSubStep,
      engineTimeStepMs:s.vehicleEngineTimeStepMs,deterministicLockstep:s.vehicleDeterministicLockstep,lockstepMaxSteps:s.vehicleLockstepMaxSteps,
      yawTurns:s.vehicleYawTurns,speedKmh:s.vehicleSpeedKmh,forwardSpeed:s.vehicleForwardSpeed,
      lateralSpeed:s.vehicleLateralSpeed,slipDegrees:s.vehicleSlipAngleDegrees,
      rearSlipDegrees:s.vehicleRearSlipAngleDegrees,yawRate:s.vehicleYawRate,
      steer:s.vehicleSteer,contacts:s.vehicleWheelContacts,roll:s.vehicleRoll,parked:s.vehicleParked,
      driveRequested:s.vehicleDriveRequested,totalSpringLoad:s.vehicleTotalSpringLoad,rearLongitudinalForce:s.vehicleRearLongitudinalForce,totalLongitudinalForce:s.vehicleTotalLongitudinalForce,
      velocityX:s.vehicleVelocityX,velocityY:s.vehicleVelocityY,velocityZ:s.vehicleVelocityZ,
      maxCompression:s.vehicleMaxSuspensionCompression,averageCompression:s.vehicleAverageSuspensionCompression,
      wheels:s.vehicleWheelDiagnostics?.map(w=>({key:w.key,compression:w.compression,springForce:w.springForce,damperForce:w.damperForce,bumpForce:w.bumpForce,rawSpringForce:w.rawSpringForce,anchorY:w.anchorY,suspensionLength:w.suspensionLength,pointVelocityY:w.pointVelocityY,contactY:w.contactY})) ,
      bottomClearance:s.vehicleRoadBodyBottomClearance,appliedForceX:s.vehicleAppliedForceX,appliedForceZ:s.vehicleAppliedForceZ,
      forwardX:s.vehicleForwardX,forwardZ:s.vehicleForwardZ,roadY:s.vehicleRoadSurfaceY,roadDistance:s.vehicleRoadDistance,
      spawnX:s.vehicleSpawnX,spawnZ:s.vehicleSpawnZ,spawnGrade:s.vehicleSpawnGrade,spawnToProbe:s.vehicleSpawnDistanceFromRoadProbe,
      bodyBottomClearance:s.vehicleRoadBodyBottomClearance,wheelDiagnostics:s.vehicleWheelDiagnostics
    };
  });
  const beforeDrive=await sampleVehicle();
  if(beforeDrive.speedKmh>1.0||beforeDrive.parked!==true||beforeDrive.contacts!==4)throw new Error("Vehicle must remain parked with four wheel ray contacts before driver input: "+JSON.stringify(beforeDrive));
  if(Math.abs(beforeDrive.bodyMass-1250)>.5||Math.abs(beforeDrive.gravityFactor-1)>.001)throw new Error("Havok vehicle mass/gravity mismatch: "+JSON.stringify(beforeDrive));
  if(Math.abs(beforeDrive.physicsStep-1/60)>.00001||Math.abs(beforeDrive.physicsSubStep)>.001||Math.abs(beforeDrive.engineTimeStepMs-1000/60)>.02||beforeDrive.deterministicLockstep!==true||beforeDrive.lockstepMaxSteps!==4)throw new Error("Babylon Engine and Havok are not using bounded deterministic 60 Hz lockstep: "+JSON.stringify(beforeDrive));
  const handlingSamples={beforeDrive};
  await page.keyboard.down("w");
  await page.waitForTimeout(180);
  handlingSamples.accelerationT180=await sampleVehicle();
  if(handlingSamples.accelerationT180.contacts!==4)throw new Error("Vehicle lost a real Havok wheel ray contact immediately after PARKED-to-DYNAMIC: "+JSON.stringify(handlingSamples.accelerationT180));
  await page.waitForTimeout(320);
  handlingSamples.accelerationT500=await sampleVehicle();
  await page.waitForTimeout(500);
  handlingSamples.accelerationT1000=await sampleVehicle();
  await page.waitForTimeout(500);
  handlingSamples.acceleration=await sampleVehicle();
  await page.keyboard.up("w");
  await page.keyboard.down("s");
  await page.waitForTimeout(220);
  await page.keyboard.up("s");
  handlingSamples.preCorner=await sampleVehicle();
  await page.keyboard.down("d");
  await page.waitForTimeout(500);
  handlingSamples.corner=await sampleVehicle();
  await page.keyboard.down(" ");
  await page.waitForTimeout(120);
  handlingSamples.handbrake=await sampleVehicle();
  await page.keyboard.up("d");
  await page.keyboard.up(" ");
  await page.keyboard.down("a");
  await page.waitForTimeout(450);
  handlingSamples.countersteer=await sampleVehicle();
  await page.keyboard.up("a");
  await page.keyboard.up("w");

  await page.keyboard.down("w");
  await page.waitForTimeout(250);
  const spinStart=await sampleVehicle();
  await page.keyboard.down("w");
  await page.keyboard.down("d");
  await page.keyboard.down(" ");
  await page.waitForTimeout(180);
  await page.keyboard.up(" ");
  await page.waitForTimeout(700);
  handlingSamples.spin=await sampleVehicle();
  await page.keyboard.up(" ");
  await page.keyboard.up("d");
  await page.keyboard.up("w");
  await page.keyboard.down("s");
  await page.waitForTimeout(800);
  await page.keyboard.up("s");
  await page.waitForTimeout(250);
  const finalVehicle=await sampleVehicle();
  console.log("VEHICLE HANDLING PHASES",JSON.stringify({
    ...handlingSamples,
    spinStart,
    spinYawDelta:finalVehicle.unwrappedYaw-spinStart.unwrappedYaw,
    finalVehicle
  }));

  const state = await page.evaluate(() => ({
    cameraKeyboardEnabled: window.__DRIVELLA_LAB__.cameraKeyboardEnabled,
    neonGlowReady: window.__DRIVELLA_LAB__.neonGlowReady,
    terrainGridChunks: window.__DRIVELLA_LAB__.terrainGridChunks,
    terrainGridMeshCount: window.__DRIVELLA_LAB__.terrainGridMeshCount,
    renderer: window.__DRIVELLA_LAB__.renderer,
    frames: window.__DRIVELLA_LAB__.frames,
    legacyEffectsReady: window.__DRIVELLA_LAB__.legacyEffectsReady,
    legacyEffects: window.__DRIVELLA_LAB__.legacyEffects,
    roadCurbChunks: window.__DRIVELLA_LAB__.roadCurbChunks,
    physicsMode: window.__DRIVELLA_LAB__.physicsMode,
    vehicleReady:window.__DRIVELLA_LAB__.vehicleReady,vehicleWheelbase:window.__DRIVELLA_LAB__.vehicleWheelbase,
    vehicleTrack:window.__DRIVELLA_LAB__.vehicleTrack,vehicleWheelRadius:window.__DRIVELLA_LAB__.vehicleWheelRadius,
    vehicleWheelContacts:window.__DRIVELLA_LAB__.vehicleWheelContacts,vehicleStableFrames:window.__DRIVELLA_LAB__.vehicleStableFrames,
    vehicleSpeedKmh:window.__DRIVELLA_LAB__.vehicleSpeedKmh,vehicleRoll:window.__DRIVELLA_LAB__.vehicleRoll,
    vehiclePitch:window.__DRIVELLA_LAB__.vehiclePitch,vehicleYaw:window.__DRIVELLA_LAB__.vehicleYaw,
    vehicleX:window.__DRIVELLA_LAB__.vehicleX,vehicleY:window.__DRIVELLA_LAB__.vehicleY,vehicleZ:window.__DRIVELLA_LAB__.vehicleZ,
    vehicleBodyMass:window.__DRIVELLA_LAB__.vehicleBodyMass,vehicleGravityFactor:window.__DRIVELLA_LAB__.vehicleGravityFactor,
    vehiclePhysicsStep:window.__DRIVELLA_LAB__.vehiclePhysicsStep,vehiclePhysicsSubStep:window.__DRIVELLA_LAB__.vehiclePhysicsSubStep,
    vehicleEngineTimeStepMs:window.__DRIVELLA_LAB__.vehicleEngineTimeStepMs,vehicleDeterministicLockstep:window.__DRIVELLA_LAB__.vehicleDeterministicLockstep,vehicleLockstepMaxSteps:window.__DRIVELLA_LAB__.vehicleLockstepMaxSteps,
    vehicleDriveRequested:window.__DRIVELLA_LAB__.vehicleDriveRequested,vehicleTotalSpringLoad:window.__DRIVELLA_LAB__.vehicleTotalSpringLoad,
    vehicleRoadSurfaceY:window.__DRIVELLA_LAB__.vehicleRoadSurfaceY,vehicleRoadDistance:window.__DRIVELLA_LAB__.vehicleRoadDistance,vehicleRoadBodyBottomClearance:window.__DRIVELLA_LAB__.vehicleRoadBodyBottomClearance,
    vehicleVelocityX:window.__DRIVELLA_LAB__.vehicleVelocityX,vehicleVelocityY:window.__DRIVELLA_LAB__.vehicleVelocityY,vehicleVelocityZ:window.__DRIVELLA_LAB__.vehicleVelocityZ,
    vehicleMaxSuspensionCompression:window.__DRIVELLA_LAB__.vehicleMaxSuspensionCompression,vehicleAverageSuspensionCompression:window.__DRIVELLA_LAB__.vehicleAverageSuspensionCompression,
    vehicleAppliedForceX:window.__DRIVELLA_LAB__.vehicleAppliedForceX,vehicleAppliedForceZ:window.__DRIVELLA_LAB__.vehicleAppliedForceZ,
    vehicleRearLongitudinalForce:window.__DRIVELLA_LAB__.vehicleRearLongitudinalForce,vehicleTotalLongitudinalForce:window.__DRIVELLA_LAB__.vehicleTotalLongitudinalForce,
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

  if (state.cameraKeyboardEnabled !== false) {
    throw new Error("Camera keyboard input is still attached; vehicle steering keys must not orbit the camera: " + JSON.stringify(state));
  }
  if (state.neonGlowReady !== true || state.terrainGridChunks < 1 || state.terrainGridMeshCount < 1) {
    throw new Error("Neon scene presentation did not initialize a glow layer and terrain grid: " + JSON.stringify(state));
  }
  if(state.frames<30)throw new Error("Render loop did not advance enough frames.");
  if (!state.legacyEffectsReady || state.roadCurbChunks < 1) {
    throw new Error("Legacy FX or neon kerbs did not initialize in the scene: " + JSON.stringify({
      legacyEffectsReady: state.legacyEffectsReady,
      legacyEffects: state.legacyEffects,
      roadCurbChunks: state.roadCurbChunks
    }));
  }
  if(!state.vehicleReady||state.vehicleWheelContacts!==4||state.vehicleStableFrames<24)throw new Error("Countach lost one or more independent wheel contacts: "+JSON.stringify(state));
  if(!Number.isFinite(state.vehicleRoadDistance)||state.vehicleRoadDistance>7)throw new Error("Handling smoke left the asphalt corridor: "+JSON.stringify(state));
  const travelled=Math.hypot(state.vehicleX-beforeDrive.x,state.vehicleZ-beforeDrive.z);
  const yawDelta=Math.abs(state.vehicleUnwrappedYaw-beforeDrive.unwrappedYaw);
  const yawSamples=[beforeDrive,...Object.values(handlingSamples),finalVehicle]
    .map(sample=>sample?.unwrappedYaw).filter(Number.isFinite);
  const yawExcursion=yawSamples.length?Math.max(...yawSamples)-Math.min(...yawSamples):0;
  const maxSteerInput=Math.max(0,...Object.values(handlingSamples).map(sample=>Math.abs(sample?.steer??0)));
  const accelerationSpeedKmh=Math.max(
    handlingSamples.accelerationT180?.speedKmh??0,
    handlingSamples.accelerationT500?.speedKmh??0,
    handlingSamples.accelerationT1000?.speedKmh??0,
    handlingSamples.acceleration?.speedKmh??0
  );
  // Countersteering can return the final heading close to its starting value.
  // Check the full heading excursion and measured steering input instead of
  // comparing only the net angle after opposite steering phases.
  if(travelled<.25||accelerationSpeedKmh<1.5||yawExcursion<.001||maxSteerInput<.25)
    throw new Error("WASD failed to move and steer the Countach: "+JSON.stringify({beforeDrive,state,travelled,yawDelta,yawExcursion,maxSteerInput,accelerationSpeedKmh,handlingSamples}));
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
    || state.tunnelPortals < 2
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

  await page.locator("#fxToggle").click();
  for (const effect of ["ssao", "shadows", "godRays"]) {
    await page.locator('[data-effect="' + effect + '"]').check();
  }
  await page.locator("#fxToggle").click();
  await page.waitForTimeout(300);
  const restoredEffects = await page.evaluate(() => window.__DRIVELLA_LAB__?.legacyEffects ?? null);
  if (requiredEffects.some((name) => restoredEffects?.[name] !== true)
      || restoredEffects?.bloom !== false
      || restoredEffects?.reflections !== false
      || restoredEffects?.reflectionsSupported !== true) {
    throw new Error("Native graphics effects did not restore their expected profile after the physics smoke test: "
      + JSON.stringify(restoredEffects));
  }

  await mkdir("artifacts", { recursive: true });
  await page.screenshot({ path: "artifacts/engine-lab-spatial-preview.png" });
  console.log("NATIVE GRAPHICS EFFECTS PASS", JSON.stringify({ initialEffects, reflectionTogglePass, restoredEffects }));
  console.log("ENGINE LAB PASS", JSON.stringify(state));
  console.log("VEHICLE HANDLING ACCEPTANCE DATA",JSON.stringify(handlingSamples));
  console.log("RUNTIME NETWORK PASS: same-origin requests only.");
} finally {
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
}
