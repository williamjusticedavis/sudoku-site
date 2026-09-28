import { describe, expect, it } from 'vitest';
import { emptyGrid, type CellIndex, type Digit, type Grid } from '../grid.js';
import type { Step, TechniqueId } from '../step.js';
import { parseGrid } from '../candidates.js';
import { hasUniqueSolution } from '../validate.js';
import {
  bug1,
  bug1Candidate,
  extendedRectangleCandidate,
  uniqueRectangle,
  uniqueRectangle2,
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

const elimKeys = (s: Step): string[] =>
  s.eliminations.map((e) => `${e.cell}:${e.digit}`).sort();
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

describe('Unique Rectangle Types 2–6 and Hidden Rectangle', () => {
  // Every case uses the rectangle r1c1, r1c4, r2c1, r2c4 (cells 0, 3, 9, 12,
  // boxes 1 and 2) on the pair 1/2. Detection is tested without the guard —
  // these hand-built grids have no givens, so they are never unique.
  const rest = (cells: number[], digits: Digit[]) =>
    Object.fromEntries(cells.map((c) => [c, digits])) as Record<CellIndex, Digit[]>;

  it('Type 2: two roof corners sharing a line with the same one extra', () => {
    // Roof r1c4, r2c4 = {1,2,7}; one of them is 7, so r4c4 (same column) isn't.
    const g = gridWith({ 0: [1, 2], 9: [1, 2], 3: [1, 2, 7], 12: [1, 2, 7], 30: [7, 8] });
    const step = extendedRectangleCandidate(g, 'unique-rectangle-2')!;
    expect(step.technique).toBe('unique-rectangle-2');
    expect(elimKeys(step)).toEqual(['30:7']);
  });

  it('Type 5: the same extra on diagonal corners', () => {
    // Roof r1c4, r2c1 = {1,2,7}; r1c2 sees both (row 1, box 1).
    const g = gridWith({ 0: [1, 2], 12: [1, 2], 3: [1, 2, 7], 9: [1, 2, 7], 1: [7, 8] });
    expect(extendedRectangleCandidate(g, 'unique-rectangle-2')).toBeNull();
    const step = extendedRectangleCandidate(g, 'unique-rectangle-5')!;
    expect(elimKeys(step)).toEqual(['1:7']);
  });

  it('Type 3: the roof acts as one cell in a naked pair', () => {
    // Roof r2c1 {1,2,3} + r2c4 {1,2,4} is a virtual {3,4}; with r2c7 {3,4}
    // that's a naked pair in row 2, so r2c8 loses its 3.
    const g = gridWith({
      ...rest([10, 11, 13, 14, 17], [5, 6, 8, 9]),
      0: [1, 2],
      3: [1, 2],
      9: [1, 2, 3],
      12: [1, 2, 4],
      15: [3, 4],
      16: [3, 5],
    });
    const step = extendedRectangleCandidate(g, 'unique-rectangle-3')!;
    expect(elimKeys(step)).toEqual(['16:3']);
  });

  it('Type 4: a pair digit locked to the roof removes the other from it', () => {
    // 1 appears in row 2 only at the roof, so one roof corner is 1 and neither
    // can be 2. (r2c7 holds a 2, so 2 isn't locked the same way.)
    const g = gridWith({ 0: [1, 2], 3: [1, 2], 9: [1, 2, 3], 12: [1, 2, 4], 15: [2, 5] });
    const step = extendedRectangleCandidate(g, 'unique-rectangle-4')!;
    expect(elimKeys(step)).toEqual(['12:2', '9:2']);
  });

  it('Type 6: diagonal floor with the digit locked to the rectangle in both rows', () => {
    // 1 only on the rectangle in rows 1 and 2 → 1 leaves the roof r1c4, r2c1.
    const g = gridWith({ 0: [1, 2], 12: [1, 2], 3: [1, 2, 5], 9: [1, 2, 6], 5: [2, 7] });
    const step = extendedRectangleCandidate(g, 'unique-rectangle-6')!;
    expect(elimKeys(step)).toEqual(['3:1', '9:1']);
  });

  it('Hidden Rectangle: locked along the far corner’s row and column', () => {
    // Floor r1c1. Opposite corner r2c4 sees 1 only on the rectangle in row 2
    // and column 4, so it can't be 2. (r9c4 holds a 2 so 2 isn't locked too.)
    const g = gridWith({
      0: [1, 2],
      3: [1, 2, 6],
      9: [1, 2, 7],
      12: [1, 2, 5],
      75: [2, 8],
    });
    const step = extendedRectangleCandidate(g, 'hidden-rectangle')!;
    expect(elimKeys(step)).toEqual(['12:2']);
  });

  it('the guard blocks the extended types on a non-unique grid', () => {
    const g = gridWith({ 0: [1, 2], 9: [1, 2], 3: [1, 2, 7], 12: [1, 2, 7], 30: [7, 8] });
    expect(extendedRectangleCandidate(g, 'unique-rectangle-2')).not.toBeNull();
    expect(uniqueRectangle2(g)).toBeNull();
  });

  it('Type 4 and Hidden Rectangle fire on the hard 17-clue set', () => {
    const fired = new Set(
      runFixture('hard17.csv', 50).outcomes.flatMap((o) => o.techniques),
    );
    expect(fired.has('unique-rectangle-4')).toBe(true);
    expect(fired.has('hidden-rectangle')).toBe(true);
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
