import { terrainHeight } from "./TerrainField.mjs";
import {
  MAIN_ROUTE_CONTROL_POINTS,
  ROAD_SAMPLE_SPACING,
  sampleClosedRoutePoints
} from "./WorldLayout.mjs";

export const ROAD_CHUNK_SIZE = 128;
export const ROAD_HALF_WIDTH = 6.2;
export const ROAD_SHOULDER_WIDTH = 2.4;
export const ROAD_SURFACE_OFFSET = 1.05;
export const ROAD_SHOULDER_OFFSET = 0.58;

const ROAD_COLORS = Object.freeze({
  asphalt: Object.freeze([0.11, 0.13, 0.16]),
  shoulder: Object.freeze([0.25, 0.29, 0.25]),
  edge: Object.freeze([0.72, 0.83, 0.84]),
  center: Object.freeze([0.08, 0.58, 0.78])
});

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function distance2D(a, b) {
  return Math.hypot(a.x - b.x, a.z - b.z);
}

function catmullRom(p0, p1, p2, p3, t) {
  const t2 = t * t;
  const t3 = t2 * t;
  return {
    x: 0.5 * (
      2 * p1[0] +
      (-p0[0] + p2[0]) * t +
      (2 * p0[0] - 5 * p1[0] + 4 * p2[0] - p3[0]) * t2 +
      (-p0[0] + 3 * p1[0] - 3 * p2[0] + p3[0]) * t3
    ),
    z: 0.5 * (
      2 * p1[1] +
      (-p0[1] + p2[1]) * t +
      (2 * p0[1] - 5 * p1[1] + 4 * p2[1] - p3[1]) * t2 +
      (-p0[1] + 3 * p1[1] - 3 * p2[1] + p3[1]) * t3
    )
  };
}

export function generateMainRoadSamples(
  controlPoints = MAIN_ROUTE_CONTROL_POINTS,
  sampleSpacing = ROAD_SAMPLE_SPACING
) {
  const raw = sampleClosedRoutePoints(controlPoints, sampleSpacing);
  const samples = [];
  const length = raw.length;
  for (let index = 0; index < length; index += 1) {
    const previous = raw[(index - 1 + length) % length];
    const current = raw[index];
    const next = raw[(index + 1) % length];
    const tangentX = next.x - previous.x;
    const tangentZ = next.z - previous.z;
    const tangentLength = Math.hypot(tangentX, tangentZ) || 1;
    const tx = tangentX / tangentLength;
    const tz = tangentZ / tangentLength;
    const normalX = -tz;
    const normalZ = tx;

    const incomingX = current.x - previous.x;
    const incomingZ = current.z - previous.z;
    const outgoingX = next.x - current.x;
    const outgoingZ = next.z - current.z;
    const incomingLength = Math.hypot(incomingX, incomingZ) || 1;
    const outgoingLength = Math.hypot(outgoingX, outgoingZ) || 1;
    const turn = (incomingX / incomingLength) * (outgoingZ / outgoingLength)
      - (incomingZ / incomingLength) * (outgoingX / outgoingLength);
    const bank = clamp(turn * 2.2, -0.16, 0.16);
    const centerY = terrainHeight(current.x, current.z) + ROAD_SURFACE_OFFSET;

    samples.push({
      x: current.x,
      z: current.z,
      y: centerY,
      tangentX: tx,
      tangentZ: tz,
      normalX,
      normalZ,
      bank
    });
  }
  return samples;
}

function offsetPoint(sample, offset, lift) {
  const x = sample.x + sample.normalX * offset;
  const z = sample.z + sample.normalZ * offset;
  const bankLift = sample.bank * (offset / ROAD_HALF_WIDTH);
  return {
    x,
    y: terrainHeight(x, z) + lift + bankLift,
    z
  };
}

function addQuad(geometry, chunkOrigin, a, b, c, d, color) {
  const base = geometry.positions.length / 3;
  for (const point of [a, b, c, d]) {
    geometry.positions.push(
      point.x - chunkOrigin.x,
      point.y - chunkOrigin.y,
      point.z - chunkOrigin.z
    );
    geometry.colors.push(color[0], color[1], color[2], 1);
  }
  geometry.indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
}

function createCrossSection(sample) {
  const half = ROAD_HALF_WIDTH;
  const outer = ROAD_HALF_WIDTH + ROAD_SHOULDER_WIDTH;
  return {
    leftOuter: offsetPoint(sample, outer, ROAD_SHOULDER_OFFSET),
    leftEdge: offsetPoint(sample, half, ROAD_SURFACE_OFFSET),
    center: {
      x: sample.x,
      y: terrainHeight(sample.x, sample.z) + ROAD_SURFACE_OFFSET,
      z: sample.z
    },
    rightEdge: offsetPoint(sample, -half, ROAD_SURFACE_OFFSET),
    rightOuter: offsetPoint(sample, -outer, ROAD_SHOULDER_OFFSET),
    leftMarking: offsetPoint(sample, half - 0.55, ROAD_SURFACE_OFFSET + 0.1),
    rightMarking: offsetPoint(sample, -half + 0.55, ROAD_SURFACE_OFFSET + 0.1),
    centerMarking: offsetPoint(sample, 0, ROAD_SURFACE_OFFSET + 0.14),
    centerDashLeft: offsetPoint(sample, -0.11, ROAD_SURFACE_OFFSET + 0.15),
    centerDashRight: offsetPoint(sample, 0.11, ROAD_SURFACE_OFFSET + 0.15)
  };
}

function chunkIndex(value, size) {
  return Math.floor((value + size * 0.5) / size);
}

export function buildRoadChunkGeometry(samples, chunkX, chunkY, chunkZ, chunkSize = ROAD_CHUNK_SIZE) {
  if (!Array.isArray(samples) || samples.length < 8) {
    throw new TypeError("Road chunk generation requires a closed sample path.");
  }
  if (![chunkX, chunkY, chunkZ].every(Number.isInteger)) {
    throw new TypeError("Road chunk coordinates must be integers.");
  }
  if (!Number.isFinite(chunkSize) || chunkSize <= 0) {
    throw new RangeError("Road chunk size must be a positive finite number.");
  }

  const geometry = { positions: [], colors: [], indices: [], segmentCount: 0 };
  const origin = {
    x: chunkX * chunkSize,
    y: chunkY * chunkSize,
    z: chunkZ * chunkSize
  };
  const sections = samples.map(createCrossSection);
  const count = samples.length;

  for (let index = 0; index < count; index += 1) {
    const nextIndex = (index + 1) % count;
    const a = samples[index];
    const b = samples[nextIndex];
    const midpointX = (a.x + b.x) * 0.5;
    const midpointZ = (a.z + b.z) * 0.5;
    if (chunkIndex(midpointX, chunkSize) !== chunkX || chunkIndex(midpointZ, chunkSize) !== chunkZ) {
      continue;
    }

    const current = sections[index];
    const next = sections[nextIndex];

    addQuad(geometry, origin, current.leftOuter, current.leftEdge, next.leftEdge, next.leftOuter, ROAD_COLORS.shoulder);
    addQuad(geometry, origin, current.leftEdge, current.center, next.center, next.leftEdge, ROAD_COLORS.asphalt);
    addQuad(geometry, origin, current.center, current.rightEdge, next.rightEdge, next.center, ROAD_COLORS.asphalt);
    addQuad(geometry, origin, current.rightEdge, current.rightOuter, next.rightOuter, next.rightEdge, ROAD_COLORS.shoulder);

    // Continuous pale edge lines.
    addQuad(
      geometry, origin,
      current.leftMarking, offsetPoint(a, ROAD_HALF_WIDTH - 0.35, ROAD_SURFACE_OFFSET + 0.1),
      offsetPoint(b, ROAD_HALF_WIDTH - 0.35, ROAD_SURFACE_OFFSET + 0.1), next.leftMarking,
      ROAD_COLORS.edge
    );
    addQuad(
      geometry, origin,
      offsetPoint(a, -ROAD_HALF_WIDTH + 0.35, ROAD_SURFACE_OFFSET + 0.1), current.rightMarking,
      next.rightMarking, offsetPoint(b, -ROAD_HALF_WIDTH + 0.35, ROAD_SURFACE_OFFSET + 0.1),
      ROAD_COLORS.edge
    );

    // A synth-cyan broken centre line provides an unmistakable racing route.
    if (Math.floor(index / 7) % 3 !== 2) {
      addQuad(
        geometry, origin,
        current.centerDashLeft, current.centerDashRight,
        next.centerDashRight, next.centerDashLeft,
        ROAD_COLORS.center
      );
    }
    geometry.segmentCount += 1;
  }

  return geometry;
}

export function nearestRoadSurfaceHeight(x, z, samples) {
  if (!Number.isFinite(x) || !Number.isFinite(z) || !Array.isArray(samples) || !samples.length) {
    return null;
  }
  let nearest = null;
  let nearestDistance = Infinity;
  for (const sample of samples) {
    const dx = sample.x - x;
    const dz = sample.z - z;
    const distance = dx * dx + dz * dz;
    if (distance < nearestDistance) {
      nearestDistance = distance;
      nearest = sample;
    }
  }
  return nearest ? nearest.y : null;
}

export function getRoadStats(samples, chunkSize = ROAD_CHUNK_SIZE) {
  if (!Array.isArray(samples) || samples.length < 2) {
    return { sampleCount: 0, length: 0, maxGrade: 0, chunkKeys: [] };
  }
  let length = 0;
  let maxGrade = 0;
  const chunkKeys = new Set();
  for (let index = 0; index < samples.length; index += 1) {
    const current = samples[index];
    const next = samples[(index + 1) % samples.length];
    const distance = distance2D(current, next);
    const grade = Math.abs(next.y - current.y) / Math.max(distance, 0.001);
    length += distance;
    maxGrade = Math.max(maxGrade, grade);
    const midX = (current.x + next.x) * 0.5;
    const midZ = (current.z + next.z) * 0.5;
    chunkKeys.add(`${chunkIndex(midX, chunkSize)}:${chunkIndex(midZ, chunkSize)}`);
  }
  return {
    sampleCount: samples.length,
    length,
    maxGrade,
    chunkKeys: [...chunkKeys].sort()
  };
}
