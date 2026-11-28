import assert from "node:assert/strict";
import { createRoadGridExclusionIndex } from "../engine-lab/src/RoadGridMask.mjs";
const route = [
  { x: 0, z: 0 }, { x: 100, z: 0 },
  { x: 100, z: 100 }, { x: 0, z: 100 }
];
const mask = createRoadGridExclusionIndex(route, { radius: 10, cellSize: 24 });
assert.equal(mask.segmentCount, 4, "the closed road loop must include its closing segment");
assert.equal(mask.isNearRoad(50, 0), true, "points on straight road segments must be excluded");
assert.equal(mask.isNearRoad(50, 9.99), true, "the shoulder and safety margin must be excluded");
assert.equal(mask.isNearRoad(50, 10.01), false, "points outside the road margin must keep the terrain grid");
assert.equal(mask.isNearRoad(0, 50), true, "the closing road segment must also be indexed");
assert.equal(mask.isNearRoad(100, 100), true, "corners shared by two segments must be excluded");
assert.equal(mask.isNearRoad(50, 50), false, "the decorative grid must remain inside the terrain area");
assert.equal(mask.isNearRoad(Number.NaN, 0), false, "invalid query coordinates must be safe");
assert.equal(createRoadGridExclusionIndex([]).isNearRoad(0, 0), false, "an empty route must produce an inactive mask");
console.log("ROAD GRID MASK PASS: asphalt, shoulders, and corners are excluded without hiding nearby terrain.");
