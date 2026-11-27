import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { inflateSync } from "node:zlib";
import { calculateAckermannAngles, calculateLateralTireForce, calculateSpeedSteerLimit, calculateStaticSuspensionCompression, calculateVehicleMotionTelemetry, clampTireForce, measureCountachRigMetrics, wrapVehicleAngle } from "../engine-lab/src/VehicleController.mjs";

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

function tyreRadius(partName) {
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
    // Countach part vertices are authored around each wheel mesh's local origin.
    radius = Math.max(radius, Math.hypot(point[1], point[2]));
  }
  return { radius, min, max };
}

const front = tyreRadius("front_tyre");
const rear = tyreRadius("rear_tyre");
const wheelRadius = (front.radius + rear.radius) * 0.5;
console.log("COUNTACH RAW TYRE MEASUREMENTS", JSON.stringify({ front, rear }));
assert.ok(front.radius > 0 && front.radius < 2, "Front tyre radius must be finite and positive.");
assert.ok(rear.radius > 0 && rear.radius < 2, "Rear tyre radius must be finite and positive.");
const rig = measureCountachRigMetrics(meta, wheelRadius);
assert.ok(Math.abs(rig.track - 1.8548473716) < 1e-6);
assert.ok(Math.abs(rig.wheelbase - 3.2824337110) < 1e-6);
const frontStaticCompression=calculateStaticSuspensionCompression(meta.wheelCenters.front[1],wheelRadius);
const rearStaticCompression=calculateStaticSuspensionCompression(meta.wheelCenters.rear[1],wheelRadius);
assert.ok(frontStaticCompression>.075&&frontStaticCompression<.10,"Front static sag must preload the springs to support the 1,250 kg chassis.");
assert.ok(rearStaticCompression>.065&&rearStaticCompression<.09,"Rear static sag must preload the springs to support the 1,250 kg chassis.");

const right = calculateAckermannAngles(0.7, rig.wheelbase, rig.track);
assert.ok(right.left > 0 && right.right > right.left, "Right-hand turn must steer right wheel tighter.");
const left = calculateAckermannAngles(-0.7, rig.wheelbase, rig.track);
assert.ok(left.right < 0 && Math.abs(left.left) > Math.abs(left.right), "Left-hand turn must steer left wheel tighter.");
assert.deepEqual(calculateAckermannAngles(0, rig.wheelbase, rig.track), { left: 0, right: 0 });
assert.equal(calculateSpeedSteerLimit(0,rig.wheelbase,7,.49),.49);
assert.ok(calculateSpeedSteerLimit(7.5,rig.wheelbase,7,.49)<.49);
assert.ok(calculateSpeedSteerLimit(15,rig.wheelbase,7,.49)<calculateSpeedSteerLimit(7.5,rig.wheelbase,7,.49));
assert.deepEqual(clampTireForce(1800, 900, 4000), { longitudinal: 1800, lateral: 900, scale: 1 });
const saturated = clampTireForce(4000, 3000, 3500);
assert.ok(Math.hypot(saturated.longitudinal, saturated.lateral) <= 3500.000001 && saturated.scale < 1);
assert.ok(calculateLateralTireForce(1, 5000, 4000) < 0, "lateral tyre force must oppose slip");
assert.ok(Math.abs(calculateLateralTireForce(100, 5000, 4000)) <= 3680.000001, "lateral tyre force must obey the grip limit");
const motion = calculateVehicleMotionTelemetry({ x: 3, y: 0, z: 10 }, 0, 0.42);
assert.ok(Math.abs(motion.forwardSpeed - 10) < 1e-9);
assert.ok(Math.abs(motion.lateralSpeed - 3) < 1e-9);
assert.ok(motion.slipAngle > 0 && motion.yawRate === 0.42);
assert.ok(Math.abs(wrapVehicleAngle(Math.PI * 1.5) + Math.PI * 0.5) < 1e-9);

console.log("COUNTACH SOURCE GEOMETRY PASS", JSON.stringify({
  rawBytes: raw.byteLength,
  encodedCharacters: encoded.length,
  frontTyre: front,
  rearTyre: rear,
  wheelbase: rig.wheelbase,
  track: rig.track,
  measuredWheelRadius: rig.wheelRadius
}));
console.log("VEHICLE CONTROLLER UNIT PASS", JSON.stringify({ right, left, saturated, frontStaticCompression, rearStaticCompression,steerLow:calculateSpeedSteerLimit(0,rig.wheelbase,7,.49),steerMid:calculateSpeedSteerLimit(7.5,rig.wheelbase,7,.49),steerHigh:calculateSpeedSteerLimit(15,rig.wheelbase,7,.49) }));
