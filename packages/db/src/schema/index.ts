// The complete schema — three tables.
//
// `tactics` + `tactic_puzzles` are the Learn curriculum (static reference data,
// seeded from `seed.ts`); `feedback` is the one thing users write.
//
// There are deliberately no accounts, no progress tracking, no persisted
// solves and no saved puzzles — nothing here is tied to a person. That is a
// product decision, not a gap waiting to be filled; CLAUDE.md carries the
// reasoning, and adding a table for any of it needs to be raised first.
export * from './enums.js';
export * from './tactics.js';
export * from './tactic-puzzles.js';
export * from './feedback.js';
