import { integer, pgTable, primaryKey, timestamp, uuid } from 'drizzle-orm/pg-core';
import { users } from './users.js';
import { tactics } from './tactics.js';

/** Favoriting a tactic/lesson (e.g. "W-Wing"). Tactic-scoped only — there is
 * deliberately no puzzle favoriting. */
export const userFavoriteTactics = pgTable(
  'user_favorite_tactics',
  {
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    tacticId: integer('tactic_id')
      .notNull()
      .references(() => tactics.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.tacticId] })],
);
