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
  /** Learn-only decorative lines (green, no arrowhead) connecting cells that
   * form a shape worth naming out loud — e.g. X-Wing's four corner cells
   * drawn as an X. Not "this blocks that" like `arrows` — just a visual aid. */
  xLines?: { from: number; to: number; style?: 'solid' | 'dashed' }[];
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

/** Just enough to render a link to a neighbouring tactic. Carries `tier` so the
 * link can be tinted by the tier it leads *to* — the neighbour is often in a
 * different tier from the lesson being viewed, and that's worth seeing before
 * you click. */
export interface TacticLink {
  slug: string;
  name: string;
  tier: Tier;
}

export interface TacticDetail extends TacticSummary {
  puzzles: LessonPuzzle[];
  /** Neighbours in curriculum order, so a learner can move between lessons
   * without going back through the tier overview. These cross tier boundaries —
   * the last Beginner tactic's `next` is the first Intermediate one — and are
   * null at the two ends of the curriculum. */
  prev: TacticLink | null;
  next: TacticLink | null;
}

export const TIER_ORDER: Tier[] = ['beginner', 'intermediate', 'advanced', 'master'];

export const TIER_LABEL: Record<Tier, string> = {
  beginner: 'Beginner',
  intermediate: 'Intermediate',
  advanced: 'Advanced',
  master: 'Master',
};
