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

const canvas = document.getElementById("renderCanvas");
const statusText = document.getElementById("engineStatus");
const statusDot = document.getElementById("statusDot");
const physicsMeta = document.getElementById("physicsMeta");
const renderMeta = document.getElementById("renderMeta");
const fpsMeta = document.getElementById("fpsMeta");
const dropButton = document.getElementById("dropButton");
const resetButton = document.getElementById("resetButton");

const labState = {
  ready: false,
  renderer: "initializing",
  physicsReady: false,
  physicsMode: "initializing",
  frames: 0,
  probeY: null,
  error: null
};
window.__DRIVELLA_LAB__ = labState;

function setStatus(message, state = "warn") {
  statusText.textContent = message;
  statusDot.className = "status-dot " + state;
}

function terrainHeight(x, z) {
  return Math.sin(x * 0.024) * Math.cos(z * 0.019) * 5.2
    + Math.sin((x + z) * 0.043) * 2.1
    + Math.cos((x - z) * 0.031) * 1.6
    + Math.sin(z * 0.071) * Math.cos(x * 0.058) * 0.8;
}

function createHeightField(scene) {
  const segments = 112;
  const extent = 210;
  const step = (extent * 2) / segments;
  const positions = [];
  const indices = [];
  const normals = [];
  const uvs = [];

  for (let iz = 0; iz <= segments; iz += 1) {
    for (let ix = 0; ix <= segments; ix += 1) {
      const x = -extent + ix * step;
      const z = -extent + iz * step;
      positions.push(x, terrainHeight(x, z), z);
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

  VertexData.ComputeNormals(positions, indices, normals);
  const vertexData = new VertexData();
  vertexData.positions = positions;
  vertexData.indices = indices;
  vertexData.normals = normals;
  vertexData.uvs = uvs;

  const terrain = new Mesh("drivella-full-3d-heightfield", scene);
  vertexData.applyToMesh(terrain, true);
  terrain.isPickable = false;

  const material = new StandardMaterial("terrain-material", scene);
  material.diffuseColor = new Color3(0.055, 0.12, 0.16);
  material.specularColor = new Color3(0.16, 0.26, 0.31);
  material.specularPower = 48;
  terrain.material = material;
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

function createSpatialReference(scene) {
  const axisLength = 145;
  const axisMaterial = new StandardMaterial("axis-lines", scene);
  axisMaterial.emissiveColor = new Color3(0.12, 0.34, 0.47);
  axisMaterial.alpha = 0.28;
  axisMaterial.wireframe = true;
  axisMaterial.backFaceCulling = false;

  const shell = MeshBuilder.CreateSphere("equal-distance-world-envelope", {
    diameter: axisLength * 2,
    segments: 28
  }, scene);
  shell.material = axisMaterial;
  shell.isPickable = false;

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
  const skyLight = new HemisphericLight("sky-fill", new Vector3(0, 1, 0), scene);
  skyLight.intensity = 0.74;
  skyLight.groundColor = new Color3(0.035, 0.055, 0.1);

  const sun = new DirectionalLight("sun", new Vector3(-0.45, -1, 0.3), scene);
  sun.position = new Vector3(70, 130, -40);
  sun.intensity = 1.55;

  const camera = new ArcRotateCamera(
    "world-orbit-camera",
    -Math.PI * 0.72,
    Math.PI * 0.34,
    285,
    new Vector3(0, 8, 0),
    scene
  );
  camera.attachControl(canvas, true);
  camera.lowerRadiusLimit = 28;
  camera.upperRadiusLimit = 430;
  camera.lowerBetaLimit = 0.015;
  camera.upperBetaLimit = Math.PI - 0.015;
  camera.wheelPrecision = 34;
  camera.panningSensibility = 75;
  camera.inertia = 0.78;
  scene.activeCamera = camera;

  const terrain = createHeightField(scene);
  createSpatialReference(scene);

  scene.clearColor = new Color4(0.018, 0.027, 0.052, 1);
  scene.fogMode = Scene.FOGMODE_EXP2;
  scene.fogDensity = 0.00062;
  scene.fogColor = new Color3(0.018, 0.027, 0.052);

  return { camera, terrain };
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
let terrain;
let havokAttemptRunning = false;
let havokInstance = null;
let probeMesh = null;
let frameCounter = 0;
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
    addPhysicalProbe(scene, terrain, 0, PhysicsShapeType.MESH, { friction: 0.96, restitution: 0.02 });

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
    terrain = environment.terrain;

    scene.onAfterRenderObservable.add(() => {
      frameCounter += 1;
      labState.frames = frameCounter;
      if (probeMesh) labState.probeY = Number(probeMesh.position.y.toFixed(3));
      if (frameCounter % 18 === 0) fpsMeta.textContent = "FPS: " + engine.getFps().toFixed(0);
    });

    engine.runRenderLoop(() => scene.render());
    window.addEventListener("resize", () => engine.resize());

    resetButton.addEventListener("click", () => {
      camera.alpha = -Math.PI * 0.72;
      camera.beta = Math.PI * 0.34;
      camera.radius = 285;
      camera.target.set(0, 8, 0);
    });

    dropButton.addEventListener("click", () => {
      spawnDynamicBox(-12, 42, -8);
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
