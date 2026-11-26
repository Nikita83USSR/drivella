export const MAIN_ROUTE_CONTROL_POINTS = Object.freeze([
  Object.freeze([0, 0]),
  Object.freeze([34, -72]),
  Object.freeze([112, -138]),
  Object.freeze([218, -128]),
  Object.freeze([292, -28]),
  Object.freeze([262, 102]),
  Object.freeze([164, 218]),
  Object.freeze([24, 270]),
  Object.freeze([-122, 244]),
  Object.freeze([-260, 148]),
  Object.freeze([-310, 0]),
  Object.freeze([-250, -158]),
  Object.freeze([-108, -228]),
  Object.freeze([-20, -150])
]);

export const ROAD_SAMPLE_SPACING = 3.2;
export const ROAD_PROFILE_MAX_GRADE = 0.32;
export const ROAD_PROFILE_CORE_RADIUS = 8.5;
export const ROAD_PROFILE_BLEND_RADIUS = 15;

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
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

export function sampleClosedRoutePoints(
  controlPoints = MAIN_ROUTE_CONTROL_POINTS,
  sampleSpacing = ROAD_SAMPLE_SPACING
) {
  if (!Array.isArray(controlPoints) || controlPoints.length < 4) {
    throw new TypeError("A closed road route requires at least four control points.");
  }
  if (!Number.isFinite(sampleSpacing) || sampleSpacing <= 0) {
    throw new RangeError("Road sample spacing must be a positive finite number.");
  }
  for (const point of controlPoints) {
    if (!Array.isArray(point) || point.length !== 2 || !point.every(Number.isFinite)) {
      throw new TypeError("Road control points must be finite [x, z] pairs.");
    }
  }

  const raw = [];
  const count = controlPoints.length;
  for (let index = 0; index < count; index += 1) {
    const p0 = controlPoints[(index - 1 + count) % count];
    const p1 = controlPoints[index];
    const p2 = controlPoints[(index + 1) % count];
    const p3 = controlPoints[(index + 2) % count];
    const segmentLength = Math.hypot(p2[0] - p1[0], p2[1] - p1[1]);
    const steps = Math.max(4, Math.ceil(segmentLength / sampleSpacing));
    for (let step = 0; step < steps; step += 1) {
      raw.push(catmullRom(p0, p1, p2, p3, step / steps));
    }
  }
  return raw;
}

let routeSpatialIndex = null;

function getRouteSpatialIndex() {
  if (routeSpatialIndex) return routeSpatialIndex;
  const samples = sampleClosedRoutePoints();
  const cellSize = 32;
  const buckets = new Map();

  for (let index = 0; index < samples.length; index += 1) {
    const a = samples[index];
    const b = samples[(index + 1) % samples.length];
    const midpointX = (a.x + b.x) * 0.5;
    const midpointZ = (a.z + b.z) * 0.5;
    const cellX = Math.floor(midpointX / cellSize);
    const cellZ = Math.floor(midpointZ / cellSize);
    const key = `${cellX}:${cellZ}`;
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key).push(index);
  }

  routeSpatialIndex = { samples, buckets, cellSize };
  return routeSpatialIndex;
}

export function nearestMainRouteSegment(x, z) {
  if (!Number.isFinite(x) || !Number.isFinite(z)) {
    throw new TypeError("Route distance query requires finite world coordinates.");
  }

  const { samples, buckets, cellSize } = getRouteSpatialIndex();
  const cellX = Math.floor(x / cellSize);
  const cellZ = Math.floor(z / cellSize);
  let nearest = null;
  let bestDistanceSquared = Infinity;

  for (let offsetX = -1; offsetX <= 1; offsetX += 1) {
    for (let offsetZ = -1; offsetZ <= 1; offsetZ += 1) {
      const bucket = buckets.get(`${cellX + offsetX}:${cellZ + offsetZ}`);
      if (!bucket) continue;
      for (const index of bucket) {
        const a = samples[index];
        const b = samples[(index + 1) % samples.length];
        const dx = b.x - a.x;
        const dz = b.z - a.z;
        const lengthSquared = dx * dx + dz * dz || 1;
        const t = clamp(((x - a.x) * dx + (z - a.z) * dz) / lengthSquared, 0, 1);
        const pointX = a.x + dx * t;
        const pointZ = a.z + dz * t;
        const distanceSquared = (x - pointX) ** 2 + (z - pointZ) ** 2;
        if (distanceSquared < bestDistanceSquared) {
          bestDistanceSquared = distanceSquared;
          nearest = { index, t, distance: Math.sqrt(distanceSquared) };
        }
      }
    }
  }

  return nearest;
}

export function distanceToMainRoute(x, z) {
  return nearestMainRouteSegment(x, z)?.distance ?? Infinity;
}
