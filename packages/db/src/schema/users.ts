import { pgTable, timestamp, text, uuid, varchar } from 'drizzle-orm/pg-core';

/** Registered accounts. Auth is username + password_hash (session-based). */
export const users = pgTable('users', {
  id: uuid('id').defaultRandom().primaryKey(),
  username: varchar('username', { length: 50 }).notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});
