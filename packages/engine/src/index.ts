/**
 * @sudoku/engine — framework-free sudoku solving engine (Phase 1).
 *
 * Public surface: grid types + candidate helpers, board geometry, candidate
 * computation and (de)serialization, validation/uniqueness, the Step model,
 * and the solving loop. Technique implementations are added under `src/` and
 * registered in `solver.TECHNIQUES` as they land.
 */

export * from './grid.js';
export * from './units.js';
export * from './candidates.js';
export * from './validate.js';
export * from './step.js';
export * from './solver.js';
export * from './techniques/singles.js';
export * from './techniques/locked.js';
export * from './techniques/subsets.js';
export * from './techniques/fish.js';
export * from './techniques/chains.js';
export * from './techniques/coloring.js';
export * from './techniques/wings.js';
export * from './techniques/uniqueness.js';
export * from './techniques/xychain.js';
export * from './techniques/als.js';
export * from './techniques/forcing.js';
