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
  hasCand,
  type CellIndex,
  type Digit,
  type Grid,
} from './grid.js';
import { computeCandidates } from './candidates.js';
import type { Elimination } from './step.js';
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
    }
  | {
      readonly kind: 'wrong-elimination';
      readonly cell: CellIndex;
      /** The digit that actually belongs here, which the user's marks rule out. */
      readonly digit: Digit;
    };

export interface MistakeReport {
  readonly ok: boolean;
  readonly mistakes: readonly Mistake[];
}

/**
 * The STRUCTURAL half of mistake checking: the three problems visible from the
 * grid alone, with no reference to the solution — a repeated placed digit, a
 * mark contradicting a placed peer, and a digit with nowhere left to go.
 * Operates on the grid's current candidates, so it is meant to be run on a grid
 * carrying user notation (see `parseGridWithCandidates`).
 *
 * It cannot see a wrongly-eliminated-but-still-legal candidate — a mark set
 * that is structurally fine but rules out the digit that actually belongs.
 * That needs the solution, and lives in `auditUserCandidates`. A caller that
 * wants a complete answer (the solver page's "Check for mistakes") runs both.
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
        mistakes.push({
          kind: 'impossible-candidate',
          cell,
          digit: d,
          conflictingCell: bad,
        });
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
        mistakes.push({
          kind: 'missing-digit',
          digit: d,
          unitKind: unit.kind,
          unitIndex: unit.index,
        });
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

export interface CandidateAudit {
  /** True when every mark checked out — only then are `eliminations` populated. */
  readonly ok: boolean;
  /** Cells whose marks contradict the grid's candidates or the actual solution. */
  readonly badCells: readonly CellIndex[];
  /** Marks that rule out the digit which actually belongs — cell paired with
   * that digit, so a caller can say *which* digit was wrongly eliminated. */
  readonly wrongEliminations: readonly Elimination[];
  /** Eliminations the user made ahead of the engine. Empty when `!ok`. */
  readonly eliminations: readonly Elimination[];
}

/**
 * Verify a user's pencil marks against the grid's own candidates AND the
 * puzzle's actual solution, so correct hand-work can seed the solving loop
 * instead of being thrown away and re-derived step by step.
 *
 * This is the verification `checkForMistakes` deliberately does not do: that
 * check is cheap and cannot see a wrongly-eliminated-but-still-legal candidate
 * (see its doc comment), which is exactly the dangerous case here. Removing a
 * digit that actually belongs in a cell would send the solver down a road with
 * no solution on it, so the marks are checked against `solve`'s brute-force
 * answer, not against plausibility.
 *
 * A mark of 0 means "the user wrote nothing here", not "no candidates" — those
 * cells are skipped and left to the engine, so partially-noted grids work.
 *
 * Still all-or-nothing, exactly as `reconcileNotation` is: one bad cell voids
 * the whole set (`eliminations` comes back empty) and the caller resets. No
 * partial-credit repair. Does not mutate `grid`.
 */
export function auditUserCandidates(
  grid: Grid,
  marks: ArrayLike<number>,
): CandidateAudit {
  const solution = solve(grid);
  if (solution === null) {
    return { ok: false, badCells: [], wrongEliminations: [], eliminations: [] };
  }

  const bad = new Set<CellIndex>();
  const wrongEliminations: Elimination[] = [];
  const eliminations: Elimination[] = [];

  for (let cell = 0; cell < CELL_COUNT; cell++) {
    if (grid.placed[cell] !== 0) continue;
    const mark = marks[cell] ?? 0;
    if (mark === 0) continue; // unmarked — the engine keeps its own candidates

    const belongs = solution.placed[cell] as Digit;
    // A mark the engine has already ruled out: the user added something illegal.
    // (`checkForMistakes` reports this one too, as an impossible-candidate.)
    if ((mark & ~grid.candidates[cell]!) !== 0) bad.add(cell);
    // A mark missing the digit that actually belongs here: a wrong elimination.
    else if (!hasCand(mark, belongs)) {
      bad.add(cell);
      wrongEliminations.push({ cell, digit: belongs });
    } else {
      for (const d of candList(grid.candidates[cell]! & ~mark)) {
        eliminations.push({ cell, digit: d });
      }
    }
  }

  if (bad.size > 0) {
    return { ok: false, badCells: [...bad], wrongEliminations, eliminations: [] };
  }
  return { ok: true, badCells: [], wrongEliminations: [], eliminations };
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
