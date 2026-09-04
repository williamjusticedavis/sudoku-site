import { pgTable, text, timestamp, uuid, varchar } from 'drizzle-orm/pg-core';

/** Feedback submitted from the footer's Feedback page.
 *
 * Deliberately not tied to an account and deliberately without an email
 * column. Anyone can leave a note — logged in or not — and all they give is a
 * name to sign it with. There is nowhere to reply to, which is the point: the
 * site has no address for anybody (`users` has a username and no email either),
 * so collecting one here would be the only place it happens.
 *
 * Read it with `pnpm db:studio`. There is no admin page, since that would need
 * auth that does not exist yet.
 */
export const feedback = pgTable('feedback', {
  id: uuid('id').defaultRandom().primaryKey(),
  /** Freeform, whatever the sender typed — not a `users.username`. */
  name: varchar('name', { length: 80 }).notNull(),
  message: text('message').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});
