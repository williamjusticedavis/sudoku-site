import { describe, expect, it } from 'vitest';
import { emptyGrid, type CellIndex, type Digit, type Grid } from '../grid.js';
import type { Step, TechniqueId } from '../step.js';
import { skyscraper, twoStringKite } from './chains.js';
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

describe('skyscraper (white-box)', () => {
  it('eliminates the digit from a cell seeing both roof ends', () => {
    // Two row conjugate pairs on 1 sharing column 0 (bases r0c0, r3c0).
    // Roofs r0c3 and r3c5 are in different boxes (don't see each other).
    // r1c5 sees r0c3 (box 1) and r3c5 (column 5) → eliminate 1 there.
    const g = gridWith({ 0: [1, 2], 3: [1, 2], 27: [1, 2], 32: [1, 2], 14: [1, 3] });
    const step = skyscraper(g)!;
    expect(step.technique).toBe('skyscraper');
    expect(elimKeys(step)).toEqual(['14:1']);
  });
});

describe('2-string kite (white-box)', () => {
  it('eliminates the digit from the cell seeing both free ends', () => {
    // Row-1 conjugate on 1: r1c1, r1c8. Column-2 conjugate on 1: r0c2, r6c2.
    // Weak ends r1c1 & r0c2 share box 0. Free ends r1c8, r6c2 → r6c8 sees both.
    const g = gridWith({ 10: [1, 2], 17: [1, 2], 2: [1, 2], 56: [1, 2], 62: [1, 3] });
    const step = twoStringKite(g)!;
    expect(step.technique).toBe('2-string-kite');
    expect(elimKeys(step)).toEqual(['62:1']);
  });
});

describe('single-digit chains fire on real broad-set puzzles', () => {
  // No dedicated fixtures exist for these (white-box only, like W-Wing/UR), but
  // all three do fire on third-party 17-clue puzzles — a real firing proof
  // beyond the hand-built cases. Turbot Fish is rarest (fires on ~1 puzzle);
  // its correctness rests on this firing plus the never-wrong oracle invariant.
  it('skyscraper fires on the 17-clue set', () => {
    expect(firesCount('17clue_100subset.csv', 'skyscraper')).toBeGreaterThan(0);
  });
  it('2-string kite fires on the 17-clue set', () => {
    expect(firesCount('17clue_100subset.csv', '2-string-kite')).toBeGreaterThan(0);
  });
  it('turbot fish fires on the 17-clue set', () => {
    expect(firesCount('17clue_100subset.csv', 'turbot-fish')).toBeGreaterThan(0);
  });
});

describe('chains keep the broad solve-rate and never place a wrong digit', () => {
  it('solves at least as many of the 17-clue set as before (91), no wrong', () => {
    const summary = runFixture('17clue_100subset.csv');
    expect(summary.wrong).toEqual([]);
    expect(summary.solved).toBeGreaterThanOrEqual(91);
    console.log(`[chains] 17clue_100subset: solved ${summary.solved}/100`);
  });
});
