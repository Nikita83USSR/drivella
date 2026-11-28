import assert from "node:assert/strict";
import { buildRoadChunkGeometry, buildRoadCurbChunkGeometry, generateMainRoadSamples } from "../engine-lab/src/RoadNetwork.mjs";

const samples = generateMainRoadSamples();
const road = buildRoadChunkGeometry(samples, 0, 0, 0);
const curbs = buildRoadCurbChunkGeometry(samples, 0, 0, 0);

assert.ok(road.indices.length > 0, "the asphalt geometry must be present");
assert.ok(curbs.indices.length > 0, "raised neon kerbs must be generated");
assert.ok(curbs.segmentCount > 0, "kerb segments must be counted");
assert.equal(curbs.positions.length % 3, 0, "kerb positions must be valid XYZ triples");
assert.equal(curbs.colors.length % 4, 0, "kerb colours must be valid RGBA values");
assert.equal(curbs.positions.length / 3, curbs.colors.length / 4, "every kerb vertex must have a colour");
assert.ok(curbs.positions.every(Number.isFinite), "kerb geometry must contain finite coordinates");

const maxRoadY = Math.max(...road.positions.filter((_, index) => index % 3 === 1));
const maxCurbY = Math.max(...curbs.positions.filter((_, index) => index % 3 === 1));
assert.ok(maxCurbY > maxRoadY + 0.08, "kerb top must stand visibly above the asphalt");

const expected = [0.13, 0.68, 0.98];
const hasGridBlue = curbs.colors.some((_, index) => {
  if (index % 4 !== 0) return false;
  return Math.abs(curbs.colors[index] - expected[0]) < 1e-6
    && Math.abs(curbs.colors[index + 1] - expected[1]) < 1e-6
    && Math.abs(curbs.colors[index + 2] - expected[2]) < 1e-6;
});
assert.ok(hasGridBlue, "kerbs must use the cyan-blue grid palette");

const emptyNeighbor = buildRoadCurbChunkGeometry(samples, 1000, 0, 1000);
assert.equal(emptyNeighbor.indices.length, 0, "distant chunks must not receive unrelated kerb geometry");

console.log("ROAD CURBS PASS: asphalt remains separate, raised visual kerbs use the cyan-blue grid palette.");
