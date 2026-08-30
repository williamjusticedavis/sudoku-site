import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  serial,
  varchar,
} from 'drizzle-orm/pg-core';
import { tactics } from './tactics.js';

/**
 * One ordered hint step for a teaching puzzle: what the step highlights and the
 * explanation shown to the learner. Mirrors the engine's Step shape loosely so
 * curated content can be authored without importing the engine here.
 */
export interface HintStep {
  technique: string;
  explanation: string;
  /**
   * 81-char placed-digit string for the grid state at the moment this step
   * fires. Present when easier moves had to be applied first to reach the
   * position where the target tactic is visible; absent when the step fires
   * directly on the puzzle's `gridState`. Lesson boards render this when set.
   */
  gridBefore?: string;
  highlights?: { role: string; cells: number[]; digits?: number[] }[];
  placements?: { cell: number; digit: number }[];
  eliminations?: { cell: number; digit: number }[];
  /** Cell-to-cell pointers for steps where a highlighted region alone doesn't
   * spell out which cell each part of it is responsible for — see engine's
   * `Arrow`. Optional; most techniques don't need it. */
  arrows?: { from: number; to: number }[];
  /** Learn-only decorative lines (green, no arrowhead) connecting cells that
   * form a shape worth naming out loud — e.g. X-Wing's four corner cells
   * literally drawn as an X. Unlike `arrows`, these aren't "this blocks
   * that": just a visual aid, so kept as a separate field. */
  xLines?: { from: number; to: number; style?: 'solid' | 'dashed' }[];
}

/** Curated example puzzles per tactic (at least 3 each). */
export const tacticPuzzles = pgTable(
  'tactic_puzzles',
  {
    id: serial('id').primaryKey(),
    tacticId: integer('tactic_id')
      .notNull()
      .references(() => tactics.id, { onDelete: 'cascade' }),
    gridState: varchar('grid_state', { length: 81 }).notNull(),
    solutionState: varchar('solution_state', { length: 81 }).notNull(),
    stepData: jsonb('step_data').$type<HintStep[]>().notNull(),
    isTeachingExample: boolean('is_teaching_example').notNull().default(false),
  },
  (t) => [index('tactic_puzzles_tactic_id_idx').on(t.tacticId)],
);
