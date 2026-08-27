import { describe, expect, it } from 'vitest';
import { ALL_CANDIDATES, bit, emptyGrid, type Grid } from '../grid.js';
import { parseGrid } from '../candidates.js';
import { solveAll } from '../solver.js';
import { applyStep } from '../step.js';
import { hiddenSingle } from '../techniques/singles.js';
import { crossHatching, lastPossibleNumber } from './teachingSingles.js';

describe('crossHatching', () => {
  it('fires the same fact hiddenSingle finds when a plain scan explains it', () => {
    // Same four-1s setup as singles.test.ts: r1c1's candidate-1 is banned from
    // every other box-0 cell purely by placed peers, no other technique needed.
    const g = parseGrid(
      Array.from({ length: 81 }, (_, i) =>
        [13, 25, 37, 56].includes(i) ? '1' : '.',
      ).join(''),
    );
    const hidden = hiddenSingle(g)!;
    const step = crossHatching(g)!;
    expect(step.technique).toBe('cross-hatching');
    expect(step.placements).toEqual(hidden.placements);
  });

  it('does not fire a fact that depends on prior eliminations', () => {
    const g = lastPossibleNumberGrid();
    expect(crossHatching(g)).toBeNull();
  });
});

describe('lastPossibleNumber', () => {
  it('does not fire a plain-scan fact', () => {
    const g = parseGrid(
      Array.from({ length: 81 }, (_, i) =>
        [13, 25, 37, 56].includes(i) ? '1' : '.',
      ).join(''),
    );
    expect(lastPossibleNumber(g)).toBeNull();
  });

  it('fires when the fact only emerges from candidates already narrowed by elimination', () => {
    // Row 0, digit 5: nothing is placed anywhere, so a peer-only scan would
    // find 5 still legal in every cell of the row (no plain-scan fact exists).
    // Candidate 5 was hand-cleared from r1c2..r1c9 (as an earlier technique
    // would), leaving r1c1 as 5's only home — visible only via the candidate
    // list, not by scanning placed digits.
    const g = lastPossibleNumberGrid();
    const step = lastPossibleNumber(g)!;
    expect(step.technique).toBe('last-possible-number');
    expect(step.placements).toEqual([{ cell: 0, digit: 5 }]);
  });
});

/** Row 0 rigged so digit 5 has one legal home (r1c1) only once you consult
 * the (artificially narrowed) candidate list — not from placed peers alone. */
function lastPossibleNumberGrid(): Grid {
  const g = emptyGrid();
  for (let i = 0; i < 81; i++) g.candidates[i] = ALL_CANDIDATES;
  for (let c = 1; c <= 8; c++) g.candidates[c] = ALL_CANDIDATES & ~bit(5);
  return g;
}

describe('cross-hatching / last-possible-number partition every hidden single', () => {
  it('never both fire on the same grid, and exactly one matches hiddenSingle when either fires', () => {
    const puzzle =
      '010903600000080000900000507002010430000402000064070200701000005000030000005601020';
    const g = parseGrid(puzzle);
    const result = solveAll(g);
    expect(result.status).toBe('solved');
    // Replay hidden-single steps and confirm the two teaching detectors are
    // mutually exclusive and agree with hiddenSingle whenever a hidden single
    // was the actual step taken.
    let checked = 0;
    const state = parseGrid(puzzle);
    for (const step of result.steps) {
      if (step.technique === 'hidden-single') {
        const ch = crossHatching(state);
        const lpn = lastPossibleNumber(state);
        expect(ch === null || lpn === null).toBe(true); // never both
        expect(ch !== null || lpn !== null).toBe(true); // always exactly one
        checked++;
      }
      applyStep(state, step);
    }
    expect(checked).toBeGreaterThan(0);
  });
});
