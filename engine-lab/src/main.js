import {
  ArcRotateCamera,
  Color3,
  Color4,
  DirectionalLight,
  Engine,
  GlowLayer,
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
import { neonizeGeometryColors } from "./NeonPalette.mjs";
import { LegacyVisualEffects } from "./LegacyVisualEffects.mjs";
import { VehicleController } from "./VehicleController.mjs";
import { SpatialChunkManager } from "./SpatialChunkManager.mjs";
import { registerTunnelCorridors, terrainChunkLayer, terrainHeight, terrainMoisture } from "./TerrainField.mjs";
import { generateBiomePlacements } from "./BiomeField.mjs";
import { buildHydrologyChunkGeometry, classifyRoadHydrologyCrossings, getHydrologyStats } from "./HydrologyField.mjs";
import { buildRoadChunkGeometry, buildRoadCurbChunkGeometry, buildRoadFurnitureChunkGeometry, generateMainRoadSamples, getRoadStats, getRoadFurnitureStats, nearestRoadSurfaceHeight, nearestRoadSurfaceInfo } from "./RoadNetwork.mjs";
import { buildTunnelChunkGeometry, detectTunnelSegments, getTunnelStats, TUNNEL_CLEAR_HEIGHT } from "./TunnelNetwork.mjs";

import { createRoadGridExclusionIndex } from "./RoadGridMask.mjs";

const canvas = document.getElementById("renderCanvas");
const statusText = document.getElementById("engineStatus");
const statusDot = document.getElementById("statusDot");
const physicsMeta = document.getElementById("physicsMeta");
const renderMeta = document.getElementById("renderMeta");
const fpsMeta = document.getElementById("fpsMeta");
const worldMeta = document.getElementById("worldMeta");
const roadMeta = document.getElementById("roadMeta");
const waterMeta = document.getElementById("waterMeta");
const tunnelMeta = document.getElementById("tunnelMeta");
const vehicleMeta = document.getElementById("vehicleMeta");
const dropButton = document.getElementById("dropButton");
const resetButton = document.getElementById("resetButton");
const fxToggle = document.getElementById("fxToggle");
const fxPanel = document.getElementById("fxPanel");

const labState = {
  ready: false,
  renderer: "initializing",
  cameraKeyboardEnabled: false,
  neonGlowReady: false,
  terrainGridChunks: 0,
  terrainGridMeshCount: 0,
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
  roadGuardrailSegments: 0,
  roadDrainageSegments: 0,
  roadTransitionSegments: 0,
  roadFurnitureChunks: 0,
  roadSampleCount: 0,
  waterChunks: 0,
  shoreChunks: 0,
  riverSegments: 0,
  lakeTriangles: 0,
  riverCount: 0,
  lakeCount: 0,
  bridgeCrossingCount: 0,
  bridgeCandidateCount: 0,
  bridgePiers: 0,
  bridgeGirderSegments: 0,
  unresolvedWaterCrossings: 0,
  bridgeCrossings: [],
  tunnelCount: 0,
  tunnelLength: 0,
  tunnelChunks: 0,
  tunnelPortals: 0,
  tunnelRibs: 0,
  tunnelLights: 0,
  tunnelMinCover: null,
  tunnelMeshCount: 0,
  tunnelBodyCount: 0,
  tunnelProbeY: null,
  tunnelProbeYAtRoof: null,
  tunnelProbePeakY: null,
  tunnelProbeStableFrames: 0,
  vehicleReady:false,vehicleWheelbase:null,vehicleTrack:null,vehicleWheelRadius:null,
  vehicleWheelContacts:0,vehicleStableFrames:0,vehicleSpeedKmh:0,vehicleRoll:0,vehiclePitch:0,vehicleYaw:0,vehicleSteer:0,
  vehicleX:0,vehicleY:0,vehicleZ:0,vehicleBodyMass:0,vehicleGravityFactor:1,vehiclePhysicsStep:0,vehiclePhysicsSubStep:0,vehicleEngineTimeStepMs:0,vehicleDeterministicLockstep:false,vehicleLockstepMaxSteps:0,vehicleDriveRequested:0,vehicleTotalSpringLoad:0,vehicleRearLongitudinalForce:0,vehicleTotalLongitudinalForce:0,
  vehicleSpawnX:null,vehicleSpawnZ:null,vehicleSpawnGrade:null,vehicleSpawnDistanceFromRoadProbe:null,
  vehicleRoadSurfaceY:null,vehicleRoadDistance:null,vehicleRoadBodyBottomClearance:null,vehicleVelocityX:0,vehicleVelocityY:0,vehicleVelocityZ:0,vehicleMaxSuspensionCompression:0,vehicleAverageSuspensionCompression:0,vehicleAppliedForceX:0,vehicleAppliedForceZ:0,vehicleForwardX:0,vehicleForwardZ:0,vehicleWheelDiagnostics:[],
  vehicleForwardSpeed:0,vehicleLateralSpeed:0,vehicleSlipAngle:0,vehicleSlipAngleDegrees:0,vehicleYawRate:0,vehicleUnwrappedYaw:0,vehicleYawTurns:0,vehicleRearSlipAngle:0,vehicleRearSlipAngleDegrees:0,vehicleFrontGrip:0,vehicleRearGrip:0,vehicleRearHandbrakeGrip:0,vehicleParked:true,
  error:null,
  spatial: null
};
window.__DRIVELLA_LAB__ = labState;
let visualEffects = null;
let roadCurbMeshes = new Map();
let roadMarkingMeshes = new Map();

function setStatus(message, state = "warn") {
  statusText.textContent = message;
  statusDot.className = "status-dot " + state;
}

function terrainColorAt(height, slopeAmount, moisture, distanceFromStart) {
  // Match the original black-ground aesthetic; leave just enough tint to read
  // the terrain facets beneath the regular neon grid.
  let base;
  if (distanceFromStart < 80) {
    base = [0.004, 0.004, 0.009];
  } else if (height > 138) {
    base = [0.015, 0.006, 0.022];
  } else if (slopeAmount > 0.58) {
    base = [0.012, 0.005, 0.018];
  } else if (height < -82) {
    base = moisture > 0.52 ? [0.004, 0.010, 0.014] : [0.011, 0.006, 0.018];
  } else if (moisture > 0.555) {
    base = [0.004, 0.009, 0.014];
  } else if (moisture < 0.315) {
    base = [0.016, 0.004, 0.012];
  } else {
    base = [0.006, 0.006, 0.016];
  }
  const slopeBlend = Math.max(0, Math.min(0.28, (slopeAmount - 0.2) * 0.34));
  const rockTint = [0.020, 0.007, 0.026];
  const variation = (moisture - 0.5) * 0.003;
  return [
    Math.max(0, Math.min(0.05, base[0] * (1 - slopeBlend) + rockTint[0] * slopeBlend + variation)),
    Math.max(0, Math.min(0.04, base[1] * (1 - slopeBlend) + rockTint[1] * slopeBlend + variation)),
    Math.max(0, Math.min(0.06, base[2] * (1 - slopeBlend) + rockTint[2] * slopeBlend + variation))
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

function pushGridQuad(geometry, origin, a, b, c, d) {
  const base = geometry.positions.length / 3;
  for (const point of [a, b, c, d]) {
    geometry.positions.push(point[0] - origin.x, point[1] - origin.y, point[2] - origin.z);
  }
  geometry.indices.push(base, base + 2, base + 1, base, base + 3, base + 2);
}

function createTerrainGridMesh(scene, name, geometry, material, origin) {
  if (!geometry.indices.length) return null;
  const mesh = new Mesh(name, scene);
  const normals = [];
  VertexData.ComputeNormals(geometry.positions, geometry.indices, normals);
  const data = new VertexData();
  data.positions = geometry.positions;
  data.indices = geometry.indices;
  data.normals = normals;
  data.applyToMesh(mesh, true);
  mesh.position.copyFrom(origin);
  mesh.material = material;
  mesh.isPickable = false;
  mesh.alwaysSelectAsActiveMesh = true;
  mesh.metadata = { spatialChunk: true, terrainGrid: true };
  return mesh;
}

function createTerrainGridChunk(scene, chunkX, chunkY, chunkZ, chunkSize, minorMaterial, majorMaterial, roadGridMask = null) {
  const half = chunkSize * 0.5;
  const origin = new Vector3(chunkX * chunkSize, chunkY * chunkSize, chunkZ * chunkSize);
  const minX = chunkX * chunkSize - half;
  const maxX = minX + chunkSize;
  const minZ = chunkZ * chunkSize - half;
  const maxZ = minZ + chunkSize;
  const sampleSegments = Math.ceil(chunkSize / 4);
  const sampleStep = chunkSize / sampleSegments;
  const minor = { positions: [], indices: [] };
  const major = { positions: [], indices: [] };

  const addXLine = (worldX, isMajor) => {
    const target = minor;
    const halfWidth = 0.026;
    for (let segment = 0; segment < sampleSegments; segment += 1) {
      const z0 = minZ + segment * sampleStep;
      const z1 = z0 + sampleStep;
      const y0 = terrainHeight(worldX, z0) + 0.17;
      const y1 = terrainHeight(worldX, z1) + 0.17;
      if (roadGridMask && (roadGridMask.isNearRoad(worldX, z0) || roadGridMask.isNearRoad(worldX, (z0 + z1) * 0.5) || roadGridMask.isNearRoad(worldX, z1))) continue;
      pushGridQuad(target, origin,
        [worldX - halfWidth, y0, z0],
        [worldX + halfWidth, y0, z0],
        [worldX + halfWidth, y1, z1],
        [worldX - halfWidth, y1, z1]);
    }
  };

  const addZLine = (worldZ, isMajor) => {
    const target = minor;
    const halfWidth = 0.026;
    for (let segment = 0; segment < sampleSegments; segment += 1) {
      const x0 = minX + segment * sampleStep;
      const x1 = x0 + sampleStep;
      const y0 = terrainHeight(x0, worldZ) + 0.17;
      const y1 = terrainHeight(x1, worldZ) + 0.17;
      if (roadGridMask && (roadGridMask.isNearRoad(x0, worldZ) || roadGridMask.isNearRoad((x0 + x1) * 0.5, worldZ) || roadGridMask.isNearRoad(x1, worldZ))) continue;
      pushGridQuad(target, origin,
        [x0, y0, worldZ - halfWidth],
        [x1, y1, worldZ - halfWidth],
        [x1, y1, worldZ + halfWidth],
        [x0, y0, worldZ + halfWidth]);
    }
  };

  const firstX = Math.ceil((minX - 0.0001) / 10) * 10;
  for (let worldX = firstX; worldX < maxX - 0.0001; worldX += 10) {
    addXLine(worldX, false);
  }
  const firstZ = Math.ceil((minZ - 0.0001) / 10) * 10;
  for (let worldZ = firstZ; worldZ < maxZ - 0.0001; worldZ += 10) {
    addZLine(worldZ, false);
  }

  return {
    minorMesh: createTerrainGridMesh(scene, "terrain-grid-" + chunkX + "-" + chunkY + "-" + chunkZ, minor, minorMaterial, origin),
    majorMesh: null
  };
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

function createCombinedPropMesh(scene, name, geometry, material, position, options = {}) {
  if (!geometry.indices.length) return null;
  const neonize = options.neonize !== false;
  const neonGlowColor = options.glowColor ?? (neonize ? neonizeGeometryColors(geometry.colors) : null);
  const mesh = new Mesh(name, scene);
  mesh.metadata = { ...(mesh.metadata ?? {}), ...(neonGlowColor ? { neonGlowColor } : {}) };
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
  skyLight.intensity = 0.92;
  skyLight.groundColor = new Color3(0.035, 0.055, 0.1);

  const sun = new DirectionalLight("sun", new Vector3(-0.45, -1, 0.3), scene);
  sun.position = new Vector3(70, 130, -40);
  sun.intensity = 1.2;

  const camera = new ArcRotateCamera(
    "world-orbit-camera",
    -Math.PI * 0.72,
    Math.PI * 0.34,
    worldRadius * 0.88,
    new Vector3(0, 5, 0),
    scene
  );
  camera.attachControl(canvas, true);
  // Mouse drag and wheel remain attached; camera orbit is never keyboard-driven.
  const cameraKeyboardInput = camera.inputs.attached.keyboard;
  if (cameraKeyboardInput) camera.inputs.remove(cameraKeyboardInput);
  camera.keysUp = [];
  camera.keysDown = [];
  camera.keysLeft = [];
  camera.keysRight = [];
  labState.cameraKeyboardEnabled = Boolean(camera.inputs.attached.keyboard);
  camera.lowerRadiusLimit = 28;
  camera.upperRadiusLimit = worldRadius * 2.2;
  camera.lowerBetaLimit = 0.015;
  camera.upperBetaLimit = Math.PI - 0.015;
  camera.wheelPrecision = 34;
  camera.panningSensibility = 75;
  camera.inertia = 0.78;
  scene.activeCamera = camera;

  const neonGlow = new GlowLayer("drivella-neon-glow", scene, { blurKernelSize: 18 });
  const environmentNeonGlow = neonGlow;
  // A single, tighter GlowLayer keeps the grid and raised kerbs neon without a second bloom pass.
  neonGlow.intensity = 0.42;
  neonGlow.customEmissiveColorSelector = (mesh, _subMesh, material, result) => {
    const glow = mesh.metadata?.neonGlowColor;
    if (glow) {
      result.set(glow[0], glow[1], glow[2], 1);
    } else if (material?.emissiveColor) {
      result.set(material.emissiveColor.r, material.emissiveColor.g, material.emissiveColor.b, 1);
    } else {
      result.set(0, 0, 0, 0);
    }
  };
  labState.neonGlowReady = true;

  const terrainGridMinorMaterial = new StandardMaterial("terrain-grid-material", scene);
  terrainGridMinorMaterial.diffuseColor = new Color3(0.055, 0.34, 0.54);
  terrainGridMinorMaterial.emissiveColor = new Color3(0.025, 0.17, 0.29);
  terrainGridMinorMaterial.disableLighting = true;
  terrainGridMinorMaterial.backFaceCulling = false;
  // Retain the current function signature without adding the second, nested grid.
  const terrainGridMajorMaterial = terrainGridMinorMaterial;

  const terrainMaterial = new StandardMaterial("terrain-material", scene);
  terrainMaterial.diffuseColor = Color3.White();
  terrainMaterial.specularColor = new Color3(0.045, 0.035, 0.075);
  terrainMaterial.specularPower = 12;
  terrainMaterial.emissiveColor = new Color3(0.001, 0.001, 0.003);
  terrainMaterial.backFaceCulling = false;
  terrainMaterial.twoSidedLighting = true;
  terrainMaterial.useVertexColors = true;

  const roadSamples = generateMainRoadSamples();
  const roadGridMask = createRoadGridExclusionIndex(roadSamples, { radius: 9.9, cellSize: 24 });
  const tunnels = detectTunnelSegments(roadSamples);
  const tunnelSpatialStats = registerTunnelCorridors(tunnels);
  const tunnelStats = getTunnelStats(tunnels);
  const roadStats = getRoadStats(roadSamples);
  const roadFurnitureStats = getRoadFurnitureStats(roadSamples, 128, tunnels);
  const hydrologyStats = getHydrologyStats();
  const bridgeClassification = classifyRoadHydrologyCrossings(roadSamples);
  const waterMeshes = new Map();
  const shoreMeshes = new Map();
  const roadMeshes = new Map();
  const roadFurnitureMeshes = new Map();
  const roadCurbMeshes = new Map();
  const roadMarkingMeshes = new Map();
  const tunnelMeshes = new Map();
  const tunnelBodies = new Map();
  const roadBodies = new Map();
  const roadMaterial = new StandardMaterial("drivella-road-material", scene);
  roadMaterial.diffuseColor = Color3.White();
  roadMaterial.specularColor = new Color3(0.19, 0.23, 0.28);
  roadMaterial.specularPower = 36;
  roadMaterial.emissiveColor = Color3.Black();
  roadMaterial.useVertexColors = true;
  roadMaterial.backFaceCulling = false;
  roadMaterial.disableLighting = false;
  // 2 environment + 8 track lights. Headlights are injected as a dedicated
  // road-material shader contribution so they do not consume WebGL light slots.
  roadMaterial.maxSimultaneousLights = 10;
  labState.roadMaxSimultaneousLights = roadMaterial.maxSimultaneousLights;
  const roadMarkingMaterial = new StandardMaterial("drivella-road-marking-material", scene);
  roadMarkingMaterial.diffuseColor = Color3.White();
  roadMarkingMaterial.emissiveColor = new Color3(0.72, 0.72, 0.78);
  roadMarkingMaterial.specularColor = Color3.Black();
  roadMarkingMaterial.disableLighting = true;
  roadMarkingMaterial.useVertexColors = true;
  roadMarkingMaterial.backFaceCulling = false;
  const roadCurbMaterial = new StandardMaterial("drivella-neon-fence-material", scene);
  roadCurbMaterial.diffuseColor = Color3.White();
  roadCurbMaterial.emissiveColor = Color3.White();
  roadCurbMaterial.specularColor = Color3.Black();
  roadCurbMaterial.disableLighting = true;
  roadCurbMaterial.useVertexColors = true;
  roadCurbMaterial.backFaceCulling = false;
  const roadFurnitureMaterial = new StandardMaterial("drivella-road-furniture-material", scene);
  roadFurnitureMaterial.diffuseColor = Color3.White();
  roadFurnitureMaterial.specularColor = new Color3(0.18, 0.21, 0.22);
  roadFurnitureMaterial.specularPower = 14;
  roadFurnitureMaterial.emissiveColor = Color3.Black();
  roadFurnitureMaterial.useVertexColors = true;
  roadFurnitureMaterial.backFaceCulling = false;

  const tunnelMaterial = new StandardMaterial("drivella-tunnel-material", scene);
  tunnelMaterial.diffuseColor = Color3.White();
  tunnelMaterial.emissiveColor = new Color3(0.055, 0.055, 0.055);
  tunnelMaterial.specularColor = new Color3(0.28, 0.34, 0.39);
  tunnelMaterial.specularPower = 28;
  tunnelMaterial.useVertexColors = true;
  tunnelMaterial.backFaceCulling = false;

  const waterMaterial = new StandardMaterial("drivella-water-material", scene);
  waterMaterial.diffuseColor = Color3.White();
  waterMaterial.emissiveColor = new Color3(0.06, 0.06, 0.06);
  waterMaterial.specularColor = new Color3(0.68, 0.84, 0.9);
  waterMaterial.specularPower = 96;
  waterMaterial.useVertexColors = true;
  waterMaterial.alpha = 0.84;
  waterMaterial.transparencyMode = StandardMaterial.MATERIAL_ALPHABLEND;
  waterMaterial.disableDepthWrite = true;
  waterMaterial.backFaceCulling = false;

  const shoreMaterial = new StandardMaterial("drivella-shore-material", scene);
  shoreMaterial.diffuseColor = Color3.White();
  shoreMaterial.emissiveColor = new Color3(0.045, 0.045, 0.045);
  shoreMaterial.specularColor = new Color3(0.1, 0.12, 0.1);
  shoreMaterial.specularPower = 10;
  shoreMaterial.useVertexColors = true;
  shoreMaterial.backFaceCulling = false;

  const terrainMeshes = new Map();
  const terrainGridMeshes = new Map();
  const terrainBodies = new Map();
  const biomeMeshes = new Map();
  const rockBodies = new Map();
  const biomeMaterial = new StandardMaterial("biome-props-material", scene);
  biomeMaterial.diffuseColor = Color3.White();
  biomeMaterial.specularColor = new Color3(0.06, 0.08, 0.07);
  biomeMaterial.specularPower = 8;
  biomeMaterial.emissiveColor = new Color3(0.045, 0.045, 0.045);
  biomeMaterial.useVertexColors = true;
  biomeMaterial.backFaceCulling = false;
  const rockMaterial = new StandardMaterial("biome-rock-material", scene);
  rockMaterial.diffuseColor = Color3.White();
  rockMaterial.specularColor = new Color3(0.14, 0.17, 0.2);
  rockMaterial.specularPower = 18;
  rockMaterial.emissiveColor = new Color3(0.055, 0.055, 0.055);
  rockMaterial.useVertexColors = true;
  rockMaterial.backFaceCulling = false;
  const chunkManager = new SpatialChunkManager({
    chunkSize: 128,
    radius: worldRadius,
    maxActiveChunks: 512,
    onCreate: (chunk) => {
      const payload = { terrainMesh: null, terrainGrid: null, biome: null, roadMesh: null, roadMarkingMesh: null, roadCurbMeshes: [], roadFurnitureMesh: null, roadFurnitureStats: null, tunnelMesh: null, tunnelGeometryStats: null, waterMesh: null, shoreMesh: null, hydrologyStats: null };
      if (chunk.y === terrainChunkLayer(chunk.x, chunk.z, 128)) {
        const mesh = createTerrainChunk(scene, chunk.x, chunk.y, chunk.z, 128, terrainMaterial);
        payload.terrainMesh = mesh;
        terrainMeshes.set(chunk.key, mesh);
        const terrainGrid = createTerrainGridChunk(scene, chunk.x, chunk.y, chunk.z, 128, terrainGridMinorMaterial, terrainGridMajorMaterial, roadGridMask);
        payload.terrainGrid = terrainGrid;
        terrainGridMeshes.set(chunk.key, terrainGrid);
        labState.terrainGridChunks = terrainGridMeshes.size;
        labState.terrainGridMeshCount += Number(Boolean(terrainGrid.minorMesh)) + Number(Boolean(terrainGrid.majorMesh));
        const biome = createBiomeChunk(scene, chunk, 128, biomeMaterial, rockMaterial);
        payload.biome = biome;
        if (biome.vegetationMesh || biome.rockMesh) biomeMeshes.set(chunk.key, biome);

        const roadGeometry = buildRoadChunkGeometry(roadSamples, chunk.x, chunk.y, chunk.z, 128);
        const roadCurbGeometry = buildRoadCurbChunkGeometry(roadSamples, chunk.x, chunk.y, chunk.z, 128);
        const roadOrigin = new Vector3(chunk.x * 128, chunk.y * 128, chunk.z * 128);
        const roadMesh = createCombinedPropMesh(
          scene, `road-${chunk.x}-${chunk.y}-${chunk.z}`, roadGeometry, roadMaterial, roadOrigin,
          { neonize: false }
        );
        const roadMarkingMesh = createCombinedPropMesh(
          scene, `road-markings-${chunk.x}-${chunk.y}-${chunk.z}`,
          roadGeometry.markingGeometry, roadMarkingMaterial, roadOrigin, { neonize: false }
        );
        if (roadMarkingMesh) {
          payload.roadMarkingMesh = roadMarkingMesh;
          roadMarkingMeshes.set(chunk.key, roadMarkingMesh);
          // White paint must stay crisp and must not be smeared by the neon bloom.
          environmentNeonGlow.addExcludedMesh(roadMarkingMesh);
        }
        if (roadMesh) {
          payload.roadMesh = roadMesh;
          roadMeshes.set(chunk.key, roadMesh);
          environmentNeonGlow.addExcludedMesh(roadMesh);
          if (scene.getPhysicsEngine()) {
            const roadBody = addPhysicalProbe(scene, roadMesh, 0, PhysicsShapeType.MESH, { friction: 0.94, restitution: 0.02 });
            roadBodies.set(chunk.key, roadBody);
          }
        }
        const furnitureGeometry = buildRoadFurnitureChunkGeometry(roadSamples, chunk.x, chunk.y, chunk.z, 128, tunnels);
        payload.roadFurnitureStats = {
          bridgePiers: furnitureGeometry.bridgePiers,
          bridgeGirderSegments: furnitureGeometry.bridgeGirderSegments
        };
        labState.bridgePiers += furnitureGeometry.bridgePiers;
        labState.bridgeGirderSegments += furnitureGeometry.bridgeGirderSegments;
        const leftFenceMesh = createCombinedPropMesh(
          scene, `road-fence-pink-${chunk.x}-${chunk.y}-${chunk.z}`,
          roadCurbGeometry.left, roadCurbMaterial, roadOrigin,
          { neonize: false, glowColor: [1.25, 0.08, 0.60] }
        );
        const rightFenceMesh = createCombinedPropMesh(
          scene, `road-fence-cyan-${chunk.x}-${chunk.y}-${chunk.z}`,
          roadCurbGeometry.right, roadCurbMaterial, roadOrigin,
          { neonize: false, glowColor: [0.10, 0.92, 1.28] }
        );
        payload.roadCurbMeshes = [leftFenceMesh, rightFenceMesh].filter(Boolean);
        if (payload.roadCurbMeshes.length) roadCurbMeshes.set(chunk.key, payload.roadCurbMeshes);
        const furnitureMesh = createCombinedPropMesh(
          scene, `road-furniture-${chunk.x}-${chunk.y}-${chunk.z}`, furnitureGeometry, roadFurnitureMaterial, roadOrigin,
          { neonize: false }
        );
        if (furnitureMesh) {
          payload.roadFurnitureMesh = furnitureMesh;
          roadFurnitureMeshes.set(chunk.key, furnitureMesh);
          environmentNeonGlow.addExcludedMesh(furnitureMesh);
        }
        const tunnelGeometry = buildTunnelChunkGeometry(tunnels, chunk.x, chunk.y, chunk.z, 128);
        payload.tunnelGeometryStats = {
          portalCount: tunnelGeometry.portalCount,
          segmentCount: tunnelGeometry.segmentCount,
          ribCount: tunnelGeometry.ribCount,
          lightSegments: tunnelGeometry.lightSegments
        };
        labState.tunnelPortals += tunnelGeometry.portalCount;
        labState.tunnelRibs += tunnelGeometry.ribCount;
        labState.tunnelLights += tunnelGeometry.lightSegments;
        const tunnelMesh = createCombinedPropMesh(
          scene, `tunnel-${chunk.x}-${chunk.y}-${chunk.z}`, tunnelGeometry, tunnelMaterial, roadOrigin
        );
        if (tunnelMesh) {
          payload.tunnelMesh = tunnelMesh;
          tunnelMeshes.set(chunk.key, tunnelMesh);
          if (scene.getPhysicsEngine()) {
            const tunnelBody = addPhysicalProbe(scene, tunnelMesh, 0, PhysicsShapeType.MESH, { friction: 0.92, restitution: 0.01 });
            tunnelBodies.set(chunk.key, tunnelBody);
          }
        }
        const waterGeometry = buildHydrologyChunkGeometry(chunk.x, chunk.y, chunk.z, 128, terrainHeight);
        payload.hydrologyStats = {
          riverSegments: waterGeometry.riverSegments,
          lakeTriangles: waterGeometry.lakeTriangles
        };
        labState.riverSegments += waterGeometry.riverSegments;
        labState.lakeTriangles += waterGeometry.lakeTriangles;
        const waterMesh = createCombinedPropMesh(
          scene, `water-${chunk.x}-${chunk.y}-${chunk.z}`, waterGeometry.water, waterMaterial, roadOrigin
        );
        if (waterMesh) {
          payload.waterMesh = waterMesh;
          waterMeshes.set(chunk.key, waterMesh);
        }
        const shoreMesh = createCombinedPropMesh(
          scene, `shore-${chunk.x}-${chunk.y}-${chunk.z}`, waterGeometry.shore, shoreMaterial, roadOrigin
        );
        if (shoreMesh) {
          payload.shoreMesh = shoreMesh;
          shoreMeshes.set(chunk.key, shoreMesh);
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
      if (payload?.terrainGrid) {
        payload.terrainGrid.minorMesh?.dispose();
        payload.terrainGrid.majorMesh?.dispose();
        terrainGridMeshes.delete(chunk.key);
        labState.terrainGridChunks = terrainGridMeshes.size;
        labState.terrainGridMeshCount = Math.max(0, labState.terrainGridMeshCount
          - Number(Boolean(payload.terrainGrid.minorMesh)) - Number(Boolean(payload.terrainGrid.majorMesh)));
      }
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
      if (payload?.roadMarkingMesh) {
        payload.roadMarkingMesh.dispose();
        roadMarkingMeshes.delete(chunk.key);
      }
      if (payload?.roadCurbMeshes?.length) {
        for (const fenceMesh of payload.roadCurbMeshes) fenceMesh.dispose();
        roadCurbMeshes.delete(chunk.key);
      }
      if (payload?.roadFurnitureMesh) {
        payload.roadFurnitureMesh.dispose();
        roadFurnitureMeshes.delete(chunk.key);
      }
      if (payload?.roadFurnitureStats) {
        labState.bridgePiers = Math.max(0, labState.bridgePiers - payload.roadFurnitureStats.bridgePiers);
        labState.bridgeGirderSegments = Math.max(0, labState.bridgeGirderSegments - payload.roadFurnitureStats.bridgeGirderSegments);
      }
      if (payload?.tunnelGeometryStats) {
        labState.tunnelPortals = Math.max(0, labState.tunnelPortals - payload.tunnelGeometryStats.portalCount);
        labState.tunnelRibs = Math.max(0, labState.tunnelRibs - payload.tunnelGeometryStats.ribCount);
        labState.tunnelLights = Math.max(0, labState.tunnelLights - payload.tunnelGeometryStats.lightSegments);
      }
      const tunnelBody = tunnelBodies.get(chunk.key);
      if (tunnelBody) {
        tunnelBody.dispose();
        tunnelBodies.delete(chunk.key);
      }
      if (payload?.tunnelMesh) {
        payload.tunnelMesh.dispose();
        tunnelMeshes.delete(chunk.key);
      }
      if (payload?.hydrologyStats) {
        labState.riverSegments = Math.max(0, labState.riverSegments - payload.hydrologyStats.riverSegments);
        labState.lakeTriangles = Math.max(0, labState.lakeTriangles - payload.hydrologyStats.lakeTriangles);
      }
      if (payload?.waterMesh) {
        payload.waterMesh.dispose();
        waterMeshes.delete(chunk.key);
      }
      if (payload?.shoreMesh) {
        payload.shoreMesh.dispose();
        shoreMeshes.delete(chunk.key);
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

  return { camera, sun, neonGlow, roadMaterial, chunkManager, terrainMeshes, terrainGridMeshes, terrainBodies, biomeMeshes, rockBodies, roadSamples, roadStats, roadFurnitureStats, hydrologyStats, bridgeClassification, tunnels, tunnelStats, tunnelSpatialStats, tunnelMeshes, tunnelBodies, waterMeshes, shoreMeshes, roadMeshes, roadMarkingMeshes, roadCurbMeshes, roadFurnitureMeshes, roadBodies };
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
let terrainGridMeshes;
let terrainBodies;
let biomeMeshes;
let rockBodies;
let roadSamples;
let roadStats;
let roadMeshes;
let roadFurnitureMeshes;
let waterMeshes;
let shoreMeshes;
let roadBodies;
let tunnels;
let tunnelMeshes;
let tunnelBodies;
let tunnelProbeMesh = null;
let tunnelProbeStableFrames = 0;
let lastTunnelProbePosition = null;
let tunnelProbeRoadY = null;
let havokAttemptRunning = false;
let havokInstance = null;
let vehicle = null;
let lastVehicleChunkPosition = null;
let probeMesh = null;
let roadProbeMesh = null;
let roadProbeStableFrames = 0;
let lastRoadProbePosition = null;
let frameCounter = 0;
let lastProbeY = null;
let probeStableFrames = 0;
const dynamicMeshes = [];

function findStableRoadProbeSample(samples, excludedSample = null, minSeparation = 0) {
  let best = null;
  let bestScore = Infinity;
  for (let index = 0; index < samples.length; index += 1) {
    const previous = samples[(index - 1 + samples.length) % samples.length];
    const current = samples[index];
    if (Math.hypot(current.x, current.z) < 32) continue;
    if (excludedSample && Math.hypot(current.x-excludedSample.x,current.z-excludedSample.z) < minSeparation) continue;
    const next = samples[(index + 1) % samples.length];
    const distance = Math.hypot(next.x - previous.x, next.z - previous.z);
    const grade = Math.abs(next.y - previous.y) / Math.max(distance, 0.001);
    const score = grade + Math.abs(current.bank) * 0.45;
    if (score < bestScore) {
      bestScore = score;
      best = { sample: current, grade, index };
    }
  }
  return best;
}

function spawnDynamicBox(x, y, z) {
  if (!labState.physicsReady) return null;
  const box = MeshBuilder.CreateBox("runtime-test-crate", { size: 5 }, scene);
  box.position.set(x, y, z);
  const mat = new StandardMaterial("runtime-test-crate-material", scene);
  mat.diffuseColor = new Color3(0.025, 0.58, 0.9);
  mat.emissiveColor = new Color3(0.015, 0.24, 0.48);
  mat.metallic = 0.28;
  mat.roughness = 0.42;
  box.material = mat;
  const body = addPhysicalProbe(scene, box, 24, PhysicsShapeType.BOX, { restitution: 0.18 });
  dynamicMeshes.push({ mesh: box, body });
  return box;
}

async function enableHavokPhysics() {
  if (labState.physicsReady || !havokInstance) return;

  try {
    scene.enablePhysics(new Vector3(0, -9.81, 0), new HavokPlugin(true, havokInstance));
    // Babylon Engine deterministic lockstep advances this scene in bounded
    // 60 Hz simulation steps. Havok and VehicleController share the same step;
    // at most four catch-up steps can run for one rendered frame.
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
    for (const [key, mesh] of tunnelMeshes) {
      if (!tunnelBodies.has(key)) {
        const body = addPhysicalProbe(scene, mesh, 0, PhysicsShapeType.MESH, { friction: 0.92, restitution: 0.01 });
        tunnelBodies.set(key, body);
      }
    }

    const roadProbeTarget = findStableRoadProbeSample(roadSamples);
    if (!roadProbeTarget) throw new Error("Could not select a flat road segment for Havok contact test.");
    const vehicleSpawnTarget = findStableRoadProbeSample(roadSamples, roadProbeTarget.sample, 18);
    if (!vehicleSpawnTarget) throw new Error("Could not select a second flat road segment for the vehicle.");
    const vehicleSpawnDistance = Math.hypot(
      vehicleSpawnTarget.sample.x-roadProbeTarget.sample.x,
      vehicleSpawnTarget.sample.z-roadProbeTarget.sample.z
    );
    vehicle = await VehicleController.create(scene, { roadSamples, startSample: vehicleSpawnTarget.sample });
    visualEffects?.attachVehicle(vehicle);
    labState.vehicleSpawnX = Number(vehicleSpawnTarget.sample.x.toFixed(3));
    labState.vehicleSpawnZ = Number(vehicleSpawnTarget.sample.z.toFixed(3));
    labState.vehicleSpawnGrade = Number(vehicleSpawnTarget.grade.toFixed(5));
    labState.vehicleSpawnDistanceFromRoadProbe = Number(vehicleSpawnDistance.toFixed(2));
    chunkManager.update(vehicle.getPosition());
    lastVehicleChunkPosition = vehicle.getPosition();
    labState.vehicleReady = true;
    labState.vehicleWheelbase = vehicle.metrics.wheelbase;
    labState.vehicleTrack = vehicle.metrics.track;
    labState.vehicleWheelRadius = vehicle.metrics.wheelRadius;
    camera.target.copyFrom(vehicle.getCameraTarget());
    camera.radius = 24;
    camera.lowerRadiusLimit = 9;
    if (vehicleMeta) vehicleMeta.textContent = "Countach loaded · 4 independent suspensions · RWD";

    probeMesh = MeshBuilder.CreateBox("falling-physics-probe", { size: 3 }, scene);
    // Keep the terrain collision probe on the broad, flat garage apron and
    // away from the start/finish asphalt so it tests terrain contact rather
    // than rolling down the surrounding hills.
    probeMesh.position.set(0, 24, 40);
    const probeMaterial = new StandardMaterial("probe-material", scene);
    probeMaterial.diffuseColor = new Color3(0.96, 0.31, 0.12);
    probeMaterial.emissiveColor = new Color3(0.12, 0.025, 0.008);
    probeMaterial.metallic = 0.2;
    probeMaterial.roughness = 0.38;
    probeMesh.material = probeMaterial;
    addPhysicalProbe(scene, probeMesh, 18, PhysicsShapeType.BOX, { friction: 1.8, restitution: 0.01 });

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

    const vehiclePosition = vehicle.getPosition();
    let tunnelProbeTarget = null;
    for (const tunnel of tunnels) {
      for (const sample of tunnel.path) {
        const dx = sample.x - vehiclePosition.x;
        const dz = sample.z - vehiclePosition.z;
        const distanceSquared = dx * dx + dz * dz;
        if (!tunnelProbeTarget || distanceSquared < tunnelProbeTarget.distanceSquared) {
          tunnelProbeTarget = { sample, distanceSquared };
        }
      }
    }
    if (tunnelProbeTarget) {
      tunnelProbeRoadY = tunnelProbeTarget.sample.y;
      tunnelProbeMesh = MeshBuilder.CreateBox("tunnel-ceiling-collision-probe", { size: 1 }, scene);
      tunnelProbeMesh.position.set(
        tunnelProbeTarget.sample.x,
        tunnelProbeTarget.sample.y + 1.5,
        tunnelProbeTarget.sample.z
      );
      const tunnelProbeMaterial = new StandardMaterial("tunnel-probe-material", scene);
      tunnelProbeMaterial.diffuseColor = new Color3(0.76, 0.28, 0.92);
      tunnelProbeMaterial.emissiveColor = new Color3(0.12, 0.025, 0.18);
      tunnelProbeMaterial.metallic = 0.18;
      tunnelProbeMaterial.roughness = 0.46;
      tunnelProbeMesh.material = tunnelProbeMaterial;
      const tunnelProbeAggregate = addPhysicalProbe(
        scene, tunnelProbeMesh, 8, PhysicsShapeType.BOX, { friction: 1.6, restitution: 0.005 }
      );
      // Launch from inside the bore. If the arch collider is missing, the
      // test body will rise above the expected roof height instead of striking it.
      tunnelProbeAggregate.body.setLinearVelocity(new Vector3(0, 12, 0));
      labState.tunnelProbePeakY = tunnelProbeMesh.position.y;
    }

    for (let i = 0; i < 5; i += 1) {
      spawnDynamicBox(44 + (i % 2) * 6, 8 + i * 5.5, 32);
    }

    labState.physicsReady = true;
    labState.physicsMode = "havok-wasm";
    physicsMeta.textContent = "Physics: Havok · 4 raycast spring/damper suspensions";
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
    await enableHavokPhysics();
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


function wireVisualEffectsControls() {
  if (!visualEffects) return;
  const controls = fxPanel?.querySelectorAll("[data-effect]") ?? [];
  const initialEffects = visualEffects.getStatus();
  for (const input of controls) {
    if (Object.prototype.hasOwnProperty.call(initialEffects, input.dataset.effect)) input.checked = Boolean(initialEffects[input.dataset.effect]);
    input.addEventListener("change", () => visualEffects.setEnabled(input.dataset.effect, input.checked));
  }
  fxToggle?.addEventListener("click", () => {
    const open = fxPanel?.classList.toggle("open") ?? false;
    fxPanel?.setAttribute("aria-hidden", open ? "false" : "true");
    fxToggle?.setAttribute("aria-expanded", open ? "true" : "false");
  });
  window.addEventListener("keydown", (event) => {
    if (event.repeat) return;
    if (event.key === "F4") {
      event.preventDefault();
      const open = fxPanel?.classList.toggle("open") ?? false;
      fxPanel?.setAttribute("aria-hidden", open ? "false" : "true");
    }
    const key = event.key.toLowerCase();
    if (key === "l") {
      visualEffects.toggleHeadlightDeployment();
      const lamp = fxPanel?.querySelector('[data-effect="headlights"]');
      if (lamp) lamp.checked = visualEffects.headlightsDeployed;
    }
    if (key === "h") {
      visualEffects.toggleHeadlights();
      const beam = fxPanel?.querySelector('[data-effect="headlightLighting"]');
      if (beam) beam.checked = visualEffects.headlightsEnabled;
    }
  });
}

async function createRenderer() {
  try {
    if ("gpu" in navigator) {
      const webgpu = new WebGPUEngine(canvas, {
        antialias: true,
        adaptToDeviceRatio: true,
        powerPreference: "high-performance",
        deterministicLockstep: true,
        lockstepMaxSteps: 4,
        timeStep: 1 / 60
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
    stencil: true,
    deterministicLockstep: true,
    lockstepMaxSteps: 4,
    timeStep: 1 / 60
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
    // Resolve the road spline before the lighting controller is created. Both
    // the road renderer and the headlight probe then share the same sample array.
    roadSamples = Array.isArray(environment.roadSamples) ? environment.roadSamples : [];
    visualEffects = new LegacyVisualEffects(scene, engine, camera, environment.sun, {
      glowLayer: environment.neonGlow,
      roadSamples,
      roadMaterial: environment.roadMaterial
    });
    labState.legacyEffectsReady = visualEffects.ready;
    labState.legacyEffects = visualEffects.getStatus();
    wireVisualEffectsControls();
    chunkManager = environment.chunkManager;
    terrainMeshes = environment.terrainMeshes;
    terrainGridMeshes = environment.terrainGridMeshes;
    terrainBodies = environment.terrainBodies;
    biomeMeshes = environment.biomeMeshes;
    rockBodies = environment.rockBodies;
    roadStats = environment.roadStats;
    roadMeshes = environment.roadMeshes;
    roadMarkingMeshes = environment.roadMarkingMeshes;
    roadCurbMeshes = environment.roadCurbMeshes;
    roadFurnitureMeshes = environment.roadFurnitureMeshes;
    waterMeshes = environment.waterMeshes;
    shoreMeshes = environment.shoreMeshes;
    roadBodies = environment.roadBodies;
    tunnels = environment.tunnels;
    tunnelMeshes = environment.tunnelMeshes;
    tunnelBodies = environment.tunnelBodies;
    labState.tunnelCount = environment.tunnelStats.count;
    labState.tunnelLength = Number(environment.tunnelStats.totalLength.toFixed(1));
    labState.tunnelChunks = environment.tunnelStats.chunks;
    labState.tunnelMinCover = environment.tunnelStats.minCover === null
      ? null
      : Number(environment.tunnelStats.minCover.toFixed(2));
    labState.roadGuardrailSegments = environment.roadFurnitureStats.guardrailSegments;
    labState.roadDrainageSegments = environment.roadFurnitureStats.drainageSegments;
    labState.roadTransitionSegments = environment.roadFurnitureStats.transitionSegments;
    labState.roadLength = Number(roadStats.length.toFixed(1));
    labState.roadSampleCount = roadSamples.length;
    labState.riverCount = environment.hydrologyStats.riverCount;
    labState.lakeCount = environment.hydrologyStats.lakeCount;
    labState.bridgeCrossingCount = environment.bridgeClassification.crossings.length;
    labState.bridgeCandidateCount = environment.bridgeClassification.candidateCount;
    labState.unresolvedWaterCrossings = environment.bridgeClassification.unresolvedCount;
    labState.bridgeCrossings = environment.bridgeClassification.crossings;

    scene.onAfterRenderObservable.add(() => {
      visualEffects?.update(vehicle);
      if (visualEffects) labState.legacyEffects = visualEffects.getStatus();
      frameCounter += 1;
      if(vehicle){
        vehicle.syncVisuals();const t=vehicle.getTelemetry();
        labState.vehicleX=t.x;labState.vehicleY=t.y;labState.vehicleZ=t.z;labState.vehicleSpeedKmh=t.speedKmh;
        labState.vehicleBodyMass=t.bodyMass;labState.vehicleGravityFactor=t.gravityFactor;
        labState.vehiclePhysicsStep=t.physicsStep;labState.vehiclePhysicsSubStep=t.physicsSubStep;
        labState.vehicleEngineTimeStepMs=t.engineTimeStepMs;labState.vehicleDeterministicLockstep=t.deterministicLockstep;labState.vehicleLockstepMaxSteps=t.lockstepMaxSteps;
        labState.vehicleRoll=t.roll;labState.vehiclePitch=t.pitch;labState.vehicleYaw=t.yaw;labState.vehicleSteer=t.steer;
        labState.vehicleWheelContacts=t.wheelContactCount;
        labState.vehicleForwardSpeed=t.forwardSpeed;labState.vehicleLateralSpeed=t.lateralSpeed;
        labState.vehicleSlipAngle=t.slipAngle;labState.vehicleSlipAngleDegrees=t.slipAngleDegrees;
        labState.vehicleYawRate=t.yawRate;labState.vehicleUnwrappedYaw=t.unwrappedYaw;labState.vehicleYawTurns=t.yawTurns;
        labState.vehicleRearSlipAngle=t.rearSlipAngle;labState.vehicleRearSlipAngleDegrees=t.rearSlipAngleDegrees;
        labState.vehicleFrontGrip=t.frontGrip;labState.vehicleRearGrip=t.rearGrip;labState.vehicleRearHandbrakeGrip=t.rearHandbrakeGrip;labState.vehicleParked=t.parked;
        labState.vehicleDriveRequested=t.driveRequested;labState.vehicleTotalSpringLoad=t.totalSpringLoad;labState.vehicleRearLongitudinalForce=t.rearLongitudinalForce;labState.vehicleTotalLongitudinalForce=t.totalLongitudinalForce;
        labState.vehicleVelocityX=t.velocityX;labState.vehicleVelocityY=t.velocityY;labState.vehicleVelocityZ=t.velocityZ;
        labState.vehicleMaxSuspensionCompression=t.maxSuspensionCompression;labState.vehicleAverageSuspensionCompression=t.averageSuspensionCompression;
        labState.vehicleAppliedForceX=t.appliedDriveForceWorldX;labState.vehicleAppliedForceZ=t.appliedDriveForceWorldZ;
        labState.vehicleForwardX=t.bodyForwardX;labState.vehicleForwardZ=t.bodyForwardZ;labState.vehicleWheelDiagnostics=t.wheels;
        const roadContact=nearestRoadSurfaceInfo(t.x,t.z,roadSamples);
        labState.vehicleRoadSurfaceY=roadContact?Number(roadContact.y.toFixed(3)):null;
        labState.vehicleRoadDistance=roadContact?Number(roadContact.distance.toFixed(3)):null;
        labState.vehicleRoadBodyBottomClearance=roadContact?Number((t.y-.21-roadContact.y).toFixed(3)):null;
        labState.vehicleStableFrames=t.wheelContactCount===4?labState.vehicleStableFrames+1:0;
        camera.target.copyFrom(vehicle.getCameraTarget());
        if(vehicleMeta)vehicleMeta.textContent=`Countach · ${t.speedKmh.toFixed(0)} km/h · slip ${Math.abs(t.slipAngleDegrees).toFixed(1)}° · wheels ${t.wheelContactCount}/4 · roll ${(Math.abs(t.roll)*57.2958).toFixed(1)}°`;
      }
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
      if (tunnelProbeMesh) {
        const position = tunnelProbeMesh.position;
        labState.tunnelProbeY = Number(position.y.toFixed(3));
        labState.tunnelProbeYAtRoof = tunnelProbeRoadY === null
          ? null
          : Number((tunnelProbeRoadY + TUNNEL_CLEAR_HEIGHT).toFixed(3));
        labState.tunnelProbePeakY = Number(Math.max(
          labState.tunnelProbePeakY ?? -Infinity,
          position.y
        ).toFixed(3));
        if (lastTunnelProbePosition) {
          const movement = Math.hypot(
            position.x - lastTunnelProbePosition.x,
            position.y - lastTunnelProbePosition.y,
            position.z - lastTunnelProbePosition.z
          );
          tunnelProbeStableFrames = movement < 0.025 ? tunnelProbeStableFrames + 1 : 0;
        }
        lastTunnelProbePosition = { x: position.x, y: position.y, z: position.z };
        labState.tunnelProbeStableFrames = tunnelProbeStableFrames;
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
      
      if(frameCounter%6===0&&chunkManager&&camera){
        const player=vehicle?vehicle.getPosition():camera.target;
        if(!lastVehicleChunkPosition||Vector3.Distance(player,lastVehicleChunkPosition)>18){chunkManager.update(player);lastVehicleChunkPosition=player.clone();}
        const spatial=chunkManager.getStats();
        labState.spatial = spatial;
        const terrainLayers = [...new Set([...terrainMeshes.values()].map((mesh) => mesh.metadata.chunkY))].sort((a, b) => a - b);
        labState.roadChunks = roadMeshes.size;
        labState.roadFurnitureChunks = roadFurnitureMeshes.size;
        labState.waterChunks = waterMeshes.size;
        labState.shoreChunks = shoreMeshes.size;
        if (waterMeta) {
          waterMeta.textContent = `Water: ${labState.riverCount} rivers · ${labState.lakeCount} lakes · ${waterMeshes.size} chunks · ${labState.bridgeCandidateCount} spans · ${labState.bridgeGirderSegments} girders · ${labState.bridgePiers} piers`;
        }
        labState.tunnelMeshCount = tunnelMeshes.size;
        labState.tunnelBodyCount = tunnelBodies.size;
        if (tunnelMeta) {
          tunnelMeta.textContent = `Tunnels: ${labState.tunnelCount} bores · ${labState.tunnelLength} m · ${tunnelMeshes.size} chunks · ${labState.tunnelPortals} portals`;
        }
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
        labState.roadCurbChunks = roadCurbMeshes.size;
        labState.roadMarkingChunks = roadMarkingMeshes.size;
        worldMeta.textContent = `XYZ chunks: ${spatial.activeCount} · terrain: ${terrainMeshes.size} patches · Y layers ${terrainLayers.join("/") || "—"} · ${Object.values(spatial.axisCoverage).every(Boolean) ? "6/6 directions" : "coverage check pending"}`;
        roadMeta.textContent = `Road: ${roadMeshes.size} chunks · neon fence ${roadCurbMeshes.size} · white markings ${roadMarkingMeshes.size} · ${Math.round(roadStats.length)} m · transitions ${labState.roadTransitionSegments} · drains ${labState.roadDrainageSegments} · fenced drop zones ${labState.roadGuardrailSegments}`;
        biomeMeta.textContent = `Biomes: ${biomeTypes.slice(0, 4).join("/") || "preparing"} · ${biomeTotals.trees} trees · ${biomeTotals.rocks} rocks`;
      }
    });

    let fpsWindowStart = performance.now();
    let lastFrameStart = null;
    let fpsWindowFrames = 0;
    let frameIntervals = [];
    let renderCosts = [];
    engine.runRenderLoop(() => {
      const frameStart = performance.now();
      if (lastFrameStart !== null) frameIntervals.push(frameStart - lastFrameStart);
      lastFrameStart = frameStart;
      fpsWindowFrames += 1;
      const renderStart = performance.now();
      scene.render();
      renderCosts.push(performance.now() - renderStart);
      const elapsed = frameStart - fpsWindowStart;
      if (elapsed >= 1000) {
        const sortedIntervals = frameIntervals.slice().sort((a, b) => a - b);
        const averageFrameMs = frameIntervals.length
          ? frameIntervals.reduce((sum, value) => sum + value, 0) / frameIntervals.length
          : elapsed / Math.max(1, fpsWindowFrames);
        const p95FrameMs = sortedIntervals.length
          ? sortedIntervals[Math.min(sortedIntervals.length - 1, Math.ceil(sortedIntervals.length * 0.95) - 1)]
          : averageFrameMs;
        const averageRenderMs = renderCosts.length
          ? renderCosts.reduce((sum, value) => sum + value, 0) / renderCosts.length
          : 0;
        const measuredFps = frameIntervals.length * 1000 / elapsed;
        const babylonFps = engine.getFps();
        fpsMeta.textContent = `FPS ${measuredFps.toFixed(0)} (Babylon ${babylonFps.toFixed(0)}) · ${averageFrameMs.toFixed(1)} ms avg / ${p95FrameMs.toFixed(1)} p95 · CPU ${averageRenderMs.toFixed(1)} ms`;
        labState.frameMetrics = {
          measuredFps: Number(measuredFps.toFixed(1)),
          babylonFps: Number(babylonFps.toFixed(1)),
          averageFrameMs: Number(averageFrameMs.toFixed(2)),
          p95FrameMs: Number(p95FrameMs.toFixed(2)),
          averageRenderCpuMs: Number(averageRenderMs.toFixed(2))
        };
        fpsWindowStart = frameStart;
        fpsWindowFrames = 0;
        frameIntervals = [];
        renderCosts = [];
      }
    });
    window.addEventListener("resize", () => engine.resize());

    resetButton.addEventListener("click", () => {
      camera.alpha = -Math.PI * 0.72;
      camera.beta = Math.PI * 0.34;
      camera.radius = chunkManager.radius * 0.88;
      camera.target.copyFrom(vehicle?vehicle.getCameraTarget():new Vector3(0,5,0));
    });

    dropButton.addEventListener("click", () => {
      const target=vehicle?vehicle.getCameraTarget():camera.target;
      spawnDynamicBox(target.x-12,target.y+42,target.z-8);
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
