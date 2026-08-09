/**
 * Forcing Chain (contradiction form) — the completeness backstop.
 *
 * For an unsolved cell, tentatively assume each of its candidates in turn and
 * propagate with the simpler techniques. If an assumption drives the grid into a
 * contradiction (a cell left with no candidates, or a unit that can no longer
 * place some digit), that candidate is impossible and is eliminated. When a cell
 * has only one non-contradictory candidate left, the follow-up naked single
 * places it.
 *
 * This is a genuine, hint-able logical step ("assuming r1c1=5 leads to a
 * contradiction, so r1c1≠5"), not brute force: it reports the assumption and the
 * contradiction it produced. It runs LAST, only when every pattern technique is
 * stuck, and it uses the pattern techniques themselves as its propagation
 * engine, so any grid with a unique solution is driven to completion.
 *
 * Cells are tried fewest-candidates-first (bivalue cells first) so the cheapest,
 * most decisive assumptions are made before expensive ones.
 */

import {
  candCount,
  candList,
  cellName,
  cloneGrid,
  isSolved,
  type CellIndex,
  type Digit,
  type Grid,
} from '../grid.js';
import { UNITS } from '../units.js';
import { applyStep, makeStep, type Elimination, type Step, type Technique } from '../step.js';

/** A contradiction: an empty cell with no candidates, or a digit with nowhere
 * left to go in some unit. */
function hasContradiction(grid: Grid): boolean {
  for (let c = 0; c < 81; c++) {
    if (grid.placed[c] === 0 && grid.candidates[c] === 0) return true;
  }
  for (const unit of UNITS) {
    let placedMask = 0;
    let candMask = 0;
    for (const c of unit.cells) {
      const p = grid.placed[c]!;
      if (p !== 0) placedMask |= 1 << (p - 1);
      else candMask |= grid.candidates[c]!;
    }
    // A digit neither placed nor available anywhere in the unit → dead unit.
    if ((placedMask | candMask) !== 0x1ff) return true;
  }
  return false;
}

type Outcome = 'solved' | 'stuck' | 'contradiction';

/** Propagate to a fixpoint with `techniques`, reporting contradiction if hit. */
function propagate(grid: Grid, techniques: readonly Technique[]): Outcome {
  for (;;) {
    if (hasContradiction(grid)) return 'contradiction';
    if (isSolved(grid)) return 'solved';
    let applied = false;
    for (const t of techniques) {
      const step = t(grid);
      if (step !== null) {
        applyStep(grid, step);
        applied = true;
        break;
      }
    }
    if (!applied) return 'stuck';
  }
}

/**
 * Build a forcing-chain technique that propagates with `propagation` (the
 * simpler techniques — must NOT include this forcing technique itself).
 */
export function makeForcingChain(propagation: readonly Technique[]): Technique {
  return (grid: Grid): Step | null => {
    // Candidate cells, fewest candidates first.
    const cells: CellIndex[] = [];
    for (let c = 0; c < 81; c++) {
      if (grid.placed[c] === 0 && candCount(grid.candidates[c]!) >= 2) cells.push(c);
    }
    cells.sort((a, b) => candCount(grid.candidates[a]!) - candCount(grid.candidates[b]!));

    for (const cell of cells) {
      const cands = candList(grid.candidates[cell]!);
      const impossible: Digit[] = [];

      for (const d of cands) {
        const trial = cloneGrid(grid);
        applyStep(
          trial,
          makeStep({
            technique: 'user',
            placements: [{ cell, digit: d }],
            description: `assume ${cellName(cell)}=${d}`,
          }),
        );
        if (propagate(trial, propagation) === 'contradiction') impossible.push(d);
      }

      if (impossible.length === 0 || impossible.length === cands.length) continue;

      const eliminations: Elimination[] = impossible.map((digit) => ({ cell, digit }));
      const survivors = cands.filter((d) => !impossible.includes(d));
      return makeStep({
        technique: 'forcing-chain',
        eliminations,
        highlights: [{ role: 'elimination', cells: [cell], digits: impossible }],
        description: `Forcing chain: assuming ${cellName(cell)} ∈ {${impossible.join(
          ',',
        )}} each leads to a contradiction, so ${cellName(cell)} must be ${
          survivors.length === 1 ? survivors[0] : `one of {${survivors.join(',')}}`
        } — eliminate ${impossible.join(',')}.`,
      });
    }
    return null;
  };
}
