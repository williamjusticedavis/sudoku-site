import { describe, expect, it } from 'vitest';
import { emptyGrid, type CellIndex, type Digit, type Grid } from '../grid.js';
import type { Elimination, Step } from '../step.js';
import {
  hiddenPair,
  hiddenTriple,
  nakedPair,
  nakedQuad,
  nakedTriple,
} from './subsets.js';
import { runFixture } from '../__tests__/oracle.js';

/** Build a grid where the given cells carry explicit candidate sets (row 0). */
function gridWith(cands: Record<CellIndex, Digit[]>): Grid {
  const g = emptyGrid();
  for (const [cell, digits] of Object.entries(cands)) {
    let mask = 0;
    for (const d of digits) mask |= 1 << (d - 1);
    g.candidates[Number(cell)] = mask;
  }
  return g;
}

function elimKeys(step: Step): string[] {
  return step.eliminations.map((e: Elimination) => `${e.cell}:${e.digit}`).sort();
}

describe('nakedPair', () => {
  it('eliminates the pair digits from the rest of the unit', () => {
    // Row 0: r0c0/r0c1 = {2,5}; the pair; c2 and c3 also hold 2/5.
    const g = gridWith({ 0: [2, 5], 1: [2, 5], 2: [2, 5, 8], 3: [5, 7, 9] });
    const step = nakedPair(g)!;
    expect(step.technique).toBe('naked-pair');
    expect(elimKeys(step)).toEqual(['2:2', '2:5', '3:5'].sort());
    expect(step.highlights.find((h) => h.role === 'base')!.cells).toEqual([0, 1]);
  });

  it('does not fire when the pair digits appear nowhere else in the unit', () => {
    const g = gridWith({ 0: [2, 5], 1: [2, 5], 2: [3, 8], 3: [7, 9] });
    expect(nakedPair(g)).toBeNull();
  });
});

describe('nakedTriple', () => {
  it('fires on three cells whose candidate union is exactly three digits', () => {
    // {1,2},{2,3},{1,3} → union {1,2,3}; c3/c4 lose those digits.
    const g = gridWith({ 0: [1, 2], 1: [2, 3], 2: [1, 3], 3: [1, 2, 3, 9], 4: [3, 9] });
    const step = nakedTriple(g)!;
    expect(step.technique).toBe('naked-triple');
    expect(elimKeys(step)).toEqual(['3:1', '3:2', '3:3', '4:3'].sort());
  });
});

describe('hiddenPair', () => {
  it('strips foreign candidates from the two cells that alone hold the pair', () => {
    // Digits 4,6 live only in r0c0,r0c1 (which also carry extras 3 and 7).
    const g = gridWith({ 0: [3, 4, 6], 1: [4, 6, 7], 2: [3, 7], 3: [3, 7, 8] });
    const step = hiddenPair(g)!;
    expect(step.technique).toBe('hidden-pair');
    expect(elimKeys(step)).toEqual(['0:3', '1:7'].sort());
    expect(step.highlights[0]!.role).toBe('base');
  });
});

describe('hiddenTriple', () => {
  it('confines three digits to three cells and clears the rest', () => {
    // Digits 4,5,6 appear only across r0c0,r0c1,r0c2 (each with a foreign extra).
    const g = gridWith({
      0: [1, 4, 5],
      1: [4, 6, 2],
      2: [5, 6, 7],
      3: [1, 2, 7],
      4: [1, 2, 7],
    });
    const step = hiddenTriple(g)!;
    expect(step.technique).toBe('hidden-triple');
    // c0 loses 1, c1 loses 2, c2 loses 7.
    expect(elimKeys(step)).toEqual(['0:1', '1:2', '2:7'].sort());
  });
});

describe('nakedQuad', () => {
  it('fires on four cells whose candidate union is exactly four digits', () => {
    const g = gridWith({
      0: [1, 2],
      1: [2, 3],
      2: [3, 4],
      3: [1, 4],
      4: [1, 2, 3, 4, 9],
    });
    const step = nakedQuad(g)!;
    expect(step.technique).toBe('naked-quad');
    expect(elimKeys(step)).toEqual(['4:1', '4:2', '4:3', '4:4'].sort());
  });
});

describe('subsets raise the broad solve-rate with zero wrong placements', () => {
  it('solves more of the 17-clue set than singles alone (28), no wrong', () => {
    const summary = runFixture('17clue_100subset.csv'); // uses the full technique list
    expect(summary.wrong).toEqual([]);
    expect(summary.solved).toBeGreaterThan(28);
    console.log(`[subsets] 17clue_100subset: solved ${summary.solved}/100`);
  });
});
