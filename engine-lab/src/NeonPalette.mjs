const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

function rgbToHsv(r, g, b) {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const delta = max - min;
  let hue = 0;

  if (delta > 1e-8) {
    if (max === r) hue = ((g - b) / delta) % 6;
    else if (max === g) hue = (b - r) / delta + 2;
    else hue = (r - g) / delta + 4;
    hue *= 60;
    if (hue < 0) hue += 360;
  }

  return { hue, saturation: max <= 1e-8 ? 0 : delta / max, value: max };
}

function hsvToRgb(hue, saturation, value) {
  const h = ((hue % 360) + 360) % 360;
  const c = value * saturation;
  const x = c * (1 - Math.abs((h / 60) % 2 - 1));
  const m = value - c;
  let rgb;

  if (h < 60) rgb = [c, x, 0];
  else if (h < 120) rgb = [x, c, 0];
  else if (h < 180) rgb = [0, c, x];
  else if (h < 240) rgb = [0, x, c];
  else if (h < 300) rgb = [x, 0, c];
  else rgb = [c, 0, x];

  return rgb.map((channel) => clamp(channel + m, 0, 1));
}

/**
 * Brightens and enriches a color while keeping its hue fixed.
 * Neutral grays stay neutral; green stays green, amber stays amber, etc.
 */
export function neonizeRgb(r, g, b) {
  if (![r, g, b].every(Number.isFinite)) {
    throw new TypeError("neonizeRgb expects three finite color channels.");
  }

  const color = rgbToHsv(clamp(r, 0, 1), clamp(g, 0, 1), clamp(b, 0, 1));
  const saturation = color.saturation < 0.035
    ? color.saturation
    : clamp(color.saturation * 1.18 + 0.035, 0, 0.96);
  const value = clamp(color.value * 1.24 + 0.035, 0, 0.94);

  return hsvToRgb(color.hue, saturation, value);
}

/**
 * Converts a vertex-color buffer in place and returns a matching glow tint
 * derived from those same source colors.
 */
export function neonizeGeometryColors(colors) {
  if (!Array.isArray(colors) && !(colors instanceof Float32Array)) {
    throw new TypeError("Geometry colors must be an array or Float32Array.");
  }
  if (colors.length % 4 !== 0) {
    throw new RangeError("Geometry color buffers must contain RGBA values.");
  }
  if (!colors.length) return [0.65, 0.75, 0.9];

  let sumR = 0;
  let sumG = 0;
  let sumB = 0;

  for (let index = 0; index < colors.length; index += 4) {
    const [r, g, b] = neonizeRgb(colors[index], colors[index + 1], colors[index + 2]);
    colors[index] = r;
    colors[index + 1] = g;
    colors[index + 2] = b;
    sumR += r;
    sumG += g;
    sumB += b;
  }

  const count = colors.length / 4;
  const average = [sumR / count, sumG / count, sumB / count];
  const peak = Math.max(...average);
  if (peak <= 1e-6) return [0.65, 0.75, 0.9];

  // Raise the glow without changing the mean color's hue or color balance.
  const targetPeak = clamp(Math.max(0.58, peak * 1.55), 0, 0.96);
  const scale = targetPeak / peak;
  return average.map((channel) => clamp(channel * scale, 0, 1));
}

export function getRgbHueDegrees(r, g, b) {
  return rgbToHsv(clamp(r, 0, 1), clamp(g, 0, 1), clamp(b, 0, 1)).hue;
}
