import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { inflateSync } from "node:zlib";
import { calculateAckermannAngles, clampTireForce, measureCountachRigMetrics } from "../engine-lab/src/VehicleController.mjs";

const assetDir = new URL("../engine-lab/assets/", import.meta.url);
const names = [
  "countach_model_0.js", "countach_model_0a.js", "countach_model_0b.js",
  "countach_model_0c.js", "countach_model_0d.js", "countach_model_1.js",
  "countach_model_2.js", "countach_model_3a.js", "countach_model_3b.js",
  "countach_model_3c.js", "countach_model_3d.js"
];
const source = await Promise.all(names.map(async (name) =>
  readFile(new URL(name, assetDir), "utf8")
));
const metadataMatch = source[0].match(/window\.DRIVELLA_COUNTACH_META=(\{.*?\});/s);
assert.ok(metadataMatch, "Countach v2 rig metadata must be present in the copied model asset.");
const meta = JSON.parse(metadataMatch[1]);
const encoded = source.flatMap((chunk) =>
  [...chunk.matchAll(/DRIVELLA_COUNTACH_DATA\+='([^']*)'/g)].map((match) => match[1])
).join("");
assert.ok(encoded.length > 10000, "All compressed Countach model parts must be present locally.");
const raw = inflateSync(Buffer.from(encoded, "base64"));
assert.equal(raw.byteLength, meta.rawBytes, "Decompressed Countach bytes must match its metadata.");
const view = new DataView(raw.buffer, raw.byteOffset, raw.byteLength);

function tyreRadius(partName, centre) {
  const part = meta.parts.find((entry) => entry.name === partName);
  assert.ok(part, `Missing ${partName} triangle metadata.`);
  let radius = 0;
  let min = [Infinity, Infinity, Infinity];
  let max = [-Infinity, -Infinity, -Infinity];
  for (let index = 0; index < part.indexCount; index += 1) {
    const vertexIndex = view.getUint16(part.indexOffset + index * 2, true);
    const offset = part.vertexOffset + vertexIndex * 6;
    const point = [
      view.getInt16(offset, true) / meta.unitsPerGameUnit,
      view.getInt16(offset + 2, true) / meta.unitsPerGameUnit,
      view.getInt16(offset + 4, true) / meta.unitsPerGameUnit
    ];
    for (let axis = 0; axis < 3; axis += 1) {
      min[axis] = Math.min(min[axis], point[axis]);
      max[axis] = Math.max(max[axis], point[axis]);
    }
    radius = Math.max(radius, Math.hypot(
      point[1] - centre[1],
      point[2] - centre[2]
    ));
  }
  return { radius, min, max };
}

const front = tyreRadius("front_tyre", meta.wheelCenters.front);
const rear = tyreRadius("rear_tyre", meta.wheelCenters.rear);
const wheelRadius = (front.radius + rear.radius) * 0.5;
console.log("COUNTACH RAW TYRE MEASUREMENTS", JSON.stringify({ front, rear }));
assert.ok(front.radius > 0 && front.radius < 2, "Front tyre radius must be finite and positive.");
assert.ok(rear.radius > 0 && rear.radius < 2, "Rear tyre radius must be finite and positive.");
const rig = measureCountachRigMetrics(meta, wheelRadius);
assert.ok(Math.abs(rig.track - 1.8548473716) < 1e-6);
assert.ok(Math.abs(rig.wheelbase - 3.2824337110) < 1e-6);

const right = calculateAckermannAngles(0.7, rig.wheelbase, rig.track);
assert.ok(right.left > 0 && right.right > right.left, "Right-hand turn must steer right wheel tighter.");
const left = calculateAckermannAngles(-0.7, rig.wheelbase, rig.track);
assert.ok(left.right < 0 && Math.abs(left.left) > Math.abs(left.right), "Left-hand turn must steer left wheel tighter.");
assert.deepEqual(calculateAckermannAngles(0, rig.wheelbase, rig.track), { left: 0, right: 0 });
assert.deepEqual(clampTireForce(1800, 900, 4000), { longitudinal: 1800, lateral: 900, scale: 1 });
const saturated = clampTireForce(4000, 3000, 3500);
assert.ok(Math.hypot(saturated.longitudinal, saturated.lateral) <= 3500.000001 && saturated.scale < 1);

console.log("COUNTACH SOURCE GEOMETRY PASS", JSON.stringify({
  rawBytes: raw.byteLength,
  encodedCharacters: encoded.length,
  frontTyre: front,
  rearTyre: rear,
  wheelbase: rig.wheelbase,
  track: rig.track,
  measuredWheelRadius: rig.wheelRadius
}));
console.log("VEHICLE CONTROLLER UNIT PASS", JSON.stringify({ right, left, saturated }));
