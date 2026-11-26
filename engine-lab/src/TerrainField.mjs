export function terrainHeight(x, z) {
  if (!Number.isFinite(x) || !Number.isFinite(z)) {
    throw new TypeError("terrainHeight expects finite world coordinates.");
  }

  const distance = Math.hypot(x, z);
  const reliefMask = Math.max(0, Math.min(1, (distance - 48) / 96));
  const broad = Math.sin(x * 0.0041) * Math.cos(z * 0.0036) * 78;
  const ridge = Math.sin((x + z) * 0.0084) * Math.cos((x - z) * 0.0061) * 34;
  const detail = Math.sin(x * 0.024 + Math.cos(z * 0.012)) * Math.cos(z * 0.021) * 7;
  return reliefMask * (broad + ridge + detail);
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
