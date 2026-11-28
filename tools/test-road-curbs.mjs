import assert from "node:assert/strict";
import { buildRoadChunkGeometry, buildRoadCurbChunkGeometry, generateMainRoadSamples } from "../engine-lab/src/RoadNetwork.mjs";

const samples = generateMainRoadSamples();
const road = buildRoadChunkGeometry(samples, 0, 0, 0);
const stripes = buildRoadCurbChunkGeometry(samples, 0, 0, 0);

assert.ok(road.indices.length > 0, "the asphalt geometry must be present");
assert.ok(stripes.indices.length > 0, "the roadside neon strips must be generated");

const oldGameAsphalt = [0.055, 0.055, 0.105];
const oldGameShoulder = [0.075, 0.07, 0.13];
const oldGameWhiteMarking = [0.92, 0.96, 1.0];
const hasColor = (colors, expected) => colors.some((_, index) => {
  if (index % 4 !== 0) return false;
  return expected.every((value, channel) => Math.abs(colors[index + channel] - value) < 1e-6);
});
assert.ok(hasColor(road.colors, oldGameAsphalt), "asphalt must retain the stable game's dark blue-black tone");
assert.ok(hasColor(road.colors, oldGameShoulder), "road shoulders must stay subdued, not neon");
assert.ok(hasColor(road.colors, oldGameWhiteMarking), "lane marks must be neutral white rather than synth-cyan");

assert.ok(stripes.segmentCount > 0, "both roadside strips must be counted");
assert.equal(stripes.positions.length % 3, 0, "stripe positions must be valid XYZ triples");
assert.equal(stripes.colors.length % 4, 0, "stripe colours must be valid RGBA values");
assert.equal(stripes.positions.length / 3, stripes.colors.length / 4, "every stripe vertex must have a colour");
assert.ok(stripes.positions.every(Number.isFinite), "stripe geometry must contain finite coordinates");
assert.ok(stripes.stripeWidth > 0.12 && stripes.stripeWidth < 0.22, "the neon edge must be a narrow painted line");
assert.ok(stripes.height > 0 && stripes.height < 0.04, "the neon line must sit nearly flush with the shoulder");
assert.ok(hasColor(stripes.colors, [0.12, 0.72, 0.98]), "one roadside strip must retain the cyan neon palette");
assert.ok(hasColor(stripes.colors, [0.92, 0.13, 0.56]), "the opposite roadside strip must retain the magenta neon palette");

const emptyNeighbor = buildRoadCurbChunkGeometry(samples, 1000, 0, 1000);
assert.equal(emptyNeighbor.indices.length, 0, "distant chunks must not receive unrelated roadside strips");

console.log("ROAD STRIPES PASS: dark asphalt, thin cyan/magenta shoulder lines, no raised neon curb.");
