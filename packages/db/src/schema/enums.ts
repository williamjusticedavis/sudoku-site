import { pgEnum } from 'drizzle-orm/pg-core';

/** Difficulty tiers for the Learn curriculum (findability-based, not structural). */
export const tierEnum = pgEnum('tier', [
  'beginner',
  'intermediate',
  'advanced',
  'master',
]);
