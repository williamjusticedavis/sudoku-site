// Pure, dependency-free feature extraction for isolated single-digit glyphs.
// Used identically by the reference-bank generator and the runtime
// classifier — if those two ever call different logic here, the whole
// template-matching approach breaks silently, so this is the one place
// either of them is allowed to do this math.

/** Luminance below this counts as "ink" — matches pipeline.ts's convention. */
const DARK_LUMINANCE = 128;

export interface Box {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

/** Tight bounding box of ink (dark) pixels in a raw single-channel grayscale
 * buffer, or null if there's no ink at all. Coordinates are inclusive. */
export function inkBoundingBox(
  gray: Uint8Array,
  width: number,
  height: number,
): Box | null {
  let left = width;
  let right = -1;
  let top = height;
  let bottom = -1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (gray[y * width + x]! >= DARK_LUMINANCE) continue;
      if (x < left) left = x;
      if (x > right) right = x;
      if (y < top) top = y;
      if (y > bottom) bottom = y;
    }
  }
  return right === -1 ? null : { left, top, right, bottom };
}

/** Bilinear-sample a single-channel image at fractional coordinates, clamped
 * to bounds. */
function sampleBilinear(
  gray: Uint8Array,
  width: number,
  height: number,
  x: number,
  y: number,
): number {
  const x0 = Math.max(0, Math.min(width - 1, Math.floor(x)));
  const y0 = Math.max(0, Math.min(height - 1, Math.floor(y)));
  const x1 = Math.min(width - 1, x0 + 1);
  const y1 = Math.min(height - 1, y0 + 1);
  const fx = x - x0;
  const fy = y - y0;
  const p00 = gray[y0 * width + x0]!;
  const p10 = gray[y0 * width + x1]!;
  const p01 = gray[y1 * width + x0]!;
  const p11 = gray[y1 * width + x1]!;
  const top = p00 + (p10 - p00) * fx;
  const bottom = p01 + (p11 - p01) * fx;
  return top + (bottom - top) * fy;
}

export const CANONICAL_SIZE = 40;
// Fraction of the canonical canvas the glyph's own bounding box fills —
// leaves a margin so the glyph doesn't touch the edge, matching how real
// cell crops always carry an inset too.
const GLYPH_FILL_FRACTION = 0.8;

/** Position- and scale-invariant normalization: crop to the glyph's own ink
 * bounding box (discarding surrounding whitespace, wherever it sits in the
 * source), then resample onto a fixed canonical square canvas, centered.
 * This is what makes an off-center "1" compare identically to a centered
 * one — the exact failure mode that broke tesseract on the real font that
 * prompted this module. */
export function normalizeToCanonical(
  gray: Uint8Array,
  width: number,
  height: number,
  box: Box,
  canonicalSize: number = CANONICAL_SIZE,
): Float32Array {
  const boxW = box.right - box.left + 1;
  const boxH = box.bottom - box.top + 1;
  const fitSize = canonicalSize * GLYPH_FILL_FRACTION;
  const scale = fitSize / Math.max(boxW, boxH);
  const targetW = boxW * scale;
  const targetH = boxH * scale;
  const offsetX = (canonicalSize - targetW) / 2;
  const offsetY = (canonicalSize - targetH) / 2;

  const out = new Float32Array(canonicalSize * canonicalSize).fill(255);
  for (let oy = 0; oy < canonicalSize; oy++) {
    for (let ox = 0; ox < canonicalSize; ox++) {
      const gx = ox - offsetX;
      const gy = oy - offsetY;
      if (gx < 0 || gy < 0 || gx >= targetW || gy >= targetH) continue;
      const sx = box.left + gx / scale;
      const sy = box.top + gy / scale;
      out[oy * canonicalSize + ox] = sampleBilinear(gray, width, height, sx, sy);
    }
  }
  return out;
}

export const ZONE_GRID = 8;

/** Zone (projection) features: average ink density per cell of a
 * gridSize x gridSize partition of a canonical-size canvas. A classical OCR
 * technique specifically because it's robust to minor stroke-width/
 * antialiasing variance while still capturing overall shape — unlike raw
 * pixel distance, which is exactly what let an off-center glyph fool a
 * naive resize-and-compare approach. */
export function zoneFeatures(
  canonical: Float32Array,
  canonicalSize: number = CANONICAL_SIZE,
  gridSize: number = ZONE_GRID,
): Float32Array {
  const zones = new Float32Array(gridSize * gridSize);
  const counts = new Uint32Array(gridSize * gridSize);
  for (let y = 0; y < canonicalSize; y++) {
    const zy = Math.min(gridSize - 1, Math.floor((y / canonicalSize) * gridSize));
    for (let x = 0; x < canonicalSize; x++) {
      const zx = Math.min(gridSize - 1, Math.floor((x / canonicalSize) * gridSize));
      const zi = zy * gridSize + zx;
      // Ink density: 0 = white/no ink, 1 = solid black.
      zones[zi]! += (255 - canonical[y * canonicalSize + x]!) / 255;
      counts[zi]!++;
    }
  }
  for (let i = 0; i < zones.length; i++) zones[i]! /= counts[i]!;
  return zones;
}

/** Full pipeline: a raw grayscale cell -> its zone-feature vector, or null
 * if there's no ink to extract a glyph from. (Callers should already have
 * blank-detected before reaching this — this is a defensive fallback, not
 * the primary blank check, which stays in pipeline.ts.) */
export function extractFeatures(
  gray: Uint8Array,
  width: number,
  height: number,
): Float32Array | null {
  const box = inkBoundingBox(gray, width, height);
  if (!box) return null;
  const canonical = normalizeToCanonical(gray, width, height, box);
  return zoneFeatures(canonical);
}

/** Euclidean distance between two equal-length feature vectors. */
export function featureDistance(a: Float32Array, b: Float32Array): number {
  let sum = 0;
  for (let i = 0; i < a.length; i++) {
    const d = a[i]! - b[i]!;
    sum += d * d;
  }
  return Math.sqrt(sum);
}
