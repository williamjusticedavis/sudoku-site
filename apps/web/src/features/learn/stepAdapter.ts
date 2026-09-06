import { parseBoard, type Grid, type Step } from '@sudoku/engine';
import { beatAsStep, stepCells as beatCells } from '../solver/highlights.js';
import type { LessonStep } from './types.js';

/** The engine's `parseBoard` under the name the lesson code reads by. A lesson
 * board is `HintStep.gridBefore`, which is in bracket-candidate notation
 * whenever lead-up moves were applied and a plain clue string otherwise. */
export function parseLessonGrid(grid: string): Grid {
  return parseBoard(grid);
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
