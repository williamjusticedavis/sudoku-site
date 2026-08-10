import {
  boolean,
  integer,
  pgTable,
  primaryKey,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';
import { users } from './users.js';
import { tactics } from './tactics.js';

/** Per-user completion of a tactic; drives the Learn per-tier progress bar. */
export const userTacticProgress = pgTable(
  'user_tactic_progress',
  {
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    tacticId: integer('tactic_id')
      .notNull()
      .references(() => tactics.id, { onDelete: 'cascade' }),
    completed: boolean('completed').notNull().default(false),
    completedAt: timestamp('completed_at', { withTimezone: true }),
  },
  (t) => [primaryKey({ columns: [t.userId, t.tacticId] })],
);
