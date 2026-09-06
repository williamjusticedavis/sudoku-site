// The complete schema — three tables.
//
// `tactics` + `tactic_puzzles` are the Learn curriculum (static reference data,
// seeded from `seed.ts`); `feedback` is the one thing users write.
//
// There are deliberately no accounts. `users`, `sessions`,
// `user_tactic_progress` and `user_favorite_tactics` were dropped on
// 2026-09-06 along with the whole idea of tracking progress — see CLAUDE.md
// for the reasoning. Solves were never persisted either, and there is no
// saved_puzzles table. Nothing here is tied to a person.
export * from './enums.js';
export * from './tactics.js';
export * from './tactic-puzzles.js';
export * from './feedback.js';
