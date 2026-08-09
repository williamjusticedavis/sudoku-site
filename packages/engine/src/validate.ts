/**
 * Grid validation and uniqueness checking — separate from the technique solver.
 *
 * `findConflicts` rejects structurally invalid grids (a digit placed twice in a
 * unit). `countSolutions` is a plain backtracking solver used only to decide
 * "no solution / unique / multiple"; several techniques (BUG+1, unique
 * rectangles) assume a unique solution and would misfire otherwise.
 */

import {
  ALL_CANDIDATES,
  CELL_COUNT,
  bit,
  candCount,
  candList,
  cloneGrid,
  type CellIndex,
  type Digit,
  type Grid,
} from './grid.js';
import { computeCandidates } from './candidates.js';
import { PEERS, UNITS } from './units.js';

/** A pair of cells in the same unit holding the same placed digit. */
export interface Conflict {
  readonly digit: Digit;
  readonly cells: readonly [CellIndex, CellIndex];
  readonly unitKind: 'row' | 'col' | 'box';
  readonly unitIndex: number;
}

/**
 * Find every duplicate placed digit within a unit. An empty array means the
 * placed digits are structurally legal (candidates are not checked here).
 */
export function findConflicts(grid: Grid): Conflict[] {
  const conflicts: Conflict[] = [];
  for (const unit of UNITS) {
    const seen = new Map<Digit, CellIndex>();
    for (const cell of unit.cells) {
      const placed = grid.placed[cell]!;
      if (placed === 0) continue;
      const d = placed as Digit;
      const prev = seen.get(d);
      if (prev !== undefined) {
        conflicts.push({
          digit: d,
          cells: [prev, cell],
          unitKind: unit.kind,
          unitIndex: unit.index,
        });
      } else {
        seen.set(d, cell);
      }
    }
  }
  return conflicts;
}

/** Convenience: true when no unit repeats a placed digit. */
export function isValid(grid: Grid): boolean {
  return findConflicts(grid).length === 0;
}

/**
 * Count solutions by backtracking, stopping once `cap` is reached (default 2,
 * enough to distinguish unique from non-unique). Returns 0, 1, or up to `cap`.
 * Does not mutate the input grid.
 *
 * Uses a most-constrained-cell heuristic (fewest candidates first) over a
 * private working copy whose candidates are kept consistent as digits are
 * placed and unwound.
 */
export function countSolutions(grid: Grid, cap = 2): number {
  if (!isValid(grid)) return 0;
  const work = cloneGrid(grid);
  computeCandidates(work);
  let count = 0;

  const search = (): boolean => {
    // Pick the empty cell with the fewest candidates.
    let target: CellIndex = -1;
    let best = 10;
    for (let i = 0; i < CELL_COUNT; i++) {
      if (work.placed[i] !== 0) continue;
      const n = candCount(work.candidates[i]!);
      if (n === 0) return false; // dead end
      if (n < best) {
        best = n;
        target = i;
        if (n === 1) break;
      }
    }

    if (target === -1) {
      // No empty cells left → a full solution.
      count++;
      return count >= cap;
    }

    const mask = work.candidates[target]!;
    for (let d = 1 as Digit; d <= 9; d++) {
      if ((mask & bit(d)) === 0) continue;

      // Place d, snapshotting affected peer candidates for O(1) undo.
      const touched: CellIndex[] = [];
      work.placed[target] = d;
      work.candidates[target] = 0;
      const clear = ~bit(d);
      for (const p of PEERS[target]!) {
        if (work.placed[p] === 0 && (work.candidates[p]! & bit(d)) !== 0) {
          work.candidates[p] = work.candidates[p]! & clear;
          touched.push(p);
        }
      }

      const stop = search();

      // Undo.
      work.placed[target] = 0;
      work.candidates[target] = mask;
      for (const p of touched) {
        work.candidates[p] = (work.candidates[p]! | bit(d)) & ALL_CANDIDATES;
      }

      if (stop) return true;
    }
    return false;
  };

  search();
  return count;
}

/** True when the grid has exactly one solution. */
export function hasUniqueSolution(grid: Grid): boolean {
  return countSolutions(grid, 2) === 1;
}

// ── Lightweight mistake check for user-submitted notation ────────────────────

/**
 * A single problem found by `checkForMistakes`, discriminated by `kind`:
 *  - `digit-conflict`       : the same digit is placed twice in a unit.
 *  - `impossible-candidate` : a candidate mark contradicts a placed peer.
 *  - `missing-digit`        : a digit is neither placed nor a candidate anywhere
 *                             in a unit, so it has nowhere left to go.
 */
export type Mistake =
  | {
      readonly kind: 'digit-conflict';
      readonly digit: Digit;
      readonly cells: readonly [CellIndex, CellIndex];
      readonly unitKind: 'row' | 'col' | 'box';
      readonly unitIndex: number;
    }
  | {
      readonly kind: 'impossible-candidate';
      readonly cell: CellIndex;
      readonly digit: Digit;
      /** A placed peer of `cell` holding `digit`, which makes the mark illegal. */
      readonly conflictingCell: CellIndex;
    }
  | {
      readonly kind: 'missing-digit';
      readonly digit: Digit;
      readonly unitKind: 'row' | 'col' | 'box';
      readonly unitIndex: number;
    };

export interface MistakeReport {
  readonly ok: boolean;
  readonly mistakes: readonly Mistake[];
}

/**
 * The intentionally lightweight mistake check for user-submitted grids. It runs
 * EXACTLY three checks and no more (no reachability or tactic verification —
 * catching wrongly-eliminated-but-still-valid candidates is deliberately out of
 * scope). Operates on the grid's current candidates, so it is meant to be run on
 * a grid carrying user notation (see `parseGridWithCandidates`).
 */
export function checkForMistakes(grid: Grid): MistakeReport {
  const mistakes: Mistake[] = [];

  // 1. Digit conflicts — the same digit placed twice in a unit.
  for (const c of findConflicts(grid)) {
    mistakes.push({
      kind: 'digit-conflict',
      digit: c.digit,
      cells: [c.cells[0], c.cells[1]],
      unitKind: c.unitKind,
      unitIndex: c.unitIndex,
    });
  }

  // 2. Impossible candidates — a mark contradicting a placed peer.
  for (let cell = 0; cell < CELL_COUNT; cell++) {
    if (grid.placed[cell] !== 0) continue;
    for (const d of candList(grid.candidates[cell]!)) {
      const bad = PEERS[cell]!.find((p) => grid.placed[p] === d);
      if (bad !== undefined) {
        mistakes.push({ kind: 'impossible-candidate', cell, digit: d, conflictingCell: bad });
      }
    }
  }

  // 3. Missing digit — a digit with nowhere left to go in a unit.
  for (const unit of UNITS) {
    let placedMask = 0;
    let candMask = 0;
    for (const c of unit.cells) {
      const p = grid.placed[c]!;
      if (p !== 0) placedMask |= bit(p as Digit);
      else candMask |= grid.candidates[c]!;
    }
    for (let d = 1 as Digit; d <= 9; d++) {
      const b = bit(d);
      if ((placedMask & b) === 0 && (candMask & b) === 0) {
        mistakes.push({ kind: 'missing-digit', digit: d, unitKind: unit.kind, unitIndex: unit.index });
      }
    }
  }

  return { ok: mistakes.length === 0, mistakes };
}

export interface NotationResult {
  readonly report: MistakeReport;
  /** True when user candidates were discarded and recomputed from placed. */
  readonly reset: boolean;
}

/**
 * Reset-on-error policy for user notation. If `checkForMistakes` finds any
 * problem, the user's candidate marks are discarded entirely and recomputed from
 * placed digits (`computeCandidates`) — NO partial-credit repair. If the marks
 * are clean they are left in place as the starting point. Either way the solving
 * loop maintains its own state afterward and never re-reads the user's marks.
 * Mutates `grid` on reset.
 */
export function reconcileNotation(grid: Grid): NotationResult {
  const report = checkForMistakes(grid);
  if (!report.ok) {
    computeCandidates(grid);
    return { report, reset: true };
  }
  return { report, reset: false };
}

/**
 * Return the first full solution found by backtracking, or null if the grid is
 * unsolvable. Independent of the technique solver (plain search, no techniques),
 * so it serves as the test oracle: for a grid with a unique solution (see
 * `hasUniqueSolution`) this IS the solution, and the technique solver must reach
 * exactly it. Does not mutate the input.
 */
export function solve(grid: Grid): Grid | null {
  if (!isValid(grid)) return null;
  const work = cloneGrid(grid);
  computeCandidates(work);

  const search = (): boolean => {
    let target: CellIndex = -1;
    let best = 10;
    for (let i = 0; i < CELL_COUNT; i++) {
      if (work.placed[i] !== 0) continue;
      const n = candCount(work.candidates[i]!);
      if (n === 0) return false;
      if (n < best) {
        best = n;
        target = i;
        if (n === 1) break;
      }
    }
    if (target === -1) return true; // no empty cells → solved

    const mask = work.candidates[target]!;
    for (let d = 1 as Digit; d <= 9; d++) {
      if ((mask & bit(d)) === 0) continue;
      const touched: CellIndex[] = [];
      work.placed[target] = d;
      work.candidates[target] = 0;
      const clear = ~bit(d);
      for (const p of PEERS[target]!) {
        if (work.placed[p] === 0 && (work.candidates[p]! & bit(d)) !== 0) {
          work.candidates[p] = work.candidates[p]! & clear;
          touched.push(p);
        }
      }
      if (search()) return true;
      work.placed[target] = 0;
      work.candidates[target] = mask;
      for (const p of touched) {
        work.candidates[p] = (work.candidates[p]! | bit(d)) & ALL_CANDIDATES;
      }
    }
    return false;
  };

  return search() ? work : null;
}
