/**
 * Tridagon (also called Thor's Hammer) — an impossible pattern on three digits.
 *
 * Take four boxes at the corners of a rectangle of boxes (two box-rows by two
 * box-columns), and in each box a "diagonal" of three cells on its three
 * different rows and three different columns. If those twelve cells could only
 * be the three digits T, each box would need T once each, and the rows and
 * columns the boxes share can rule out every arrangement. When they do, the
 * twelve cells can't all be from T: at least one of the other candidates in
 * them — the "guardians" — is true.
 *
 * Whether the arrangement is impossible depends on how the four diagonals are
 * oriented, so rather than encode the parity rule it is checked directly: every
 * filling of the twelve cells from T (at most 6⁴) is tried, respecting their
 * own candidates and the rows, columns and boxes they share. Only a pattern
 * with no filling at all is used.
 *
 * What the guardians give:
 *  - exactly one guardian candidate → it is placed;
 *  - all guardians in one cell → that cell can't be any digit of T;
 *  - all guardians the same digit x → x leaves any cell seeing all of them.
 */

import {
  bit,
  candCount,
  candList,
  cellName,
  hasCand,
  type CellIndex,
  type Digit,
  type Grid,
} from '../grid.js';
import { commonPeers } from '../units.js';
import { makeStep, type Elimination, type Step, type Technique } from '../step.js';

const PERMS: readonly (readonly number[])[] = [
  [0, 1, 2],
  [0, 2, 1],
  [1, 0, 2],
  [1, 2, 0],
  [2, 0, 1],
  [2, 1, 0],
];

/** Does any filling of `boxes` (three cells each) from `digits` survive? */
function canFill(
  grid: Grid,
  boxes: readonly (readonly CellIndex[])[],
  digits: Digit[],
): boolean {
  const cells = boxes.flat();
  const value = new Map<CellIndex, Digit>();
  const clash = (c: CellIndex, d: Digit) => {
    for (const [o, v] of value) {
      if (v === d && (Math.floor(o / 9) === Math.floor(c / 9) || o % 9 === c % 9))
        return true;
    }
    return false;
  };
  const place = (b: number): boolean => {
    if (b === boxes.length) return true;
    for (const perm of PERMS) {
      const box = boxes[b]!;
      let ok = true;
      const placed: CellIndex[] = [];
      for (let i = 0; i < 3; i++) {
        const c = box[i]!;
        const d = digits[perm[i]!]!;
        if (!hasCand(grid.candidates[c]!, d) || clash(c, d)) {
          ok = false;
          break;
        }
        value.set(c, d);
        placed.push(c);
      }
      if (ok && place(b + 1)) return true;
      for (const c of placed) value.delete(c);
    }
    return false;
  };
  return cells.length === 12 && place(0);
}

/** Every three-cell diagonal of box `b` whose cells are open and hold at least
 * two digits of `tMask`. */
function diagonals(grid: Grid, b: number, tMask: number): CellIndex[][] {
  const r0 = Math.floor(b / 3) * 3;
  const c0 = (b % 3) * 3;
  const out: CellIndex[][] = [];
  for (const perm of PERMS) {
    const cells = [0, 1, 2].map((i) => (r0 + i) * 9 + c0 + perm[i]!);
    if (
      cells.every(
        (c) => grid.placed[c] === 0 && candCount(grid.candidates[c]! & tMask) >= 2,
      )
    ) {
      out.push(cells);
    }
  }
  return out;
}

const BAND_PAIRS = [
  [0, 1],
  [0, 2],
  [1, 2],
] as const;

export const tridagon: Technique = (grid: Grid): Step | null => {
  for (let tMask = 0; tMask < 0x200; tMask++) {
    if (candCount(tMask) !== 3) continue;
    const t = candList(tMask);

    for (const [br1, br2] of BAND_PAIRS) {
      for (const [bc1, bc2] of BAND_PAIRS) {
        const boxIds = [br1 * 3 + bc1, br1 * 3 + bc2, br2 * 3 + bc1, br2 * 3 + bc2];
        const options = boxIds.map((b) => diagonals(grid, b, tMask));
        if (options.some((o) => o.length === 0)) continue;

        for (const d0 of options[0]!) {
          for (const d1 of options[1]!) {
            for (const d2 of options[2]!) {
              for (const d3 of options[3]!) {
                const boxes = [d0, d1, d2, d3];
                const cells = boxes.flat();
                const guardians: { cell: CellIndex; digit: Digit }[] = [];
                for (const c of cells) {
                  for (const d of candList(grid.candidates[c]! & ~tMask)) {
                    guardians.push({ cell: c, digit: d });
                  }
                }
                if (guardians.length === 0) continue; // the grid is already broken

                const step = conclude(grid, cells, t, tMask, boxIds, guardians);
                if (step === null) continue;
                if (canFill(grid, boxes, t)) continue;
                return step;
              }
            }
          }
        }
      }
    }
  }
  return null;
};

/** Build the step the guardians allow, or null if they allow nothing. Checked
 * before the (costlier) impossibility proof, which the caller still runs. */
function conclude(
  grid: Grid,
  cells: CellIndex[],
  t: Digit[],
  tMask: number,
  boxIds: number[],
  guardians: { cell: CellIndex; digit: Digit }[],
): Step | null {
  const head = `Tridagon on ${t.join(',')} in boxes ${boxIds
    .map((b) => b + 1)
    .join(', ')}: ${cells.map(cellName).join(', ')} can't all be ${t.join('/')}`;
  const base = { role: 'base' as const, cells, digits: t };
  const gCells = [...new Set(guardians.map((g) => g.cell))];

  if (guardians.length === 1) {
    const g = guardians[0]!;
    return makeStep({
      technique: 'tridagon',
      placements: [g],
      highlights: [base, { role: 'placement', cells: [g.cell], digits: [g.digit] }],
      description: `${head}, and the only other candidate is ${g.digit} in ${cellName(
        g.cell,
      )} → place it.`,
    });
  }

  let eliminations: Elimination[] = [];
  if (gCells.length === 1) {
    const c = gCells[0]!;
    eliminations = candList(grid.candidates[c]! & tMask).map((digit) => ({
      cell: c,
      digit,
    }));
  } else {
    const digits = new Set(guardians.map((g) => g.digit));
    if (digits.size !== 1) return null;
    const x = guardians[0]!.digit;
    eliminations = commonPeers(gCells)
      .filter((c) => grid.placed[c] === 0 && (grid.candidates[c]! & bit(x)) !== 0)
      .map((cell) => ({ cell, digit: x }));
  }
  if (eliminations.length === 0) return null;

  return makeStep({
    technique: 'tridagon',
    eliminations,
    highlights: [
      base,
      {
        role: 'related',
        cells: gCells,
        digits: [...new Set(guardians.map((g) => g.digit))],
      },
      {
        role: 'elimination',
        cells: [...new Set(eliminations.map((e) => e.cell))],
        digits: [...new Set(eliminations.map((e) => e.digit))],
      },
    ],
    description: `${head}, so one of the other candidates in ${gCells
      .map(cellName)
      .join(', ')} is true → eliminate ${eliminations
      .map((e) => `${e.digit} from ${cellName(e.cell)}`)
      .join(', ')}.`,
  });
}
