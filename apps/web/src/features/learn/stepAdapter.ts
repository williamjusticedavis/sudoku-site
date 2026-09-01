import { parseGrid, parseGridWithCandidates, type Grid, type Step } from '@sudoku/engine';
import { beatAsStep, stepCells as beatCells } from '../solver/highlights.js';
import type { LessonStep } from './types.js';

/**
 * Parse a lesson board string. A plain 81-char digit string (0 = blank) gets
 * fresh computed candidates; the extended `[candidates]`-per-cell format
 * (`HintStep.gridBefore` when lead-up moves were applied) is parsed verbatim so
 * the board shows the exact candidate state the technique fired on.
 */
export function parseLessonGrid(grid: string): Grid {
  return /[[\s]/.test(grid) ? parseGridWithCandidates(grid) : parseGrid(grid);
}

/**
 * Adapt a stored `LessonStep` to the engine `Step` shape so the solver's
 * `buildHighlightMap` / `buildCandidateMarkers` can be reused verbatim. A
 * stored lesson step and a beat the solver narrates live are the same shape —
 * both come out of the engine's `buildWalkthrough`/`explainStep` — so this is
 * just `beatAsStep` under the name the lesson code uses.
 */
export function toEngineStep(step: LessonStep): Step {
  return beatAsStep(step);
}

/** Every cell the step names — see `stepCells` in the solver's highlights. */
export function stepCells(step: LessonStep): number[] {
  return beatCells(step);
}
