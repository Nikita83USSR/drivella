const RIVER_DEFINITIONS = Object.freeze([
  Object.freeze({
    id: "main-river",
    name: "Main river",
    halfWidth: 6.4,
    levelOffset: 0,
    controlPoints: Object.freeze([
      Object.freeze([410, -250]),
      Object.freeze([325, -210]),
      Object.freeze([250, -165]),
      Object.freeze([215, -128]),
      Object.freeze([160, -80]),
      Object.freeze([105, -30]),
      Object.freeze([60, 35]),
      Object.freeze([10, 86]),
      Object.freeze([-95, 112]),
      Object.freeze([-205, 140]),
      Object.freeze([-300, 175]),
      Object.freeze([-405, 205])
    ])
  }),
  Object.freeze({
    id: "north-tributary",
    name: "North tributary",
    halfWidth: 3.7,
    levelOffset: 1.2,
    controlPoints: Object.freeze([
      Object.freeze([360, 355]),
      Object.freeze([295, 305]),
      Object.freeze([230, 250]),
      Object.freeze([165, 195]),
      Object.freeze([105, 140]),
      Object.freeze([54, 96])
    ])
  })
]);

const LAKE_DEFINITIONS = Object.freeze([
  Object.freeze({
    id: "western-lake",
    name: "Western lake",
    x: -382,
    z: 207,
    radiusX: 39,
    radiusZ: 31,
    levelOffset: -1.5,
    phase: 0.4
  }),
  Object.freeze({
    id: "eastern-tarn",
    name: "Eastern tarn",
    x: 348,
    z: -300,
    radiusX: 31,
    radiusZ: 24,
    levelOffset: 2.8,
    phase: 1.7
  })
]);

export const HYDROLOGY_CHUNK_SIZE = 128;
export const RIVER_BANK_RADIUS = 24;
export const RIVER_BED_DEPTH = 1.75;
export const LAKE_BED_DEPTH = 2.15;
export const LAKE_SHORE_WIDTH = 9;
export const RIVER_SHORE_WIDTH = 3.8;

const WATER_COLOR = Object.freeze([0.10, 0.43, 0.57]);
const WATER_HIGHLIGHT_COLOR = Object.freeze([0.29, 0.69, 0.77]);
const RIVER_SHORE_COLOR = Object.freeze([0.47, 0.43, 0.31]);
const LAKE_SHORE_COLOR = Object.freeze([0.53, 0.49, 0.36]);

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function smooth01(value) {
  const t = clamp(value, 0, 1);
  return t * t * (3 - 2 * t);
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function catmullRom(p0, p1, p2, p3, t) {
  const t2 = t * t;
  const t3 = t2 * t;
  return {
    x: 0.5 * (
      2 * p1[0]
      + (-p0[0] + p2[0]) * t
      + (2 * p0[0] - 5 * p1[0] + 4 * p2[0] - p3[0]) * t2
      + (-p0[0] + 3 * p1[0] - 3 * p2[0] + p3[0]) * t3
    ),
    z: 0.5 * (
      2 * p1[1]
      + (-p0[1] + p2[1]) * t
      + (2 * p0[1] - 5 * p1[1] + p2[1] * 0 + 4 * p2[1] - p3[1]) * t2
      + (-p0[1] + 3 * p1[1] - 3 * p2[1] + p3[1]) * t3
    )
  };
}

function waterLevelAt(x, z, levelOffset = 0) {
  return 0.29 * x - 22 + levelOffset + Math.sin((z + 230) * 0.012) * 1.15;
}

function sampleRiver(definition, spacing = 5.2) {
  const points = [];
  const count = definition.controlPoints.length;
  for (let index = 0; index < count - 1; index += 1) {
    const p0 = definition.controlPoints[Math.max(0, index - 1)];
    const p1 = definition.controlPoints[index];
    const p2 = definition.controlPoints[index + 1];
    const p3 = definition.controlPoints[Math.min(count - 1, index + 2)];
    const distance = Math.hypot(p2[0] - p1[0], p2[1] - p1[1]);
    const steps = Math.max(4, Math.ceil(distance / spacing));
    for (let step = 0; step < steps; step += 1) {
      const point = catmullRom(p0, p1, p2, p3, step / steps);
      points.push({
        x: point.x,
        z: point.z,
        y: waterLevelAt(point.x, point.z, definition.levelOffset)
      });
    }
  }
  const last = definition.controlPoints[count - 1];
  points.push({
    x: last[0],
    z: last[1],
    y: waterLevelAt(last[0], last[1], definition.levelOffset)
  });

  for (let index = 0; index < points.length; index += 1) {
    const previous = points[Math.max(0, index - 1)];
    const next = points[Math.min(points.length - 1, index + 1)];
    const dx = next.x - previous.x;
    const dz = next.z - previous.z;
    const length = Math.hypot(dx, dz) || 1;
    points[index].tangentX = dx / length;
    points[index].tangentZ = dz / length;
    points[index].normalX = -dz / length;
    points[index].normalZ = dx / length;
  }
  return points;
}

const RIVERS = Object.freeze(RIVER_DEFINITIONS.map((definition) => Object.freeze({
  ...definition,
  samples: Object.freeze(sampleRiver(definition).map((sample) => Object.freeze(sample)))
})));

function lakeLevelAt(lake) {
  return waterLevelAt(lake.x, lake.z, lake.levelOffset);
}

function nearestPointOnSegment(x, z, a, b) {
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  const lengthSquared = dx * dx + dz * dz || 1;
  const t = clamp(((x - a.x) * dx + (z - a.z) * dz) / lengthSquared, 0, 1);
  const pointX = a.x + dx * t;
  const pointZ = a.z + dz * t;
  return {
    x: pointX,
    z: pointZ,
    t,
    distance: Math.hypot(x - pointX, z - pointZ)
  };
}

export function getNearestWaterFeature(x, z, maxDistance = Infinity) {
  if (!Number.isFinite(x) || !Number.isFinite(z)) {
    throw new TypeError("Water feature query requires finite world coordinates.");
  }
  if (!(maxDistance >= 0)) throw new RangeError("maxDistance must be non-negative.");

  let nearest = null;
  for (const river of RIVERS) {
    for (let index = 0; index < river.samples.length - 1; index += 1) {
      const a = river.samples[index];
      const b = river.samples[index + 1];
      const point = nearestPointOnSegment(x, z, a, b);
      if (point.distance < (nearest?.distance ?? maxDistance + 1)) {
        nearest = {
          id: river.id,
          name: river.name,
          kind: "river",
          x: point.x,
          z: point.z,
          distance: point.distance,
          waterY: lerp(a.y, b.y, point.t),
          halfWidth: river.halfWidth,
          sampleIndex: index,
          t: point.t
        };
      }
    }
  }

  for (const lake of LAKE_DEFINITIONS) {
    const normalizedDistance = Math.hypot((x - lake.x) / lake.radiusX, (z - lake.z) / lake.radiusZ);
    const edgeDistance = Math.max(0, normalizedDistance - 1) * Math.min(lake.radiusX, lake.radiusZ);
    if (edgeDistance < (nearest?.distance ?? maxDistance + 1)) {
      nearest = {
        id: lake.id,
        name: lake.name,
        kind: "lake",
        x: lake.x,
        z: lake.z,
        distance: edgeDistance,
        normalizedDistance,
        waterY: lakeLevelAt(lake),
        halfWidth: Math.min(lake.radiusX, lake.radiusZ),
        radiusX: lake.radiusX,
        radiusZ: lake.radiusZ
      };
    }
  }

  return nearest && nearest.distance <= maxDistance ? nearest : null;
}

/**
 * Cut a shallow river channel and lake basin into the analytic terrain. The
 * water surface remains above the lowered bed; a smooth falloff blends the
 * cut back into the natural terrain and keeps chunk borders deterministic.
 */
export function applyHydrologyCarve(x, z, terrainY) {
  if (![x, z, terrainY].every(Number.isFinite)) {
    throw new TypeError("Hydrology carve requires finite coordinates and terrain height.");
  }

  let result = terrainY;
  for (const river of RIVERS) {
    let bestDistance = Infinity;
    let bestWaterY = null;
    for (let index = 0; index < river.samples.length - 1; index += 1) {
      const a = river.samples[index];
      const b = river.samples[index + 1];
      const point = nearestPointOnSegment(x, z, a, b);
      if (point.distance < bestDistance) {
        bestDistance = point.distance;
        bestWaterY = lerp(a.y, b.y, point.t);
      }
    }
    if (bestDistance > RIVER_BANK_RADIUS) continue;

    const innerRadius = river.halfWidth * 0.58;
    const blend = bestDistance <= innerRadius
      ? 1
      : 1 - smooth01((bestDistance - innerRadius) / (RIVER_BANK_RADIUS - innerRadius));
    const channelBed = bestWaterY - RIVER_BED_DEPTH;
    result = lerp(result, channelBed, blend);
  }

  for (const lake of LAKE_DEFINITIONS) {
    const normalizedDistance = Math.hypot((x - lake.x) / lake.radiusX, (z - lake.z) / lake.radiusZ);
    const shoreDistance = Math.max(0, normalizedDistance - 1) * Math.min(lake.radiusX, lake.radiusZ);
    if (normalizedDistance > 1.35) continue;
    const blend = normalizedDistance <= 0.82
      ? 1
      : 1 - smooth01((normalizedDistance - 0.82) / (1.35 - 0.82));
    const lakeBed = lakeLevelAt(lake) - LAKE_BED_DEPTH;
    result = lerp(result, lakeBed, blend);
  }

  return result;
}

export function classifyRoadHydrologyCrossings(roadSamples, roadHalfWidth = 6.2) {
  if (!Array.isArray(roadSamples) || roadSamples.length < 2) {
    throw new TypeError("Road hydrology classification requires sampled road geometry.");
  }
  if (!Number.isFinite(roadHalfWidth) || roadHalfWidth <= 0) {
    throw new RangeError("roadHalfWidth must be positive and finite.");
  }

  const hits = [];
  for (let index = 0; index < roadSamples.length; index += 1) {
    const road = roadSamples[index];
    const water = getNearestWaterFeature(road.x, road.z, roadHalfWidth + 9);
    if (!water) continue;
    const threshold = water.kind === "river"
      ? roadHalfWidth + water.halfWidth + 2.4
      : roadHalfWidth + 3.2;
    if (water.distance > threshold) continue;
    hits.push({
      index,
      featureId: water.id,
      kind: water.kind,
      x: road.x,
      z: road.z,
      roadY: road.y,
      waterY: water.waterY,
      clearance: road.y - water.waterY,
      distance: water.distance
    });
  }

  const groups = [];
  for (const hit of hits) {
    let group = groups[groups.length - 1];
    if (!group || group.featureId !== hit.featureId || hit.index > group.endIndex + 2) {
      group = {
        featureId: hit.featureId,
        kind: hit.kind,
        startIndex: hit.index,
        endIndex: hit.index,
        hits: []
      };
      groups.push(group);
    }
    group.endIndex = hit.index;
    group.hits.push(hit);
  }

  const crossings = groups.map((group, index) => {
    const centreHit = group.hits[Math.floor(group.hits.length / 2)];
    const minClearance = Math.min(...group.hits.map((hit) => hit.clearance));
    const maxClearance = Math.max(...group.hits.map((hit) => hit.clearance));
    const averageDistance = group.hits.reduce((sum, hit) => sum + hit.distance, 0) / group.hits.length;
    return {
      id: `crossing-${index + 1}`,
      featureId: group.featureId,
      kind: group.kind,
      startIndex: group.startIndex,
      endIndex: group.endIndex,
      sampleCount: group.hits.length,
      x: centreHit.x,
      z: centreHit.z,
      roadY: centreHit.roadY,
      waterY: centreHit.waterY,
      minClearance,
      maxClearance,
      averageDistance,
      structure: minClearance >= 3 ? "bridge-candidate" : "bridge-or-culvert-required"
    };
  });

  return {
    crossings,
    candidateCount: crossings.filter((crossing) => crossing.structure === "bridge-candidate").length,
    unresolvedCount: crossings.filter((crossing) => crossing.structure !== "bridge-candidate").length
  };
}

export function getHydrologyStats() {
  return {
    riverCount: RIVERS.length,
    riverSampleCount: RIVERS.reduce((sum, river) => sum + river.samples.length, 0),
    lakeCount: LAKE_DEFINITIONS.length,
    riverIds: RIVERS.map((river) => river.id),
    lakeIds: LAKE_DEFINITIONS.map((lake) => lake.id)
  };
}

function chunkIndex(value, size) {
  return Math.floor((value + size * 0.5) / size);
}

function pushVertex(geometry, origin, point, color) {
  const base = geometry.positions.length / 3;
  geometry.positions.push(point.x - origin.x, point.y - origin.y, point.z - origin.z);
  geometry.colors.push(color[0], color[1], color[2], 1);
  return base;
}

function addQuad(geometry, origin, a, b, c, d, color) {
  const base = geometry.positions.length / 3;
  for (const point of [a, b, c, d]) pushVertex(geometry, origin, point, color);
  geometry.indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
}

function isSegmentInChunk(a, b, chunkX, chunkZ, chunkSize) {
  const midX = (a.x + b.x) * 0.5;
  const midZ = (a.z + b.z) * 0.5;
  return chunkIndex(midX, chunkSize) === chunkX && chunkIndex(midZ, chunkSize) === chunkZ;
}

export function buildHydrologyChunkGeometry(
  chunkX,
  chunkY,
  chunkZ,
  chunkSize = HYDROLOGY_CHUNK_SIZE,
  getTerrainHeight = () => 0
) {
  if (![chunkX, chunkY, chunkZ].every(Number.isInteger)) {
    throw new TypeError("Hydrology chunk coordinates must be integers.");
  }
  if (!Number.isFinite(chunkSize) || chunkSize <= 0 || typeof getTerrainHeight !== "function") {
    throw new TypeError("Hydrology chunk generation requires a positive chunk size and terrain sampler.");
  }

  const origin = { x: chunkX * chunkSize, y: chunkY * chunkSize, z: chunkZ * chunkSize };
  const water = { positions: [], colors: [], indices: [] };
  const shore = { positions: [], colors: [], indices: [] };
  let riverSegments = 0;
  let shoreSegments = 0;
  let lakeTriangles = 0;

  for (const river of RIVERS) {
    for (let index = 0; index < river.samples.length - 1; index += 1) {
      const a = river.samples[index];
      const b = river.samples[index + 1];
      if (!isSegmentInChunk(a, b, chunkX, chunkZ, chunkSize)) continue;

      const leftA = {
        x: a.x + a.normalX * river.halfWidth,
        y: a.y,
        z: a.z + a.normalZ * river.halfWidth
      };
      const rightA = {
        x: a.x - a.normalX * river.halfWidth,
        y: a.y,
        z: a.z - a.normalZ * river.halfWidth
      };
      const leftB = {
        x: b.x + b.normalX * river.halfWidth,
        y: b.y,
        z: b.z + b.normalZ * river.halfWidth
      };
      const rightB = {
        x: b.x - b.normalX * river.halfWidth,
        y: b.y,
        z: b.z - b.normalZ * river.halfWidth
      };
      addQuad(water, origin, leftA, rightA, rightB, leftB, WATER_COLOR);

      // A narrow broken highlight line makes the flowing surface readable
      // without a texture or an external shader dependency.
      if (index % 5 !== 4) {
        const highlightA = {
          x: a.x - a.normalX * river.halfWidth * 0.25,
          y: a.y + 0.025,
          z: a.z - a.normalZ * river.halfWidth * 0.25
        };
        const highlightB = {
          x: b.x - b.normalX * river.halfWidth * 0.25,
          y: b.y + 0.025,
          z: b.z - b.normalZ * river.halfWidth * 0.25
        };
        const highlightC = {
          x: b.x + b.normalX * river.halfWidth * 0.25,
          y: b.y + 0.025,
          z: b.z + b.normalZ * river.halfWidth * 0.25
        };
        const highlightD = {
          x: a.x + a.normalX * river.halfWidth * 0.25,
          y: a.y + 0.025,
          z: a.z + a.normalZ * river.halfWidth * 0.25
        };
        addQuad(water, origin, highlightA, highlightB, highlightC, highlightD, WATER_HIGHLIGHT_COLOR);
      }

      const leftShoreA = {
        x: a.x + a.normalX * (river.halfWidth + RIVER_SHORE_WIDTH),
        y: getTerrainHeight(a.x + a.normalX * (river.halfWidth + RIVER_SHORE_WIDTH), a.z + a.normalZ * (river.halfWidth + RIVER_SHORE_WIDTH)) + 0.08,
        z: a.z + a.normalZ * (river.halfWidth + RIVER_SHORE_WIDTH)
      };
      const rightShoreA = {
        x: a.x - a.normalX * (river.halfWidth + RIVER_SHORE_WIDTH),
        y: getTerrainHeight(a.x - a.normalX * (river.halfWidth + RIVER_SHORE_WIDTH), a.z - a.normalZ * (river.halfWidth + RIVER_SHORE_WIDTH)) + 0.08,
        z: a.z - a.normalZ * (river.halfWidth + RIVER_SHORE_WIDTH)
      };
      const leftShoreB = {
        x: b.x + b.normalX * (river.halfWidth + RIVER_SHORE_WIDTH),
        y: getTerrainHeight(b.x + b.normalX * (river.halfWidth + RIVER_SHORE_WIDTH), b.z + b.normalZ * (river.halfWidth + RIVER_SHORE_WIDTH)) + 0.08,
        z: b.z + b.normalZ * (river.halfWidth + RIVER_SHORE_WIDTH)
      };
      const rightShoreB = {
        x: b.x - b.normalX * (river.halfWidth + RIVER_SHORE_WIDTH),
        y: getTerrainHeight(b.x - b.normalX * (river.halfWidth + RIVER_SHORE_WIDTH), b.z - b.normalZ * (river.halfWidth + RIVER_SHORE_WIDTH)) + 0.08,
        z: b.z - b.normalZ * (river.halfWidth + RIVER_SHORE_WIDTH)
      };
      addQuad(shore, origin, leftA, leftShoreA, leftShoreB, leftB, RIVER_SHORE_COLOR);
      addQuad(shore, origin, rightShoreA, rightA, rightB, rightShoreB, RIVER_SHORE_COLOR);
      riverSegments += 1;
      shoreSegments += 2;
    }
  }

  for (const lake of LAKE_DEFINITIONS) {
    const ring = [];
    const steps = 48;
    for (let index = 0; index < steps; index += 1) {
      const angle = (index / steps) * Math.PI * 2;
      const shape = 1
        + Math.sin(angle * 3 + lake.phase) * 0.075
        + Math.sin(angle * 5 - lake.phase * 0.7) * 0.035;
      ring.push({
        x: lake.x + Math.cos(angle) * lake.radiusX * shape,
        y: lakeLevelAt(lake),
        z: lake.z + Math.sin(angle) * lake.radiusZ * shape
      });
    }
    const centre = { x: lake.x, y: lakeLevelAt(lake), z: lake.z };
    const shoreRing = ring.map((point, index) => {
      const angle = (index / steps) * Math.PI * 2;
      const x = lake.x + Math.cos(angle) * (lake.radiusX + LAKE_SHORE_WIDTH) * (1 + Math.sin(angle * 3 + lake.phase) * 0.04);
      const z = lake.z + Math.sin(angle) * (lake.radiusZ + LAKE_SHORE_WIDTH) * (1 + Math.sin(angle * 3 + lake.phase) * 0.04);
      return { x, y: getTerrainHeight(x, z) + 0.1, z };
    });

    for (let index = 0; index < steps; index += 1) {
      const next = (index + 1) % steps;
      const a = ring[index];
      const b = ring[next];
      const centroid = {
        x: (centre.x + a.x + b.x) / 3,
        z: (centre.z + a.z + b.z) / 3
      };
      if (chunkIndex(centroid.x, chunkSize) === chunkX && chunkIndex(centroid.z, chunkSize) === chunkZ) {
        const base = pushVertex(water, origin, centre, WATER_COLOR);
        const aIndex = pushVertex(water, origin, a, WATER_COLOR);
        const bIndex = pushVertex(water, origin, b, WATER_COLOR);
        water.indices.push(base, aIndex, bIndex);
        lakeTriangles += 1;
      }

      const shoreCentroid = {
        x: (a.x + b.x + shoreRing[index].x + shoreRing[next].x) * 0.25,
        z: (a.z + b.z + shoreRing[index].z + shoreRing[next].z) * 0.25
      };
      if (chunkIndex(shoreCentroid.x, chunkSize) === chunkX && chunkIndex(shoreCentroid.z, chunkSize) === chunkZ) {
        addQuad(shore, origin, a, shoreRing[index], shoreRing[next], b, LAKE_SHORE_COLOR);
      }
    }
  }

  return {
    water,
    shore,
    riverSegments,
    shoreSegments,
    lakeTriangles,
    hasWater: water.indices.length > 0,
    hasShore: shore.indices.length > 0
  };
}
