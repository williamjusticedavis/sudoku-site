import { integer, pgTable, serial, text, unique, varchar } from 'drizzle-orm/pg-core';
import { tierEnum } from './enums.js';

/** Static reference data: the Learn techniques. Seeded once, not user-generated. */
export const tactics = pgTable(
  'tactics',
  {
    id: serial('id').primaryKey(),
    slug: varchar('slug', { length: 64 }).notNull().unique(),
    name: text('name').notNull(),
    tier: tierEnum('tier').notNull(),
    orderInTier: integer('order_in_tier').notNull(),
    description: text('description').notNull(),
  },
  (t) => [unique('tactics_tier_order_uq').on(t.tier, t.orderInTier)],
);
