import assert from "node:assert/strict";
import { SpatialChunkManager } from "../engine-lab/src/SpatialChunkManager.mjs";
import { terrainChunkHeightRange, terrainChunkLayer, terrainHeight } from "../engine-lab/src/TerrainField.mjs";
import { BIOME_IDS, generateBiomePlacements, sampleBiome } from "../engine-lab/src/BiomeField.mjs";
import { buildRoadChunkGeometry, generateMainRoadSamples, getRoadStats, nearestRoadSurfaceHeight } from "../engine-lab/src/RoadNetwork.mjs";

const disposed = [];
const manager = new SpatialChunkManager({
  chunkSize: 128,
  radius: 420,
  onCreate: (chunk) => ({ createdFor: chunk.key }),
  onDispose: (_payload, chunk) => disposed.push(chunk.key)
});

const initial = manager.update({ x: 0, y: 0, z: 0 });
assert.ok(initial.activeCount > 100, "the spherical region should cover a meaningful 3D chunk volume");
assert.equal(initial.chunkSize, 128);
assert.equal(initial.radius, 420);
assert.equal(terrainHeight(0, 0), 0, "the start/garage zone must remain flat");
assert.ok(terrainHeight(384, 0) > 64, "eastern high ground should occupy an upper Y layer");
assert.ok(terrainHeight(-384, 0) < -64, "western low ground should occupy a lower Y layer");
assert.equal(terrainChunkLayer(0, 0, 128), 0);
assert.equal(terrainChunkLayer(3, 0, 128), 1);
assert.equal(terrainChunkLayer(-3, 0, 128), -1);
const eastRange = terrainChunkHeightRange(3, 0, 128);
const westRange = terrainChunkHeightRange(-3, 0, 128);
assert.ok(eastRange.max > 100 && westRange.min < -80, "terrain relief must cross vertical chunk layers");
assert.ok(eastRange.max - eastRange.min > 35, "terrain patches need meaningful relief rather than a flat sheet");
assert.notEqual(terrainHeight(240, 96), terrainHeight(-240, 96), "the terrain field must vary in world space");
assert.equal(terrainHeight(384, 0), terrainHeight(384, 0), "terrain coordinates must resolve deterministically");
const sampledBiomes = new Set();
for (let z = -420; z <= 420; z += 42) {
  for (let x = -420; x <= 420; x += 42) sampledBiomes.add(sampleBiome(x, z).id);
}
assert.ok(sampledBiomes.size >= 4, "world climate and elevation should produce several distinct biomes");
for (const biome of sampledBiomes) assert.ok(BIOME_IDS.includes(biome));

const scatterA = generateBiomePlacements(3, -2, 128, 0x1234abcd, "high");
const scatterB = generateBiomePlacements(3, -2, 128, 0x1234abcd, "high");
assert.deepEqual(scatterA, scatterB, "biome props must remain stable for the same chunk seed");
assert.ok(scatterA.trees.length + scatterA.grass.length + scatterA.reeds.length + scatterA.rocks.length > 0);
for (const group of [scatterA.trees, scatterA.grass, scatterA.reeds, scatterA.rocks]) {
  for (const prop of group) {
    assert.ok(prop.x >= -57 && prop.x <= 57 && prop.z >= -57 && prop.z <= 57,
      "biome placements must remain inside their terrain patch");
  }
}
const lowScatter = generateBiomePlacements(3, -2, 128, 0x1234abcd, "low");
assert.ok(
  lowScatter.trees.length + lowScatter.grass.length + lowScatter.reeds.length + lowScatter.rocks.length
  <= scatterA.trees.length + scatterA.grass.length + scatterA.reeds.length + scatterA.rocks.length,
  "far LOD must not create more objects than near LOD"
);

for (const axis of ["+X", "-X", "+Y", "-Y", "+Z", "-Z"]) {
  assert.equal(initial.axisCoverage[axis], true, `missing symmetric world coverage on ${axis}`);
}

const activeKeys = new Set(manager.getActiveChunks().map((chunk) => chunk.key));
for (const chunk of manager.getActiveChunks()) {
  const opposite = SpatialChunkManager.chunkKey(-chunk.x, -chunk.y, -chunk.z);
  assert.ok(activeKeys.has(opposite), `XYZ volume is not symmetric around origin: ${chunk.key}`);
  assert.equal(chunk.seed, new SpatialChunkManager()._metadata({ x: 0, y: 0, z: 0 }, chunk.x, chunk.y, chunk.z).seed);
}

const diagonalKey = SpatialChunkManager.chunkKey(1, 1, 1);
assert.ok(activeKeys.has(diagonalKey), "diagonal 3D chunks must be included");
assert.ok(activeKeys.has("3:1:0"), "upper terrain chunks must be available in +Y");
assert.ok(activeKeys.has("-3:-1:0"), "lower terrain chunks must be available in -Y");
assert.ok(
  SpatialChunkManager.intersectsSphere({ x: 0, y: 0, z: 0 }, 3, 0, 0, 128, 420),
  "the +X boundary chunk must intersect the same sphere"
);

const beforeCameraTurn = manager.getStats().activeCount;
// Camera direction/frustum are not accepted by update; looking away cannot evict chunks.
manager.update({ x: 0, y: 0, z: 0 });
assert.equal(manager.getStats().activeCount, beforeCameraTurn);

const moved = manager.update({ x: 1024, y: 0, z: 0 });
assert.ok(moved.activeCount > 0);
assert.ok(disposed.length > 0, "chunks outside the player-centered radius should be retired");
assert.ok(
  manager.getActiveChunks().every((chunk) => chunk.x >= 5),
  "chunks behind the new player position should no longer remain active"
);

const deterministicA = new SpatialChunkManager();
const deterministicB = new SpatialChunkManager();
deterministicA.update({ x: -320, y: 64, z: 896 });
deterministicB.update({ x: -320, y: 64, z: 896 });
const seedsA = deterministicA.getActiveChunks().map((chunk) => [chunk.key, chunk.seed]).sort();
const seedsB = deterministicB.getActiveChunks().map((chunk) => [chunk.key, chunk.seed]).sort();
assert.deepEqual(seedsA, seedsB, "the same XYZ world coordinates must always produce the same seeds");

manager.dispose();
deterministicA.dispose();
deterministicB.dispose();

const roadSamplesA = generateMainRoadSamples();
const roadSamplesB = generateMainRoadSamples();
assert.deepEqual(roadSamplesA, roadSamplesB, "the main road spline must be deterministic");
assert.ok(roadSamplesA.length > 500, "the route must have enough samples for smooth bends");
assert.ok(Math.abs(roadSamplesA[0].x) < 0.001 && Math.abs(roadSamplesA[0].z) < 0.001,
  "the start/finish point must cross the central garage area");
const roadStats = getRoadStats(roadSamplesA);
assert.ok(roadStats.length > 1200 && roadStats.length < 4000, "main route length must be a coherent closed circuit");
console.log("ROAD GRADE METRICS", JSON.stringify(roadStats));
assert.ok(roadStats.maxGrade < 2.5, "road grade must remain finite and within a physically navigable bound");
assert.ok(roadStats.chunkKeys.length >= 8, "the circuit must traverse several world chunks");
assert.ok(Math.abs(nearestRoadSurfaceHeight(0, 0, roadSamplesA) - 1.05) < 0.001,
  "road start/finish elevation must remain 1.05 m above central terrain");
let roadSegments = 0;
let roadVertices = 0;
for (const key of roadStats.chunkKeys) {
  const [x, z] = key.split(":").map(Number);
  const y = terrainChunkLayer(x, z, 128);
  const chunkGeometry = buildRoadChunkGeometry(roadSamplesA, x, y, z, 128);
  roadSegments += chunkGeometry.segmentCount;
  roadVertices += chunkGeometry.positions.length / 3;
  assert.ok(chunkGeometry.indices.length > 0, `route chunk ${key} should contain road geometry`);
  assert.ok(chunkGeometry.positions.every(Number.isFinite), `road chunk ${key} has invalid geometry`);
}
assert.ok(roadSegments > roadSamplesA.length * 0.9, "road chunks should cover nearly every spline segment");
assert.ok(roadVertices > 10000, "road mesh should contain actual asphalt, shoulders and markings");

console.log("ROAD NETWORK TEST PASS", JSON.stringify({ ...roadStats, roadSegments, roadVertices }));

console.log("SPATIAL CHUNK TEST PASS", JSON.stringify(initial));
