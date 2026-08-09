import { describe, expect, it } from 'vitest';
import { candCount, type CellIndex } from '../grid.js';
import { parseGrid, serializeGrid } from '../candidates.js';
import { replay, solveAll } from '../solver.js';
import { hiddenSingle, lastFreeCell, nakedSingle } from './singles.js';

// The unique solution of the classic "53.." puzzle — a complete, legal grid.
const SOLUTION =
  '534678912672195348198342567859761423426853791713924856961537284287419635345286179';

function blank(indices: CellIndex[]): string {
  const s = SOLUTION.split('');
  for (const i of indices) s[i] = '.';
  return s.join('');
}

describe('lastFreeCell', () => {
  it('fills the single empty cell of a unit with the missing digit', () => {
    const g = parseGrid(blank([0])); // r1c1 (solution 5) is the only gap in its row
    const step = lastFreeCell(g)!;
    expect(step).not.toBeNull();
    expect(step.technique).toBe('last-free-cell');
    expect(step.placements).toEqual([{ cell: 0, digit: 5 }]);
    // placement highlighted, the other 8 unit cells marked related
    const roles = step.highlights.map((h) => h.role).sort();
    expect(roles).toEqual(['placement', 'related']);
  });

  it('does not fire when every unit has 2+ empties', () => {
    const g = parseGrid(blank([0, 1, 2, 9, 10, 11, 18, 19, 20])); // whole box empty
    expect(lastFreeCell(g)).toBeNull();
  });
});

describe('nakedSingle', () => {
  it('places the sole candidate of a cell', () => {
    const g = parseGrid(blank([0]));
    const step = nakedSingle(g)!;
    expect(step.technique).toBe('naked-single');
    expect(step.placements).toEqual([{ cell: 0, digit: 5 }]);
  });
});

describe('hiddenSingle', () => {
  it('finds a digit with one home in a unit even when that cell has other candidates', () => {
    // Four 1s that between them ban digit 1 from every box-0 cell except r1c1:
    //  r2c5 & r3c8 (rows 2,3) clear the lower two box rows; r5c2 & r7c3 (cols 2,3)
    //  clear r1c2 and r1c3. Grid is otherwise empty, so r1c1 keeps many candidates.
    const g = parseGrid(
      Array.from({ length: 81 }, (_, i) =>
        [13, 25, 37, 56].includes(i) ? '1' : '.',
      ).join(''),
    );
    expect(candCount(g.candidates[0]!)).toBeGreaterThan(1); // NOT a naked single
    const step = hiddenSingle(g)!;
    expect(step.technique).toBe('hidden-single');
    expect(step.placements).toEqual([{ cell: 0, digit: 1 }]);
  });
});

describe('solve loop with singles', () => {
  it('solves a fully-blanked box by cascading singles', () => {
    const puzzle = blank([0, 1, 2, 9, 10, 11, 18, 19, 20]);
    const g = parseGrid(puzzle);
    const result = solveAll(g);
    expect(result.status).toBe('solved');
    expect(serializeGrid(g)).toBe(SOLUTION);
    expect(result.steps).toHaveLength(9);
    // The cascade must include genuine singles beyond last-free-cell.
    const techniques = new Set(result.steps.map((s) => s.technique));
    expect([...techniques].some((t) => t === 'naked-single' || t === 'hidden-single')).toBe(
      true,
    );
  });

  it('replaying the steps reproduces the solved grid', () => {
    const puzzle = blank([0, 1, 2, 9, 10, 11, 18, 19, 20]);
    const g = parseGrid(puzzle);
    const result = solveAll(g);
    const rebuilt = replay(puzzle, result.steps);
    expect(serializeGrid(rebuilt)).toBe(SOLUTION);
    expect(Array.from(rebuilt.candidates)).toEqual(Array.from(g.candidates));
  });

  it('last-free-cell wins first on a diagonally-blanked grid', () => {
    // One blank per row/column → each is a last-free-cell in its row.
    const g = parseGrid(blank([0, 10, 20, 30, 40, 50, 60, 70, 80]));
    const result = solveAll(g);
    expect(result.status).toBe('solved');
    expect(serializeGrid(g)).toBe(SOLUTION);
    expect(result.steps[0]!.technique).toBe('last-free-cell');
  });
});
