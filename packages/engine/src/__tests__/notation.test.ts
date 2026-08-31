import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
  computeCandidates,
  parseGrid,
  parseGridWithCandidates,
  serializeGrid,
  serializeGridWithCandidates,
} from '../candidates.js';
import { bit, candList, cloneGrid, type Digit } from '../grid.js';
import {
  auditUserCandidates,
  checkForMistakes,
  reconcileNotation,
  solve,
} from '../validate.js';
import { applyStep, makeStep } from '../step.js';
import { solveAll } from '../solver.js';

const NOTATION_DIR = join(
  dirname(fileURLToPath(import.meta.url)),
  '../../tests/fixtures/notation',
);
const loadFixture = (name: string): string =>
  readFileSync(join(NOTATION_DIR, name), 'utf8');

const PUZZLE =
  '53..7....6..195....98....6.8...6...34..8.3..17...2...6.6....28....419..5....8..79';
const SOLUTION =
  '534678912672195348198342567859761423426853791713924856961537284287419635345286179';
/** diabolical1.csv row 1 — needs real elimination techniques, not just singles. */
const HARD =
  '120304078300807009000000000290000084000080000780000013000000000400902006930108047'.replace(
    /0/g,
    '.',
  );

/** Build an extended-notation string from overrides onto an all-empty base. */
function ext(overrides: Record<number, string>): string {
  const tokens = new Array(81).fill('.');
  for (const [i, v] of Object.entries(overrides)) tokens[Number(i)] = v;
  return tokens.join(' ');
}

describe('parseGridWithCandidates', () => {
  it('keeps user candidate marks distinct from what computeCandidates would derive', () => {
    // r1c3 (index 2) is empty; user marks only {1,5}. computeCandidates would
    // give more — the parser must preserve the user set verbatim.
    const g = parseGridWithCandidates(ext({ 0: '5', 2: '[15]' }));
    expect(g.placed[0]).toBe(5);
    expect(candList(g.candidates[2]!)).toEqual([1, 5]);

    const fresh = cloneGrid(g);
    computeCandidates(fresh);
    expect(candList(fresh.candidates[2]!).length).toBeGreaterThan(2); // strictly more
  });

  it('computes candidates for unmarked empties and accepts digit-run shorthand', () => {
    const g = parseGridWithCandidates(ext({ 0: '5', 40: '159' }));
    expect(candList(g.candidates[40]!)).toEqual([1, 5, 9]); // bare run == [159]
    expect(candList(g.candidates[1]!).length).toBeGreaterThan(0); // '.' got computed
  });

  it('round-trips through serializeGridWithCandidates', () => {
    const g = parseGrid(PUZZLE);
    const again = parseGridWithCandidates(serializeGridWithCandidates(g));
    expect(serializeGrid(again)).toBe(serializeGrid(g));
    expect(Array.from(again.candidates)).toEqual(Array.from(g.candidates));
  });

  it('rejects malformed input', () => {
    expect(() => parseGridWithCandidates('5 3 .')).toThrow(); // wrong token count
    expect(() => parseGridWithCandidates(ext({ 0: '[0]' }))).toThrow(); // invalid token
  });
});

describe('checkForMistakes — exactly the three checks', () => {
  it('passes a grid with correct computed candidates', () => {
    expect(checkForMistakes(parseGrid(PUZZLE)).ok).toBe(true);
  });

  it('flags an impossible candidate (mark contradicts a placed peer)', () => {
    const g = parseGridWithCandidates(ext({ 0: '5', 1: '[57]' })); // r1c2 marks 5; r1c1=5
    const report = checkForMistakes(g);
    expect(report.ok).toBe(false);
    const m = report.mistakes.find((x) => x.kind === 'impossible-candidate');
    expect(m).toMatchObject({
      kind: 'impossible-candidate',
      cell: 1,
      digit: 5,
      conflictingCell: 0,
    });
  });

  it('flags a digit missing entirely from a unit', () => {
    // Row 0: placed 5,3; the rest marked without 1 or 7 → both have nowhere to go.
    const g = parseGridWithCandidates(
      ext({
        0: '5',
        1: '3',
        2: '[24]',
        3: '[26]',
        4: '[268]',
        5: '[489]',
        6: '[249]',
        7: '[248]',
        8: '[24]',
      }),
    );
    const report = checkForMistakes(g);
    const missing = report.mistakes.filter((x) => x.kind === 'missing-digit');
    expect(missing.length).toBeGreaterThan(0);
    expect(missing.every((m) => m.kind === 'missing-digit' && m.unitKind === 'row')).toBe(
      true,
    );
  });

  it('flags a digit conflict (same digit placed twice in a unit)', () => {
    const report = checkForMistakes(parseGridWithCandidates(ext({ 0: '5', 1: '5' })));
    const m = report.mistakes.find((x) => x.kind === 'digit-conflict');
    expect(m).toMatchObject({ kind: 'digit-conflict', digit: 5, unitKind: 'row' });
  });

  it('does NOT flag a merely under-marked (but still legal) candidate set', () => {
    // Narrow a cell to a strict subset of its own legal candidates (drop one).
    // That is a wrongly-eliminated-but-legal mark — deliberately NOT one of the
    // three checks (no reachability analysis), so it must not be reported as an
    // impossible candidate.
    const g = parseGrid(PUZZLE);
    const legal = candList(g.candidates[2]!);
    let mask = 0;
    for (const d of legal.slice(1)) mask |= 1 << (d - 1); // drop the first, keep the rest
    g.candidates[2] = mask;
    const report = checkForMistakes(g);
    expect(report.mistakes.filter((m) => m.kind === 'impossible-candidate')).toEqual([]);
  });
});

describe('reconcileNotation — reset-on-error, keep-on-clean', () => {
  it('discards user candidates and recomputes when a mistake is found', () => {
    const g = parseGridWithCandidates(ext({ 0: '5', 1: '[57]' })); // impossible mark
    const before = Array.from(g.candidates);
    const { report, reset } = reconcileNotation(g);
    expect(report.ok).toBe(false);
    expect(reset).toBe(true);

    // Candidates now equal a fresh computation from placed digits only.
    const fresh = cloneGrid(g);
    computeCandidates(fresh);
    expect(Array.from(g.candidates)).toEqual(Array.from(fresh.candidates));
    expect(Array.from(g.candidates)).not.toEqual(before); // the bad mark is gone
  });

  it('keeps clean user candidates as the starting point', () => {
    const g = parseGrid(PUZZLE); // correct candidates
    const snapshot = Array.from(g.candidates);
    const { report, reset } = reconcileNotation(g);
    expect(report.ok).toBe(true);
    expect(reset).toBe(false);
    expect(Array.from(g.candidates)).toEqual(snapshot); // untouched
  });
});

describe('notation fixtures', () => {
  it('valid.txt has no mistakes', () => {
    expect(checkForMistakes(parseGridWithCandidates(loadFixture('valid.txt'))).ok).toBe(
      true,
    );
  });

  it.each([
    ['impossible.txt', 'impossible-candidate'],
    ['missing.txt', 'missing-digit'],
    ['conflict.txt', 'digit-conflict'],
  ])('%s trips %s', (file, kind) => {
    const report = checkForMistakes(parseGridWithCandidates(loadFixture(file)));
    expect(report.ok).toBe(false);
    expect(report.mistakes.some((m) => m.kind === kind)).toBe(true);
  });
});

describe('auditUserCandidates — promote verified hand-work, reset otherwise', () => {
  /** Marks matching the grid's own candidates, as a starting point to edit. */
  const marksFrom = (g: ReturnType<typeof parseGrid>): Uint16Array => {
    const m = new Uint16Array(81);
    for (let i = 0; i < 81; i++) if (g.placed[i] === 0) m[i] = g.candidates[i]!;
    return m;
  };
  /** The first empty cell with more candidates than just the solution digit. */
  const editableCell = (g: ReturnType<typeof parseGrid>) => {
    for (let i = 0; i < 81; i++) {
      if (g.placed[i] === 0 && candList(g.candidates[i]!).length > 1) return i;
    }
    throw new Error('no multi-candidate cell');
  };

  it('an unmarked grid is clean and asks for nothing', () => {
    const g = parseGrid(PUZZLE);
    const audit = auditUserCandidates(g, new Uint16Array(81));
    expect(audit.ok).toBe(true);
    expect(audit.eliminations).toEqual([]);
  });

  it('marks identical to the engine candidates yield no eliminations', () => {
    const g = parseGrid(PUZZLE);
    const audit = auditUserCandidates(g, marksFrom(g));
    expect(audit.ok).toBe(true);
    expect(audit.eliminations).toEqual([]);
  });

  it('a correct hand elimination is accepted and reported', () => {
    const g = parseGrid(PUZZLE);
    const sol = solve(g)!;
    const cell = editableCell(g);
    // Drop a candidate that is NOT the solution digit — a legitimate elimination.
    const victim = candList(g.candidates[cell]!).find((d) => d !== sol.placed[cell])!;
    const marks = marksFrom(g);
    marks[cell] = g.candidates[cell]! & ~bit(victim);

    const audit = auditUserCandidates(g, marks);
    expect(audit.ok).toBe(true);
    expect(audit.eliminations).toEqual([{ cell, digit: victim }]);
  });

  it('removing the digit that actually belongs is rejected, naming the cell', () => {
    const g = parseGrid(PUZZLE);
    const sol = solve(g)!;
    const cell = editableCell(g);
    const marks = marksFrom(g);
    marks[cell] = g.candidates[cell]! & ~bit(sol.placed[cell] as Digit);

    const audit = auditUserCandidates(g, marks);
    expect(audit.ok).toBe(false);
    expect(audit.badCells).toContain(cell);
    expect(audit.eliminations).toEqual([]); // all-or-nothing, no partial credit
    // Names the digit that belongs, so "Check for mistakes" can say which.
    expect(audit.wrongEliminations).toEqual([{ cell, digit: sol.placed[cell] }]);
  });

  it('catches what checkForMistakes structurally cannot', () => {
    // The same under-marked-but-legal set that checkForMistakes deliberately
    // lets through (see its own test above) — here it must be caught.
    const g = parseGrid(PUZZLE);
    const sol = solve(g)!;
    const cell = editableCell(g);
    const marks = marksFrom(g);
    marks[cell] = g.candidates[cell]! & ~bit(sol.placed[cell] as Digit);

    const overlaid = cloneGrid(g);
    for (let i = 0; i < 81; i++) if (marks[i] !== 0) overlaid.candidates[i] = marks[i]!;
    expect(checkForMistakes(overlaid).ok).toBe(true); // structurally fine
    expect(auditUserCandidates(g, marks).ok).toBe(false); // but wrong
  });

  it('adding a candidate the engine already ruled out is rejected', () => {
    const g = parseGrid(PUZZLE);
    const cell = g.placed.findIndex((p, i) => p === 0 && g.candidates[i]! !== 0);
    const absent = ([1, 2, 3, 4, 5, 6, 7, 8, 9] as Digit[]).find(
      (d) => (g.candidates[cell]! & bit(d)) === 0,
    )!;
    const marks = marksFrom(g);
    marks[cell] = g.candidates[cell]! | bit(absent);

    const audit = auditUserCandidates(g, marks);
    expect(audit.ok).toBe(false);
    expect(audit.badCells).toContain(cell);
  });

  it('unmarked cells are left to the engine (partial notation is fine)', () => {
    const g = parseGrid(PUZZLE);
    const sol = solve(g)!;
    const cell = editableCell(g);
    const victim = candList(g.candidates[cell]!).find((d) => d !== sol.placed[cell])!;
    // ONLY this cell is marked; every other cell is 0 ("user wrote nothing").
    const marks = new Uint16Array(81);
    marks[cell] = g.candidates[cell]! & ~bit(victim);

    const audit = auditUserCandidates(g, marks);
    expect(audit.ok).toBe(true);
    expect(audit.eliminations).toEqual([{ cell, digit: victim }]);
  });

  it('seeding the solver with verified marks skips the work already done', () => {
    // A puzzle that actually needs elimination techniques — PUZZLE is all
    // placements, so pre-done eliminations there could never remove a step.
    const coldGrid = parseGrid(HARD);
    const cold = solveAll(coldGrid);
    expect(cold.status).toBe('solved');
    const solution = serializeGrid(coldGrid);

    // Simulate a user who hand-did the work up to the 3rd elimination-only step.
    const advanced = parseGrid(HARD);
    let elims = 0;
    for (const s of cold.steps) {
      applyStep(advanced, s);
      if (s.placements.length === 0 && ++elims === 3) break;
    }

    const g = parseGrid(HARD);
    const audit = auditUserCandidates(g, advanced.candidates);
    expect(audit.ok).toBe(true);
    expect(audit.eliminations.length).toBeGreaterThan(0);

    applyStep(
      g,
      makeStep({
        technique: 'user-notes',
        eliminations: [...audit.eliminations],
        description: 'hand-done eliminations',
      }),
    );
    const seeded = solveAll(g);
    expect(seeded.status).toBe('solved');
    expect(serializeGrid(g)).toBe(solution);
    expect(seeded.steps.length).toBeLessThan(cold.steps.length);
  });
});

describe('reset recovers a solvable grid; the solver never trusts user marks', () => {
  it('a broken-notation grid resets and still solves to the correct solution', () => {
    const g = parseGridWithCandidates(loadFixture('missing.txt'));
    const { reset } = reconcileNotation(g); // erased-digit notation → reset
    expect(reset).toBe(true);
    const result = solveAll(g);
    expect(result.status).toBe('solved');
    expect(serializeGrid(g)).toBe(SOLUTION);
  });

  it('a clean-notation grid solves to the correct solution', () => {
    const g = parseGridWithCandidates(loadFixture('valid.txt'));
    reconcileNotation(g);
    const result = solveAll(g);
    expect(result.status).toBe('solved');
    expect(serializeGrid(g)).toBe(SOLUTION);
  });
});
