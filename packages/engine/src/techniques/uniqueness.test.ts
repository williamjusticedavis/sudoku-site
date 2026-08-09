import { describe, expect, it } from 'vitest';
import { emptyGrid, type CellIndex, type Digit, type Grid } from '../grid.js';
import type { Step, TechniqueId } from '../step.js';
import { parseGrid } from '../candidates.js';
import { hasUniqueSolution } from '../validate.js';
import {
  bug1,
  bug1Candidate,
  uniqueRectangle,
  uniqueRectangleCandidate,
} from './uniqueness.js';
import { loadPuzzles, runFixture } from '../__tests__/oracle.js';

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

/**
 * A BUG+1-SHAPED candidate grid with NO placed digits. The candidate pattern is
 * resolvable (box 0 makes digit 5 appear 3× while every other digit is even), so
 * detection returns {cell 0, digit 5}. But with zero placed digits the puzzle
 * has many solutions — so it is exactly the case where the uniqueness guard must
 * stop BUG+1 from firing.
 */
function bug1ShapedButMultiSolution(): Grid {
  const cands: Record<CellIndex, Digit[]> = {};
  for (let c = 0; c < 81; c++) cands[c] = [1, 2]; // all bivalue
  // Box 0 crafted so digit 5 is the odd one out; cell 0 is the tri-value cell.
  cands[0] = [3, 4, 5];
  cands[1] = [5, 6];
  cands[2] = [5, 6]; // 5 appears in cells 0,1,2 → count 3 (odd)
  cands[9] = [3, 7];
  cands[10] = [4, 7]; // 3,4,7 each even
  cands[11] = [8, 9];
  cands[18] = [8, 9];
  cands[19] = [1, 2];
  cands[20] = [1, 2];
  return gridWith(cands);
}

describe('uniqueness guard (hasUniqueSolution) — proven standalone', () => {
  it('is true for a unique puzzle and false once a clue is removed', () => {
    const [unique] = loadPuzzles('17clue_100subset.csv');
    expect(hasUniqueSolution(parseGrid(unique!))).toBe(true);
    // 17-clue puzzles are minimal: dropping any given makes them non-unique.
    const firstClue = unique!.split('').findIndex((ch) => ch >= '1' && ch <= '9');
    const weakened = unique!.slice(0, firstClue) + '.' + unique!.slice(firstClue + 1);
    expect(hasUniqueSolution(parseGrid(weakened))).toBe(false);
  });

  it('is false for a grid with no givens (many solutions)', () => {
    expect(hasUniqueSolution(parseGrid('.'.repeat(81)))).toBe(false);
  });
});

describe('BUG+1', () => {
  it('detection picks the odd candidate of the tri-value cell', () => {
    const found = bug1Candidate(bug1ShapedButMultiSolution());
    expect(found).toEqual({ cell: 0, digit: 5 });
  });

  it('the guard blocks BUG+1 on a non-unique grid even though the pattern is present', () => {
    const g = bug1ShapedButMultiSolution();
    expect(bug1Candidate(g)).not.toBeNull(); // pattern IS there
    expect(bug1(g)).toBeNull(); // …but guard refuses to fire
  });

  it('fires across bug.csv (unique puzzles) and never places a wrong digit', () => {
    const summary = runFixture('bug.csv');
    expect(summary.wrong).toEqual([]);
    expect(firesCount('bug.csv', 'bug+1')).toBeGreaterThan(0);
  });
});

describe('Unique Rectangle (Type 1)', () => {
  it('detection removes the pair digits from the extra corner', () => {
    // Corners r0c0, r0c3, r1c0, r1c3 → cells 0,3,9,12 span boxes 0 and 1.
    // Three corners {1,2}; the fourth (cell 12) is {1,2,7} → remove 1,2 there.
    const g = gridWith({ 0: [1, 2], 3: [1, 2], 9: [1, 2], 12: [1, 2, 7] });
    const step = uniqueRectangleCandidate(g)!;
    expect(step.technique).toBe('unique-rectangle');
    expect(elimKeys(step)).toEqual(['12:1', '12:2']);
  });

  it('the guard blocks Unique Rectangle on a non-unique grid', () => {
    const g = gridWith({ 0: [1, 2], 3: [1, 2], 9: [1, 2], 12: [1, 2, 7] });
    expect(uniqueRectangleCandidate(g)).not.toBeNull(); // pattern present
    expect(uniqueRectangle(g)).toBeNull(); // guard blocks (placed all empty)
  });

  it('does not detect when only two corners share the pair', () => {
    const g = gridWith({ 0: [1, 2], 3: [1, 2], 9: [1, 5], 12: [1, 2, 7] });
    expect(uniqueRectangleCandidate(g)).toBeNull();
  });
});

describe('uniqueness raises the broad solve-rate with zero wrong', () => {
  it('solves at least as many of the 17-clue set as before (91), no wrong', () => {
    const summary = runFixture('17clue_100subset.csv');
    expect(summary.wrong).toEqual([]);
    expect(summary.solved).toBeGreaterThanOrEqual(91);
    console.log(`[uniqueness] 17clue_100subset: solved ${summary.solved}/100`);
  });
});
