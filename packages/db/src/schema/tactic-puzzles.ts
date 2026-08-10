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
  highlights?: { role: string; cells: number[]; digits?: number[] }[];
  placements?: { cell: number; digit: number }[];
  eliminations?: { cell: number; digit: number }[];
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
