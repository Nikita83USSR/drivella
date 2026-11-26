import { terrainHeight, terrainMoisture, terrainSlope } from "./TerrainField.mjs";
import { distanceToMainRoute } from "./WorldLayout.mjs";

export const BIOME_IDS = Object.freeze([
  "forest",
  "meadow",
  "rocky",
  "alpine",
  "wetland",
  "dryland"
]);

function makeRandom(seed) {
  let state = seed >>> 0;
  return function random() {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

export function sampleBiome(x, z) {
  if (!Number.isFinite(x) || !Number.isFinite(z)) {
    throw new TypeError("sampleBiome expects finite world coordinates.");
  }

  const elevation = terrainHeight(x, z);
  const slope = terrainSlope(x, z);
  const moisture = terrainMoisture(x, z);

  let id = "meadow";
  if (elevation > 138) {
    id = "alpine";
  } else if (slope > 0.78) {
    id = "rocky";
  } else if (elevation < -82) {
    id = "wetland";
  } else if (moisture > 0.555 && elevation < 118) {
    id = "forest";
  } else if (moisture < 0.315 && elevation > -58) {
    id = "dryland";
  }

  return { id, elevation, slope, moisture };
}

function addPlacement(target, x, z, random, extra = {}) {
  target.push({
    x,
    z,
    scale: 0.78 + random() * 0.56,
    yaw: random() * Math.PI * 2,
    ...extra
  });
}

/**
 * Deterministic decoration list for one horizontal terrain patch.
 * Placements are generated in local patch coordinates; geometry is combined
 * into one vegetation mesh and one rock mesh by the renderer.
 */
export function generateBiomePlacements(chunkX, chunkZ, chunkSize, seed, lod = "high") {
  if (!Number.isInteger(chunkX) || !Number.isInteger(chunkZ)) {
    throw new TypeError("Biome chunk coordinates must be integers.");
  }
  if (!Number.isFinite(chunkSize) || chunkSize <= 0) {
    throw new RangeError("chunkSize must be a positive finite number.");
  }
  if (!Number.isInteger(seed)) {
    throw new TypeError("Biome chunk seed must be an integer.");
  }
  if (!["high", "medium", "low"].includes(lod)) {
    throw new RangeError("Unknown biome placement LOD.");
  }

  const attempts = lod === "high" ? 58 : lod === "medium" ? 30 : 12;
  const half = chunkSize * 0.5;
  const margin = 7;
  const random = makeRandom(seed ^ 0x51ed270b);
  const result = {
    trees: [],
    grass: [],
    reeds: [],
    rocks: [],
    biomeCounts: Object.fromEntries(BIOME_IDS.map((id) => [id, 0]))
  };

  for (let index = 0; index < attempts; index += 1) {
    const localX = -half + margin + random() * (chunkSize - margin * 2);
    const localZ = -half + margin + random() * (chunkSize - margin * 2);
    const worldX = chunkX * chunkSize + localX;
    const worldZ = chunkZ * chunkSize + localZ;
    if (Math.hypot(worldX, worldZ) < 80 || distanceToMainRoute(worldX, worldZ) < 15) continue;

    const biome = sampleBiome(worldX, worldZ);
    result.biomeCounts[biome.id] += 1;
    const chance = random();

    if (biome.id === "forest") {
      if (chance < 0.83) {
        addPlacement(result.trees, localX, localZ, random, {
          height: 11 + random() * 10,
          crown: 3.4 + random() * 2.8,
          variant: random() > 0.58 ? 1 : 0
        });
      } else if (chance < 0.96) {
        addPlacement(result.rocks, localX, localZ, random, { size: 2.4 + random() * 3.2 });
      }
    } else if (biome.id === "meadow") {
      if (chance < 0.82) {
        addPlacement(result.grass, localX, localZ, random, { height: 1.0 + random() * 1.8 });
      } else if (chance < 0.91) {
        addPlacement(result.trees, localX, localZ, random, {
          height: 8 + random() * 5,
          crown: 2.4 + random() * 1.5,
          variant: 2
        });
      }
    } else if (biome.id === "rocky") {
      if (chance < 0.88) {
        addPlacement(result.rocks, localX, localZ, random, { size: 3.2 + random() * 7.5 });
      }
    } else if (biome.id === "alpine") {
      if (chance < 0.7) {
        addPlacement(result.rocks, localX, localZ, random, { size: 3.5 + random() * 8.5 });
      } else if (chance < 0.82 && lod === "high") {
        addPlacement(result.trees, localX, localZ, random, {
          height: 6 + random() * 5,
          crown: 2.2 + random() * 1.2,
          variant: 0
        });
      }
    } else if (biome.id === "wetland") {
      if (chance < 0.88) {
        addPlacement(result.reeds, localX, localZ, random, { height: 2 + random() * 2.6 });
      } else {
        addPlacement(result.rocks, localX, localZ, random, { size: 1.8 + random() * 2.8 });
      }
    } else if (biome.id === "dryland") {
      if (chance < 0.72) {
        addPlacement(result.rocks, localX, localZ, random, { size: 2.0 + random() * 4.8 });
      } else if (chance < 0.86) {
        addPlacement(result.grass, localX, localZ, random, { height: 0.7 + random() * 1.0 });
      }
    }
  }

  return result;
}
