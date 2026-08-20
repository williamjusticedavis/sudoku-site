import { describe, expect, it } from 'vitest';
import {
  CANONICAL_SIZE,
  ZONE_GRID,
  extractFeatures,
  featureDistance,
  inkBoundingBox,
  normalizeToCanonical,
  zoneFeatures,
} from './features';

function makeGray(width: number, height: number, fill = 255): Uint8Array {
  return new Uint8Array(width * height).fill(fill);
}

function paintRect(
  gray: Uint8Array,
  width: number,
  rect: { x: number; y: number; w: number; h: number },
  value: number,
) {
  for (let y = rect.y; y < rect.y + rect.h; y++) {
    for (let x = rect.x; x < rect.x + rect.w; x++) {
      gray[y * width + x] = value;
    }
  }
}

describe('inkBoundingBox', () => {
  it('returns null for a blank (all-white) image', () => {
    const gray = makeGray(20, 20);
    expect(inkBoundingBox(gray, 20, 20)).toBeNull();
  });

  it('finds the tight box around a single ink pixel', () => {
    const gray = makeGray(20, 20);
    gray[5 * 20 + 7] = 0;
    expect(inkBoundingBox(gray, 20, 20)).toEqual({
      left: 7,
      top: 5,
      right: 7,
      bottom: 5,
    });
  });

  it('finds the tight box around a rectangle of ink', () => {
    const gray = makeGray(30, 30);
    paintRect(gray, 30, { x: 10, y: 12, w: 4, h: 6 }, 0);
    expect(inkBoundingBox(gray, 30, 30)).toEqual({
      left: 10,
      top: 12,
      right: 13,
      bottom: 17,
    });
  });
});

describe('normalizeToCanonical', () => {
  it('produces near-identical output for the same glyph shifted to a different position', () => {
    const width = 60;
    const height = 60;
    const shape = { w: 6, h: 20 };

    const centered = makeGray(width, height);
    paintRect(centered, width, { x: 20, y: 20, ...shape }, 0);
    const centeredBox = inkBoundingBox(centered, width, height)!;
    const centeredCanonical = normalizeToCanonical(centered, width, height, centeredBox);

    const offCenter = makeGray(width, height);
    paintRect(offCenter, width, { x: 40, y: 5, ...shape }, 0);
    const offCenterBox = inkBoundingBox(offCenter, width, height)!;
    const offCenterCanonical = normalizeToCanonical(
      offCenter,
      width,
      height,
      offCenterBox,
    );

    expect(centeredCanonical.length).toBe(offCenterCanonical.length);
    let maxDiff = 0;
    for (let i = 0; i < centeredCanonical.length; i++) {
      maxDiff = Math.max(
        maxDiff,
        Math.abs(centeredCanonical[i]! - offCenterCanonical[i]!),
      );
    }
    // Same shape/size glyph, just relocated within the source — normalized
    // output should match closely (bilinear resampling allows tiny diffs).
    expect(maxDiff).toBeLessThan(20);
  });

  it('centers the glyph within the canonical canvas', () => {
    const width = 50;
    const height = 50;
    const gray = makeGray(width, height);
    paintRect(gray, width, { x: 5, y: 5, w: 10, h: 10 }, 0);
    const box = inkBoundingBox(gray, width, height)!;
    const canonical = normalizeToCanonical(gray, width, height, box, CANONICAL_SIZE);

    // Corners should stay white (margin around a small centered square).
    expect(canonical[0]).toBeGreaterThan(200);
    expect(canonical[CANONICAL_SIZE * CANONICAL_SIZE - 1]).toBeGreaterThan(200);
    // Center should be ink.
    const mid = Math.floor(CANONICAL_SIZE / 2);
    expect(canonical[mid * CANONICAL_SIZE + mid]).toBeLessThan(100);
  });
});

describe('zoneFeatures', () => {
  it('reports near-zero density for an all-white canonical canvas', () => {
    const canonical = new Float32Array(CANONICAL_SIZE * CANONICAL_SIZE).fill(255);
    const zones = zoneFeatures(canonical);
    expect(zones.length).toBe(ZONE_GRID * ZONE_GRID);
    for (const z of zones) expect(z).toBeCloseTo(0, 5);
  });

  it('reports near-full density for an all-black canonical canvas', () => {
    const canonical = new Float32Array(CANONICAL_SIZE * CANONICAL_SIZE).fill(0);
    const zones = zoneFeatures(canonical);
    for (const z of zones) expect(z).toBeCloseTo(1, 5);
  });

  it('concentrates density in zones covering an inked region', () => {
    const canonical = new Float32Array(CANONICAL_SIZE * CANONICAL_SIZE).fill(255);
    // Ink only the top-left quadrant.
    for (let y = 0; y < CANONICAL_SIZE / 2; y++) {
      for (let x = 0; x < CANONICAL_SIZE / 2; x++) {
        canonical[y * CANONICAL_SIZE + x] = 0;
      }
    }
    const zones = zoneFeatures(canonical);
    const half = ZONE_GRID / 2;
    // Top-left zone block: fully inked.
    expect(zones[0 * ZONE_GRID + 0]).toBeCloseTo(1, 1);
    // Bottom-right zone block: untouched.
    expect(zones[(ZONE_GRID - 1) * ZONE_GRID + (ZONE_GRID - 1)]).toBeCloseTo(0, 1);
    void half;
  });
});

describe('extractFeatures', () => {
  it('returns null for a blank cell', () => {
    const gray = makeGray(40, 40);
    expect(extractFeatures(gray, 40, 40)).toBeNull();
  });

  it('returns a ZONE_GRID^2-length vector for a cell with ink', () => {
    const gray = makeGray(40, 40);
    paintRect(gray, 40, { x: 15, y: 10, w: 8, h: 20 }, 0);
    const features = extractFeatures(gray, 40, 40);
    expect(features).not.toBeNull();
    expect(features!.length).toBe(ZONE_GRID * ZONE_GRID);
  });

  it('yields closer features for the same glyph shape than for visibly different shapes', () => {
    const width = 40;
    const height = 40;

    // A tall thin "1"-like stroke, once centered and once shifted.
    const one = makeGray(width, height);
    paintRect(one, width, { x: 18, y: 6, w: 4, h: 28 }, 0);
    const oneShifted = makeGray(width, height);
    paintRect(oneShifted, width, { x: 24, y: 8, w: 4, h: 28 }, 0);

    // A wide block, structurally different (stands in for a different digit).
    const block = makeGray(width, height);
    paintRect(block, width, { x: 8, y: 8, w: 24, h: 24 }, 0);

    const fOne = extractFeatures(one, width, height)!;
    const fOneShifted = extractFeatures(oneShifted, width, height)!;
    const fBlock = extractFeatures(block, width, height)!;

    const sameShapeDistance = featureDistance(fOne, fOneShifted);
    const differentShapeDistance = featureDistance(fOne, fBlock);

    expect(sameShapeDistance).toBeLessThan(differentShapeDistance);
  });
});

describe('featureDistance', () => {
  it('is zero for identical vectors', () => {
    const a = new Float32Array([0.1, 0.5, 0.9]);
    expect(featureDistance(a, a)).toBe(0);
  });

  it('is positive for differing vectors', () => {
    const a = new Float32Array([0, 0, 0]);
    const b = new Float32Array([1, 0, 0]);
    expect(featureDistance(a, b)).toBeCloseTo(1, 5);
  });
});
