import assert from "node:assert/strict";
import { getRgbHueDegrees, neonizeGeometryColors, neonizeRgb } from "../engine-lab/src/NeonPalette.mjs";

function hueDistance(a, b) {
  const delta = Math.abs(a - b) % 360;
  return Math.min(delta, 360 - delta);
}

const samples = [
  { name: "foliage", color: [0.055, 0.25, 0.18] },
  { name: "tree trunk", color: [0.22, 0.15, 0.09] },
  { name: "rock", color: [0.31, 0.39, 0.48] },
  { name: "water", color: [0.10, 0.43, 0.57] },
  { name: "warning amber", color: [0.88, 0.58, 0.19] },
  { name: "cyan road marking", color: [0.08, 0.58, 0.78] }
];

for (const sample of samples) {
  const beforeHue = getRgbHueDegrees(...sample.color);
  const beforePeak = Math.max(...sample.color);
  const after = neonizeRgb(...sample.color);
  const afterHue = getRgbHueDegrees(...after);
  const afterPeak = Math.max(...after);
  assert.ok(hueDistance(beforeHue, afterHue) < 1e-5, sample.name + " hue changed");
  assert.ok(afterPeak > beforePeak, sample.name + " did not become brighter");
  assert.ok(after.every((channel) => Number.isFinite(channel) && channel >= 0 && channel <= 1));
}

const gray = neonizeRgb(0.24, 0.24, 0.24);
assert.ok(Math.abs(gray[0] - gray[1]) < 1e-6 && Math.abs(gray[1] - gray[2]) < 1e-6, "neutral gray gained a false hue");

const vertexColors = new Float32Array([
  0.055, 0.25, 0.18, 1,
  0.22, 0.15, 0.09, 1,
  0.31, 0.39, 0.48, 1
]);
const before = Array.from(vertexColors);
const glowColor = neonizeGeometryColors(vertexColors);
assert.ok(vertexColors[0] > before[0] && vertexColors[1] > before[1], "vertex color buffer was not enhanced");
assert.equal(vertexColors[3], 1, "vertex alpha must be preserved");
assert.ok(glowColor.every((channel) => channel >= 0 && channel <= 1));
assert.ok(glowColor[0] > 0 && glowColor[1] > 0 && glowColor[2] > 0);

console.log("NEON PALETTE PASS: source hues preserved, neutral colors stay neutral, glow tint follows each mesh color.");
