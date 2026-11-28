import assert from "node:assert/strict";
import { buildRoadChunkGeometry, buildRoadCurbChunkGeometry, buildRoadFurnitureChunkGeometry, generateMainRoadSamples } from "../engine-lab/src/RoadNetwork.mjs";

const samples = generateMainRoadSamples();
const road = buildRoadChunkGeometry(samples, 0, 0, 0);
const whiteMarkings = road.markingGeometry;
const fence = buildRoadCurbChunkGeometry(samples, 0, 0, 0);

assert.ok(road.indices.length > 0, "the asphalt geometry must be present");
assert.ok(whiteMarkings?.indices?.length > 0, "crisp lane paint must be a separate mesh");
assert.ok(fence.left.indices.length > 0 && fence.right.indices.length > 0,
  "both roadside neon fence rails must be generated");

const oldGameAsphalt = [0.055, 0.055, 0.105];
const oldGameShoulder = [0.075, 0.07, 0.13];
const pureWhite = [1.0, 1.0, 1.0];
const hasColor = (colors, expected) => colors.some((_, index) => {
  if (index % 4 !== 0) return false;
  return expected.every((value, channel) => Math.abs(colors[index + channel] - value) < 1e-6);
});
assert.ok(hasColor(road.colors, oldGameAsphalt), "asphalt must retain the stable game's dark blue-black tone");
assert.ok(hasColor(road.colors, oldGameShoulder), "road shoulders must stay subdued, not neon");
assert.ok(hasColor(whiteMarkings.colors, pureWhite), "lane dashes must be crisp pure white");

assert.ok(whiteMarkings.edgeSegmentCount > 0, "continuous white road-edge lines must be generated");
assert.ok(whiteMarkings.centerDashSegmentCount > 0, "the dashed white centre divider must be generated");
assert.equal(whiteMarkings.segmentCount, whiteMarkings.edgeSegmentCount + whiteMarkings.centerDashSegmentCount,
  "all visible road-marking sections must be counted");
assert.equal(whiteMarkings.positions.length % 3, 0, "marking positions must be valid XYZ triples");
assert.equal(whiteMarkings.colors.length % 4, 0, "marking colors must be valid RGBA values");
assert.ok(whiteMarkings.positions.every(Number.isFinite), "marking geometry must contain finite coordinates");

assert.equal(fence.railOffset, 9.15, "neon fence must return to the old 9.15 m roadside position");
assert.ok(fence.segmentCount > 0 && fence.postCount > 0, "the neon fence must include rails and regular uprights");
assert.ok(fence.left.postCount > 0 && fence.right.postCount > 0, "both sides need visible fence posts");
assert.ok(fence.left.positions.every(Number.isFinite) && fence.right.positions.every(Number.isFinite),
  "fence geometry must contain finite coordinates");
assert.ok(hasColor(fence.left.colors, [0.96, 0.045, 0.48]), "the left fence rail must keep its magenta color");
assert.ok(hasColor(fence.right.colors, [0.06, 0.58, 1.0]), "the right fence rail must keep its cyan color");

const furniture = buildRoadFurnitureChunkGeometry(samples, 0, 0, 0);
assert.equal(furniture.guardrailSegments, 0, "do not render a second metallic fence beside the neon roadside barrier");
assert.equal(furniture.guardrailPosts, 0, "the duplicate metallic fence posts must be absent");

const emptyNeighbor = buildRoadCurbChunkGeometry(samples, 1000, 0, 1000);
assert.equal(emptyNeighbor.left.indices.length, 0, "distant chunks must not receive unrelated left fence geometry");
assert.equal(emptyNeighbor.right.indices.length, 0, "distant chunks must not receive unrelated right fence geometry");

console.log("ROAD VISUALS PASS: solid white edge lines + dashed centre divider; single cyan/magenta neon fence at 9.15 m.");
