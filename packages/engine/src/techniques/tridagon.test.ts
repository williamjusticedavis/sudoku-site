import { describe, expect, it } from 'vitest';
import { emptyGrid, type CellIndex, type Digit, type Grid } from '../grid.js';
import { tridagon } from './tridagon.js';
import { runFixture } from '../__tests__/oracle.js';

function gridWith(cands: Record<CellIndex, Digit[]>): Grid {
  const g = emptyGrid();
  for (const [cell, digits] of Object.entries(cands)) {
    let mask = 0;
    for (const d of digits) mask |= 1 << (d - 1);
    g.candidates[Number(cell)] = mask;
  }
  return g;
}

const on123 = (cells: CellIndex[]) =>
  Object.fromEntries(cells.map((c) => [c, [1, 2, 3]])) as Record<CellIndex, Digit[]>;

describe('tridagon (white-box)', () => {
  it('places the lone guardian of an unfillable pattern', () => {
    // The shape Pretzaal's "Sign" reaches: boxes 1, 3, 4, 6, with r6c9 (cell
    // 53) the only cell holding anything besides 1/2/3.
    const g = gridWith({
      ...on123([1, 9, 20, 8, 15, 25, 28, 38, 45, 33, 43]),
      53: [1, 2, 3, 9],
    });
    const step = tridagon(g)!;
    expect(step.technique).toBe('tridagon');
    expect(step.placements).toEqual([{ cell: 53, digit: 9 }]);
  });

  it('leaves alone a same-shaped pattern that can be filled', () => {
    // Every box on its main diagonal: 1/2/3 fits (e.g. box 1 as 1,2,3, box 3 as
    // 2,3,1, box 4 as 2,3,1, box 6 as 3,1,2), so nothing is forced.
    const g = gridWith({
      ...on123([0, 10, 20, 6, 16, 26, 27, 37, 47, 33, 43]),
      53: [1, 2, 3, 9],
    });
    expect(tridagon(g)).toBeNull();
  });

  it('removes the three digits from a cell holding every guardian', () => {
    const g = gridWith({
      ...on123([1, 9, 20, 8, 15, 25, 28, 38, 45, 33, 43]),
      53: [1, 2, 3, 8, 9],
    });
    const step = tridagon(g)!;
    expect(step.placements).toEqual([]);
    expect(step.eliminations.map((e) => `${e.cell}:${e.digit}`).sort()).toEqual([
      '53:1',
      '53:2',
      '53:3',
    ]);
  });
});

describe('tridagon on real puzzles', () => {
  it('solves "Sign" with no forcing chain', () => {
    const [outcome] = runFixture('tridagon.csv').outcomes;
    expect(outcome!.solved).toBe(true);
    expect(outcome!.techniques).toContain('tridagon');
    expect(outcome!.techniques).not.toContain('forcing-chain');
  });
});
