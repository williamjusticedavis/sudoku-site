import { describe, expect, it } from 'vitest';
import { parseGrid, serializeGrid } from '../candidates.js';
import { solve } from '../validate.js';
import { PATTERN_TECHNIQUES, forcingChain, hint } from '../solver.js';
import { loadPairs, runFixture } from '../__tests__/oracle.js';

const BROAD = '17clue_100subset.csv';

/** Run only the pattern techniques until stuck; return the stuck grid. */
function patternStuck(puzzle: string) {
  const g = parseGrid(puzzle);
  while (hint(g, PATTERN_TECHNIQUES) !== null) {
    /* keep applying pattern techniques */
  }
  return g;
}

describe('forcingChain (isolated, vs oracle)', () => {
  it("only eliminates candidates that are absent from the puzzle's unique solution", () => {
    // Find a real broad-set puzzle that the pattern techniques cannot finish,
    // freeze that stuck state, and check the forcing step is sound: every digit
    // it eliminates is genuinely not the solved value of that cell.
    const holdout = loadPairs(BROAD).find(({ puzzle }) => {
      const g = parseGrid(puzzle);
      while (hint(g, PATTERN_TECHNIQUES) !== null) {
        /* run to stuck */
      }
      return g.placed.some((d) => d === 0); // pattern techniques left it unsolved
    });
    expect(holdout, 'expected at least one pattern-stuck puzzle in the broad set').toBeTruthy();

    const { puzzle, solution } = holdout!;
    const stuck = patternStuck(puzzle);
    const step = forcingChain(stuck)!;
    expect(step, 'forcing chain should fire on a pattern-stuck grid').toBeTruthy();
    expect(step.technique).toBe('forcing-chain');
    expect(step.eliminations.length).toBeGreaterThan(0);

    // Soundness: no eliminated digit is the true solution digit for its cell.
    for (const e of step.eliminations) {
      expect(String(e.digit)).not.toBe(solution[e.cell]);
    }
    // And it agrees with the independent brute-force solution of that state.
    expect(serializeGrid(solve(stuck)!)).toBe(solution);
  });
});

describe('forcing chain completes every fixture (no logical gap)', () => {
  it('solves the entire broad set with zero wrong placements', () => {
    const summary = runFixture(BROAD);
    expect(summary.wrong).toEqual([]);
    expect(summary.solved).toBe(summary.total); // 100/100 — no puzzle left stuck
    const usedForcing = summary.outcomes.filter((o) =>
      o.techniques.includes('forcing-chain'),
    ).length;
    console.log(`[forcing] ${BROAD}: solved ${summary.solved}/${summary.total}, forcing used on ${usedForcing}`);
    expect(usedForcing).toBeGreaterThan(0); // the holdouts genuinely needed it
  });
});
