/**
 * The solving loop.
 *
 * Contract (per project design notes):
 *   - `computeCandidates` runs ONCE, inside `parseGrid`. The solver never
 *     recomputes candidates from scratch — `applyStep` maintains them.
 *   - Each iteration re-walks `TECHNIQUES` from index 0 and applies the FIRST
 *     technique that fires, then restarts from the top. Restarting matters:
 *     any application can unlock a simpler move elsewhere that should win.
 *   - `hint` and `solveAll` are the same mechanism at different speeds:
 *     `hint` runs one iteration, `solveAll` runs to completion.
 *
 * `TECHNIQUES` is intentionally empty here; techniques are registered in
 * difficulty order as they are implemented in Phase 1.
 */

import { isSolved, type Grid } from './grid.js';
import { parseGrid } from './candidates.js';
import { applyStep, type Step, type Technique } from './step.js';
import { findConflicts } from './validate.js';
import { hiddenSingle, lastFreeCell, nakedSingle } from './techniques/singles.js';
import { claiming, pointing } from './techniques/locked.js';
import {
  hiddenPair,
  hiddenQuad,
  hiddenTriple,
  nakedPair,
  nakedQuad,
  nakedTriple,
} from './techniques/subsets.js';
import {
  finnedJellyfish,
  finnedSwordfish,
  finnedXWing,
  jellyfish,
  swordfish,
  xWing,
} from './techniques/fish.js';
import { skyscraper, turbotFish, twoStringKite } from './techniques/chains.js';
import { simpleColoring } from './techniques/coloring.js';
import { wWing, xyWing, xyzWing } from './techniques/wings.js';
import { bug1, uniqueRectangle } from './techniques/uniqueness.js';
import { xyChain } from './techniques/xychain.js';
import { alsXz } from './techniques/als.js';
import { makeForcingChain } from './techniques/forcing.js';

/**
 * Pattern techniques in difficulty order (everything except the forcing-chain
 * backstop). Subsets are interleaved by size (pair-level before triple-level,
 * etc.) rather than all naked then all hidden — a hidden pair is easier to spot
 * than a naked quad, so it should be preferred when both apply. (CLAUDE.md's
 * grouped listing is the teaching taxonomy, expected to be reordered against
 * real findability.)
 */
export const PATTERN_TECHNIQUES: Technique[] = [
  lastFreeCell,
  nakedSingle,
  hiddenSingle,
  pointing,
  claiming,
  nakedPair,
  hiddenPair,
  nakedTriple,
  hiddenTriple,
  nakedQuad,
  hiddenQuad,
  xWing,
  swordfish,
  jellyfish,
  skyscraper,
  twoStringKite,
  turbotFish,
  simpleColoring,
  xyWing,
  xyzWing,
  wWing,
  uniqueRectangle,
  bug1,
  finnedXWing,
  finnedSwordfish,
  finnedJellyfish,
  xyChain,
  alsXz,
];

/**
 * The forcing-chain backstop propagates with the pattern techniques above and
 * runs only when they are all stuck. It guarantees any uniquely-solvable grid is
 * driven to completion — so hint mode always has a logical step to show, even on
 * the hardest puzzles (no brute-force gap).
 */
export const forcingChain: Technique = makeForcingChain(PATTERN_TECHNIQUES);

/** Full technique list: pattern techniques, then the forcing-chain backstop. */
export const TECHNIQUES: Technique[] = [...PATTERN_TECHNIQUES, forcingChain];

/** Why a solve stopped. */
export type SolveStatus = 'solved' | 'stuck' | 'invalid';

export interface SolveResult {
  readonly status: SolveStatus;
  /** Steps applied, in order. Replayable against a fresh `parseGrid`. */
  readonly steps: readonly Step[];
}

/**
 * Run one iteration: walk `techniques` from the top and apply the first that
 * fires. Returns the applied Step, or null if none fired (grid is stuck).
 * Mutates `grid` via `applyStep`.
 */
export function hint(grid: Grid, techniques: readonly Technique[] = TECHNIQUES): Step | null {
  for (const technique of techniques) {
    const step = technique(grid);
    if (step !== null) {
      applyStep(grid, step);
      return step;
    }
  }
  return null;
}

/**
 * Run to completion: repeatedly `hint` until solved or stuck. Mutates `grid`.
 * Rejects grids with placed-digit conflicts up front (`status: 'invalid'`).
 */
export function solveAll(
  grid: Grid,
  techniques: readonly Technique[] = TECHNIQUES,
): SolveResult {
  if (findConflicts(grid).length > 0) {
    return { status: 'invalid', steps: [] };
  }
  const steps: Step[] = [];
  while (!isSolved(grid)) {
    const step = hint(grid, techniques);
    if (step === null) return { status: 'stuck', steps };
    steps.push(step);
  }
  return { status: 'solved', steps };
}

/**
 * Reconstruct the grid at a point in time by replaying steps against a FRESH
 * grid parsed from `puzzle`. This is the solver UI's time-travel primitive:
 * clicking step N replays 0..N. Because Steps are immutable, every replay
 * reproduces identical state.
 *
 * `upTo` is the number of steps to apply (default: all). Returns a new Grid;
 * the caller's grids are untouched.
 */
export function replay(puzzle: string, steps: readonly Step[], upTo = steps.length): Grid {
  const grid = parseGrid(puzzle);
  const n = Math.max(0, Math.min(upTo, steps.length));
  for (let i = 0; i < n; i++) {
    applyStep(grid, steps[i]!);
  }
  return grid;
}
