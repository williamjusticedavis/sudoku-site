import { index, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { users } from './users.js';

/**
 * Server-side auth sessions. The id is an opaque random token stored in an
 * httpOnly cookie; a row here makes revocation trivial (logout, password change,
 * log-out-everywhere). See Step 4 reasoning for session-based vs JWT.
 */
export const sessions = pgTable(
  'sessions',
  {
    id: text('id').primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index('sessions_user_id_idx').on(t.userId)],
);
