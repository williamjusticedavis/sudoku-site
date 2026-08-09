import { describe, expect, it } from 'vitest';
import { emptyGrid, type CellIndex, type Digit, type Grid } from '../grid.js';
import type { Step, TechniqueId } from '../step.js';
import { claiming, pointing } from './locked.js';
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

describe('pointing (box → line)', () => {
  it('removes the digit from the line outside the box', () => {
    // Box 0 has 1 only in r0c0/r0c1 (same row) → clear 1 from the rest of row 0.
    // r0c4 (idx 4) holds 1 and is outside box 0 → eliminated.
    const g = gridWith({ 0: [1, 5], 1: [1, 6], 4: [1, 5] });
    const step = pointing(g)!;
    expect(step.technique).toBe('pointing');
    expect(elimKeys(step)).toEqual(['4:1']);
    expect([...step.highlights[0]!.cells].sort((a, b) => a - b)).toEqual([0, 1]);
  });

  it('does not fire when the box candidates span two lines', () => {
    const g = gridWith({ 0: [1, 5], 10: [1, 6], 4: [1, 5] }); // r0c0 & r1c1 → different rows
    expect(pointing(g)).toBeNull();
  });
});

describe('claiming (line → box)', () => {
  it('removes the digit from the rest of the box', () => {
    // Row 0 has 1 only in r0c0/r0c1 (both box 0) → clear 1 from box 0 off-row.
    // r1c1 (idx 10) holds 1 in box 0 → eliminated.
    const g = gridWith({ 0: [1, 5], 1: [1, 6], 10: [1, 5] });
    const step = claiming(g)!;
    expect(step.technique).toBe('claiming');
    expect(elimKeys(step)).toEqual(['10:1']);
  });
});

describe('locked candidates fire on their named fixtures', () => {
  it('pointing fires across pointing-pairs.csv', () => {
    expect(firesCount('pointing-pairs.csv', 'pointing')).toBeGreaterThan(0);
  });
  it('claiming fires across boxline-reduction.csv', () => {
    expect(firesCount('boxline-reduction.csv', 'claiming')).toBeGreaterThan(0);
  });
});

describe('locked candidates raise the broad solve-rate with zero wrong', () => {
  it('solves at least as many of the 17-clue set as before (78), no wrong', () => {
    const summary = runFixture('17clue_100subset.csv');
    expect(summary.wrong).toEqual([]);
    expect(summary.solved).toBeGreaterThanOrEqual(78);
    console.log(`[locked] 17clue_100subset: solved ${summary.solved}/100`);
  });
});
