import { rawTerrainHeight } from "./TerrainField.mjs";
import { getNearestWaterFeature } from "./HydrologyField.mjs";

export const TUNNEL_CHUNK_SIZE = 128;
export const TUNNEL_CLEAR_WIDTH = 16.8;
export const TUNNEL_CLEAR_HEIGHT = 7.15;
export const TUNNEL_LINING_RADIUS = 8.4;
export const TUNNEL_PORTAL_RADIUS = 10.2;
export const TUNNEL_CORRIDOR_RADIUS = 11.4;
export const TUNNEL_SPATIAL_CELL_SIZE = 32;

const TUNNEL_COLORS = Object.freeze({
  lining: Object.freeze([0.235, 0.285, 0.335]),
  liningShade: Object.freeze([0.16, 0.205, 0.25]),
  rib: Object.freeze([0.34, 0.405, 0.465]),
  portal: Object.freeze([0.39, 0.46, 0.51]),
  portalInner: Object.freeze([0.23, 0.30, 0.36]),
  light: Object.freeze([0.12, 0.78, 0.94]),
  warning: Object.freeze([0.88, 0.58, 0.19])
});

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function chunkIndex(value, size) {
  return Math.floor((value + size * 0.5) / size);
}

function nearestOnSegment(x, z, a, b) {
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  const lengthSquared = dx * dx + dz * dz || 1;
  const t = clamp(((x - a.x) * dx + (z - a.z) * dz) / lengthSquared, 0, 1);
  const px = a.x + dx * t;
  const pz = a.z + dz * t;
  return { x: px, z: pz, t, distance: Math.hypot(x - px, z - pz) };
}

function isWaterApproach(sample, clearance = 18) {
  const water = getNearestWaterFeature(sample.x, sample.z, clearance);
  if (!water) return false;
  const reach = water.kind === "river"
    ? 6.2 + water.halfWidth + 3.5
    : 6.2 + 4.5;
  return water.distance <= reach;
}

function routeDistanceForIndices(samples, indices) {
  let length = 0;
  for (let position = 0; position < indices.length - 1; position += 1) {
    const a = samples[indices[position]];
    const b = samples[indices[position + 1]];
    length += Math.hypot(b.x - a.x, b.z - a.z);
  }
  return length;
}

/**
 * Find naturally overhung route sections. The route is sampled from the
 * existing grade-limited road profile; the height above it is measured against
 * the uncut terrain field. Water crossings are excluded so bridges remain
 * separate structures.
 */
export function detectTunnelSegments(roadSamples, options = {}) {
  if (!Array.isArray(roadSamples) || roadSamples.length < 8) {
    throw new TypeError("Tunnel detection requires a sampled closed road route.");
  }
  const minPortalCover = options.minPortalCover ?? 7.8;
  const minInteriorCover = options.minInteriorCover ?? 12.5;
  const minLength = options.minLength ?? 48;
  const maxGapSamples = options.maxGapSamples ?? 1;
  if (![minPortalCover, minInteriorCover, minLength].every(Number.isFinite)
    || minPortalCover <= TUNNEL_CLEAR_HEIGHT
    || minInteriorCover <= minPortalCover
    || minLength <= 0
    || !Number.isInteger(maxGapSamples)
    || maxGapSamples < 0
  ) {
    throw new RangeError("Tunnel detection thresholds are invalid.");
  }

  const samples = roadSamples.map((sample, index) => {
    const terrainY = rawTerrainHeight(sample.x, sample.z);
    const cover = terrainY - sample.y;
    return {
      ...sample,
      index,
      terrainY,
      cover,
      eligible: cover >= minPortalCover && !isWaterApproach(sample)
    };
  });

  const groups = [];
  let current = null;
  let pendingGap = 0;
  for (let index = 0; index < samples.length; index += 1) {
    const sample = samples[index];
    if (sample.eligible) {
      if (!current) {
        current = { indices: [index] };
      } else {
        if (pendingGap > 0) {
          for (let gap = pendingGap; gap > 0; gap -= 1) {
            const gapIndex = (index - gap + samples.length) % samples.length;
            current.indices.push(gapIndex);
          }
          pendingGap = 0;
        }
        current.indices.push(index);
      }
    } else if (current) {
      pendingGap += 1;
      if (pendingGap > maxGapSamples) {
        if (current.indices.length) groups.push(current);
        current = null;
        pendingGap = 0;
      }
    }
  }
  if (current) {
    if (current.indices.length) groups.push(current);
  }

  // Merge groups that meet across the closed-route seam.
  if (groups.length > 1) {
    const first = groups[0];
    const last = groups[groups.length - 1];
    if (first.indices[0] === 0 && last.indices[last.indices.length - 1] === samples.length - 1) {
      const merged = { indices: [...last.indices, ...first.indices] };
      groups.splice(groups.length - 1, 1);
      groups.splice(0, 1, merged);
    }
  }

  const tunnels = [];
  for (const group of groups) {
    const indices = group.indices;
    if (indices.length < 2) continue;
    const length = routeDistanceForIndices(samples, indices);
    const coverSamples = indices.map((index) => samples[index].cover);
    const minCover = Math.min(...coverSamples);
    const maxCover = Math.max(...coverSamples);
    const averageCover = coverSamples.reduce((sum, value) => sum + value, 0) / coverSamples.length;
    if (length < minLength || maxCover < minInteriorCover || minCover < minPortalCover - 0.01) continue;

    const path = indices.map((index) => samples[index]);
    const start = path[0];
    const end = path[path.length - 1];
    const id = `tunnel-${tunnels.length + 1}`;
    tunnels.push({
      id,
      startIndex: indices[0],
      endIndex: indices[indices.length - 1],
      length,
      minCover,
      maxCover,
      averageCover,
      sampleCount: path.length,
      minHeadroom: TUNNEL_CLEAR_HEIGHT,
      path: Object.freeze(path),
      start,
      end,
      chunkKeys: Object.freeze([...new Set(path.slice(0, -1).map((point, index) => {
        const next = path[index + 1];
        return `${chunkIndex((point.x + next.x) * 0.5, TUNNEL_CHUNK_SIZE)}:${chunkIndex((point.z + next.z) * 0.5, TUNNEL_CHUNK_SIZE)}`;
      }))])
    });
  }

  return tunnels;
}

function addVertex(geometry, origin, point, color) {
  const index = geometry.positions.length / 3;
  geometry.positions.push(point.x - origin.x, point.y - origin.y, point.z - origin.z);
  geometry.colors.push(color[0], color[1], color[2], 1);
  return index;
}

function addQuad(geometry, origin, a, b, c, d, color) {
  const base = geometry.positions.length / 3;
  addVertex(geometry, origin, a, color);
  addVertex(geometry, origin, b, color);
  addVertex(geometry, origin, c, color);
  addVertex(geometry, origin, d, color);
  geometry.indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
}

function tunnelArch(sample, radius = TUNNEL_LINING_RADIUS, rise = TUNNEL_CLEAR_HEIGHT - 0.55, baseOffset = 0.55, divisions = 12) {
  const points = [];
  for (let index = 0; index <= divisions; index += 1) {
    const angle = (index / divisions) * Math.PI;
    const lateral = Math.cos(angle) * radius;
    points.push({
      x: sample.x + sample.normalX * lateral,
      y: sample.y + baseOffset + Math.sin(angle) * rise,
      z: sample.z + sample.normalZ * lateral
    });
  }
  return points;
}

function tunnelSideBottom(sample, side, radius = TUNNEL_LINING_RADIUS) {
  return {
    x: sample.x + sample.normalX * side * radius,
    y: sample.y + 0.18,
    z: sample.z + sample.normalZ * side * radius
  };
}

function addTunnelPortal(geometry, origin, sample) {
  const inner = tunnelArch(sample, TUNNEL_LINING_RADIUS, TUNNEL_CLEAR_HEIGHT - 0.55, 0.55, 16);
  const outer = tunnelArch(sample, TUNNEL_PORTAL_RADIUS, 8.15, 0.55, 16);
  for (let index = 0; index < inner.length - 1; index += 1) {
    addQuad(
      geometry, origin,
      inner[index], outer[index], outer[index + 1], inner[index + 1],
      index % 4 === 0 ? TUNNEL_COLORS.warning : TUNNEL_COLORS.portal
    );
  }

  for (const side of [-1, 1]) {
    const innerBottom = tunnelSideBottom(sample, side);
    const outerBottom = tunnelSideBottom(sample, side, TUNNEL_PORTAL_RADIUS);
    const innerTop = inner[side < 0 ? 0 : inner.length - 1];
    const outerTop = outer[side < 0 ? 0 : outer.length - 1];
    addQuad(
      geometry, origin,
      innerBottom, outerBottom, outerTop, innerTop,
      TUNNEL_COLORS.portalInner
    );
  }
  geometry.portalCount += 1;
}

function isSegmentInChunk(a, b, chunkX, chunkZ, chunkSize) {
  return chunkIndex((a.x + b.x) * 0.5, chunkSize) === chunkX
    && chunkIndex((a.z + b.z) * 0.5, chunkSize) === chunkZ;
}

export function buildTunnelChunkGeometry(tunnels, chunkX, chunkY, chunkZ, chunkSize = TUNNEL_CHUNK_SIZE) {
  if (!Array.isArray(tunnels)) throw new TypeError("Tunnel chunk generation requires tunnel segments.");
  if (![chunkX, chunkY, chunkZ].every(Number.isInteger)) {
    throw new TypeError("Tunnel chunk coordinates must be integers.");
  }
  if (!Number.isFinite(chunkSize) || chunkSize <= 0) {
    throw new RangeError("Tunnel chunk size must be a positive finite number.");
  }

  const origin = { x: chunkX * chunkSize, y: chunkY * chunkSize, z: chunkZ * chunkSize };
  const geometry = {
    positions: [],
    colors: [],
    indices: [],
    segmentCount: 0,
    portalCount: 0,
    ribCount: 0,
    lightSegments: 0,
    tunnelIds: []
  };

  for (const tunnel of tunnels) {
    const path = tunnel.path;
    if (!path || path.length < 2) continue;
    let includedTunnel = false;

    const sections = path.map((sample) => tunnelArch(sample));
    for (let index = 0; index < path.length - 1; index += 1) {
      const a = path[index];
      const b = path[index + 1];
      if (!isSegmentInChunk(a, b, chunkX, chunkZ, chunkSize)) continue;
      includedTunnel = true;

      const archA = sections[index];
      const archB = sections[index + 1];
      for (let ring = 0; ring < archA.length - 1; ring += 1) {
        const shade = ring >= 4 && ring <= 8 ? TUNNEL_COLORS.lining : TUNNEL_COLORS.liningShade;
        addQuad(geometry, origin, archA[ring], archA[ring + 1], archB[ring + 1], archB[ring], shade);
      }

      for (const side of [-1, 1]) {
        const archPointA = archA[side < 0 ? 0 : archA.length - 1];
        const archPointB = archB[side < 0 ? 0 : archB.length - 1];
        const bottomA = tunnelSideBottom(a, side);
        const bottomB = tunnelSideBottom(b, side);
        addQuad(geometry, origin, bottomA, archPointA, archPointB, bottomB, TUNNEL_COLORS.liningShade);
      }

      // Continuous cyan service strips sit just inside both shoulders.
      for (const side of [-1, 1]) {
        const lightA = {
          x: a.x + a.normalX * side * 7.45,
          y: a.y + 4.25,
          z: a.z + a.normalZ * side * 7.45
        };
        const lightB = {
          x: b.x + b.normalX * side * 7.45,
          y: b.y + 4.25,
          z: b.z + b.normalZ * side * 7.45
        };
        const thickness = 0.12;
        const upperA = { ...lightA, y: lightA.y + thickness };
        const upperB = { ...lightB, y: lightB.y + thickness };
        addQuad(geometry, origin, lightA, upperA, upperB, lightB, TUNNEL_COLORS.light);
        geometry.lightSegments += 1;
      }

      // Reinforced transverse ribs repeat every ~13 m along the tunnel.
      if (index % 4 === 0) {
        const ribOuter = tunnelArch(a, TUNNEL_LINING_RADIUS + 0.28, TUNNEL_CLEAR_HEIGHT - 0.28, 0.52, 12);
        const ribInner = tunnelArch(a, TUNNEL_LINING_RADIUS - 0.12, TUNNEL_CLEAR_HEIGHT - 0.58, 0.55, 12);
        for (let ring = 0; ring < ribInner.length - 1; ring += 1) {
          addQuad(
            geometry, origin,
            ribInner[ring], ribOuter[ring], ribOuter[ring + 1], ribInner[ring + 1],
            TUNNEL_COLORS.rib
          );
        }
        geometry.ribCount += 1;
      }

      geometry.segmentCount += 1;
    }

    const hasStartPortal = chunkIndex(tunnel.start.x, chunkSize) === chunkX
      && chunkIndex(tunnel.start.z, chunkSize) === chunkZ;
    const hasEndPortal = chunkIndex(tunnel.end.x, chunkSize) === chunkX
      && chunkIndex(tunnel.end.z, chunkSize) === chunkZ;
    if (hasStartPortal) addTunnelPortal(geometry, origin, tunnel.start);
    if (hasEndPortal) addTunnelPortal(geometry, origin, tunnel.end);
    if (includedTunnel || hasStartPortal || hasEndPortal) geometry.tunnelIds.push(tunnel.id);
  }

  return geometry;
}

export function getTunnelStats(tunnels) {
  return {
    count: tunnels.length,
    totalLength: tunnels.reduce((sum, tunnel) => sum + tunnel.length, 0),
    portalCount: tunnels.length * 2,
    totalSamples: tunnels.reduce((sum, tunnel) => sum + tunnel.sampleCount, 0),
    minCover: tunnels.length ? Math.min(...tunnels.map((tunnel) => tunnel.minCover)) : null,
    maxCover: tunnels.length ? Math.max(...tunnels.map((tunnel) => tunnel.maxCover)) : null,
    chunks: [...new Set(tunnels.flatMap((tunnel) => tunnel.chunkKeys))].length
  };
}

export function isTunnelSampleIndex(index, tunnels) {
  return tunnels.some((tunnel) => {
    const count = tunnel.path.length;
    return tunnel.path.some((sample) => sample.index === index)
      || tunnel.path.some((sample) => sample.index === (index + 1) % Math.max(count, 1));
  });
}
