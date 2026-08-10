// The complete schema — exactly the 5 CLAUDE.md tables plus `sessions` for
// session-based auth. Solves are never persisted (no solve/solve-step tables),
// and there is no saved_puzzles table (favorites are tactic-scoped only).
export * from './enums.js';
export * from './users.js';
export * from './sessions.js';
export * from './tactics.js';
export * from './tactic-puzzles.js';
export * from './user-tactic-progress.js';
export * from './user-favorite-tactics.js';
