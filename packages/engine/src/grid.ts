/**
 * Board representation and candidate bitmask helpers.
 *
 * Cells are indexed 0..80, row-major:
 *   row = floor(index / 9), col = index % 9,
 *   box = floor(row / 3) * 3 + floor(col / 3).
 *
 * Candidates are stored as a 9-bit mask per cell (bit `d - 1` set means digit
 * `d` is a candidate). This is fast to union/intersect/count and cheap to clone
 * with `.slice()`, which matters for the backtracking uniqueness checker.
 */

/** A placed/candidate digit, 1..9. */
export type Digit = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;

/** A cell index, 0..80. */
export type CellIndex = number;

/** A 9-bit candidate mask (bit `d - 1` = digit `d`). */
export type CandidateMask = number;

export const SIZE = 9;
export const CELL_COUNT = 81;

/** Mask with all nine digits present (0b1_1111_1111). */
export const ALL_CANDIDATES: CandidateMask = 0x1ff;

/**
 * The solving grid. Mutable during a solve; `applyStep` is the sole mutator
 * once a grid has been produced by `parseGrid`.
 */
export interface Grid {
  /** Placed digit per cell; 0 = empty. */
  placed: Int8Array;
  /** Candidate mask per cell; only meaningful where `placed[i] === 0`. */
  candidates: Uint16Array;
}

/** Create an empty grid (no placed digits, no candidates yet). */
export function emptyGrid(): Grid {
  return {
    placed: new Int8Array(CELL_COUNT),
    candidates: new Uint16Array(CELL_COUNT),
  };
}

/** Deep copy of a grid (used by the backtracking uniqueness checker). */
export function cloneGrid(g: Grid): Grid {
  return {
    placed: g.placed.slice(),
    candidates: g.candidates.slice(),
  };
}

// ── Coordinate helpers ──────────────────────────────────────────────────────

export function rowOf(i: CellIndex): number {
  return Math.floor(i / SIZE);
}

export function colOf(i: CellIndex): number {
  return i % SIZE;
}

export function boxOf(i: CellIndex): number {
  return Math.floor(rowOf(i) / 3) * 3 + Math.floor(colOf(i) / 3);
}

/** Human-readable cell label, e.g. `r3c7` (1-based). */
export function cellName(i: CellIndex): string {
  return `r${rowOf(i) + 1}c${colOf(i) + 1}`;
}

// ── Candidate bitmask helpers ───────────────────────────────────────────────

/** Mask for a single digit. */
export function bit(d: Digit): CandidateMask {
  return 1 << (d - 1);
}

export function hasCand(mask: CandidateMask, d: Digit): boolean {
  return (mask & bit(d)) !== 0;
}

export function addCand(mask: CandidateMask, d: Digit): CandidateMask {
  return mask | bit(d);
}

export function removeCand(mask: CandidateMask, d: Digit): CandidateMask {
  return mask & ~bit(d);
}

/** Number of candidates set in a mask (popcount over 9 bits). */
export function candCount(mask: CandidateMask): number {
  let n = 0;
  let m = mask & ALL_CANDIDATES;
  while (m !== 0) {
    m &= m - 1;
    n++;
  }
  return n;
}

/** The digits present in a mask, ascending. */
export function candList(mask: CandidateMask): Digit[] {
  const out: Digit[] = [];
  for (let d = 1 as Digit; d <= SIZE; d++) {
    if (hasCand(mask, d)) out.push(d);
  }
  return out;
}

/**
 * If exactly one candidate is set, return it; otherwise null.
 * Handy for naked singles and "only place left" checks.
 */
export function onlyCand(mask: CandidateMask): Digit | null {
  const m = mask & ALL_CANDIDATES;
  if (m === 0 || (m & (m - 1)) !== 0) return null;
  return (31 - Math.clz32(m) + 1) as Digit;
}

/** True when every cell has a placed digit. */
export function isSolved(g: Grid): boolean {
  for (let i = 0; i < CELL_COUNT; i++) {
    if (g.placed[i] === 0) return false;
  }
  return true;
}
