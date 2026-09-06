import type { InferInsertModel, InferSelectModel } from 'drizzle-orm';
import { feedback, tacticPuzzles, tactics } from './schema/index.js';

export * from './schema/index.js';
export { db, client, schema } from './client.js';
export type { Database } from './client.js';
// Re-export the query builder helper so consumers need not depend on
// drizzle-orm directly for simple raw queries (e.g. health checks).
export { sql } from 'drizzle-orm';

// Convenience row types inferred from the schema.
export type Tactic = InferSelectModel<typeof tactics>;
export type NewTactic = InferInsertModel<typeof tactics>;
export type TacticPuzzle = InferSelectModel<typeof tacticPuzzles>;
export type NewTacticPuzzle = InferInsertModel<typeof tacticPuzzles>;
export type Feedback = InferSelectModel<typeof feedback>;
export type NewFeedback = InferInsertModel<typeof feedback>;
