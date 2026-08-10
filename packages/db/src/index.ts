import type { InferInsertModel, InferSelectModel } from 'drizzle-orm';
import {
  sessions,
  tacticPuzzles,
  tactics,
  userFavoriteTactics,
  userTacticProgress,
  users,
} from './schema/index.js';

export * from './schema/index.js';
export { db, client, schema } from './client.js';
export type { Database } from './client.js';
// Re-export the query builder helper so consumers need not depend on
// drizzle-orm directly for simple raw queries (e.g. health checks).
export { sql } from 'drizzle-orm';

// Convenience row types inferred from the schema.
export type User = InferSelectModel<typeof users>;
export type NewUser = InferInsertModel<typeof users>;
export type Session = InferSelectModel<typeof sessions>;
export type NewSession = InferInsertModel<typeof sessions>;
export type Tactic = InferSelectModel<typeof tactics>;
export type NewTactic = InferInsertModel<typeof tactics>;
export type TacticPuzzle = InferSelectModel<typeof tacticPuzzles>;
export type NewTacticPuzzle = InferInsertModel<typeof tacticPuzzles>;
export type UserTacticProgress = InferSelectModel<typeof userTacticProgress>;
export type UserFavoriteTactic = InferSelectModel<typeof userFavoriteTactics>;
