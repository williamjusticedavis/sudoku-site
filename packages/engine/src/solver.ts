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
 * Pattern techniques in difficulty order — the order the solver walks, and so
 * the order that decides which technique a hint shows when several apply.
 *
 * This tracks the Learn curriculum's TIER boundaries (beginner → intermediate →
 * advanced → master, see CLAUDE.md): the solver should never teach a Master
 * technique on a grid where an Intermediate one would do. It is not the same
 * list as the curriculum, though, and is not derived from it:
 *
 *   - Order WITHIN a tier is a judgement call about how findable a pattern is
 *     by eye. CLAUDE.md is explicit that its own `order_in_tier` is just
 *     listing order and was never ranked, so it is not authoritative here.
 *   - Subsets interleave by SIZE, not naked-then-hidden — a hidden pair is
 *     easier to spot than a naked quad, so it should win when both apply.
 *   - BUG+1 is deliberately hoisted out of Advanced to sit just after the
 *     intermediate block. It is one of the most findable things on the whole
 *     list once the grid is in its shape ("every unsolved cell has two
 *     candidates except one"), and it costs nothing to promote: it can only
 *     fire when the grid is already all-bivalue-but-one, so it is never
 *     competing with the wings and chains on an ordinary position.
 *   - The fish family (X-Wing / Swordfish / Jellyfish) is deliberately NOT
 *     kept together. They were built as a group because they share structure,
 *     but they are three different tiers to a solver's eye: an X-Wing is
 *     Intermediate and a Jellyfish is genuinely hard to see.
 *
 * Reordering this list is not a local change: `packages/db/src/seed.ts` builds
 * each lesson's lead-up from `TECHNIQUES` minus the target, so the order
 * decides the exact position every curated puzzle fires on. Any change here
 * needs a reseed, and the seed throws if a lesson's technique stops firing.
 */
export const PATTERN_TECHNIQUES: Technique[] = [
  // Beginner
  lastFreeCell,
  nakedSingle,
  hiddenSingle,
  // Intermediate
  pointing,
  claiming,
  nakedPair,
  hiddenPair,
  nakedTriple,
  hiddenTriple,
  nakedQuad,
  hiddenQuad,
  xWing,
  skyscraper,
  // Advanced — BUG+1 first, see the note above
  bug1,
  twoStringKite,
  turbotFish,
  swordfish,
  xyWing,
  wWing,
  xyzWing,
  finnedXWing,
  finnedSwordfish,
  uniqueRectangle,
  // Master
  jellyfish,
  finnedJellyfish,
  simpleColoring,
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
export function hint(
  grid: Grid,
  techniques: readonly Technique[] = TECHNIQUES,
): Step | null {
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
export function replay(
  puzzle: string,
  steps: readonly Step[],
  upTo = steps.length,
): Grid {
  const grid = parseGrid(puzzle);
  const n = Math.max(0, Math.min(upTo, steps.length));
  for (let i = 0; i < n; i++) {
    applyStep(grid, steps[i]!);
  }
  return grid;
}
