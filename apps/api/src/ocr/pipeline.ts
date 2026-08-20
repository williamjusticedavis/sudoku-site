import sharp from 'sharp';
import { classifyCell, TEMPLATE_CONFIDENCE_THRESHOLD } from './classify.js';
import { withConcurrency } from './concurrency.js';
import { CONFIDENCE_THRESHOLD, ocrCell, type CellOcrResult } from './tesseract.js';

/** `template` (Stage 1 multi-font zone-feature matcher, classify.ts — default)
 * or `tesseract` (general-purpose OCR engine, tesseract.ts, kept as an
 * opt-in fallback via OCR_CLASSIFIER=tesseract). Flipped to `template` once
 * M5's eval harness cleared the plan's own bar for it: beating tesseract on
 * both real screenshot fixtures, not just synthetic held-out fonts —
 * confirmed 100%/100% vs. 94.7%/64.7% non-blank accuracy, including the
 * literal r5c1 "1" misread that started this effort, now read correctly by
 * both. Re-run `pnpm --filter @sudoku/api eval:ocr` before changing this
 * default again — it's not a guess either way. */
type ClassifierMode = 'template' | 'tesseract';
function resolveClassifierMode(): ClassifierMode {
  return process.env.OCR_CLASSIFIER === 'tesseract' ? 'tesseract' : 'template';
}
function confidenceThresholdFor(mode: ClassifierMode): number {
  return mode === 'template' ? TEMPLATE_CONFIDENCE_THRESHOLD : CONFIDENCE_THRESHOLD;
}

// Canonical square the photo is normalized to before slicing. Divisible by 9
// so every cell is an exact 100x100px square.
const GRID_SIZE = 900;
const CELL_PX = GRID_SIZE / 9;
// Fraction of each cell trimmed from every side before OCR, so grid-line ink
// at the cell border isn't mistaken for a digit stroke.
const CELL_INSET = 0.12;
// A digit stroke covers several percent of a tightly-cropped cell even at
// minimum weight; blank-cell noise (anti-aliasing, compression) stays well
// under 1%. Kept as a named constant — expect to retune against real photos.
const BLANK_INK_THRESHOLD = 0.015;
const DARK_LUMINANCE = 128;
// Each OCR call forks a `tesseract` process; unbounded concurrency risks the
// container, fully serial is slow for a ~30-70 non-blank-cell grid.
const MAX_CONCURRENT_OCR = 6;
// Whole-image sanity band: a blank/white page or a solid-dark photo is almost
// certainly not a sudoku grid — reject before spending 81 OCR calls on it.
const WHOLE_IMAGE_MIN_INK = 0.01;
const WHOLE_IMAGE_MAX_INK = 0.6;
// The client crop is usually close but not pixel-perfect (screenshots of a
// digital puzzle only — no lens distortion/rotation to worry about, just
// scale/translation error from the manual crop). How far a grid line can be
// refined from its uniform expected position before we give up on it.
// Empirically tuned against synthetic mis-crop fixtures: 15 was too narrow
// to catch even a mild (~3-4%) crop error; 70 started losing to false peaks
// on well-aligned crops. 45 fixed a mild mis-crop to match perfectly-aligned
// quality without regressing the aligned case — the sweet spot, not a
// measured constant. A ~8% combined scale+translation crop still degrades
// (each undetectable line safely falls back to uniform, never worse than
// pre-refinement) — an accepted residual limit, not something to chase by
// widening further.
const LINE_SEARCH_RADIUS_PX = 45;
// A detected peak must be at least this many times darker than its search
// window's median to be trusted as a real line, not noise.
const PEAK_PROMINENCE_RATIO = 1.3;
// Floor on the gap between two adjacent detected lines (well under the true
// ~100px cell width) — catches a collapsed/false-peak pair.
const MIN_CELL_PX = 60;
// A major line (outer border / block divider) spans the full grid width or
// height, so it should dominate its row/column's dark-pixel count — real
// detected majors scored 780-900 out of 900 in testing. A "peak" well below
// this is more likely an isolated digit stroke than a real line; the
// relative prominence-ratio check alone doesn't catch this; a weak-in-
// absolute-terms peak can still beat a near-empty window's low median.
// Found via a real screenshot where a digit stroke (98/900, ~11% coverage)
// beat the window median enough to pass the ratio check and pull the
// bottom-border major 45px off its true position.
const MIN_MAJOR_LINE_RATIO = 0.3;

export type PipelineResult =
  | { ok: true; grid: string; confidentCount: number; blankCount: number }
  | {
      ok: false;
      reason: 'unreadable-image' | 'no-grid-detected' | 'too-few-confident-digits';
    };

/** Fraction of pixels darker than DARK_LUMINANCE in a raw single-channel buffer. */
function inkDensity(rawGray: Buffer): number {
  let dark = 0;
  for (const byte of rawGray) if (byte < DARK_LUMINANCE) dark++;
  return dark / rawGray.length;
}

/** Pure — whether a cell's ink coverage is low enough to skip OCR entirely. */
export function isBlankCell(inkFraction: number): boolean {
  return inkFraction < BLANK_INK_THRESHOLD;
}

/** Dark-pixel count per row (axis 'row') or column (axis 'col') across a
 * GRID_SIZE x GRID_SIZE single-channel buffer. A grid line spans the full
 * width/height so it dominates its row/column's count; a digit stroke only
 * touches ~76px of one row/column — diluted ~12x by comparison. */
function computeProfile(gray: Buffer, axis: 'row' | 'col'): Uint32Array {
  const profile = new Uint32Array(GRID_SIZE);
  for (let y = 0; y < GRID_SIZE; y++) {
    for (let x = 0; x < GRID_SIZE; x++) {
      if (gray[y * GRID_SIZE + x]! >= DARK_LUMINANCE) continue;
      profile[axis === 'row' ? y : x]!++;
    }
  }
  return profile;
}

function median(values: readonly number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1]! + sorted[mid]!) / 2 : sorted[mid]!;
}

/** Pure — search a small window around one uniform position for the true
 * darkness peak, falling back to the uniform position when the window has
 * no prominent peak. */
function findLine(profile: Uint32Array, center: number): number {
  const lo = Math.max(0, center - LINE_SEARCH_RADIUS_PX);
  const hi = Math.min(GRID_SIZE - 1, center + LINE_SEARCH_RADIUS_PX);
  const window: number[] = [];
  let bestPos = center;
  let bestVal = -1;
  for (let p = lo; p <= hi; p++) {
    const v = profile[p]!;
    window.push(v);
    if (v > bestVal) {
      bestVal = v;
      bestPos = p;
    }
  }
  if (bestVal <= 0) return center; // window is entirely blank — nothing to find
  if (bestVal < GRID_SIZE * MIN_MAJOR_LINE_RATIO) return center; // too weak to be a real full-span line
  const baseline = Math.max(median(window), 1);
  return bestVal / baseline >= PEAK_PROMINENCE_RATIO ? bestPos : center;
}

/** Pure — refine the 10 grid-line positions (0, CELL_PX, ..., 900). Only the
 * 4 lines that double as block dividers (indices 0, 3, 6, 9 — the outer
 * border plus the two bold block-divider lines most sudoku UIs render
 * thicker than regular cell dividers) are independently peak-searched; the
 * other 6 are interpolated as exact thirds between their block's two
 * anchors. Searching all 10 independently was the original approach, but a
 * real failing screenshot showed why it's fragile: that app's block
 * dividers scored 600-900 on the darkness profile while its regular cell
 * dividers scored only 50-150 — faint enough that a nearby digit stroke
 * regularly outscored the true line within the same search window,
 * producing wildly uneven cell spans (66px next to 135px). Anchoring on the
 * 4 reliably-strong lines and interpolating the rest removes that failure
 * mode entirely, at the cost of assuming even cell spacing within a block —
 * true for every sudoku grid regardless of how faint its lines are. */
export function detectGridLines(profile: Uint32Array): number[] {
  const uniform = Array.from({ length: 10 }, (_, i) =>
    Math.min(i * CELL_PX, GRID_SIZE - 1),
  );

  const majorIndices = [0, 3, 6, 9];
  const majors = majorIndices.map((i) => findLine(profile, uniform[i]!));

  const detected: number[] = [];
  for (let block = 0; block < 3; block++) {
    const start = majors[block]!;
    const end = majors[block + 1]!;
    detected.push(start);
    detected.push(start + Math.round((end - start) / 3));
    detected.push(start + Math.round(((end - start) * 2) / 3));
  }
  detected.push(majors[3]!);

  for (let i = 0; i < detected.length - 1; i++) {
    if (detected[i + 1]! - detected[i]! < MIN_CELL_PX) {
      detected[i] = uniform[i]!;
      detected[i + 1] = uniform[i + 1]!;
    }
  }
  return detected;
}

/** Pure — assemble the 81-char grid string from per-cell OCR results, applying
 * the confidence threshold. Low-confidence/absent reads become '.' rather
 * than risk a wrong digit. */
export function assembleGrid(
  cellResults: readonly CellOcrResult[],
  confidenceThreshold: number = CONFIDENCE_THRESHOLD,
): {
  grid: string;
  confidentCount: number;
  blankCount: number;
} {
  let grid = '';
  let confidentCount = 0;
  let blankCount = 0;
  for (const result of cellResults) {
    if (result.digit !== null && result.confidence >= confidenceThreshold) {
      grid += result.digit;
      confidentCount++;
    } else {
      grid += '.';
      blankCount++;
    }
  }
  return { grid, confidentCount, blankCount };
}

interface Cell {
  data: Buffer;
  width: number;
  height: number;
}

/** Slice 81 cells using the detected (not assumed-uniform) grid line
 * positions — corrects for the crop being a bit loose/tight. Cells can be a
 * few px off-square from each other when detection nudged one axis more
 * than the other; that's fine, each cell just uses its own dimensions. */
async function extractCells(
  normalized: Buffer,
  rowLines: readonly number[],
  colLines: readonly number[],
): Promise<Cell[]> {
  const cells: Cell[] = [];
  for (let row = 0; row < 9; row++) {
    const cellH = rowLines[row + 1]! - rowLines[row]!;
    const insetY = Math.round(cellH * CELL_INSET);
    const innerH = cellH - insetY * 2;
    for (let col = 0; col < 9; col++) {
      const cellW = colLines[col + 1]! - colLines[col]!;
      const insetX = Math.round(cellW * CELL_INSET);
      const innerW = cellW - insetX * 2;
      const data = await sharp(normalized, {
        raw: { width: GRID_SIZE, height: GRID_SIZE, channels: 1 },
      })
        .extract({
          left: colLines[col]! + insetX,
          top: rowLines[row]! + insetY,
          width: innerW,
          height: innerH,
        })
        // sharp's raw() output after extract() doesn't reliably keep the
        // single-channel format declared on input (observed 3x the expected
        // byte count without this) — re-assert it explicitly.
        .grayscale()
        .raw()
        .toBuffer();
      cells.push({ data, width: innerW, height: innerH });
    }
  }
  return cells;
}

/** Preprocess a photo, slice it into 81 cells, and OCR each non-blank one. */
export async function extractGrid(imageBuffer: Buffer): Promise<PipelineResult> {
  let normalized: Buffer;
  try {
    normalized = await sharp(imageBuffer)
      .rotate() // auto-orient via EXIF
      .grayscale()
      .normalize() // contrast stretch
      .resize(GRID_SIZE, GRID_SIZE, { fit: 'fill' })
      .raw()
      .toBuffer();
  } catch {
    return { ok: false, reason: 'unreadable-image' };
  }

  const wholeInk = inkDensity(normalized);
  if (wholeInk < WHOLE_IMAGE_MIN_INK || wholeInk > WHOLE_IMAGE_MAX_INK) {
    return { ok: false, reason: 'no-grid-detected' };
  }

  const debug = process.env.OCR_DEBUG === 'true';
  const classifierMode = resolveClassifierMode();
  const confidenceThreshold = confidenceThresholdFor(classifierMode);
  const rowLines = detectGridLines(computeProfile(normalized, 'row'));
  const colLines = detectGridLines(computeProfile(normalized, 'col'));
  if (debug) {
    console.log(`[ocr] classifier: ${classifierMode}`);
    console.log(`[ocr] rows: ${rowLines.join(',')}`);
    console.log(`[ocr] cols: ${colLines.join(',')}`);
  }
  const cells = await extractCells(normalized, rowLines, colLines);
  const cellResults = await withConcurrency(
    cells,
    MAX_CONCURRENT_OCR,
    async (cell, index): Promise<CellOcrResult> => {
      const label = `r${Math.floor(index / 9) + 1}c${(index % 9) + 1}`;
      const ink = inkDensity(cell.data);
      if (isBlankCell(ink)) {
        if (debug)
          console.log(`[ocr] ${label} ink=${ink.toFixed(4)} -> skipped as blank`);
        return { digit: null, confidence: 0 };
      }
      const result =
        classifierMode === 'template'
          ? classifyCell(cell.data, cell.width, cell.height)
          : await ocrCell(
              await sharp(cell.data, {
                raw: { width: cell.width, height: cell.height, channels: 1 },
              })
                .png()
                .toBuffer(),
            );
      if (debug) {
        const verdict =
          result.digit !== null && result.confidence >= confidenceThreshold
            ? 'kept'
            : 'rejected';
        console.log(
          `[ocr] ${label} ink=${ink.toFixed(4)} ${classifierMode}=${JSON.stringify(result)} -> ${verdict}`,
        );
      }
      return result;
    },
  );

  const { grid, confidentCount, blankCount } = assembleGrid(
    cellResults,
    confidenceThreshold,
  );
  if (confidentCount === 0) return { ok: false, reason: 'too-few-confident-digits' };
  return { ok: true, grid, confidentCount, blankCount };
}
