// Stage 1 template-matching classifier: compares a cell's zone-feature
// vector against the multi-font reference bank (generate-bank.ts) and picks
// the digit whose closest reference glyph is nearest, by a wide margin.
// Pure/synchronous — no subprocess, unlike tesseract.ts's ocrCell.

import { loadReferenceBank } from './glyphs/bank.js';
import { extractFeatures, featureDistance } from './glyphs/features.js';
import type { CellOcrResult } from './tesseract.js';

/** Below this (0-100) confidence, a cell's template-match read is discarded.
 * Confidence here is a normalized best-vs-second-best-digit gap, not
 * tesseract's TSV confidence — the two scales aren't comparable, and an
 * initial guess of 60 (borrowed from tesseract's scale) turned out to
 * reject almost every correct read. Empirically measured across a 405-cell
 * multi-font sample: mean confidence was 70.6 when the match was correct
 * vs. 19.8 when wrong, with 100% precision achievable down to a threshold
 * of ~20. 25 keeps a margin below that separation without giving back
 * meaningful recall — re-derive with M5's eval harness if the bank or
 * distance metric changes. */
export const TEMPLATE_CONFIDENCE_THRESHOLD = 25;

/** Classify a single pre-cropped, grayscale cell buffer as one of 1-9, or
 * null if there's no ink or the match is too ambiguous to trust. Confidence
 * is the normalized gap between the best-matching digit and the
 * next-best-matching *different* digit — a clear single winner scores high,
 * two closely-competing digits score low, matching the same
 * prefer-blank-over-wrong-digit philosophy tesseract.ts's threshold uses. */
export function classifyCell(
  gray: Uint8Array,
  width: number,
  height: number,
): CellOcrResult {
  const features = extractFeatures(gray, width, height);
  if (!features) return { digit: null, confidence: 0 };

  const bank = loadReferenceBank();
  const bestDistanceByDigit = new Map<string, number>();
  for (const glyph of bank) {
    const distance = featureDistance(features, glyph.features);
    const current = bestDistanceByDigit.get(glyph.digit);
    if (current === undefined || distance < current) {
      bestDistanceByDigit.set(glyph.digit, distance);
    }
  }
  if (bestDistanceByDigit.size === 0) return { digit: null, confidence: 0 };

  const ranked = [...bestDistanceByDigit.entries()].sort((a, b) => a[1] - b[1]);
  const [bestDigit, bestDistance] = ranked[0]!;
  // Only one digit class present in the bank (shouldn't happen with a real
  // 9-digit bank, but a corrupted/partial bank should fail closed, not
  // report false confidence).
  if (ranked.length < 2) return { digit: null, confidence: 0 };
  const secondBestDistance = ranked[1]![1];

  const denominator = Math.max(secondBestDistance, 1e-6);
  const relativeGap = (secondBestDistance - bestDistance) / denominator;
  const confidence = Math.max(0, Math.min(100, relativeGap * 100));

  return { digit: bestDigit, confidence };
}
