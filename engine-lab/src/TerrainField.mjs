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

export function terrainHeight(x, z) {
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

  return reliefMask * (macroTilt + continental + ridged + detail + valley);
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
