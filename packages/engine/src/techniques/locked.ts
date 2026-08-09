/**
 * Locked Candidates — the box↔line intersection eliminations.
 *
 *  - Pointing (box → line): within a box, if every candidate for digit d lies in
 *    a single row (or column), then d can be removed from that row/column in the
 *    cells OUTSIDE the box.
 *  - Claiming (line → box), a.k.a. box-line reduction: within a row (or column),
 *    if every candidate for d lies in a single box, then d can be removed from
 *    the rest of that box.
 *
 * Both are the same geometry seen from the two sides. Returns null unless at
 * least one elimination results.
 */

import {
  boxOf,
  cellName,
  colOf,
  hasCand,
  rowOf,
  type CellIndex,
  type Digit,
  type Grid,
} from '../grid.js';
import { BOXES, COLS, ROWS, type Unit } from '../units.js';
import { makeStep, type Elimination, type Step, type Technique } from '../step.js';

/** Empty cells of `unit` that still admit digit `d`. */
function positionsOf(grid: Grid, unit: Unit, d: Digit): CellIndex[] {
  return unit.cells.filter((c) => grid.placed[c] === 0 && hasCand(grid.candidates[c]!, d));
}

/** Digits not yet placed anywhere in `unit`. */
function unplacedDigits(grid: Grid, unit: Unit): Digit[] {
  let mask = 0;
  for (const c of unit.cells) {
    const p = grid.placed[c]!;
    if (p !== 0) mask |= 1 << (p - 1);
  }
  const out: Digit[] = [];
  for (let d = 1 as Digit; d <= 9; d++) if ((mask & (1 << (d - 1))) === 0) out.push(d);
  return out;
}

function allSame<T>(xs: T[], key: (x: T) => number): number | null {
  const first = key(xs[0]!);
  return xs.every((x) => key(x) === first) ? first : null;
}

/** Pointing: box confines d to one line → clear that line outside the box. */
export const pointing: Technique = (grid: Grid): Step | null => {
  for (const box of BOXES) {
    for (const d of unplacedDigits(grid, box)) {
      const cells = positionsOf(grid, box, d);
      if (cells.length < 2) continue;

      const sameRow = allSame(cells, rowOf);
      const line: Unit | null =
        sameRow !== null ? ROWS[sameRow]! : (() => {
          const sameCol = allSame(cells, colOf);
          return sameCol !== null ? COLS[sameCol]! : null;
        })();
      if (line === null) continue;

      const eliminations: Elimination[] = [];
      for (const c of line.cells) {
        if (boxOf(c) === box.index) continue; // inside the box — that's the pattern
        if (grid.placed[c] === 0 && hasCand(grid.candidates[c]!, d)) {
          eliminations.push({ cell: c, digit: d });
        }
      }
      if (eliminations.length === 0) continue;

      return makeStep({
        technique: 'pointing',
        eliminations,
        highlights: [
          { role: 'base', cells, digits: [d] },
          { role: 'elimination', cells: eliminations.map((e) => e.cell), digits: [d] },
        ],
        description: `Pointing: in box ${box.index + 1}, ${d} is confined to ${line.kind} ${
          line.index + 1
        } (${cells.map(cellName).join(', ')}) → remove ${d} from the rest of that ${line.kind}.`,
      });
    }
  }
  return null;
};

/** Claiming: line confines d to one box → clear the rest of that box. */
export const claiming: Technique = (grid: Grid): Step | null => {
  for (const line of [...ROWS, ...COLS]) {
    for (const d of unplacedDigits(grid, line)) {
      const cells = positionsOf(grid, line, d);
      if (cells.length < 2) continue;

      const box = allSame(cells, boxOf);
      if (box === null) continue;

      const eliminations: Elimination[] = [];
      for (const c of BOXES[box]!.cells) {
        if (line.kind === 'row' ? rowOf(c) === line.index : colOf(c) === line.index) continue;
        if (grid.placed[c] === 0 && hasCand(grid.candidates[c]!, d)) {
          eliminations.push({ cell: c, digit: d });
        }
      }
      if (eliminations.length === 0) continue;

      return makeStep({
        technique: 'claiming',
        eliminations,
        highlights: [
          { role: 'base', cells, digits: [d] },
          { role: 'elimination', cells: eliminations.map((e) => e.cell), digits: [d] },
        ],
        description: `Claiming: in ${line.kind} ${line.index + 1}, ${d} is confined to box ${
          box + 1
        } (${cells.map(cellName).join(', ')}) → remove ${d} from the rest of that box.`,
      });
    }
  }
  return null;
};
