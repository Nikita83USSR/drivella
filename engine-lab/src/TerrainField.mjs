import { applyHydrologyCarve, getNearestWaterFeature } from "./HydrologyField.mjs";
import {
  MAIN_ROUTE_CONTROL_POINTS,
  ROAD_PROFILE_BLEND_RADIUS,
  ROAD_PROFILE_CORE_RADIUS,
  ROAD_PROFILE_MAX_GRADE,
  ROAD_SAMPLE_SPACING,
  nearestMainRouteSegment,
  sampleClosedRoutePoints
} from "./WorldLayout.mjs";

function hashGrid(x, z) {
  let hash = Math.imul(x | 0, 0x45d9f3b);
  hash = Math.imul(hash ^ (hash >>> 16), 0x45d9f3b);
  hash ^= Math.imul(z | 0, 0x119de1f3);
  hash = Math.imul(hash ^ (hash >>> 16), 0x45d9f3b);
  return ((hash ^ (hash >>> 16)) >>> 0) / 4294967295;
}

function smooth01(value) {
  return value * value * (3 - 2 * value);
}

function lerp(a, b, amount) {
  return a + (b - a) * amount;
}

function valueNoise(x, z) {
  const x0 = Math.floor(x);
  const z0 = Math.floor(z);
  const tx = smooth01(x - x0);
  const tz = smooth01(z - z0);
  const a = hashGrid(x0, z0);
  const b = hashGrid(x0 + 1, z0);
  const c = hashGrid(x0, z0 + 1);
  const d = hashGrid(x0 + 1, z0 + 1);
  return lerp(lerp(a, b, tx), lerp(c, d, tx), tz);
}

function fbm(x, z, octaves = 5) {
  let sum = 0;
  let amplitude = 0.5;
  let frequency = 1;
  let weight = 0;
  for (let octave = 0; octave < octaves; octave += 1) {
    sum += valueNoise(x * frequency, z * frequency) * amplitude;
    weight += amplitude;
    frequency *= 2.03;
    amplitude *= 0.5;
  }
  return sum / weight;
}

export function rawTerrainHeight(x, z) {
  if (!Number.isFinite(x) || !Number.isFinite(z)) {
    throw new TypeError("terrainHeight expects finite world coordinates.");
  }

  const distance = Math.hypot(x, z);
  const reliefMask = Math.max(0, Math.min(1, (distance - 48) / 96));
  if (reliefMask === 0) return 0;

  const warpX = (fbm(x * 0.0017 + 41.7, z * 0.0017 - 8.3, 4) - 0.5) * 72;
  const warpZ = (fbm(x * 0.0017 - 17.2, z * 0.0017 + 63.1, 4) - 0.5) * 72;
  const worldX = x + warpX;
  const worldZ = z + warpZ;

  const macroTilt = worldX * 0.4;
  const continental = (fbm(worldX * 0.0022, worldZ * 0.0022, 5) - 0.5) * 34;
  const ridgeNoise = fbm(worldX * 0.0062 + 14, worldZ * 0.0062 - 9, 5);
  const ridged = (1 - Math.abs(ridgeNoise * 2 - 1) - 0.42) * 64;
  const detail = (fbm(worldX * 0.018, worldZ * 0.018, 4) - 0.5) * 13;

  const valleyAxis = Math.sin(worldX * 0.0022) * 165;
  const valleyDistance = (worldZ - valleyAxis) / 52;
  const valley = -32 * Math.exp(-(valleyDistance * valleyDistance));

  const baseHeight = reliefMask * (macroTilt + continental + ridged + detail + valley);
  return applyHydrologyCarve(x, z, baseHeight);
}


let roadElevationProfile = null;

const TUNNEL_CORRIDOR_CELL_SIZE = 32;
const TUNNEL_CORRIDOR_RADIUS = 11.4;
let tunnelCorridorBuckets = new Map();
let tunnelCorridorCount = 0;

function tunnelCellKey(x, z) {
  return `${Math.floor(x / TUNNEL_CORRIDOR_CELL_SIZE)}:${Math.floor(z / TUNNEL_CORRIDOR_CELL_SIZE)}`;
}

export function registerTunnelCorridors(tunnels) {
  if (!Array.isArray(tunnels)) throw new TypeError("Tunnel corridor registration requires an array.");
  const buckets = new Map();
  let segmentCount = 0;

  for (const tunnel of tunnels) {
    if (!Array.isArray(tunnel.path) || tunnel.path.length < 2) continue;
    for (let index = 0; index < tunnel.path.length - 1; index += 1) {
      const a = tunnel.path[index];
      const b = tunnel.path[index + 1];
      const segment = { a, b };
      const minCellX = Math.floor((Math.min(a.x, b.x) - TUNNEL_CORRIDOR_RADIUS) / TUNNEL_CORRIDOR_CELL_SIZE);
      const maxCellX = Math.floor((Math.max(a.x, b.x) + TUNNEL_CORRIDOR_RADIUS) / TUNNEL_CORRIDOR_CELL_SIZE);
      const minCellZ = Math.floor((Math.min(a.z, b.z) - TUNNEL_CORRIDOR_RADIUS) / TUNNEL_CORRIDOR_CELL_SIZE);
      const maxCellZ = Math.floor((Math.max(a.z, b.z) + TUNNEL_CORRIDOR_RADIUS) / TUNNEL_CORRIDOR_CELL_SIZE);
      for (let cellX = minCellX; cellX <= maxCellX; cellX += 1) {
        for (let cellZ = minCellZ; cellZ <= maxCellZ; cellZ += 1) {
          const key = `${cellX}:${cellZ}`;
          if (!buckets.has(key)) buckets.set(key, []);
          buckets.get(key).push(segment);
        }
      }
      segmentCount += 1;
    }
  }

  tunnelCorridorBuckets = buckets;
  tunnelCorridorCount = segmentCount;
  return { tunnelCount: tunnels.length, segmentCount, cellCount: buckets.size };
}

export function isInsideTunnelCorridor(x, z, radius = TUNNEL_CORRIDOR_RADIUS) {
  if (!Number.isFinite(x) || !Number.isFinite(z) || !Number.isFinite(radius) || radius < 0) {
    throw new TypeError("Tunnel corridor query requires finite coordinates and a non-negative radius.");
  }
  if (!tunnelCorridorCount) return false;
  const segments = tunnelCorridorBuckets.get(tunnelCellKey(x, z));
  if (!segments) return false;

  for (const segment of segments) {
    const dx = segment.b.x - segment.a.x;
    const dz = segment.b.z - segment.a.z;
    const lengthSquared = dx * dx + dz * dz || 1;
    const t = Math.max(0, Math.min(1, ((x - segment.a.x) * dx + (z - segment.a.z) * dz) / lengthSquared));
    const nearestX = segment.a.x + dx * t;
    const nearestZ = segment.a.z + dz * t;
    if (Math.hypot(x - nearestX, z - nearestZ) <= radius) return true;
  }
  return false;
}

function getRoadElevationProfile() {
  if (roadElevationProfile) return roadElevationProfile;

  const route = sampleClosedRoutePoints(MAIN_ROUTE_CONTROL_POINTS, ROAD_SAMPLE_SPACING);
  const heights = route.map((point) => rawTerrainHeight(point.x, point.z));
  const edgeLengths = route.map((point, index) => {
    const next = route[(index + 1) % route.length];
    return Math.hypot(next.x - point.x, next.z - point.z);
  });
  const maxGrade = ROAD_PROFILE_MAX_GRADE;
  const anchorHeight = heights[0];
  const cumulative = new Array(route.length).fill(0);
  for (let index = 1; index < route.length; index += 1) {
    cumulative[index] = cumulative[index - 1] + edgeLengths[index - 1];
  }
  const totalLength = cumulative[cumulative.length - 1] + edgeLengths[edgeLengths.length - 1];

  // Construct two globally grade-limited envelopes on the closed loop:
  // the greatest permissible profile below raw terrain and the least
  // permissible profile above it. Their midpoint is also grade-limited.
  const projected = new Array(route.length);
  for (let index = 0; index < route.length; index += 1) {
    let lowerEnvelope = Infinity;
    let upperEnvelope = -Infinity;
    for (let source = 0; source < route.length; source += 1) {
      const along = Math.abs(cumulative[index] - cumulative[source]);
      const loopDistance = Math.min(along, totalLength - along);
      const allowance = maxGrade * loopDistance;
      lowerEnvelope = Math.min(lowerEnvelope, heights[source] + allowance);
      upperEnvelope = Math.max(upperEnvelope, heights[source] - allowance);
    }
    projected[index] = (lowerEnvelope + upperEnvelope) * 0.5;
  }

  // Preserve the actual start/finish elevation while keeping the profile shape.
  const anchorOffset = anchorHeight - projected[0];
  for (let index = 0; index < projected.length; index += 1) {
    heights[index] = projected[index] + anchorOffset;
  }

  // Where a river/lake crosses the route, create a raised road deck with
  // grade-limited approaches. The propagated floor is a 20%-Lipschitz envelope;
  // taking its maximum with the existing profile preserves the grade bound.
  const roadHalfWidth = 6.2;
  const roadSurfaceOffset = 1.05;
  const requiredDeckClearance = 4.0;
  const waterFloorConstraints = [];
  for (let index = 0; index < route.length; index += 1) {
    const point = route[index];
    const water = getNearestWaterFeature(point.x, point.z, roadHalfWidth + 9);
    if (!water) continue;
    const crossingReach = water.kind === "river"
      ? roadHalfWidth + water.halfWidth + 2.4
      : roadHalfWidth + 3.2;
    if (water.distance > crossingReach) continue;
    waterFloorConstraints.push({
      index,
      floor: water.waterY + requiredDeckClearance - roadSurfaceOffset
    });
  }

  if (waterFloorConstraints.length) {
    for (let index = 0; index < route.length; index += 1) {
      let raisedFloor = -Infinity;
      for (const constraint of waterFloorConstraints) {
        const along = Math.abs(cumulative[index] - cumulative[constraint.index]);
        const loopDistance = Math.min(along, totalLength - along);
        raisedFloor = Math.max(
          raisedFloor,
          constraint.floor - maxGrade * loopDistance
        );
      }
      heights[index] = Math.max(heights[index], raisedFloor);
    }
  }

  roadElevationProfile = Object.freeze({
    route,
    heights: Object.freeze(heights.slice()),
    edgeLengths: Object.freeze(edgeLengths),
    maxGrade
  });
  return roadElevationProfile;
}

export function getMainRoadElevationStats() {
  const profile = getRoadElevationProfile();
  let maxGrade = 0;
  let minHeight = Infinity;
  let maxHeight = -Infinity;
  for (let index = 0; index < profile.heights.length; index += 1) {
    const nextIndex = (index + 1) % profile.heights.length;
    const distance = Math.max(profile.edgeLengths[index], 0.001);
    const grade = Math.abs(profile.heights[nextIndex] - profile.heights[index]) / distance;
    maxGrade = Math.max(maxGrade, grade);
    minHeight = Math.min(minHeight, profile.heights[index]);
    maxHeight = Math.max(maxHeight, profile.heights[index]);
  }
  return { maxGrade, minHeight, maxHeight, sampleCount: profile.heights.length };
}

function roadProfileHeightAtNearest(nearest) {
  const profile = getRoadElevationProfile();
  const nextIndex = (nearest.index + 1) % profile.heights.length;
  return profile.heights[nearest.index]
    + (profile.heights[nextIndex] - profile.heights[nearest.index]) * nearest.t;
}

export function roadProfileHeightAt(x, z) {
  if (!Number.isFinite(x) || !Number.isFinite(z)) {
    throw new TypeError("roadProfileHeightAt expects finite world coordinates.");
  }
  const nearest = nearestMainRouteSegment(x, z);
  return nearest ? roadProfileHeightAtNearest(nearest) : rawTerrainHeight(x, z);
}

export function terrainHeight(x, z) {
  if (!Number.isFinite(x) || !Number.isFinite(z)) {
    throw new TypeError("terrainHeight expects finite world coordinates.");
  }

  const rawHeight = rawTerrainHeight(x, z);
  const nearest = nearestMainRouteSegment(x, z);
  if (!nearest || nearest.distance >= ROAD_PROFILE_BLEND_RADIUS) return rawHeight;

  // Keep river/lake channels open beneath raised road decks. The road surface
  // uses roadProfileHeightAt; the terrain itself is not replaced by an earth
  // embankment inside a water crossing corridor.
  // Tunnel interiors retain the uncut mountain surface as their roof. The
  // tunnel liner is built separately below it, while the ordinary road
  // earthwork corridor is deliberately not flattened through this segment.
  if (isInsideTunnelCorridor(x, z)) return rawHeight;

  const water = getNearestWaterFeature(x, z, ROAD_PROFILE_BLEND_RADIUS + 0.2);
  if (water) {
    const crossingReach = water.kind === "river"
      ? 6.2 + water.halfWidth + 2.4
      : 6.2 + 3.2;
    if (water.distance <= crossingReach) return rawHeight;
  }

  const routeHeight = roadProfileHeightAtNearest(nearest);
  if (nearest.distance <= ROAD_PROFILE_CORE_RADIUS) return routeHeight;
  const blendT = (nearest.distance - ROAD_PROFILE_CORE_RADIUS)
    / (ROAD_PROFILE_BLEND_RADIUS - ROAD_PROFILE_CORE_RADIUS);
  const smoothBlend = blendT * blendT * (3 - 2 * blendT);
  const weight = 1 - smoothBlend;
  return rawHeight + (routeHeight - rawHeight) * weight;
}

export function terrainChunkLayer(chunkX, chunkZ, chunkSize = 128) {
  if (!Number.isInteger(chunkX) || !Number.isInteger(chunkZ)) {
    throw new TypeError("Terrain chunk coordinates must be integers.");
  }
  if (!Number.isFinite(chunkSize) || chunkSize <= 0) {
    throw new RangeError("chunkSize must be a positive finite number.");
  }

  const half = chunkSize * 0.5;
  let heightSum = 0;
  let sampleCount = 0;
  for (let iz = 0; iz <= 4; iz += 1) {
    const worldZ = chunkZ * chunkSize - half + (iz * chunkSize) / 4;
    for (let ix = 0; ix <= 4; ix += 1) {
      const worldX = chunkX * chunkSize - half + (ix * chunkSize) / 4;
      heightSum += terrainHeight(worldX, worldZ);
      sampleCount += 1;
    }
  }

  const averageHeight = heightSum / sampleCount;
  return Math.floor((averageHeight + half) / chunkSize);
}

export function terrainChunkHeightRange(chunkX, chunkZ, chunkSize = 128) {
  if (!Number.isInteger(chunkX) || !Number.isInteger(chunkZ)) {
    throw new TypeError("Terrain chunk coordinates must be integers.");
  }
  const half = chunkSize * 0.5;
  let min = Infinity;
  let max = -Infinity;
  for (let iz = 0; iz <= 8; iz += 1) {
    const worldZ = chunkZ * chunkSize - half + (iz * chunkSize) / 8;
    for (let ix = 0; ix <= 8; ix += 1) {
      const worldX = chunkX * chunkSize - half + (ix * chunkSize) / 8;
      const height = terrainHeight(worldX, worldZ);
      min = Math.min(min, height);
      max = Math.max(max, height);
    }
  }
  return { min, max };
}
export function terrainSlope(x, z) {
  const gradientX = (terrainHeight(x + 2, z) - terrainHeight(x - 2, z)) * 0.25;
  const gradientZ = (terrainHeight(x, z + 2) - terrainHeight(x, z - 2)) * 0.25;
  return Math.hypot(gradientX, gradientZ);
}

export function terrainMoisture(x, z) {
  if (!Number.isFinite(x) || !Number.isFinite(z)) {
    throw new TypeError("terrainMoisture expects finite world coordinates.");
  }
  return fbm(x * 0.0032 + 125.4, z * 0.0032 - 82.1, 5);
}
