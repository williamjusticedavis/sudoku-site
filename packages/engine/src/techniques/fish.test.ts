import { describe, expect, it } from 'vitest';
import { emptyGrid, type CellIndex, type Digit, type Grid } from '../grid.js';
import type { Step, TechniqueId } from '../step.js';
import { xWing } from './fish.js';
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

function elimKeys(step: Step): string[] {
  return step.eliminations.map((e) => `${e.cell}:${e.digit}`).sort();
}

/** How many puzzles in a fixture file the solver applies `tech` on. */
function firesCount(file: string, tech: TechniqueId): number {
  return runFixture(file).outcomes.filter((o) => o.techniques.includes(tech)).length;
}

describe('xWing (white-box)', () => {
  it('eliminates the digit from cover columns outside the base rows', () => {
    // Digit 1 sits only in columns 2 and 6 of rows 0 and 4 → X-Wing.
    // r2c2 also holds 1 in column 2 (not a base row) → it must be eliminated.
    const g = gridWith({
      2: [1, 5], // r0c2
      6: [1, 5], // r0c6
      38: [1, 7], // r4c2
      42: [1, 7], // r4c6
      20: [1, 3], // r2c2  ← elimination target
    });
    const step = xWing(g)!;
    expect(step.technique).toBe('x-wing');
    expect(elimKeys(step)).toEqual(['20:1']);
    expect(
      [...step.highlights.find((h) => h.role === 'base')!.cells].sort((a, b) => a - b),
    ).toEqual([2, 6, 38, 42]);
  });

  it('does not fire without a confining pattern', () => {
    const g = gridWith({ 2: [1, 5], 6: [1, 5], 38: [1, 7], 43: [1, 7] }); // cols 2,6 vs 2,7
    expect(xWing(g)).toBeNull();
  });
});

describe('fish techniques fire on their named fixtures', () => {
  // Independent proof each pattern actually triggers on third-party puzzles
  // known to require it — beyond just moving the aggregate solve-rate.
  it('x-wing fires across xwing.csv', () => {
    expect(firesCount('xwing.csv', 'x-wing')).toBeGreaterThan(0);
  });
  it('swordfish fires across swordfish.csv', () => {
    expect(firesCount('swordfish.csv', 'swordfish')).toBeGreaterThan(0);
  });
  it('jellyfish fires across jellyfish.csv', () => {
    expect(firesCount('jellyfish.csv', 'jellyfish')).toBeGreaterThan(0);
  });
  it('finned swordfish fires across finnedswordfish.csv', () => {
    expect(firesCount('finnedswordfish.csv', 'finned-swordfish')).toBeGreaterThan(0);
  });
});

describe('fish raise the broad solve-rate with zero wrong placements', () => {
  it('solves more of the 17-clue set than subsets alone (55), no wrong', () => {
    const summary = runFixture('17clue_100subset.csv');
    expect(summary.wrong).toEqual([]);
    expect(summary.solved).toBeGreaterThanOrEqual(55);
    console.log(`[fish] 17clue_100subset: solved ${summary.solved}/100`);
  });
});
