import { describe, expect, it } from 'vitest';
import { emptyGrid, type CellIndex, type Digit, type Grid } from '../grid.js';
import { parseGrid, serializeGrid } from '../candidates.js';
import { solve } from '../validate.js';
import { sueDeCoq } from './suedecoq.js';
import { checkAgainstOracle } from '../__tests__/oracle.js';

function gridWith(cands: Record<CellIndex, Digit[]>): Grid {
  const g = emptyGrid();
  for (const [cell, digits] of Object.entries(cands)) {
    let mask = 0;
    for (const d of digits) mask |= 1 << (d - 1);
    g.candidates[Number(cell)] = mask;
  }
  return g;
}

describe('sueDeCoq (white-box)', () => {
  it('clears the line set’s digits from the line and the box set’s from the box', () => {
    // r1c1/r1c2 (box 1 ∩ row 1) hold 1,2,3,4. r1c5 {1,2} is the row set,
    // r2c3 {3,4} the box set: four cells, four digits. So 1/2 leave the rest
    // of row 1 (r1c9) and 3/4 leave the rest of box 1 (r3c3).
    const g = gridWith({
      0: [1, 2, 3, 4],
      1: [1, 2, 3, 4],
      4: [1, 2],
      11: [3, 4],
      8: [1, 5],
      20: [3, 6],
    });
    const step = sueDeCoq(g)!;
    expect(step.technique).toBe('sue-de-coq');
    expect(step.eliminations.map((e) => `${e.cell}:${e.digit}`).sort()).toEqual([
      '20:3',
      '8:1',
    ]);
  });
});

describe('sueDeCoq on a real puzzle', () => {
  it('fires on a hard 17-clue puzzle and the solve stays sound', () => {
    const puzzle =
      '000000000000000012003045000000000000000100006034000700000080400010000500620070000';
    const solution = serializeGrid(solve(parseGrid(puzzle))!);
    const outcome = checkAgainstOracle({ puzzle, solution });
    expect(outcome.techniques).toContain('sue-de-coq');
    expect(outcome.wrongElimination).toBeNull();
    expect(outcome.solved).toBe(true);
  });
});
