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
import { terrainChunkLayer, terrainHeight, terrainMoisture } from "./TerrainField.mjs";
import { generateBiomePlacements } from "./BiomeField.mjs";
import { buildRoadChunkGeometry, generateMainRoadSamples, getRoadStats, nearestRoadSurfaceHeight, nearestRoadSurfaceInfo } from "./RoadNetwork.mjs";

const canvas = document.getElementById("renderCanvas");
const statusText = document.getElementById("engineStatus");
const statusDot = document.getElementById("statusDot");
const physicsMeta = document.getElementById("physicsMeta");
const renderMeta = document.getElementById("renderMeta");
const fpsMeta = document.getElementById("fpsMeta");
const worldMeta = document.getElementById("worldMeta");
const roadMeta = document.getElementById("roadMeta");
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
  roadYAtProbe: null,
  roadDistanceAtProbe: null,
  roadProbeY: null,
  roadProbeX: null,
  roadProbeZ: null,
  roadProbeYAtRoad: null,
  roadProbeDistanceToRoad: null,
  roadProbeStableFrames: 0,
  roadProbeTargetGrade: null,
  roadChunks: 0,
  roadLength: 0,
  roadSampleCount: 0,
  error: null,
  spatial: null
};
window.__DRIVELLA_LAB__ = labState;

function setStatus(message, state = "warn") {
  statusText.textContent = message;
  statusDot.className = "status-dot " + state;
}

function terrainColorAt(height, slopeAmount, moisture, distanceFromStart) {
  if (distanceFromStart < 80) {
    return [0.45, 0.48, 0.47];
  }

  let base;
  if (height > 138) {
    base = [0.62, 0.68, 0.73];
  } else if (slopeAmount > 0.58) {
    base = [0.39, 0.43, 0.46];
  } else if (height < -82) {
    base = moisture > 0.52 ? [0.19, 0.36, 0.29] : [0.27, 0.36, 0.31];
  } else if (moisture > 0.555) {
    base = [0.17, 0.34, 0.22];
  } else if (moisture < 0.315) {
    base = [0.47, 0.39, 0.24];
  } else {
    base = [0.35, 0.45, 0.25];
  }

  const slopeBlend = Math.max(0, Math.min(0.58, (slopeAmount - 0.2) * 0.68));
  const rockTint = [0.48, 0.53, 0.57];
  const variation = (moisture - 0.5) * 0.045;
  return [
    Math.max(0, Math.min(1, base[0] * (1 - slopeBlend) + rockTint[0] * slopeBlend + variation)),
    Math.max(0, Math.min(1, base[1] * (1 - slopeBlend) + rockTint[1] * slopeBlend + variation)),
    Math.max(0, Math.min(1, base[2] * (1 - slopeBlend) + rockTint[2] * slopeBlend + variation))
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
      const rgb = terrainColorAt(worldHeight, 1 - normalY, terrainMoisture(worldX, worldZ), Math.hypot(worldX, worldZ));
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

function pushFlatTriangle(positions, colors, indices, a, b, c, color) {
  const base = positions.length / 3;
  positions.push(...a, ...b, ...c);
  for (let i = 0; i < 3; i += 1) colors.push(color[0], color[1], color[2], 1);
  indices.push(base, base + 1, base + 2);
}

function appendCone(geometry, x, y, z, radius, height, sides, color, rotation = 0) {
  const tip = [x, y + height, z];
  for (let side = 0; side < sides; side += 1) {
    const a0 = rotation + (side / sides) * Math.PI * 2;
    const a1 = rotation + ((side + 1) / sides) * Math.PI * 2;
    const p0 = [x + Math.cos(a0) * radius, y, z + Math.sin(a0) * radius];
    const p1 = [x + Math.cos(a1) * radius, y, z + Math.sin(a1) * radius];
    pushFlatTriangle(geometry.positions, geometry.colors, geometry.indices, p0, p1, tip, color);
  }
}

function appendCylinder(geometry, x, y, z, bottomRadius, topRadius, height, sides, color, rotation = 0) {
  for (let side = 0; side < sides; side += 1) {
    const a0 = rotation + (side / sides) * Math.PI * 2;
    const a1 = rotation + ((side + 1) / sides) * Math.PI * 2;
    const b0 = [x + Math.cos(a0) * bottomRadius, y, z + Math.sin(a0) * bottomRadius];
    const b1 = [x + Math.cos(a1) * bottomRadius, y, z + Math.sin(a1) * bottomRadius];
    const t0 = [x + Math.cos(a0) * topRadius, y + height, z + Math.sin(a0) * topRadius];
    const t1 = [x + Math.cos(a1) * topRadius, y + height, z + Math.sin(a1) * topRadius];
    pushFlatTriangle(geometry.positions, geometry.colors, geometry.indices, b0, b1, t1, color);
    pushFlatTriangle(geometry.positions, geometry.colors, geometry.indices, b0, t1, t0, color);
  }
}

function appendRock(geometry, x, y, z, size, seed) {
  const random = (() => {
    let state = seed >>> 0;
    return () => {
      state = (state * 1664525 + 1013904223) >>> 0;
      return state / 4294967296;
    };
  })();
  const sides = 7;
  const rings = [];
  const baseRadius = size * (0.72 + random() * 0.2);
  for (let ring = 0; ring < 3; ring += 1) {
    const radius = ring === 1 ? baseRadius * (0.8 + random() * 0.28) : baseRadius * (ring === 0 ? 0.78 : 0.2);
    const ringY = ring === 0 ? 0 : ring === 1 ? size * (0.38 + random() * 0.18) : size * (0.82 + random() * 0.22);
    const points = [];
    for (let side = 0; side < sides; side += 1) {
      const angle = (side / sides) * Math.PI * 2 + random() * 0.16;
      const wobble = 0.78 + random() * 0.42;
      points.push([
        x + Math.cos(angle) * radius * wobble,
        y + ringY,
        z + Math.sin(angle) * radius * wobble
      ]);
    }
    rings.push(points);
  }
  const tones = [
    [0.24, 0.31, 0.39],
    [0.31, 0.39, 0.48],
    [0.39, 0.47, 0.54]
  ];
  for (let ring = 0; ring < 2; ring += 1) {
    for (let side = 0; side < sides; side += 1) {
      const next = (side + 1) % sides;
      const p00 = rings[ring][side];
      const p01 = rings[ring][next];
      const p10 = rings[ring + 1][side];
      const p11 = rings[ring + 1][next];
      const color = tones[(side + ring) % tones.length];
      pushFlatTriangle(geometry.positions, geometry.colors, geometry.indices, p00, p01, p11, color);
      pushFlatTriangle(geometry.positions, geometry.colors, geometry.indices, p00, p11, p10, color);
    }
  }
}

function createCombinedPropMesh(scene, name, geometry, material, position) {
  if (!geometry.indices.length) return null;
  const mesh = new Mesh(name, scene);
  const normals = [];
  VertexData.ComputeNormals(geometry.positions, geometry.indices, normals);
  const data = new VertexData();
  data.positions = geometry.positions;
  data.indices = geometry.indices;
  data.normals = normals;
  data.colors = geometry.colors;
  data.applyToMesh(mesh, true);
  mesh.position.copyFrom(position);
  mesh.material = material;
  mesh.isPickable = false;
  return mesh;
}

function createBiomeChunk(scene, chunk, chunkSize, vegetationMaterial, rockMaterial) {
  const placements = generateBiomePlacements(chunk.x, chunk.z, chunkSize, chunk.seed, chunk.lod);
  const vegetation = { positions: [], colors: [], indices: [] };
  const rocks = { positions: [], colors: [], indices: [] };
  const baseY = chunk.y * chunkSize;

  for (const tree of placements.trees) {
    const worldX = chunk.x * chunkSize + tree.x;
    const worldZ = chunk.z * chunkSize + tree.z;
    const base = terrainHeight(worldX, worldZ) - baseY;
    const scale = tree.scale;
    const trunkHeight = tree.height * scale * 0.42;
    appendCylinder(
      vegetation,
      tree.x, base, tree.z,
      0.48 * scale, 0.22 * scale, trunkHeight, 6,
      tree.variant === 2 ? [0.28, 0.18, 0.105] : [0.22, 0.15, 0.09],
      tree.yaw
    );

    const crownBase = base + trunkHeight * 0.68;
    const crown = tree.crown * scale;
    const foliage = tree.variant === 2
      ? [0.16, 0.32, 0.22]
      : [0.055 + (tree.variant ? 0.025 : 0), 0.25 + (tree.variant ? 0.06 : 0), 0.18 + (tree.variant ? 0.035 : 0)];
    appendCone(vegetation, tree.x, crownBase, tree.z, crown, tree.height * scale * 0.62, 7, foliage, tree.yaw);
    if (tree.variant !== 2) {
      appendCone(vegetation, tree.x, crownBase + tree.height * scale * 0.28, tree.z, crown * 0.7, tree.height * scale * 0.52, 7, [0.045, 0.2, 0.16], tree.yaw + 0.12);
    }
  }

  for (const tuft of placements.grass) {
    const worldX = chunk.x * chunkSize + tuft.x;
    const worldZ = chunk.z * chunkSize + tuft.z;
    const base = terrainHeight(worldX, worldZ) - baseY;
    const height = tuft.height * tuft.scale;
    const width = 0.22 * tuft.scale;
    const colors = [[0.28, 0.43, 0.25], [0.36, 0.5, 0.27], [0.19, 0.37, 0.24]];
    for (let blade = 0; blade < 3; blade += 1) {
      const angle = tuft.yaw + blade * Math.PI / 3;
      const dx = Math.cos(angle) * width;
      const dz = Math.sin(angle) * width;
      const lean = 0.3 + blade * 0.16;
      pushFlatTriangle(
        vegetation.positions, vegetation.colors, vegetation.indices,
        [tuft.x - dx, base, tuft.z - dz],
        [tuft.x + dx, base, tuft.z + dz],
        [tuft.x + Math.cos(angle + lean) * width * 0.65, base + height, tuft.z + Math.sin(angle + lean) * width * 0.65],
        colors[blade]
      );
    }
  }

  for (const reed of placements.reeds) {
    const worldX = chunk.x * chunkSize + reed.x;
    const worldZ = chunk.z * chunkSize + reed.z;
    const base = terrainHeight(worldX, worldZ) - baseY;
    const height = reed.height * reed.scale;
    for (let stalk = 0; stalk < 3; stalk += 1) {
      const angle = reed.yaw + stalk * Math.PI * 2 / 3;
      const offsetX = Math.cos(angle) * 0.46;
      const offsetZ = Math.sin(angle) * 0.46;
      appendCylinder(vegetation, reed.x + offsetX, base, reed.z + offsetZ, 0.07, 0.035, height * (0.72 + stalk * 0.09), 5, [0.29, 0.39, 0.22], angle);
      appendCone(vegetation, reed.x + offsetX, base + height * 0.58, reed.z + offsetZ, 0.16, 0.42, 5, [0.52, 0.34, 0.14], angle);
    }
  }

  for (const rock of placements.rocks) {
    const worldX = chunk.x * chunkSize + rock.x;
    const worldZ = chunk.z * chunkSize + rock.z;
    const base = terrainHeight(worldX, worldZ) - baseY;
    appendRock(
      rocks,
      rock.x, base, rock.z,
      rock.size * rock.scale,
      chunk.seed ^ Math.imul(Math.round(rock.x * 10 + rock.z * 17), 0x45d9f3b)
    );
  }

  const chunkOrigin = new Vector3(chunk.x * chunkSize, baseY, chunk.z * chunkSize);
  const vegetationMesh = createCombinedPropMesh(
    scene, `vegetation-${chunk.x}-${chunk.y}-${chunk.z}`, vegetation, vegetationMaterial, chunkOrigin
  );
  const rockMesh = createCombinedPropMesh(
    scene, `rocks-${chunk.x}-${chunk.y}-${chunk.z}`, rocks, rockMaterial, chunkOrigin
  );

  return {
    vegetationMesh,
    rockMesh,
    counts: {
      trees: placements.trees.length,
      grass: placements.grass.length,
      reeds: placements.reeds.length,
      rocks: placements.rocks.length
    },
    biomeCounts: placements.biomeCounts
  };
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


}

function createEnvironment(scene) {
  const worldRadius = 420;
  const skyLight = new HemisphericLight("sky-fill", new Vector3(0, 1, 0), scene);
  skyLight.intensity = 1.42;
  skyLight.groundColor = new Color3(0.035, 0.055, 0.1);

  const sun = new DirectionalLight("sun", new Vector3(-0.45, -1, 0.3), scene);
  sun.position = new Vector3(70, 130, -40);
  sun.intensity = 2.3;

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
  terrainMaterial.emissiveColor = new Color3(0.12, 0.15, 0.095);
  terrainMaterial.backFaceCulling = false;
  terrainMaterial.twoSidedLighting = true;
  terrainMaterial.useVertexColors = true;

  const roadSamples = generateMainRoadSamples();
  const roadStats = getRoadStats(roadSamples);
  const roadMeshes = new Map();
  const roadBodies = new Map();
  const roadMaterial = new StandardMaterial("drivella-road-material", scene);
  roadMaterial.diffuseColor = Color3.White();
  roadMaterial.specularColor = new Color3(0.26, 0.3, 0.34);
  roadMaterial.specularPower = 24;
  roadMaterial.useVertexColors = true;
  roadMaterial.backFaceCulling = false;

  const terrainMeshes = new Map();
  const terrainBodies = new Map();
  const biomeMeshes = new Map();
  const rockBodies = new Map();
  const biomeMaterial = new StandardMaterial("biome-props-material", scene);
  biomeMaterial.diffuseColor = Color3.White();
  biomeMaterial.specularColor = new Color3(0.06, 0.08, 0.07);
  biomeMaterial.specularPower = 8;
  biomeMaterial.useVertexColors = true;
  biomeMaterial.backFaceCulling = false;
  const rockMaterial = new StandardMaterial("biome-rock-material", scene);
  rockMaterial.diffuseColor = Color3.White();
  rockMaterial.specularColor = new Color3(0.14, 0.17, 0.2);
  rockMaterial.specularPower = 18;
  rockMaterial.useVertexColors = true;
  rockMaterial.backFaceCulling = false;
  const chunkManager = new SpatialChunkManager({
    chunkSize: 128,
    radius: worldRadius,
    maxActiveChunks: 512,
    onCreate: (chunk) => {
      const payload = { terrainMesh: null, biome: null, roadMesh: null };
      if (chunk.y === terrainChunkLayer(chunk.x, chunk.z, 128)) {
        const mesh = createTerrainChunk(scene, chunk.x, chunk.y, chunk.z, 128, terrainMaterial);
        payload.terrainMesh = mesh;
        terrainMeshes.set(chunk.key, mesh);
        const biome = createBiomeChunk(scene, chunk, 128, biomeMaterial, rockMaterial);
        payload.biome = biome;
        if (biome.vegetationMesh || biome.rockMesh) biomeMeshes.set(chunk.key, biome);

        const roadGeometry = buildRoadChunkGeometry(roadSamples, chunk.x, chunk.y, chunk.z, 128);
        const roadOrigin = new Vector3(chunk.x * 128, chunk.y * 128, chunk.z * 128);
        const roadMesh = createCombinedPropMesh(
          scene, `road-${chunk.x}-${chunk.y}-${chunk.z}`, roadGeometry, roadMaterial, roadOrigin
        );
        if (roadMesh) {
          payload.roadMesh = roadMesh;
          roadMeshes.set(chunk.key, roadMesh);
          if (scene.getPhysicsEngine()) {
            const roadBody = addPhysicalProbe(scene, roadMesh, 0, PhysicsShapeType.MESH, { friction: 0.94, restitution: 0.02 });
            roadBodies.set(chunk.key, roadBody);
          }
        }
        if (biome.rockMesh && scene.getPhysicsEngine()) {
          const rockBody = addPhysicalProbe(scene, biome.rockMesh, 0, PhysicsShapeType.MESH, { friction: 0.88, restitution: 0.04 });
          rockBodies.set(chunk.key, rockBody);
        }
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
      const roadBody = roadBodies.get(chunk.key);
      if (roadBody) {
        roadBody.dispose();
        roadBodies.delete(chunk.key);
      }
      if (payload?.roadMesh) {
        payload.roadMesh.dispose();
        roadMeshes.delete(chunk.key);
      }
      const rockBody = rockBodies.get(chunk.key);
      if (rockBody) {
        rockBody.dispose();
        rockBodies.delete(chunk.key);
      }
      if (payload?.biome) {
        payload.biome.vegetationMesh?.dispose();
        payload.biome.rockMesh?.dispose();
        biomeMeshes.delete(chunk.key);
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
  scene.fogColor = new Color3(0.055, 0.075, 0.09);
  scene.imageProcessingConfiguration.exposure = 1.18;
  scene.imageProcessingConfiguration.contrast = 1.12;

  return { camera, chunkManager, terrainMeshes, terrainBodies, biomeMeshes, rockBodies, roadSamples, roadStats, roadMeshes, roadBodies };
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
let biomeMeshes;
let rockBodies;
let roadSamples;
let roadStats;
let roadMeshes;
let roadBodies;
let havokAttemptRunning = false;
let havokInstance = null;
let probeMesh = null;
let roadProbeMesh = null;
let roadProbeStableFrames = 0;
let lastRoadProbePosition = null;
let frameCounter = 0;
let lastProbeY = null;
let probeStableFrames = 0;
const dynamicMeshes = [];

function findStableRoadProbeSample(samples) {
  let best = null;
  let bestScore = Infinity;
  for (let index = 0; index < samples.length; index += 1) {
    const previous = samples[(index - 1 + samples.length) % samples.length];
    const current = samples[index];
    const next = samples[(index + 1) % samples.length];
    const distance = Math.hypot(next.x - previous.x, next.z - previous.z);
    const grade = Math.abs(next.y - previous.y) / Math.max(distance, 0.001);
    const score = grade + Math.abs(current.bank) * 0.45;
    if (score < bestScore) {
      bestScore = score;
      best = { sample: current, grade };
    }
  }
  return best;
}

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
    for (const [key, props] of biomeMeshes) {
      if (props.rockMesh && !rockBodies.has(key)) {
        const body = addPhysicalProbe(scene, props.rockMesh, 0, PhysicsShapeType.MESH, { friction: 0.88, restitution: 0.04 });
        rockBodies.set(key, body);
      }
    }
    for (const [key, mesh] of roadMeshes) {
      if (!roadBodies.has(key)) {
        const body = addPhysicalProbe(scene, mesh, 0, PhysicsShapeType.MESH, { friction: 0.94, restitution: 0.02 });
        roadBodies.set(key, body);
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

    const roadProbeTarget = findStableRoadProbeSample(roadSamples);
    if (!roadProbeTarget) throw new Error("Could not select a flat road segment for Havok contact test.");
    labState.roadProbeTargetGrade = roadProbeTarget.grade;
    roadProbeMesh = MeshBuilder.CreateBox("road-collision-probe", {
      width: 2,
      height: 2,
      depth: 2
    }, scene);
    roadProbeMesh.position.set(
      roadProbeTarget.sample.x,
      roadProbeTarget.sample.y + 12,
      roadProbeTarget.sample.z
    );
    const roadProbeMaterial = new StandardMaterial("road-probe-material", scene);
    roadProbeMaterial.diffuseColor = new Color3(1, 0.61, 0.16);
    roadProbeMaterial.emissiveColor = new Color3(0.12, 0.055, 0.01);
    roadProbeMaterial.metallic = 0.12;
    roadProbeMaterial.roughness = 0.5;
    roadProbeMesh.material = roadProbeMaterial;
    addPhysicalProbe(scene, roadProbeMesh, 18, PhysicsShapeType.BOX, { friction: 1.8, restitution: 0.01 });

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
    biomeMeshes = environment.biomeMeshes;
    rockBodies = environment.rockBodies;
    roadSamples = environment.roadSamples;
    roadStats = environment.roadStats;
    roadMeshes = environment.roadMeshes;
    roadBodies = environment.roadBodies;
    labState.roadLength = Number(roadStats.length.toFixed(1));
    labState.roadSampleCount = roadSamples.length;

    scene.onAfterRenderObservable.add(() => {
      frameCounter += 1;
      labState.frames = frameCounter;
      if (probeMesh) {
        const currentY = probeMesh.position.y;
        labState.probeY = Number(currentY.toFixed(3));
        labState.probeX = Number(probeMesh.position.x.toFixed(3));
        labState.probeZ = Number(probeMesh.position.z.toFixed(3));
        labState.terrainYAtProbe = Number(terrainHeight(probeMesh.position.x, probeMesh.position.z).toFixed(3));
        const roadY = nearestRoadSurfaceHeight(probeMesh.position.x, probeMesh.position.z, roadSamples);
        labState.roadYAtProbe = roadY === null ? null : Number(roadY.toFixed(3));
        if (lastProbeY !== null && Math.abs(currentY - lastProbeY) < 0.05) {
          probeStableFrames += 1;
        } else {
          probeStableFrames = 0;
        }
        lastProbeY = currentY;
        labState.probeStableFrames = probeStableFrames;
      }
      if (roadProbeMesh) {
        const position = roadProbeMesh.position;
        const roadContact = nearestRoadSurfaceInfo(position.x, position.z, roadSamples);
        labState.roadProbeX = Number(position.x.toFixed(3));
        labState.roadProbeY = Number(position.y.toFixed(3));
        labState.roadProbeZ = Number(position.z.toFixed(3));
        labState.roadProbeYAtRoad = roadContact ? Number(roadContact.y.toFixed(3)) : null;
        labState.roadProbeDistanceToRoad = roadContact ? Number(roadContact.distance.toFixed(3)) : null;
        if (lastRoadProbePosition) {
          const movement = Math.hypot(
            position.x - lastRoadProbePosition.x,
            position.y - lastRoadProbePosition.y,
            position.z - lastRoadProbePosition.z
          );
          roadProbeStableFrames = movement < 0.025 ? roadProbeStableFrames + 1 : 0;
        }
        lastRoadProbePosition = { x: position.x, y: position.y, z: position.z };
        labState.roadProbeStableFrames = roadProbeStableFrames;
      }
      if (frameCounter % 18 === 0) fpsMeta.textContent = "FPS: " + engine.getFps().toFixed(0);
      if (frameCounter % 6 === 0 && chunkManager && camera) {
        const spatial = chunkManager.update(camera.target);
        labState.spatial = spatial;
        const terrainLayers = [...new Set([...terrainMeshes.values()].map((mesh) => mesh.metadata.chunkY))].sort((a, b) => a - b);
        labState.roadChunks = roadMeshes.size;
        const biomeTotals = { trees: 0, grass: 0, reeds: 0, rocks: 0 };
        const biomeDistribution = {};
        for (const props of biomeMeshes.values()) {
          for (const key of Object.keys(biomeTotals)) biomeTotals[key] += props.counts[key];
          for (const [id, count] of Object.entries(props.biomeCounts)) {
            biomeDistribution[id] = (biomeDistribution[id] || 0) + count;
          }
        }
        const biomeTypes = Object.keys(biomeDistribution).filter((id) => biomeDistribution[id] > 0);
        labState.biomes = biomeTotals;
        labState.biomeTypes = biomeTypes;
        labState.biomeDistribution = biomeDistribution;
        worldMeta.textContent = `XYZ chunks: ${spatial.activeCount} · terrain: ${terrainMeshes.size} patches · Y layers ${terrainLayers.join("/") || "—"} · ${Object.values(spatial.axisCoverage).every(Boolean) ? "6/6 directions" : "coverage check pending"}`;
        roadMeta.textContent = `Road: ${roadMeshes.size} chunks · ${Math.round(roadStats.length)} m loop · ${roadSamples.length} spline samples`;
        biomeMeta.textContent = `Biomes: ${biomeTypes.slice(0, 4).join("/") || "preparing"} · ${biomeTotals.trees} trees · ${biomeTotals.rocks} rocks`;
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
