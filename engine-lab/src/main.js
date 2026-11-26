import {
  ArcRotateCamera,
  Color3,
  Color4,
  DirectionalLight,
  Engine,
  HavokPlugin,
  HemisphericLight,
  Mesh,
  MeshBuilder,
  PhysicsAggregate,
  PhysicsShapeType,
  Scene,
  StandardMaterial,
  Vector3,
  VertexData,
  WebGPUEngine
} from "@babylonjs/core";
import HavokPhysics from "@babylonjs/havok";
import { SpatialChunkManager } from "./SpatialChunkManager.mjs";
import { terrainChunkLayer, terrainHeight } from "./TerrainField.mjs";

const canvas = document.getElementById("renderCanvas");
const statusText = document.getElementById("engineStatus");
const statusDot = document.getElementById("statusDot");
const physicsMeta = document.getElementById("physicsMeta");
const renderMeta = document.getElementById("renderMeta");
const fpsMeta = document.getElementById("fpsMeta");
const worldMeta = document.getElementById("worldMeta");
const dropButton = document.getElementById("dropButton");
const resetButton = document.getElementById("resetButton");

const labState = {
  ready: false,
  renderer: "initializing",
  physicsReady: false,
  physicsMode: "initializing",
  frames: 0,
  probeY: null,
  probeStableFrames: 0,
  probeX: null,
  probeZ: null,
  terrainYAtProbe: null,
  error: null,
  spatial: null
};
window.__DRIVELLA_LAB__ = labState;

function setStatus(message, state = "warn") {
  statusText.textContent = message;
  statusDot.className = "status-dot " + state;
}

function terrainColorAt(height, slopeAmount) {
  const stops = [
    [-180, [0.035, 0.07, 0.18]],
    [-70, [0.055, 0.16, 0.31]],
    [-8, [0.045, 0.27, 0.29]],
    [38, [0.16, 0.14, 0.34]],
    [100, [0.24, 0.31, 0.52]],
    [180, [0.52, 0.68, 0.78]]
  ];
  let lower = stops[0];
  let upper = stops[stops.length - 1];
  for (let index = 0; index < stops.length - 1; index += 1) {
    if (height >= stops[index][0] && height <= stops[index + 1][0]) {
      lower = stops[index];
      upper = stops[index + 1];
      break;
    }
  }
  const range = upper[0] - lower[0] || 1;
  const blend = Math.max(0, Math.min(1, (height - lower[0]) / range));
  const base = [
    lower[1][0] + (upper[1][0] - lower[1][0]) * blend,
    lower[1][1] + (upper[1][1] - lower[1][1]) * blend,
    lower[1][2] + (upper[1][2] - lower[1][2]) * blend
  ];
  const ridgeMix = Math.max(0, Math.min(0.68, slopeAmount * 0.82));
  const ridgeColor = [0.27, 0.49, 0.65];
  return [
    base[0] + (ridgeColor[0] - base[0]) * ridgeMix,
    base[1] + (ridgeColor[1] - base[1]) * ridgeMix,
    base[2] + (ridgeColor[2] - base[2]) * ridgeMix
  ];
}

function createTerrainChunk(scene, chunkX, chunkY, chunkZ, chunkSize, material) {
  const segments = 32;
  const half = chunkSize * 0.5;
  const step = chunkSize / segments;
  const positions = [];
  const indices = [];
  const normals = [];
  const colors = [];
  const uvs = [];

  for (let iz = 0; iz <= segments; iz += 1) {
    for (let ix = 0; ix <= segments; ix += 1) {
      const localX = -half + ix * step;
      const localZ = -half + iz * step;
      const worldX = chunkX * chunkSize + localX;
      const worldZ = chunkZ * chunkSize + localZ;
      const worldHeight = terrainHeight(worldX, worldZ);
      positions.push(localX, worldHeight - chunkY * chunkSize, localZ);
      uvs.push(ix / segments, iz / segments);
    }
  }

  for (let iz = 0; iz < segments; iz += 1) {
    for (let ix = 0; ix < segments; ix += 1) {
      const a = iz * (segments + 1) + ix;
      const b = a + 1;
      const c = a + segments + 1;
      const d = c + 1;
      indices.push(a, c, b, b, c, d);
    }
  }

  for (let iz = 0; iz <= segments; iz += 1) {
    for (let ix = 0; ix <= segments; ix += 1) {
      const worldX = chunkX * chunkSize - half + ix * step;
      const worldZ = chunkZ * chunkSize - half + iz * step;
      const worldHeight = terrainHeight(worldX, worldZ);
      const slopeX = (terrainHeight(worldX + 1, worldZ) - terrainHeight(worldX - 1, worldZ)) * 0.5;
      const slopeZ = (terrainHeight(worldX, worldZ + 1) - terrainHeight(worldX, worldZ - 1)) * 0.5;
      const length = Math.sqrt(slopeX * slopeX + 1 + slopeZ * slopeZ);
      const normalX = -slopeX / length;
      const normalY = 1 / length;
      const normalZ = -slopeZ / length;
      normals.push(normalX, normalY, normalZ);
      const rgb = terrainColorAt(worldHeight, 1 - normalY);
      colors.push(rgb[0], rgb[1], rgb[2], 1);
    }
  }

  const vertexData = new VertexData();
  vertexData.positions = positions;
  vertexData.indices = indices;
  vertexData.normals = normals;
  vertexData.colors = colors;
  vertexData.uvs = uvs;

  const terrain = new Mesh(`terrain-chunk-${chunkX}-${chunkY}-${chunkZ}`, scene);
  vertexData.applyToMesh(terrain, true);
  terrain.position.set(chunkX * chunkSize, chunkY * chunkSize, chunkZ * chunkSize);
  terrain.isPickable = false;
  terrain.material = material;
  terrain.metadata = { spatialChunk: true, chunkX, chunkY, chunkZ };
  return terrain;
}

function createAxisBeacon(scene, name, position, color) {
  const marker = MeshBuilder.CreateSphere(name, { diameter: 7, segments: 16 }, scene);
  marker.position.copyFrom(position);
  const material = new StandardMaterial(name + "-material", scene);
  material.emissiveColor = color;
  material.diffuseColor = color.scale(0.45);
  material.specularColor = Color3.Black();
  marker.material = material;
  return marker;
}

function createSpatialReference(scene, worldRadius) {
  const axisLength = worldRadius * 0.92;
  createAxisBeacon(scene, "axis-positive-x", new Vector3(axisLength, 0, 0), new Color3(1, 0.2, 0.32));
  createAxisBeacon(scene, "axis-negative-x", new Vector3(-axisLength, 0, 0), new Color3(0.45, 0.08, 0.18));
  createAxisBeacon(scene, "axis-positive-y", new Vector3(0, axisLength, 0), new Color3(0.18, 1, 0.66));
  createAxisBeacon(scene, "axis-negative-y", new Vector3(0, -axisLength, 0), new Color3(0.08, 0.42, 0.28));
  createAxisBeacon(scene, "axis-positive-z", new Vector3(0, 0, axisLength), new Color3(0.25, 0.64, 1));
  createAxisBeacon(scene, "axis-negative-z", new Vector3(0, 0, -axisLength), new Color3(0.12, 0.28, 0.62));

  const bridgeMaterial = new StandardMaterial("elevated-platform-material", scene);
  bridgeMaterial.diffuseColor = new Color3(0.12, 0.23, 0.3);
  bridgeMaterial.emissiveColor = new Color3(0.015, 0.04, 0.06);
  const bridge = MeshBuilder.CreateBox("elevated-3d-platform", {
    width: 72,
    height: 2,
    depth: 18
  }, scene);
  bridge.position.set(0, 62, 0);
  bridge.material = bridgeMaterial;

  for (const x of [-30, -10, 10, 30]) {
    const support = MeshBuilder.CreateBox("elevated-platform-support", {
      width: 1.8,
      height: 62,
      depth: 1.8
    }, scene);
    support.position.set(x, 30, 0);
    support.material = bridgeMaterial;
  }
}

function createEnvironment(scene) {
  const worldRadius = 420;
  const skyLight = new HemisphericLight("sky-fill", new Vector3(0, 1, 0), scene);
  skyLight.intensity = 1.18;
  skyLight.groundColor = new Color3(0.035, 0.055, 0.1);

  const sun = new DirectionalLight("sun", new Vector3(-0.45, -1, 0.3), scene);
  sun.position = new Vector3(70, 130, -40);
  sun.intensity = 2.1;

  const camera = new ArcRotateCamera(
    "world-orbit-camera",
    -Math.PI * 0.72,
    Math.PI * 0.34,
    worldRadius * 0.88,
    new Vector3(0, 5, 0),
    scene
  );
  camera.attachControl(canvas, true);
  camera.lowerRadiusLimit = 28;
  camera.upperRadiusLimit = worldRadius * 2.2;
  camera.lowerBetaLimit = 0.015;
  camera.upperBetaLimit = Math.PI - 0.015;
  camera.wheelPrecision = 34;
  camera.panningSensibility = 75;
  camera.inertia = 0.78;
  scene.activeCamera = camera;

  const terrainMaterial = new StandardMaterial("terrain-material", scene);
  terrainMaterial.diffuseColor = Color3.White();
  terrainMaterial.specularColor = new Color3(0.28, 0.38, 0.48);
  terrainMaterial.specularPower = 24;
  terrainMaterial.emissiveColor = new Color3(0.085, 0.13, 0.18);
  terrainMaterial.backFaceCulling = false;
  terrainMaterial.twoSidedLighting = true;
  terrainMaterial.useVertexColors = true;

  const terrainMeshes = new Map();
  const terrainBodies = new Map();
  const chunkManager = new SpatialChunkManager({
    chunkSize: 128,
    radius: worldRadius,
    maxActiveChunks: 512,
    onCreate: (chunk) => {
      const payload = { terrainMesh: null };
      if (chunk.y === terrainChunkLayer(chunk.x, chunk.z, 128)) {
        const mesh = createTerrainChunk(scene, chunk.x, chunk.y, chunk.z, 128, terrainMaterial);
        payload.terrainMesh = mesh;
        terrainMeshes.set(chunk.key, mesh);
        if (scene.getPhysicsEngine()) {
          const body = addPhysicalProbe(scene, mesh, 0, PhysicsShapeType.MESH, { friction: 0.96, restitution: 0.02 });
          terrainBodies.set(chunk.key, body);
        }
      }
      return payload;
    },
    onDispose: (payload, chunk) => {
      const body = terrainBodies.get(chunk.key);
      if (body) {
        body.dispose();
        terrainBodies.delete(chunk.key);
      }
      if (payload?.terrainMesh) {
        payload.terrainMesh.dispose();
        terrainMeshes.delete(chunk.key);
      }
    }
  });
  chunkManager.update({ x: 0, y: 0, z: 0 });
  createSpatialReference(scene, worldRadius);

  scene.clearColor = new Color4(0.018, 0.027, 0.052, 1);
  scene.fogMode = Scene.FOGMODE_EXP2;
  scene.fogDensity = 0.000035;
  scene.fogColor = new Color3(0.018, 0.027, 0.052);

  return { camera, chunkManager, terrainMeshes, terrainBodies };
}

function addPhysicalProbe(scene, mesh, mass, shape, options = {}) {
  return new PhysicsAggregate(mesh, shape, {
    mass,
    friction: options.friction ?? 0.82,
    restitution: options.restitution ?? 0.12
  }, scene);
}

let engine;
let scene;
let camera;
let chunkManager;
let terrainMeshes;
let terrainBodies;
let havokAttemptRunning = false;
let havokInstance = null;
let probeMesh = null;
let frameCounter = 0;
let lastProbeY = null;
let probeStableFrames = 0;
const dynamicMeshes = [];

function spawnDynamicBox(x, y, z) {
  if (!labState.physicsReady) return null;
  const box = MeshBuilder.CreateBox("runtime-test-crate", { size: 5 }, scene);
  box.position.set(x, y, z);
  const mat = new StandardMaterial("runtime-test-crate-material", scene);
  mat.diffuseColor = new Color3(0.12, 0.56, 0.72);
  mat.metallic = 0.28;
  mat.roughness = 0.42;
  box.material = mat;
  const body = addPhysicalProbe(scene, box, 24, PhysicsShapeType.BOX, { restitution: 0.18 });
  dynamicMeshes.push({ mesh: box, body });
  return box;
}

function enableHavokPhysics() {
  if (labState.physicsReady || !havokInstance) return;

  try {
    scene.enablePhysics(new Vector3(0, -9.81, 0), new HavokPlugin(true, havokInstance));
    for (const [key, mesh] of terrainMeshes) {
      if (!terrainBodies.has(key)) {
        const body = addPhysicalProbe(scene, mesh, 0, PhysicsShapeType.MESH, { friction: 0.96, restitution: 0.02 });
        terrainBodies.set(key, body);
      }
    }

    probeMesh = MeshBuilder.CreateSphere("falling-physics-probe", { diameter: 3, segments: 24 }, scene);
    probeMesh.position.set(0, 24, 0);
    const probeMaterial = new StandardMaterial("probe-material", scene);
    probeMaterial.diffuseColor = new Color3(0.96, 0.31, 0.12);
    probeMaterial.emissiveColor = new Color3(0.12, 0.025, 0.008);
    probeMaterial.metallic = 0.2;
    probeMaterial.roughness = 0.38;
    probeMesh.material = probeMaterial;
    addPhysicalProbe(scene, probeMesh, 2.5, PhysicsShapeType.SPHERE, { friction: 0.7, restitution: 0.16 });

    for (let i = 0; i < 5; i += 1) {
      spawnDynamicBox(16 + (i % 2) * 6, 8 + i * 5.5, 5);
    }

    labState.physicsReady = true;
    labState.physicsMode = "havok-wasm";
    physicsMeta.textContent = "Physics: Havok Physics V2 · WASM from this repository";
    dropButton.disabled = false;
    setStatus("3D engine and local physics ready", "ready");
  } catch (error) {
    labState.error = String(error);
    labState.physicsMode = "fallback";
    physicsMeta.textContent = "Physics: reduced mode · " + String(error.message || error);
    setStatus("3D scene active · physics needs retry", "warn");
    window.setTimeout(tryInitializeHavok, 12000);
  }
}

async function tryInitializeHavok() {
  if (havokAttemptRunning || labState.physicsReady) return;
  havokAttemptRunning = true;
  physicsMeta.textContent = "Physics: requesting repository-local WASM";
  try {
    const wasmUrl = new URL("./HavokPhysics.wasm", import.meta.url).href;
    havokInstance = await HavokPhysics({ locateFile: () => wasmUrl });
    enableHavokPhysics();
  } catch (error) {
    labState.error = String(error);
    labState.physicsMode = "fallback";
    physicsMeta.textContent = "Physics not available yet · scene continues without it";
    setStatus("3D scene active · retrying local physics", "warn");
    window.setTimeout(tryInitializeHavok, 15000);
  } finally {
    havokAttemptRunning = false;
  }
}

async function createRenderer() {
  try {
    if ("gpu" in navigator) {
      const webgpu = new WebGPUEngine(canvas, {
        antialias: true,
        adaptToDeviceRatio: true,
        powerPreference: "high-performance"
      });
      await webgpu.initAsync();
      return { engine: webgpu, label: "WebGPU" };
    }
  } catch (error) {
    console.info("WebGPU unavailable; switching to WebGL.", error);
  }

  const webgl = new Engine(canvas, true, {
    adaptToDeviceRatio: true,
    powerPreference: "high-performance",
    preserveDrawingBuffer: false,
    stencil: true
  });
  return { engine: webgl, label: "WebGL " + (webgl.webGLVersion || "fallback") };
}

async function boot() {
  try {
    setStatus("Starting local 3D renderer", "warn");
    const rendererResult = await createRenderer();
    engine = rendererResult.engine;
    labState.renderer = rendererResult.label;
    renderMeta.textContent = "Renderer: " + rendererResult.label;

    scene = new Scene(engine);
    const environment = createEnvironment(scene);
    camera = environment.camera;
    chunkManager = environment.chunkManager;
    terrainMeshes = environment.terrainMeshes;
    terrainBodies = environment.terrainBodies;

    scene.onAfterRenderObservable.add(() => {
      frameCounter += 1;
      labState.frames = frameCounter;
      if (probeMesh) {
        const currentY = probeMesh.position.y;
        labState.probeY = Number(currentY.toFixed(3));
        labState.probeX = Number(probeMesh.position.x.toFixed(3));
        labState.probeZ = Number(probeMesh.position.z.toFixed(3));
        labState.terrainYAtProbe = Number(terrainHeight(probeMesh.position.x, probeMesh.position.z).toFixed(3));
        if (lastProbeY !== null && Math.abs(currentY - lastProbeY) < 0.05) {
          probeStableFrames += 1;
        } else {
          probeStableFrames = 0;
        }
        lastProbeY = currentY;
        labState.probeStableFrames = probeStableFrames;
      }
      if (frameCounter % 18 === 0) fpsMeta.textContent = "FPS: " + engine.getFps().toFixed(0);
      if (frameCounter % 6 === 0 && chunkManager && camera) {
        const spatial = chunkManager.update(camera.target);
        labState.spatial = spatial;
        const terrainLayers = [...new Set([...terrainMeshes.values()].map((mesh) => mesh.metadata.chunkY))].sort((a, b) => a - b);
        worldMeta.textContent = `XYZ chunks: ${spatial.activeCount} · terrain: ${terrainMeshes.size} patches · Y layers ${terrainLayers.join("/") || "—"} · ${Object.values(spatial.axisCoverage).every(Boolean) ? "6/6 directions" : "coverage check pending"}`;
      }
    });

    engine.runRenderLoop(() => scene.render());
    window.addEventListener("resize", () => engine.resize());

    resetButton.addEventListener("click", () => {
      camera.alpha = -Math.PI * 0.72;
      camera.beta = Math.PI * 0.34;
      camera.radius = chunkManager.radius * 0.88;
      camera.target.set(0, 5, 0);
    });

    dropButton.addEventListener("click", () => {
      spawnDynamicBox(camera.target.x - 12, camera.target.y + 42, camera.target.z - 8);
    });

    labState.ready = true;
    if ("serviceWorker" in navigator && location.protocol !== "file:") {
      navigator.serviceWorker.register("./sw.js", { scope: "./" }).catch(() => {});
    }

    setStatus("3D world running · initializing Havok", "warn");
    tryInitializeHavok();
  } catch (error) {
    labState.error = String(error);
    setStatus("Engine startup failed — see console", "warn");
    physicsMeta.textContent = String(error.message || error);
    console.error(error);
  }
}

boot();
