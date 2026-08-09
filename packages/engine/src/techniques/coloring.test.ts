import { describe, expect, it } from 'vitest';
import { emptyGrid, type CellIndex, type Digit, type Grid } from '../grid.js';
import type { Step, TechniqueId } from '../step.js';
import { simpleColoring } from './coloring.js';
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

describe('simpleColoring (white-box: Rule 2 — colour repeats in a unit)', () => {
  it('eliminates the whole colour that appears twice in a unit', () => {
    // Conjugate pairs on 1 form a 4-cycle inside box 0: cells 0,1,19,18
    // (row0: 0-1, col1: 1-19, row2: 19-18, col0: 0-18). One colour {0,19}
    // repeats within box 0 → that colour is false, remove 1 from both.
    const g = gridWith({ 0: [1, 2], 1: [1, 2], 18: [1, 2], 19: [1, 2] });
    const step = simpleColoring(g)!;
    expect(step.technique).toBe('simple-coloring');
    expect(elimKeys(step)).toEqual(['0:1', '19:1']);
  });

  it('does not fire without any conjugate chain', () => {
    const g = gridWith({ 0: [1, 2], 40: [1, 2] }); // two lone bivalues, no strong link
    expect(simpleColoring(g)).toBeNull();
  });
});

describe('simpleColoring fires on its named fixture', () => {
  // singles-chain.csv (KyleGough "Singles Chains" == Simple Coloring). Real
  // puzzles exercise both Rule 2 and the Rule 4 (sees-both-colours) path, which
  // is impractical to hand-craft minimally.
  it('fires across singles-chain.csv and solves them, no wrong', () => {
    const summary = runFixture('singles-chain.csv');
    expect(summary.wrong).toEqual([]);
    expect(firesCount('singles-chain.csv', 'simple-coloring')).toBeGreaterThan(0);
  });
});

describe('coloring keeps the broad solve-rate and never places a wrong digit', () => {
  it('solves at least as many of the 17-clue set as before (94), no wrong', () => {
    const summary = runFixture('17clue_100subset.csv');
    expect(summary.wrong).toEqual([]);
    expect(summary.solved).toBeGreaterThanOrEqual(94);
    console.log(`[coloring] 17clue_100subset: solved ${summary.solved}/100`);
  });
});
