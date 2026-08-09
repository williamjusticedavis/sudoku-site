import { describe, expect, it } from 'vitest';
import { emptyGrid, type CellIndex, type Digit, type Grid } from '../grid.js';
import type { Step, TechniqueId } from '../step.js';
import { wWing, xyWing, xyzWing } from './wings.js';
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
const firesCount = (file: string, tech: TechniqueId): number =>
  runFixture(file).outcomes.filter((o) => o.techniques.includes(tech)).length;

describe('xyWing (white-box)', () => {
  it('eliminates Z from cells seeing both pincers', () => {
    // pivot r0c0 {1,2}; pincers r0c1 {1,3} and r1c0 {2,3}; Z=3.
    // r1c1 sees both pincers and holds 3 → eliminated.
    const g = gridWith({ 0: [1, 2], 1: [1, 3], 9: [2, 3], 10: [3, 5] });
    const step = xyWing(g)!;
    expect(step.technique).toBe('xy-wing');
    expect(elimKeys(step)).toEqual(['10:3']);
  });
});

describe('xyzWing (white-box)', () => {
  it('eliminates Z from cells seeing the pivot and both pincers', () => {
    // pivot r0c0 {1,2,3}; pincers r0c1 {1,3}, r1c0 {2,3}; Z=3.
    // r1c1 sees all three and holds 3 → eliminated.
    const g = gridWith({ 0: [1, 2, 3], 1: [1, 3], 9: [2, 3], 10: [3, 7] });
    const step = xyzWing(g)!;
    expect(step.technique).toBe('xyz-wing');
    expect(elimKeys(step)).toEqual(['10:3']);
  });
});

describe('wWing (white-box)', () => {
  // No named fixture for W-Wing (KyleGough has y/xyz/wxyz, not W). Proof here is
  // this exact-elimination white-box plus the never-wrong invariant over all
  // fixtures in oracle.test.ts.
  it('eliminates the non-link digit from cells seeing both wings', () => {
    // Wings r0c0 & r4c4 both {2,7}, not seeing each other. Column 5 is a
    // conjugate pair on 2 (r0c5, r4c5) linking them. Eliminate 7 from r0c4.
    const g = gridWith({
      0: [2, 7], // wing A
      40: [2, 7], // wing B (r4c4)
      5: [2, 8], // r0c5 — link end, sees A
      41: [2, 9], // r4c5 — link end, sees B
      4: [7, 5], // r0c4 — sees both wings, holds 7 → eliminated
    });
    const step = wWing(g)!;
    expect(step.technique).toBe('w-wing');
    expect(elimKeys(step)).toEqual(['4:7']);
  });
});

describe('wings fire on their named fixtures', () => {
  it('xy-wing fires across ywing.csv', () => {
    expect(firesCount('ywing.csv', 'xy-wing')).toBeGreaterThan(0);
  });
  it('xyz-wing fires across xyzwing.csv', () => {
    expect(firesCount('xyzwing.csv', 'xyz-wing')).toBeGreaterThan(0);
  });
});

describe('wings raise the broad solve-rate with zero wrong', () => {
  it('solves at least as many of the 17-clue set as before (85), no wrong', () => {
    const summary = runFixture('17clue_100subset.csv');
    expect(summary.wrong).toEqual([]);
    expect(summary.solved).toBeGreaterThanOrEqual(85);
    console.log(`[wings] 17clue_100subset: solved ${summary.solved}/100`);
  });
});
