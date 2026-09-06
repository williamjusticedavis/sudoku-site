import { pgTable, text, timestamp, uuid, varchar } from 'drizzle-orm/pg-core';

/** Feedback submitted from the footer's Feedback page.
 *
 * Deliberately without an email column. All anyone gives is a name to sign the
 * note with. There is nowhere to reply to, which is the point: the site has no
 * accounts and no address for anybody, so collecting one here would be the
 * only place it happens.
 *
 * Read it with `pnpm db:studio`. There is no admin page, since that would need
 * auth that does not exist yet.
 */
export const feedback = pgTable('feedback', {
  id: uuid('id').defaultRandom().primaryKey(),
  /** Freeform, whatever the sender typed. Not an identity. */
  name: varchar('name', { length: 80 }).notNull(),
  message: text('message').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});
