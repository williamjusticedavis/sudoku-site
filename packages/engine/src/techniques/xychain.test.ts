import { describe, expect, it } from 'vitest';
import { emptyGrid, type CellIndex, type Digit, type Grid } from '../grid.js';
import type { Step } from '../step.js';
import { xyChain } from './xychain.js';
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

const elimKeys = (s: Step): string[] => s.eliminations.map((e) => `${e.cell}:${e.digit}`).sort();

describe('xyChain (white-box)', () => {
  it('resolves a length-3 chain (the XY-Wing case) and eliminates Z', () => {
    // r0c1{1,3} — r0c0{1,2} — r1c0{2,3}: both ends expose 3.
    // r1c1 sees both ends and holds 3 → eliminate 3 there.
    const g = gridWith({ 0: [1, 2], 1: [1, 3], 9: [2, 3], 10: [3, 5] });
    const step = xyChain(g)!;
    expect(step.technique).toBe('xy-chain');
    expect(elimKeys(step)).toEqual(['10:3']);
    expect(step.highlights[0]!.cells).toHaveLength(3); // the chain cells
  });

  it('does not fire when the ends do not share a common eliminable Z', () => {
    // Same chain but the only cell seeing both ends has no 3.
    const g = gridWith({ 0: [1, 2], 1: [1, 3], 9: [2, 3], 10: [4, 5] });
    expect(xyChain(g)).toBeNull();
  });
});

describe('xyChain fires on real broad-set puzzles', () => {
  // No dedicated fixture (white-box only, like the single-digit chains); proof
  // is this white-box plus firing on third-party 17-clue puzzles.
  it('fires on the 17-clue set', () => {
    const fired = runFixture('17clue_100subset.csv').outcomes.filter((o) =>
      o.techniques.includes('xy-chain'),
    );
    expect(fired.length).toBeGreaterThan(0);
  });
});

describe('xyChain raises the broad solve-rate with zero wrong', () => {
  it('solves more of the 17-clue set than before (91), no wrong', () => {
    const summary = runFixture('17clue_100subset.csv');
    expect(summary.wrong).toEqual([]);
    expect(summary.solved).toBeGreaterThan(91);
    console.log(`[xy-chain] 17clue_100subset: solved ${summary.solved}/100`);
  });
});
