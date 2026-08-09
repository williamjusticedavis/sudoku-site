import { describe, expect, it } from 'vitest';
import { emptyGrid, type CellIndex, type Digit, type Grid } from '../grid.js';
import type { Step } from '../step.js';
import { alsXz } from './als.js';
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

describe('alsXz (white-box)', () => {
  it('eliminates the locked Z given a restricted common candidate', () => {
    // ALS A = r0c0 {2,3} (N=1). ALS B = r4c0 {1,2}, r4c1 {1,3} → {1,2,3} (N=2).
    // Restricted common X=2 (r0c0 sees r4c0 via column 0). Then Z=3 is locked to
    // A ∪ B, so r0c1 (sees r0c0 and r4c1, holds 3) loses 3.
    const g = gridWith({ 0: [2, 3], 36: [1, 2], 37: [1, 3], 1: [3, 4] });
    const step = alsXz(g)!;
    expect(step.technique).toBe('als-xz');
    expect(elimKeys(step)).toEqual(['1:3']);
  });

  it('does not fire without a restricted common candidate', () => {
    // Same ALSs but A={2,3} and B shares only one candidate → no RCC+Z pair.
    const g = gridWith({ 0: [2, 3], 36: [1, 4], 37: [1, 5], 1: [3, 6] });
    expect(alsXz(g)).toBeNull();
  });
});

describe('alsXz fires on real broad-set puzzles', () => {
  // No dedicated ALS fixture exists (white-box only, like the chains); proof is
  // the white-box above plus firing on third-party 17-clue puzzles, with the
  // never-wrong oracle invariant enforced across every fixture.
  it('fires on the 17-clue set', () => {
    const fired = runFixture('17clue_100subset.csv').outcomes.filter((o) =>
      o.techniques.includes('als-xz'),
    );
    expect(fired.length).toBeGreaterThan(0);
  });
});

describe('ALS keeps the broad solve-rate and never places a wrong digit', () => {
  it('solves at least as many of the 17-clue set as before (94), no wrong', () => {
    const summary = runFixture('17clue_100subset.csv');
    expect(summary.wrong).toEqual([]);
    expect(summary.solved).toBeGreaterThanOrEqual(94);
    console.log(`[als] 17clue_100subset: solved ${summary.solved}/100`);
  });
});
