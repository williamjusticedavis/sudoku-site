import { describe, expect, it } from 'vitest';
import { parseGrid, serializeGrid } from '../candidates.js';
import { findConflicts, hasUniqueSolution, solve } from '../validate.js';
import { listFixtureFiles, loadPairs, runFixture } from './oracle.js';

const PUZZLE =
  '53..7....6..195....98....6.8...6...34..8.3..17...2...6.6....28....419..5....8..79';
const SOLUTION =
  '534678912672195348198342567859761423426853791713924856961537284287419635345286179';

const BROAD = '17clue_100subset.csv';
// Every vendored fixture — the consistency invariant runs over all of them.
const ALL_FIXTURES = listFixtureFiles();

describe('brute-force oracle (validate.solve)', () => {
  it('solves the classic puzzle to its known solution', () => {
    const g = parseGrid(PUZZLE);
    expect(hasUniqueSolution(g)).toBe(true);
    expect(serializeGrid(solve(g)!)).toBe(SOLUTION);
  });
});

describe('vendored fixture solutions are trustworthy', () => {
  // Cheap structural guard (no backtracking): every vendored solution must be a
  // conflict-free complete grid that contains all of the puzzle's clues.
  it.each(ALL_FIXTURES)('%s solutions are valid & clue-consistent', (file) => {
    for (const { puzzle, solution } of loadPairs(file)) {
      expect(solution).toMatch(/^[1-9]{81}$/);
      expect(findConflicts(parseGrid(solution))).toHaveLength(0);
      for (let i = 0; i < 81; i++) {
        const clue = puzzle[i]!;
        if (clue >= '1' && clue <= '9') expect(solution[i]).toBe(clue);
      }
    }
  });

  it('engine solver agrees with the vendored oracle on a sample', () => {
    // Ties the two independent solvers together on a handful of puzzles so the
    // vendored solutions can be trusted for the fast comparisons below.
    for (const { puzzle, solution } of loadPairs(BROAD).slice(0, 5)) {
      const g = parseGrid(puzzle);
      expect(hasUniqueSolution(g)).toBe(true);
      expect(serializeGrid(solve(g)!)).toBe(solution);
    }
  });
});

describe('technique solver vs oracle — consistency invariant', () => {
  // The load-bearing test as techniques grow: the solver may not finish a
  // puzzle, but it must NEVER place a digit that disagrees with the unique
  // solution. A buggy elimination in any future technique trips this.
  it.each(ALL_FIXTURES)('never places a wrong digit in %s', (file) => {
    const summary = runFixture(file);
    expect(summary.wrong).toEqual([]);
    if (file === BROAD) {
      console.log(
        `[oracle] ${BROAD}: solved ${summary.solved}/${summary.total} with current techniques`,
      );
    }
  });
});
