import { describe, expect, it } from 'vitest';
import {
  boxOf,
  candList,
  colOf,
  rowOf,
  type CellIndex,
} from '../grid.js';
import { PEERS, UNITS } from '../units.js';
import { computeCandidates, parseGrid, serializeGrid } from '../candidates.js';
import { countSolutions, findConflicts, hasUniqueSolution } from '../validate.js';
import { applyStep, makeStep } from '../step.js';
import { replay, solveAll } from '../solver.js';

// A known-unique puzzle (the classic "Norvig hard" grid is unique).
const PUZZLE =
  '53..7....6..195....98....6.8...6...34..8.3..17...2...6.6....28....419..5....8..79';

describe('geometry', () => {
  it('maps indices to row/col/box', () => {
    expect(rowOf(0)).toBe(0);
    expect(colOf(0)).toBe(0);
    expect(boxOf(0)).toBe(0);
    // r3c7 => index (row 2)*9 + col 6 = 24, box = row-band 0 * 3 + col-band 2 = 2
    const i: CellIndex = 2 * 9 + 6;
    expect(boxOf(i)).toBe(2);
  });

  it('has 27 units of 9 cells and 20 peers per cell', () => {
    expect(UNITS).toHaveLength(27);
    for (const u of UNITS) expect(u.cells).toHaveLength(9);
    for (let i = 0; i < 81; i++) expect(PEERS[i]).toHaveLength(20);
  });
});

describe('parse / candidates / serialize', () => {
  it('round-trips placed digits', () => {
    const g = parseGrid(PUZZLE);
    expect(serializeGrid(g)).toBe(PUZZLE);
  });

  it('computes candidates from placed digits only', () => {
    const g = parseGrid(PUZZLE);
    // r1c1 is placed (5) → no candidates.
    expect(g.candidates[0]).toBe(0);
    // r1c3 is empty; its peers already place 5,3 (row), 9,8 (col via box/col),
    // so those digits are excluded. Assert a couple of concrete exclusions.
    const cands = candList(g.candidates[2]!);
    expect(cands).not.toContain(5);
    expect(cands).not.toContain(3);
    // Every empty cell must have at least one candidate in a valid puzzle.
    for (let i = 0; i < 81; i++) {
      if (g.placed[i] === 0) expect(candList(g.candidates[i]!).length).toBeGreaterThan(0);
    }
  });

  it('ignores formatting whitespace when parsing', () => {
    const g = parseGrid(PUZZLE);
    const pretty = serializeGrid(g).replace(/(.{9})/g, '$1\n');
    expect(serializeGrid(parseGrid(pretty))).toBe(PUZZLE);
  });
});

describe('validation & uniqueness', () => {
  it('accepts a legal grid and rejects a duplicate', () => {
    expect(findConflicts(parseGrid(PUZZLE))).toHaveLength(0);
    const bad = '55' + '.'.repeat(79); // two 5s in row 1
    expect(findConflicts(parseGrid(bad)).length).toBeGreaterThan(0);
  });

  it('counts solutions: unique puzzle = 1, empty grid >= 2', () => {
    expect(countSolutions(parseGrid(PUZZLE))).toBe(1);
    expect(hasUniqueSolution(parseGrid(PUZZLE))).toBe(true);
    expect(countSolutions(parseGrid('.'.repeat(81)))).toBe(2); // capped at 2
  });
});

describe('step application & replay', () => {
  it('applyStep places a digit and clears it from peers', () => {
    const g = parseGrid(PUZZLE);
    // r1c3 (index 2) is empty; place a valid candidate there.
    const digit = candList(g.candidates[2]!)[0]!;
    const step = makeStep({
      technique: 'user',
      placements: [{ cell: 2, digit }],
      description: `test place ${digit}`,
    });
    applyStep(g, step);
    expect(g.placed[2]).toBe(digit);
    expect(g.candidates[2]).toBe(0);
    // No peer of cell 2 still lists `digit` as a candidate.
    for (const p of PEERS[2]!) {
      expect(candList(g.candidates[p]!)).not.toContain(digit);
    }
  });

  it('replay reproduces identical state from the same steps', () => {
    const g = parseGrid(PUZZLE);
    const step = makeStep({
      technique: 'user',
      placements: [{ cell: 2, digit: candList(g.candidates[2]!)[0]! }],
      description: 'replayable',
    });
    const rebuilt = replay(PUZZLE, [step]);
    const direct = parseGrid(PUZZLE);
    applyStep(direct, step);
    expect(Array.from(rebuilt.placed)).toEqual(Array.from(direct.placed));
    expect(Array.from(rebuilt.candidates)).toEqual(Array.from(direct.candidates));
  });

  it('Steps are deep-frozen', () => {
    const step = makeStep({ technique: 'user', description: 'frozen' });
    expect(Object.isFrozen(step)).toBe(true);
    expect(Object.isFrozen(step.placements)).toBe(true);
    expect(Object.isFrozen(step.highlights)).toBe(true);
  });
});

describe('solver loop (no techniques registered yet)', () => {
  it('reports stuck on a puzzle with an empty technique list', () => {
    const g = parseGrid(PUZZLE);
    const result = solveAll(g, []);
    expect(result.status).toBe('stuck');
    expect(result.steps).toHaveLength(0);
  });

  it('reports invalid for a conflicting grid', () => {
    const g = parseGrid('55' + '.'.repeat(79));
    expect(solveAll(g, []).status).toBe('invalid');
  });

  it('re-derives candidates identically to a fresh parse', () => {
    const g = parseGrid(PUZZLE);
    const fresh = parseGrid(PUZZLE);
    computeCandidates(g);
    expect(Array.from(g.candidates)).toEqual(Array.from(fresh.candidates));
  });
});
