import assert from "node:assert/strict";
import { SpatialChunkManager } from "../engine-lab/src/SpatialChunkManager.mjs";
import { getMainRoadElevationStats, isInsideTunnelCorridor, rawTerrainHeight, registerTunnelCorridors, terrainChunkHeightRange, terrainChunkLayer, terrainHeight } from "../engine-lab/src/TerrainField.mjs";
import { distanceToMainRoute } from "../engine-lab/src/WorldLayout.mjs";
import { BIOME_IDS, generateBiomePlacements, sampleBiome } from "../engine-lab/src/BiomeField.mjs";
import { buildRoadChunkGeometry, buildRoadFurnitureChunkGeometry, generateMainRoadSamples, getRoadStats, getRoadFurnitureStats, nearestRoadSurfaceHeight } from "../engine-lab/src/RoadNetwork.mjs";
import { buildHydrologyChunkGeometry, classifyRoadHydrologyCrossings, getHydrologyStats, getNearestWaterFeature } from "../engine-lab/src/HydrologyField.mjs";
import { buildTunnelChunkGeometry, detectTunnelSegments, getTunnelStats, TUNNEL_CLEAR_HEIGHT } from "../engine-lab/src/TunnelNetwork.mjs";

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

const hydrologyStats = getHydrologyStats();
assert.ok(hydrologyStats.riverCount >= 2, "the world should include a main river and tributary");
assert.ok(hydrologyStats.lakeCount >= 1, "the world should include at least one lake basin");
assert.ok(hydrologyStats.riverSampleCount > 100, "river splines should be densely sampled");
const farRiver = getNearestWaterFeature(385, -235, 30);
assert.ok(farRiver && farRiver.kind === "river", "river spatial queries should find a nearby river segment");
assert.ok(terrainHeight(385, -235) <= farRiver.waterY - 1.4,
  "river terrain must be carved below the water surface rather than leaving water over solid ground");

const waterChunkTotals = {
  chunks: 0,
  riverSegments: 0,
  lakeTriangles: 0,
  shoreVertices: 0,
  waterVertices: 0
};
for (let chunkX = -4; chunkX <= 4; chunkX += 1) {
  for (let chunkZ = -4; chunkZ <= 4; chunkZ += 1) {
    const chunkY = terrainChunkLayer(chunkX, chunkZ, 128);
    const hydro = buildHydrologyChunkGeometry(chunkX, chunkY, chunkZ, 128, terrainHeight);
    assert.ok(hydro.water.positions.every(Number.isFinite), `water chunk ${chunkX}:${chunkZ} has invalid vertices`);
    assert.ok(hydro.shore.positions.every(Number.isFinite), `shore chunk ${chunkX}:${chunkZ} has invalid vertices`);
    assert.equal(hydro.water.indices.length % 3, 0, "water geometry must contain complete triangles");
    assert.equal(hydro.shore.indices.length % 3, 0, "shore geometry must contain complete triangles");
    if (hydro.hasWater || hydro.hasShore) waterChunkTotals.chunks += 1;
    waterChunkTotals.riverSegments += hydro.riverSegments;
    waterChunkTotals.lakeTriangles += hydro.lakeTriangles;
    waterChunkTotals.shoreVertices += hydro.shore.positions.length / 3;
    waterChunkTotals.waterVertices += hydro.water.positions.length / 3;
  }
}
assert.ok(waterChunkTotals.chunks >= 5, "rivers and lakes should stream across multiple world chunks");
assert.ok(waterChunkTotals.riverSegments > 80, "the streamed water network should include river surfaces");
assert.ok(waterChunkTotals.lakeTriangles >= 48, "lake polygons should be triangulated into water surfaces");
assert.ok(waterChunkTotals.shoreVertices > 500, "riverbanks and lake shores should have generated geometry");

const roadSamplesA = generateMainRoadSamples();
const roadSamplesB = generateMainRoadSamples();
assert.deepEqual(roadSamplesA, roadSamplesB, "the main road spline must be deterministic");
assert.ok(roadSamplesA.length > 500, "the route must have enough samples for smooth bends");
assert.ok(Math.abs(roadSamplesA[0].x) < 0.001 && Math.abs(roadSamplesA[0].z) < 0.001,
  "the start/finish point must cross the central garage area");
const roadStats = getRoadStats(roadSamplesA);
const tunnels = detectTunnelSegments(roadSamplesA);
const tunnelStats = getTunnelStats(tunnels);
const tunnelSpatialStats = registerTunnelCorridors(tunnels);
console.log("TUNNEL DETECTION METRICS", JSON.stringify({ ...tunnelStats, tunnelSpatialStats }));
assert.ok(tunnels.length >= 1, "the road should pass beneath at least one naturally overhung mountain section");
assert.ok(tunnels.every((tunnel) =>
  tunnel.length >= 48
  && tunnel.minCover > TUNNEL_CLEAR_HEIGHT
  && tunnel.maxCover >= 12.5
  && tunnel.path.length >= 8
), "detected tunnels must have sufficient length and mountain cover for a vehicle-sized bore");
assert.equal(tunnelSpatialStats.tunnelCount, tunnels.length);
assert.ok(tunnelSpatialStats.segmentCount >= tunnels.length * 7,
  "tunnel cover corridors must be indexed for terrain generation");
let tunnelChunks = 0;
let tunnelSegments = 0;
let tunnelPortals = 0;
let tunnelRibs = 0;
let tunnelLightSegments = 0;
for (const tunnel of tunnels) {
  const sample = tunnel.path[Math.floor(tunnel.path.length / 2)];
  assert.ok(isInsideTunnelCorridor(sample.x, sample.z),
    `${tunnel.id} centreline must register a terrain roof corridor`);
  assert.ok(isInsideTunnelCorridor(
    sample.x + sample.normalX * 5,
    sample.z + sample.normalZ * 5
  ), `${tunnel.id} corridor must cover the full road width`);
  assert.ok(!isInsideTunnelCorridor(
    sample.x + sample.normalX * 24,
    sample.z + sample.normalZ * 24
  ), `${tunnel.id} corridor must not flatten distant natural terrain`);
  assert.ok(Math.abs(terrainHeight(sample.x, sample.z) - rawTerrainHeight(sample.x, sample.z)) < 0.001,
    `${tunnel.id} must retain the mountain surface as its roof`);
  assert.ok(terrainHeight(sample.x, sample.z) - sample.y >= TUNNEL_CLEAR_HEIGHT,
    `${tunnel.id} needs clear overburden above the road`);
}
for (const key of roadStats.chunkKeys) {
  const [x, z] = key.split(":").map(Number);
  const y = terrainChunkLayer(x, z, 128);
  const geometry = buildTunnelChunkGeometry(tunnels, x, y, z, 128);
  assert.ok(geometry.positions.every(Number.isFinite), `tunnel chunk ${key} contains invalid vertices`);
  assert.equal(geometry.indices.length % 3, 0, `tunnel chunk ${key} has incomplete triangles`);
  if (geometry.indices.length) tunnelChunks += 1;
  tunnelSegments += geometry.segmentCount;
  tunnelPortals += geometry.portalCount;
  tunnelRibs += geometry.ribCount;
  tunnelLightSegments += geometry.lightSegments;
}
assert.ok(tunnelChunks >= 1, "tunnel bores must be generated in streamed world chunks");
assert.ok(tunnelSegments > 0, "tunnel geometry must contain a continuous inner lining");
assert.equal(tunnelPortals, tunnels.length * 2, "every tunnel must have an entrance and an exit portal");
assert.ok(tunnelRibs > 0, "tunnel bores must have repeated structural ribs");
assert.ok(tunnelLightSegments > 0, "tunnel interiors must have continuous local light strips");
console.log("TUNNEL NETWORK TEST PASS", JSON.stringify({ tunnelChunks, tunnelSegments, tunnelPortals, tunnelRibs, tunnelLightSegments }));

const bridgeClassification = classifyRoadHydrologyCrossings(roadSamplesA);
assert.ok(bridgeClassification.crossings.length >= 1, "the main route should classify at least one river/lake crossing");
assert.ok(
  bridgeClassification.crossings.every((crossing) =>
    Number.isFinite(crossing.minClearance)
    && crossing.minClearance >= 3.95
    && crossing.sampleCount > 0
    && crossing.structure === "bridge-candidate"
  ),
  "every road-water crossing must have a raised road deck with at least 4 m of water clearance"
);
assert.equal(bridgeClassification.unresolvedCount, 0,
  "no route section may remain below the water surface after bridge-profile elevation");
for (const crossing of bridgeClassification.crossings) {
  const water = getNearestWaterFeature(crossing.x, crossing.z, 24);
  assert.ok(water && water.kind === "river", `${crossing.id} must resolve to an actual river segment`);
  assert.ok(terrainHeight(water.x, water.z) <= water.waterY - 1.4,
    `${crossing.id} must preserve an open river channel beneath the raised deck`);
}
console.log("HYDROLOGY TEST PASS", JSON.stringify({ ...hydrologyStats, waterChunkTotals, bridgeClassification }));
assert.ok(roadStats.length > 1200 && roadStats.length < 4000, "main route length must be a coherent closed circuit");
const roadProfileStats = getMainRoadElevationStats();
console.log("ROAD GRADE METRICS", JSON.stringify({ ...roadStats, profile: roadProfileStats }));
assert.ok(roadProfileStats.maxGrade <= 0.2001, "terrain corridor must enforce the 20% max road grade");
assert.ok(roadStats.maxGrade <= 0.201, "the asphalt profile must follow the grade-limited terrain corridor");
assert.ok(distanceToMainRoute(0, 0) < 0.1, "start/finish must match the shared world route layout");
assert.ok(roadStats.chunkKeys.length >= 8, "the circuit must traverse several world chunks");
const roadFurnitureStats = getRoadFurnitureStats(roadSamplesA);
assert.ok(roadFurnitureStats.transitionSegments > 0, "cached road edge statistics must identify cut/fill sections");
assert.ok(roadFurnitureStats.drainageSegments > 0, "cached road edge statistics must identify drainage sections");
assert.ok(roadFurnitureStats.guardrailSegments > 0, "cached road edge statistics must identify exposed drops");
assert.ok(Math.abs(nearestRoadSurfaceHeight(0, 0, roadSamplesA) - 1.05) < 0.001,
  "road start/finish elevation must remain 1.05 m above central terrain");
let roadSegments = 0;
let roadVertices = 0;
let transitionSegments = 0;
let drainageSegments = 0;
let guardrailSegments = 0;
let guardrailPosts = 0;
let furnitureVertices = 0;
let bridgePiers = 0;
let bridgeGirderSegments = 0;
for (const key of roadStats.chunkKeys) {
  const [x, z] = key.split(":").map(Number);
  const y = terrainChunkLayer(x, z, 128);
  const chunkGeometry = buildRoadChunkGeometry(roadSamplesA, x, y, z, 128);
  roadSegments += chunkGeometry.segmentCount;
  roadVertices += chunkGeometry.positions.length / 3;
  assert.ok(chunkGeometry.indices.length > 0, `route chunk ${key} should contain road geometry`);
  assert.ok(chunkGeometry.positions.every(Number.isFinite), `road chunk ${key} has invalid geometry`);

  const furniture = buildRoadFurnitureChunkGeometry(roadSamplesA, x, y, z, 128);
  transitionSegments += furniture.transitionSegments;
  drainageSegments += furniture.drainageSegments;
  guardrailSegments += furniture.guardrailSegments;
  guardrailPosts += furniture.guardrailPosts;
  furnitureVertices += furniture.positions.length / 3;
  bridgePiers += furniture.bridgePiers;
  bridgeGirderSegments += furniture.bridgeGirderSegments;
  assert.ok(furniture.positions.every(Number.isFinite), `road furniture chunk ${key} has invalid geometry`);
  assert.equal(furniture.indices.length % 3, 0, `road furniture chunk ${key} has incomplete triangles`);
}
assert.ok(roadSegments > roadSamplesA.length * 0.9, "road chunks should cover nearly every spline segment");
assert.ok(roadVertices > 10000, "road mesh should contain actual asphalt, shoulders and markings");
assert.ok(transitionSegments > 0, "cut/fill transitions should be dressed where terrain diverges from the road shoulder");
assert.ok(drainageSegments > 0, "uphill road cuts should receive drainage channels");
assert.ok(guardrailSegments > 0 && guardrailPosts > 0, "exposed road drops should receive guardrails and supports");
assert.ok(furnitureVertices > 1000, "roadside transition and safety geometry should be generated");
assert.ok(bridgePiers >= 4, "raised river crossings should receive visible structural support piers");
assert.ok(bridgeGirderSegments >= 6, "raised river crossings should receive continuous structural deck girders");

console.log("ROAD NETWORK TEST PASS", JSON.stringify({
  ...roadStats, roadSegments, roadVertices,
  transitionSegments, drainageSegments, guardrailSegments, guardrailPosts, furnitureVertices, bridgePiers, bridgeGirderSegments
}));

console.log("SPATIAL CHUNK TEST PASS", JSON.stringify(initial));
