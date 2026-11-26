const AXES = Object.freeze([
  Object.freeze({ x: 1, y: 0, z: 0, name: "+X" }),
  Object.freeze({ x: -1, y: 0, z: 0, name: "-X" }),
  Object.freeze({ x: 0, y: 1, z: 0, name: "+Y" }),
  Object.freeze({ x: 0, y: -1, z: 0, name: "-Y" }),
  Object.freeze({ x: 0, y: 0, z: 1, name: "+Z" }),
  Object.freeze({ x: 0, y: 0, z: -1, name: "-Z" })
]);

function assertFiniteVector(point) {
  for (const axis of ["x", "y", "z"]) {
    if (!Number.isFinite(point?.[axis])) {
      throw new TypeError(`SpatialChunkManager expects a finite ${axis} coordinate.`);
    }
  }
}

function hashCoordinates(x, y, z) {
  let hash = 2166136261;
  const text = `${x},${y},${z}`;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function distanceSquaredToBounds(point, min, max) {
  const dx = point.x < min.x ? min.x - point.x : point.x > max.x ? point.x - max.x : 0;
  const dy = point.y < min.y ? min.y - point.y : point.y > max.y ? point.y - max.y : 0;
  const dz = point.z < min.z ? min.z - point.z : point.z > max.z ? point.z - max.z : 0;
  return dx * dx + dy * dy + dz * dz;
}

function lodForDistance(distance, radius) {
  if (distance <= radius * 0.28) return "high";
  if (distance <= radius * 0.62) return "medium";
  return "low";
}

/**
 * Manages world availability in true XYZ space.
 * Chunk lifetime is based only on player/world position and spherical distance.
 * Camera frustum and camera direction are intentionally not accepted as inputs.
 */
export class SpatialChunkManager {
  constructor({
    chunkSize = 128,
    radius = 420,
    maxActiveChunks = 4096,
    onCreate = () => null,
    onDispose = () => {}
  } = {}) {
    if (!Number.isFinite(chunkSize) || chunkSize <= 0) {
      throw new RangeError("chunkSize must be a positive finite number.");
    }
    if (!Number.isFinite(radius) || radius <= 0) {
      throw new RangeError("radius must be a positive finite number.");
    }
    if (!Number.isInteger(maxActiveChunks) || maxActiveChunks < 1) {
      throw new RangeError("maxActiveChunks must be a positive integer.");
    }
    if (typeof onCreate !== "function" || typeof onDispose !== "function") {
      throw new TypeError("onCreate and onDispose must be functions.");
    }

    this.chunkSize = chunkSize;
    this.radius = radius;
    this.maxActiveChunks = maxActiveChunks;
    this.onCreate = onCreate;
    this.onDispose = onDispose;
    this.active = new Map();
    this.lastCenterChunk = null;
    this.lastCenter = null;
  }

  static chunkKey(x, y, z) {
    return `${x}:${y}:${z}`;
  }

  static chunkIndex(position, chunkSize) {
    return Math.floor((position + chunkSize * 0.5) / chunkSize);
  }

  static boundsFor(x, y, z, chunkSize) {
    const half = chunkSize * 0.5;
    const min = Object.freeze({
      x: x * chunkSize - half,
      y: y * chunkSize - half,
      z: z * chunkSize - half
    });
    const max = Object.freeze({
      x: min.x + chunkSize,
      y: min.y + chunkSize,
      z: min.z + chunkSize
    });
    return { min, max };
  }

  static intersectsSphere(point, x, y, z, chunkSize, radius) {
    assertFiniteVector(point);
    const { min, max } = SpatialChunkManager.boundsFor(x, y, z, chunkSize);
    return distanceSquaredToBounds(point, min, max) <= radius * radius;
  }

  _metadata(point, x, y, z) {
    const key = SpatialChunkManager.chunkKey(x, y, z);
    const { min, max } = SpatialChunkManager.boundsFor(x, y, z, this.chunkSize);
    const distance = Math.sqrt(distanceSquaredToBounds(point, min, max));
    return {
      key,
      x,
      y,
      z,
      min,
      max,
      seed: hashCoordinates(x, y, z),
      distance,
      lod: lodForDistance(distance, this.radius)
    };
  }

  update(center) {
    assertFiniteVector(center);
    const point = { x: center.x, y: center.y, z: center.z };
    const size = this.chunkSize;
    const radius = this.radius;
    const cx = SpatialChunkManager.chunkIndex(point.x, size);
    const cy = SpatialChunkManager.chunkIndex(point.y, size);
    const cz = SpatialChunkManager.chunkIndex(point.z, size);
    const centerKey = SpatialChunkManager.chunkKey(cx, cy, cz);
    const reach = Math.ceil(radius / size) + 1;
    const wanted = new Map();

    for (let x = cx - reach; x <= cx + reach; x += 1) {
      for (let y = cy - reach; y <= cy + reach; y += 1) {
        for (let z = cz - reach; z <= cz + reach; z += 1) {
          const metadata = this._metadata(point, x, y, z);
          if (metadata.distance > radius) continue;
          wanted.set(metadata.key, metadata);
        }
      }
    }

    if (wanted.size > this.maxActiveChunks) {
      throw new RangeError(
        `Spatial chunk budget exceeded: ${wanted.size} > ${this.maxActiveChunks}.`
      );
    }

    for (const [key, oldChunk] of this.active) {
      if (wanted.has(key)) continue;
      this.onDispose(oldChunk.payload, oldChunk);
      this.active.delete(key);
    }

    for (const [key, metadata] of wanted) {
      const existing = this.active.get(key);
      if (existing) {
        Object.assign(existing, metadata);
        continue;
      }
      const payload = this.onCreate(metadata);
      this.active.set(key, { ...metadata, payload });
    }

    this.lastCenterChunk = centerKey;
    this.lastCenter = point;
    return this.getStats();
  }

  getActiveChunks() {
    return [...this.active.values()];
  }

  getStats() {
    const lod = { high: 0, medium: 0, low: 0 };
    for (const chunk of this.active.values()) lod[chunk.lod] += 1;

    const axisCoverage = {};
    const [centerX, centerY, centerZ] = (this.lastCenterChunk || "0:0:0").split(":").map(Number);
    const index = Math.ceil(this.radius / this.chunkSize) - 1;
    for (const axis of AXES) {
      const coords = {
        x: centerX + axis.x * index,
        y: centerY + axis.y * index,
        z: centerZ + axis.z * index
      };
      const key = SpatialChunkManager.chunkKey(coords.x, coords.y, coords.z);
      axisCoverage[axis.name] = this.active.has(key);
    }

    return {
      activeCount: this.active.size,
      chunkSize: this.chunkSize,
      radius: this.radius,
      lod,
      axisCoverage,
      centerChunk: this.lastCenterChunk
    };
  }

  dispose() {
    for (const chunk of this.active.values()) {
      this.onDispose(chunk.payload, chunk);
    }
    this.active.clear();
    this.lastCenter = null;
    this.lastCenterChunk = null;
  }
}
