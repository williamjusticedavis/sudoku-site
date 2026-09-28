import { describe, expect, it } from 'vitest';
import { emptyGrid, type CellIndex, type Digit, type Grid } from '../grid.js';
import type { Step } from '../step.js';
import { aic, groupedAic, xChain } from './aic.js';
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

const elimKeys = (s: Step): string[] =>
  s.eliminations.map((e) => `${e.cell}:${e.digit}`).sort();

describe('xChain (white-box)', () => {
  it('eliminates the digit from a cell seeing both ends of a one-digit chain', () => {
    // 1 only in r1c1, r1c5, r5c5, r5c9, r9c9, r9c2 and r2c2:
    // (1)r1c1 = r1c5 - r5c5 = r5c9 - r9c9 = r9c2, so r1c1 or r9c2 is 1, and
    // r2c2 (box 1, column 2) sees both.
    const g = gridWith({
      0: [1, 5],
      4: [1, 5],
      40: [1, 5],
      44: [1, 5],
      80: [1, 5],
      73: [1, 5],
      10: [1, 5],
    });
    const step = xChain(g)!;
    expect(step.technique).toBe('x-chain');
    expect(elimKeys(step)).toEqual(['10:1']);
  });
});

describe('aic (white-box)', () => {
  it('links through bivalue cells and conjugate pairs across digits', () => {
    // Several five-link chains exist here; the first found is
    // (1)r1c1 = (1)r5c1 - (1)r5c6 = (3)r5c6 - (3)r1c6 = (2)r1c6: r1c1 is 1 or
    // r1c6 is 2, and since they share row 1, r1c1 can't be 2.
    const g = gridWith({ 0: [1, 2], 5: [2, 3], 41: [1, 3], 36: [1, 4] });
    const step = aic(g)!;
    expect(step.technique).toBe('aic');
    expect(elimKeys(step)).toEqual(['0:2']);
  });

  it('finds nothing on a grid without a productive chain', () => {
    expect(aic(gridWith({ 0: [1, 2], 80: [3, 4] }))).toBeNull();
  });
});

describe('grouped nodes', () => {
  it('shorten a chain through a box-line group', () => {
    // Row 1 holds 1 at r1c1, r1c8 and r1c9 (no plain strong link there), and
    // box 3 holds it in column 9 only (r1c9/r2c9, a group). The shortest chain
    // uses that group: (1)r1c1 = r5c1 - r5c9 = r1c9/r2c9, clearing r1c8.
    const g = gridWith({
      0: [1, 5],
      7: [1, 5],
      8: [1, 5],
      17: [1, 6],
      44: [1, 6],
      36: [1, 7],
    });
    const step = groupedAic(g)!;
    expect(step.description).toContain('(1)r1c9/r2c9');
    expect(elimKeys(step)).toEqual(['7:1']);
  });
});

describe('chains on real puzzles', () => {
  it('X-Chain, AIC and ALS Chain all fire on the hard 17-clue set', () => {
    const fired = new Set(
      runFixture('hard17.csv', 60).outcomes.flatMap((o) => o.techniques),
    );
    expect(fired.has('x-chain')).toBe(true);
    expect(fired.has('aic')).toBe(true);
    expect(fired.has('als-chain')).toBe(true);
  });
});
