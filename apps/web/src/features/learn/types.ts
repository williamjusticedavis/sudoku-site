/**
 * Client-facing shapes for the Learn section. Kept as plain interfaces (rather
 * than importing row types from `@sudoku/db`) so nothing in the client bundle
 * references the database package.
 */

export type Tier = 'beginner' | 'intermediate' | 'advanced' | 'master';

export interface LessonHighlight {
  role: string;
  cells: number[];
  digits?: number[];
}

/** One engine-derived hint step (mirrors `@sudoku/db`'s `HintStep`). */
export interface LessonStep {
  technique: string;
  explanation: string;
  /** Placed-digit string for the position where this step fires, when easier
   * moves had to be applied first. Absent → the step fires on `gridState`. */
  gridBefore?: string;
  highlights?: LessonHighlight[];
  placements?: { cell: number; digit: number }[];
  eliminations?: { cell: number; digit: number }[];
  /** Cell-to-cell pointers (e.g. cross-hatching's "this 2 disables that
   * cell") for a step where the highlighted region alone doesn't spell out
   * which specific cell each part is responsible for. */
  arrows?: { from: number; to: number }[];
}

export interface LessonPuzzle {
  id: number;
  gridState: string;
  solutionState: string;
  stepData: LessonStep[];
  isTeachingExample: boolean;
}

export interface TacticSummary {
  slug: string;
  name: string;
  tier: Tier;
  orderInTier: number;
  description: string;
}

export interface TacticDetail extends TacticSummary {
  puzzles: LessonPuzzle[];
}

export const TIER_ORDER: Tier[] = ['beginner', 'intermediate', 'advanced', 'master'];

export const TIER_LABEL: Record<Tier, string> = {
  beginner: 'Beginner',
  intermediate: 'Intermediate',
  advanced: 'Advanced',
  master: 'Master',
};
