import { roadProfileHeightAt, terrainHeight } from "./TerrainField.mjs";
import { getNearestWaterFeature } from "./HydrologyField.mjs";
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
    const centerY = roadProfileHeightAt(current.x, current.z) + ROAD_SURFACE_OFFSET;

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
    y: sample.y - ROAD_SURFACE_OFFSET + lift + bankLift,
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
      y: sample.y,
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

export function nearestRoadSurfaceInfo(x, z, samples) {
  if (!Number.isFinite(x) || !Number.isFinite(z) || !Array.isArray(samples) || !samples.length) {
    return null;
  }
  let nearest = null;
  let nearestDistanceSquared = Infinity;
  for (const sample of samples) {
    const dx = sample.x - x;
    const dz = sample.z - z;
    const distanceSquared = dx * dx + dz * dz;
    if (distanceSquared < nearestDistanceSquared) {
      nearestDistanceSquared = distanceSquared;
      nearest = sample;
    }
  }
  return nearest
    ? { y: nearest.y, distance: Math.sqrt(nearestDistanceSquared), sample: nearest }
    : null;
}

export function nearestRoadSurfaceHeight(x, z, samples) {
  return nearestRoadSurfaceInfo(x, z, samples)?.y ?? null;
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


export const ROAD_EDGE_TRANSITION_THRESHOLD = 0.85;
export const ROAD_GUARDRAIL_DROP_THRESHOLD = 2.0;
export const ROAD_DRAINAGE_RISE_THRESHOLD = 1.45;

const ROAD_EDGE_OUTER_OFFSET = ROAD_HALF_WIDTH + ROAD_SHOULDER_WIDTH;
const ROAD_EDGE_SAMPLE_OFFSET = 17.0;
const ROAD_TRANSITION_OFFSETS = Object.freeze([8.6, 9.5, 10.4, 11.3, 12.2, 13.2, 14.6]);
const ROAD_TRANSITION_LIFTS = Object.freeze([0.58, 0.42, 0.26, 0.12, 0.03, 0.03, 0.03]);

const ROAD_FURNITURE_COLORS = Object.freeze({
  cut: Object.freeze([
    [0.34, 0.36, 0.34],
    [0.32, 0.34, 0.32],
    [0.29, 0.31, 0.30],
    [0.27, 0.29, 0.28],
    [0.26, 0.28, 0.27],
    [0.25, 0.28, 0.26]
  ]),
  fill: Object.freeze([
    [0.39, 0.34, 0.27],
    [0.37, 0.32, 0.25],
    [0.35, 0.30, 0.23],
    [0.33, 0.29, 0.23],
    [0.31, 0.29, 0.24],
    [0.29, 0.29, 0.25]
  ]),
  drainBank: Object.freeze([0.24, 0.28, 0.27]),
  drainBed: Object.freeze([0.105, 0.145, 0.15]),
  rail: Object.freeze([0.43, 0.52, 0.55]),
  railPost: Object.freeze([0.30, 0.37, 0.39]),
  bridgeConcrete: Object.freeze([0.35, 0.38, 0.39])
});

function sideProfile(sample, side) {
  const edge = offsetPoint(sample, side * ROAD_EDGE_OUTER_OFFSET, ROAD_SHOULDER_OFFSET);
  const farX = sample.x + sample.normalX * side * ROAD_EDGE_SAMPLE_OFFSET;
  const farZ = sample.z + sample.normalZ * side * ROAD_EDGE_SAMPLE_OFFSET;
  const far = { x: farX, y: terrainHeight(farX, farZ), z: farZ };
  return {
    edge,
    far,
    delta: far.y - edge.y
  };
}

const roadFurnitureProfileCache = new WeakMap();

function getRoadFurnitureProfiles(samples) {
  const cached = roadFurnitureProfileCache.get(samples);
  if (cached) return cached;
  const profiles = samples.map((sample) => ({
    left: sideProfile(sample, 1),
    right: sideProfile(sample, -1)
  }));
  roadFurnitureProfileCache.set(samples, profiles);
  return profiles;
}

function addBoxFace(geometry, origin, points, color) {
  addQuad(geometry, origin, points[0], points[1], points[2], points[3], color);
}

function addRailBeam(geometry, origin, a, b, halfThickness, halfHeight, color) {
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  const length = Math.hypot(dx, dz);
  if (length < 0.001) return;
  const nx = -dz / length;
  const nz = dx / length;
  const make = (point, side, vertical) => ({
    x: point.x + nx * side * halfThickness,
    y: point.y + vertical * halfHeight,
    z: point.z + nz * side * halfThickness
  });
  const aLeftBottom = make(a, -1, -1);
  const aRightBottom = make(a, 1, -1);
  const aRightTop = make(a, 1, 1);
  const aLeftTop = make(a, -1, 1);
  const bLeftBottom = make(b, -1, -1);
  const bRightBottom = make(b, 1, -1);
  const bRightTop = make(b, 1, 1);
  const bLeftTop = make(b, -1, 1);
  addBoxFace(geometry, origin, [aLeftBottom, bLeftBottom, bRightBottom, aRightBottom], color);
  addBoxFace(geometry, origin, [aLeftTop, aRightTop, bRightTop, bLeftTop], color);
  addBoxFace(geometry, origin, [aLeftBottom, aLeftTop, bLeftTop, bLeftBottom], color);
  addBoxFace(geometry, origin, [aRightBottom, bRightBottom, bRightTop, aRightTop], color);
  addBoxFace(geometry, origin, [aLeftBottom, aRightBottom, aRightTop, aLeftTop], color);
  addBoxFace(geometry, origin, [bLeftBottom, bLeftTop, bRightTop, bRightBottom], color);
}

function addBridgePier(geometry, origin, x, z, bottomY, topY, bottomRadius = 0.82, topRadius = 0.62) {
  if (![x, z, bottomY, topY].every(Number.isFinite) || topY - bottomY < 0.5) return;
  const sides = 8;
  const bottom = [];
  const top = [];
  for (let side = 0; side < sides; side += 1) {
    const angle = (side / sides) * Math.PI * 2;
    const cosine = Math.cos(angle);
    const sine = Math.sin(angle);
    bottom.push({ x: x + cosine * bottomRadius, y: bottomY, z: z + sine * bottomRadius });
    top.push({ x: x + cosine * topRadius, y: topY, z: z + sine * topRadius });
  }
  for (let side = 0; side < sides; side += 1) {
    const next = (side + 1) % sides;
    addQuad(
      geometry, origin,
      bottom[side], bottom[next], top[next], top[side],
      ROAD_FURNITURE_COLORS.bridgeConcrete
    );
  }
}

function addGuardrailPost(geometry, origin, point, bottom, top, radius, color) {
  const x0 = point.x - radius;
  const x1 = point.x + radius;
  const z0 = point.z - radius;
  const z1 = point.z + radius;
  const b0 = { x: x0, y: bottom, z: z0 };
  const b1 = { x: x1, y: bottom, z: z0 };
  const b2 = { x: x1, y: bottom, z: z1 };
  const b3 = { x: x0, y: bottom, z: z1 };
  const t0 = { x: x0, y: top, z: z0 };
  const t1 = { x: x1, y: top, z: z0 };
  const t2 = { x: x1, y: top, z: z1 };
  const t3 = { x: x0, y: top, z: z1 };
  addBoxFace(geometry, origin, [b0, b1, t1, t0], color);
  addBoxFace(geometry, origin, [b1, b2, t2, t1], color);
  addBoxFace(geometry, origin, [b2, b3, t3, t2], color);
  addBoxFace(geometry, origin, [b3, b0, t0, t3], color);
  addBoxFace(geometry, origin, [t0, t1, t2, t3], color);
  addBoxFace(geometry, origin, [b3, b2, b1, b0], color);
}

function terrainPointAtOffset(sample, side, offset, lift = 0.03) {
  const x = sample.x + sample.normalX * side * offset;
  const z = sample.z + sample.normalZ * side * offset;
  const bankTaper = clamp(
    (ROAD_TRANSITION_OFFSETS[ROAD_TRANSITION_OFFSETS.length - 1] - offset)
      / (ROAD_TRANSITION_OFFSETS[ROAD_TRANSITION_OFFSETS.length - 1] - ROAD_EDGE_OUTER_OFFSET),
    0,
    1
  );
  const bankLift = sample.bank * (offset / ROAD_HALF_WIDTH) * bankTaper;
  return { x, y: terrainHeight(x, z) + lift + bankLift, z };
}

function isChunkSegment(a, b, chunkX, chunkZ, chunkSize) {
  const midpointX = (a.x + b.x) * 0.5;
  const midpointZ = (a.z + b.z) * 0.5;
  return chunkIndex(midpointX, chunkSize) === chunkX
    && chunkIndex(midpointZ, chunkSize) === chunkZ;
}

/**
 * Build non-roadside geometry for one streamed road chunk. The terrain itself
 * remains the continuous ground surface; these meshes only dress measurable
 * cut/fill transitions, upper-side drainage and genuinely exposed drop-offs.
 */
export function buildRoadFurnitureChunkGeometry(
  samples,
  chunkX,
  chunkY,
  chunkZ,
  chunkSize = ROAD_CHUNK_SIZE
) {
  if (!Array.isArray(samples) || samples.length < 8) {
    throw new TypeError("Road furniture generation requires a closed sample path.");
  }
  if (![chunkX, chunkY, chunkZ].every(Number.isInteger)) {
    throw new TypeError("Road furniture chunk coordinates must be integers.");
  }
  if (!Number.isFinite(chunkSize) || chunkSize <= 0) {
    throw new RangeError("Road furniture chunk size must be a positive finite number.");
  }

  const geometry = {
    positions: [],
    colors: [],
    indices: [],
    transitionSegments: 0,
    drainageSegments: 0,
    guardrailSegments: 0,
    guardrailPosts: 0,
    bridgePiers: 0
  };
  const origin = {
    x: chunkX * chunkSize,
    y: chunkY * chunkSize,
    z: chunkZ * chunkSize
  };
  const profiles = getRoadFurnitureProfiles(samples);

  for (let index = 0; index < samples.length; index += 1) {
    const nextIndex = (index + 1) % samples.length;
    const a = samples[index];
    const b = samples[nextIndex];
    if (!isChunkSegment(a, b, chunkX, chunkZ, chunkSize)) continue;

    if (index % 4 === 0) {
      const bridgeWater = getNearestWaterFeature(a.x, a.z, ROAD_HALF_WIDTH + 9);
      if (bridgeWater) {
        const crossingReach = bridgeWater.kind === "river"
          ? ROAD_HALF_WIDTH + bridgeWater.halfWidth + 2.4
          : ROAD_HALF_WIDTH + 3.2;
        if (
          bridgeWater.distance <= crossingReach
          && a.y - bridgeWater.waterY >= 3.95
        ) {
          for (const lateralOffset of [-3.25, 3.25]) {
            const support = offsetPoint(a, lateralOffset, 0);
            addBridgePier(
              geometry, origin, support.x, support.z,
              bridgeWater.waterY - 0.9, a.y - 0.55
            );
            geometry.bridgePiers += 1;
          }
        }
      }
    }

    for (const side of [1, -1]) {
      const sideKey = side === 1 ? "left" : "right";
      const profileA = profiles[index][sideKey];
      const profileB = profiles[nextIndex][sideKey];
      const averageDelta = (profileA.delta + profileB.delta) * 0.5;

      // A tapered gravel/earth apron follows the actual terrain surface and
      // visually closes the shoulder-to-slope transition without a hard cliff.
      if (Math.abs(averageDelta) >= ROAD_EDGE_TRANSITION_THRESHOLD) {
        const palette = averageDelta > 0
          ? ROAD_FURNITURE_COLORS.cut
          : ROAD_FURNITURE_COLORS.fill;
        for (let band = 0; band < ROAD_TRANSITION_OFFSETS.length - 1; band += 1) {
          const offsetA = ROAD_TRANSITION_OFFSETS[band];
          const offsetB = ROAD_TRANSITION_OFFSETS[band + 1];
          const liftA = ROAD_TRANSITION_LIFTS[band];
          const liftB = ROAD_TRANSITION_LIFTS[band + 1];
          const a0 = terrainPointAtOffset(a, side, offsetA, liftA);
          const a1 = terrainPointAtOffset(a, side, offsetB, liftB);
          const b0 = terrainPointAtOffset(b, side, offsetA, liftA);
          const b1 = terrainPointAtOffset(b, side, offsetB, liftB);
          addQuad(geometry, origin, a0, a1, b1, b0, palette[band]);
        }
        geometry.transitionSegments += 1;
      }

      // Drainage is only cut into the uphill side of a measurable cut.
      if (
        profileA.delta >= ROAD_DRAINAGE_RISE_THRESHOLD
        && profileB.delta >= ROAD_DRAINAGE_RISE_THRESHOLD
      ) {
        const gutter = [
          { offset: 8.95, lift: 0.045 },
          { offset: 9.18, lift: -0.105 },
          { offset: 9.72, lift: -0.105 },
          { offset: 9.95, lift: 0.045 }
        ].map((point) => ({
          a: terrainPointAtOffset(a, side, point.offset, point.lift),
          b: terrainPointAtOffset(b, side, point.offset, point.lift)
        }));
        addQuad(geometry, origin, gutter[0].a, gutter[1].a, gutter[1].b, gutter[0].b, ROAD_FURNITURE_COLORS.drainBank);
        addQuad(geometry, origin, gutter[1].a, gutter[2].a, gutter[2].b, gutter[1].b, ROAD_FURNITURE_COLORS.drainBed);
        addQuad(geometry, origin, gutter[2].a, gutter[3].a, gutter[3].b, gutter[2].b, ROAD_FURNITURE_COLORS.drainBank);
        geometry.drainageSegments += 1;
      }

      // Guardrails are reserved for the side where the ground falls away.
      if (
        profileA.delta <= -ROAD_GUARDRAIL_DROP_THRESHOLD
        && profileB.delta <= -ROAD_GUARDRAIL_DROP_THRESHOLD
      ) {
        const railOffset = ROAD_EDGE_OUTER_OFFSET - 0.18;
        const groundA = offsetPoint(a, side * railOffset, ROAD_SHOULDER_OFFSET);
        const groundB = offsetPoint(b, side * railOffset, ROAD_SHOULDER_OFFSET);
        const topA = { ...groundA, y: groundA.y + 0.98 };
        const topB = { ...groundB, y: groundB.y + 0.98 };
        const midA = { ...groundA, y: groundA.y + 0.52 };
        const midB = { ...groundB, y: groundB.y + 0.52 };
        addRailBeam(geometry, origin, topA, topB, 0.095, 0.085, ROAD_FURNITURE_COLORS.rail);
        addRailBeam(geometry, origin, midA, midB, 0.07, 0.065, ROAD_FURNITURE_COLORS.rail);
        geometry.guardrailSegments += 1;

        if (index % 4 === 0) {
          addGuardrailPost(
            geometry, origin, groundA,
            groundA.y - 0.14, groundA.y + 1.13,
            0.075, ROAD_FURNITURE_COLORS.railPost
          );
          geometry.guardrailPosts += 1;
        }
      }
    }
  }

  return geometry;
}

export function getRoadFurnitureStats(samples, chunkSize = ROAD_CHUNK_SIZE) {
  if (!Array.isArray(samples) || samples.length < 2) {
    return { transitionSegments: 0, drainageSegments: 0, guardrailSegments: 0 };
  }
  const stats = { transitionSegments: 0, drainageSegments: 0, guardrailSegments: 0, bridgePiers: 0 };
  const profiles = getRoadFurnitureProfiles(samples);
  for (let index = 0; index < samples.length; index += 1) {
    const nextIndex = (index + 1) % samples.length;
    const a = samples[index];
    const b = samples[nextIndex];
    const averageMagnitude = (
      Math.abs(profiles[index].left.delta)
      + Math.abs(profiles[nextIndex].left.delta)
      + Math.abs(profiles[index].right.delta)
      + Math.abs(profiles[nextIndex].right.delta)
    ) * 0.25;
    if (averageMagnitude >= ROAD_EDGE_TRANSITION_THRESHOLD) {
      stats.transitionSegments += 1;
    }
    for (const side of [1, -1]) {
      const sideKey = side === 1 ? "left" : "right";
      const profileA = profiles[index][sideKey];
      const profileB = profiles[nextIndex][sideKey];
      if (profileA.delta >= ROAD_DRAINAGE_RISE_THRESHOLD && profileB.delta >= ROAD_DRAINAGE_RISE_THRESHOLD) {
        stats.drainageSegments += 1;
      }
      if (profileA.delta <= -ROAD_GUARDRAIL_DROP_THRESHOLD && profileB.delta <= -ROAD_GUARDRAIL_DROP_THRESHOLD) {
        stats.guardrailSegments += 1;
      }
    }
  }
  return stats;
}
