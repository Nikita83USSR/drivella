// Spatial hash for clipping the decorative terrain grid away from the asphalt and shoulders.
export function createRoadGridExclusionIndex(samples, { radius = 9.9, cellSize = 24 } = {}) {
  if (!Array.isArray(samples) || samples.length < 2) {
    return { radius, cellSize, segmentCount: 0, isNearRoad: () => false };
  }
  if (!Number.isFinite(radius) || radius <= 0 || !Number.isFinite(cellSize) || cellSize <= 0) {
    throw new RangeError("Road grid mask radius and cell size must be positive finite numbers.");
  }
  const buckets = new Map();
  const cellKey = (x, z) => `${x}:${z}`;
  let segmentCount = 0;
  for (let index = 0; index < samples.length; index += 1) {
    const a = samples[index], b = samples[(index + 1) % samples.length];
    if (![a?.x, a?.z, b?.x, b?.z].every(Number.isFinite)) continue;
    const segment = { ax: a.x, az: a.z, bx: b.x, bz: b.z };
    const minCellX = Math.floor((Math.min(a.x, b.x) - radius) / cellSize);
    const maxCellX = Math.floor((Math.max(a.x, b.x) + radius) / cellSize);
    const minCellZ = Math.floor((Math.min(a.z, b.z) - radius) / cellSize);
    const maxCellZ = Math.floor((Math.max(a.z, b.z) + radius) / cellSize);
    for (let cellX = minCellX; cellX <= maxCellX; cellX += 1) {
      for (let cellZ = minCellZ; cellZ <= maxCellZ; cellZ += 1) {
        const key = cellKey(cellX, cellZ), bucket = buckets.get(key);
        if (bucket) bucket.push(segment); else buckets.set(key, [segment]);
      }
    }
    segmentCount += 1;
  }
  const radiusSquared = radius * radius;
  function isNearRoad(x, z) {
    if (!Number.isFinite(x) || !Number.isFinite(z)) return false;
    const bucket = buckets.get(cellKey(Math.floor(x / cellSize), Math.floor(z / cellSize)));
    if (!bucket) return false;
    for (const segment of bucket) {
      const dx = segment.bx - segment.ax, dz = segment.bz - segment.az;
      const lengthSquared = dx * dx + dz * dz;
      const t = lengthSquared > 1e-12
        ? Math.max(0, Math.min(1, ((x - segment.ax) * dx + (z - segment.az) * dz) / lengthSquared))
        : 0;
      const nearestX = segment.ax + dx * t, nearestZ = segment.az + dz * t;
      const distanceX = x - nearestX, distanceZ = z - nearestZ;
      if (distanceX * distanceX + distanceZ * distanceZ <= radiusSquared) return true;
    }
    return false;
  }
  return { radius, cellSize, segmentCount, isNearRoad };
}
