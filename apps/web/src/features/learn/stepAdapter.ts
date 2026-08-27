import { parseGrid, parseGridWithCandidates, type Grid, type Step } from '@sudoku/engine';
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
 * `buildHighlightMap` / `buildCandidateMarkers` can be reused verbatim. Only
 * the fields those helpers read are populated.
 */
export function toEngineStep(step: LessonStep): Step {
  return {
    technique: step.technique as Step['technique'],
    description: step.explanation,
    highlights: (step.highlights ?? []) as Step['highlights'],
    placements: (step.placements ?? []) as Step['placements'],
    eliminations: (step.eliminations ?? []) as Step['eliminations'],
  };
}

/** Every cell the step names — highlight groups, placements, eliminations. */
export function stepCells(step: LessonStep): number[] {
  const cells: number[] = [];
  for (const g of step.highlights ?? []) cells.push(...g.cells);
  for (const p of step.placements ?? []) cells.push(p.cell);
  for (const e of step.eliminations ?? []) cells.push(e.cell);
  return cells;
}
