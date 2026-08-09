/**
 * Uniqueness techniques — deductions that are only valid because the puzzle is
 * guaranteed to have exactly ONE solution.
 *
 *  - BUG+1  : the grid is a Bivalue Universal Grave plus one. Every unsolved
 *    cell has exactly two candidates except a single cell with three. A true BUG
 *    (all bivalue) has an even number of solutions, so it can never be the state
 *    of a unique puzzle; the third candidate in the odd cell is therefore the
 *    one that avoids the grave and must be the solution. The correct digit is
 *    the candidate of that cell appearing an odd number of times (three) in its
 *    row / column / box.
 *  - Unique Rectangle (Type 1): four cells at the intersection of two rows and
 *    two columns, spanning exactly two boxes, where three corners hold the same
 *    two candidates {a,b} and the fourth holds {a,b} plus extras. If a and b
 *    survived in the fourth corner, the four cells could be filled two ways →
 *    two solutions. Uniqueness forbids that, so a and b are removed from the
 *    fourth corner.
 *
 * Both are UNSOUND on a non-unique grid, so each is gated behind
 * `hasUniqueSolution` (the guard). The guard only runs once a candidate pattern
 * is detected, keeping it off the hot path.
 */

import {
  boxOf,
  candCount,
  candList,
  cellName,
  hasCand,
  type CellIndex,
  type Digit,
  type Grid,
} from '../grid.js';
import { UNITS_OF } from '../units.js';
import { hasUniqueSolution } from '../validate.js';
import { makeStep, type Elimination, type Step, type Technique } from '../step.js';

/** Count empty cells still holding `d` within one unit (by unit membership). */
function countInUnitOf(grid: Grid, cell: CellIndex, kind: 'row' | 'col' | 'box', d: Digit): number {
  const unit = UNITS_OF[cell]!.find((u) => u.kind === kind)!;
  let n = 0;
  for (const c of unit.cells) {
    if (grid.placed[c] === 0 && hasCand(grid.candidates[c]!, d)) n++;
  }
  return n;
}

/**
 * Pattern detection for BUG+1, independent of the uniqueness guard: returns the
 * forced {cell, digit} if the grid is BUG+1 shaped and resolvable, else null.
 * Exposed so the guard's gating role can be tested in isolation.
 */
export function bug1Candidate(grid: Grid): { cell: CellIndex; digit: Digit } | null {
  let triCell: CellIndex = -1;
  for (let c = 0; c < 81; c++) {
    if (grid.placed[c] !== 0) continue;
    const n = candCount(grid.candidates[c]!);
    if (n === 2) continue;
    if (n === 3 && triCell === -1) {
      triCell = c;
    } else {
      return null; // a second 3-cell, or a 1/4+-cell → not BUG+1
    }
  }
  if (triCell === -1) return null; // pure BUG (or solved), not BUG+1

  // The solution is the candidate with odd (3) count in the tri-cell's units.
  const odd: Digit[] = [];
  for (const d of candList(grid.candidates[triCell]!)) {
    if (countInUnitOf(grid, triCell, 'box', d) % 2 === 1) odd.push(d);
  }
  return odd.length === 1 ? { cell: triCell, digit: odd[0]! } : null;
}

export const bug1: Technique = (grid: Grid): Step | null => {
  const found = bug1Candidate(grid);
  if (found === null) return null;
  if (!hasUniqueSolution(grid)) return null; // guard: unsound otherwise

  return makeStep({
    technique: 'bug+1',
    placements: [found],
    highlights: [{ role: 'placement', cells: [found.cell], digits: [found.digit] }],
    description: `BUG+1: every unsolved cell is bivalue except ${cellName(
      found.cell,
    )}; uniqueness forces ${found.digit} there.`,
  });
};

/**
 * Pattern detection for Unique Rectangle Type 1, independent of the guard.
 * Returns a ready Step (built via `makeStep`) if the pattern is present, else
 * null. Exposed so the guard's gating role can be tested in isolation.
 */
export function uniqueRectangleCandidate(grid: Grid): Step | null {
  for (let r1 = 0; r1 < 9; r1++) {
    for (let r2 = r1 + 1; r2 < 9; r2++) {
      for (let c1 = 0; c1 < 9; c1++) {
        for (let c2 = c1 + 1; c2 < 9; c2++) {
          const corners: CellIndex[] = [
            r1 * 9 + c1,
            r1 * 9 + c2,
            r2 * 9 + c1,
            r2 * 9 + c2,
          ];
          if (corners.some((c) => grid.placed[c] !== 0)) continue;

          // Must span exactly two boxes (the defining constraint of a UR).
          const boxes = new Set(corners.map(boxOf));
          if (boxes.size !== 2) continue;

          const masks = corners.map((c) => grid.candidates[c]!);
          // Identify the bivalue pair shared by (at least) three corners.
          let extraIdx = -1;
          let pairMask = -1;
          let ok = true;
          for (let i = 0; i < 4; i++) {
            if (candCount(masks[i]!) === 2) {
              if (pairMask === -1) pairMask = masks[i]!;
              else if (masks[i]! !== pairMask) {
                ok = false;
                break;
              }
            } else if (extraIdx === -1) {
              extraIdx = i;
            } else {
              ok = false; // more than one non-pair corner → not Type 1
              break;
            }
          }
          if (!ok || pairMask === -1 || extraIdx === -1) continue;
          // The extra corner must contain the pair plus at least one more digit.
          const extraMask = masks[extraIdx]!;
          if ((extraMask & pairMask) !== pairMask || candCount(extraMask) <= 2) continue;
          // Exactly three pair corners required (extra is the only non-pair one).
          if (masks.filter((m) => m === pairMask).length !== 3) continue;

          const digits = candList(pairMask);
          const extraCell = corners[extraIdx]!;
          const eliminations: Elimination[] = digits
            .filter((d) => hasCand(extraMask, d))
            .map((d) => ({ cell: extraCell, digit: d }));
          if (eliminations.length === 0) continue;

          const floor = corners.filter((_, i) => i !== extraIdx);
          return makeStep({
            technique: 'unique-rectangle',
            eliminations,
            highlights: [
              { role: 'base', cells: floor, digits },
              { role: 'elimination', cells: [extraCell], digits },
            ],
            description: `Unique Rectangle (Type 1) on {${digits.join(
              ',',
            )}} at rows ${r1 + 1},${r2 + 1} cols ${c1 + 1},${c2 + 1}: remove ${digits.join(
              ',',
            )} from ${cellName(extraCell)} to avoid a deadly pattern.`,
          });
        }
      }
    }
  }
  return null;
}

export const uniqueRectangle: Technique = (grid: Grid): Step | null => {
  const step = uniqueRectangleCandidate(grid);
  if (step === null) return null;
  if (!hasUniqueSolution(grid)) return null; // guard: unsound otherwise
  return step;
};
