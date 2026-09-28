/**
 * Uniqueness techniques — deductions that are only valid because the puzzle is
 * guaranteed to have exactly ONE solution.
 *
 *  - BUG+1  : the grid is a Bivalue Universal Grave plus one. Every unsolved
 *    cell has exactly two candidates except a single cell with three. A true BUG
 *    (all bivalue) has an even number of solutions, so it can never be the state
 *    of a unique puzzle; the third candidate in the odd cell is therefore the
 *    one that avoids the grave and must be the solution. The correct digit is
 *    the candidate of that cell appearing an odd number of times (three) in its
 *    row / column / box.
 *  - Unique Rectangle (Type 1): four cells at the intersection of two rows and
 *    two columns, spanning exactly two boxes, where three corners hold the same
 *    two candidates {a,b} and the fourth holds {a,b} plus extras. If a and b
 *    survived in the fourth corner, the four cells could be filled two ways →
 *    two solutions. Uniqueness forbids that, so a and b are removed from the
 *    fourth corner.
 *
 *  - Unique Rectangle Types 2–6 and Hidden Rectangle: the same deadly
 *    rectangle, broken by something other than a single extra-laden corner.
 *    See `extendedRectangle` below.
 *
 * All are UNSOUND on a non-unique grid, so each is gated behind
 * `hasUniqueSolution` (the guard). The guard only runs once a candidate pattern
 * is detected, keeping it off the hot path.
 */

import {
  bit,
  boxOf,
  candCount,
  candList,
  cellName,
  colOf,
  hasCand,
  rowOf,
  type CellIndex,
  type Digit,
  type Grid,
} from '../grid.js';
import { UNITS_OF, commonPeers, type Unit } from '../units.js';
import { hasUniqueSolution } from '../validate.js';
import {
  makeStep,
  type Elimination,
  type HighlightGroup,
  type Step,
  type Technique,
  type TechniqueId,
} from '../step.js';
import { combinations } from './util.js';

/** Count empty cells still holding `d` within one unit (by unit membership). */
function countInUnitOf(
  grid: Grid,
  cell: CellIndex,
  kind: 'row' | 'col' | 'box',
  d: Digit,
): number {
  const unit = UNITS_OF[cell]!.find((u) => u.kind === kind)!;
  let n = 0;
  for (const c of unit.cells) {
    if (grid.placed[c] === 0 && hasCand(grid.candidates[c]!, d)) n++;
  }
  return n;
}

/**
 * Pattern detection for BUG+1, independent of the uniqueness guard: returns the
 * forced {cell, digit} if the grid is BUG+1 shaped and resolvable, else null.
 * Exposed so the guard's gating role can be tested in isolation.
 */
export function bug1Candidate(grid: Grid): { cell: CellIndex; digit: Digit } | null {
  let triCell: CellIndex = -1;
  for (let c = 0; c < 81; c++) {
    if (grid.placed[c] !== 0) continue;
    const n = candCount(grid.candidates[c]!);
    if (n === 2) continue;
    if (n === 3 && triCell === -1) {
      triCell = c;
    } else {
      return null; // a second 3-cell, or a 1/4+-cell → not BUG+1
    }
  }
  if (triCell === -1) return null; // pure BUG (or solved), not BUG+1

  // The solution is the candidate with odd (3) count in the tri-cell's units.
  const odd: Digit[] = [];
  for (const d of candList(grid.candidates[triCell]!)) {
    if (countInUnitOf(grid, triCell, 'box', d) % 2 === 1) odd.push(d);
  }
  return odd.length === 1 ? { cell: triCell, digit: odd[0]! } : null;
}

export const bug1: Technique = (grid: Grid): Step | null => {
  const found = bug1Candidate(grid);
  if (found === null) return null;
  if (!hasUniqueSolution(grid)) return null; // guard: unsound otherwise

  return makeStep({
    technique: 'bug+1',
    placements: [found],
    highlights: [{ role: 'placement', cells: [found.cell], digits: [found.digit] }],
    description: `BUG+1: every unsolved cell is bivalue except ${cellName(
      found.cell,
    )}; uniqueness forces ${found.digit} there.`,
  });
};

/**
 * Pattern detection for Unique Rectangle Type 1, independent of the guard.
 * Returns a ready Step (built via `makeStep`) if the pattern is present, else
 * null. Exposed so the guard's gating role can be tested in isolation.
 */
export function uniqueRectangleCandidate(grid: Grid): Step | null {
  for (let r1 = 0; r1 < 9; r1++) {
    for (let r2 = r1 + 1; r2 < 9; r2++) {
      for (let c1 = 0; c1 < 9; c1++) {
        for (let c2 = c1 + 1; c2 < 9; c2++) {
          const corners: CellIndex[] = [
            r1 * 9 + c1,
            r1 * 9 + c2,
            r2 * 9 + c1,
            r2 * 9 + c2,
          ];
          if (corners.some((c) => grid.placed[c] !== 0)) continue;

          // Must span exactly two boxes (the defining constraint of a UR).
          const boxes = new Set(corners.map(boxOf));
          if (boxes.size !== 2) continue;

          const masks = corners.map((c) => grid.candidates[c]!);
          // Identify the bivalue pair shared by (at least) three corners.
          let extraIdx = -1;
          let pairMask = -1;
          let ok = true;
          for (let i = 0; i < 4; i++) {
            if (candCount(masks[i]!) === 2) {
              if (pairMask === -1) pairMask = masks[i]!;
              else if (masks[i]! !== pairMask) {
                ok = false;
                break;
              }
            } else if (extraIdx === -1) {
              extraIdx = i;
            } else {
              ok = false; // more than one non-pair corner → not Type 1
              break;
            }
          }
          if (!ok || pairMask === -1 || extraIdx === -1) continue;
          // The extra corner must contain the pair plus at least one more digit.
          const extraMask = masks[extraIdx]!;
          if ((extraMask & pairMask) !== pairMask || candCount(extraMask) <= 2) continue;
          // Exactly three pair corners required (extra is the only non-pair one).
          if (masks.filter((m) => m === pairMask).length !== 3) continue;

          const digits = candList(pairMask);
          const extraCell = corners[extraIdx]!;
          const eliminations: Elimination[] = digits
            .filter((d) => hasCand(extraMask, d))
            .map((d) => ({ cell: extraCell, digit: d }));
          if (eliminations.length === 0) continue;

          const floor = corners.filter((_, i) => i !== extraIdx);
          return makeStep({
            technique: 'unique-rectangle',
            eliminations,
            highlights: [
              { role: 'base', cells: floor, digits },
              { role: 'elimination', cells: [extraCell], digits },
            ],
            description: `Unique Rectangle (Type 1) on {${digits.join(
              ',',
            )}} at rows ${r1 + 1},${r2 + 1} cols ${c1 + 1},${c2 + 1}: remove ${digits.join(
              ',',
            )} from ${cellName(extraCell)} to avoid a deadly pattern.`,
          });
        }
      }
    }
  }
  return null;
}

export const uniqueRectangle: Technique = (grid: Grid): Step | null => {
  const step = uniqueRectangleCandidate(grid);
  if (step === null) return null;
  if (!hasUniqueSolution(grid)) return null; // guard: unsound otherwise
  return step;
};

/**
 * A candidate unique rectangle: four unsolved corners on two rows, two columns
 * and exactly two boxes, every corner still holding both `a` and `b`, and at
 * least one corner holding nothing else (the "floor"). Corners are ordered
 * r1c1, r1c2, r2c1, r2c2, so corner i and corner 3-i are diagonal.
 */
interface Rectangle {
  readonly corners: readonly CellIndex[];
  readonly a: Digit;
  readonly b: Digit;
  readonly pair: number;
  readonly floor: readonly CellIndex[];
  readonly roof: readonly CellIndex[];
}

function* rectangles(grid: Grid): Generator<Rectangle> {
  for (let r1 = 0; r1 < 9; r1++) {
    for (let r2 = r1 + 1; r2 < 9; r2++) {
      for (let c1 = 0; c1 < 9; c1++) {
        for (let c2 = c1 + 1; c2 < 9; c2++) {
          const corners = [r1 * 9 + c1, r1 * 9 + c2, r2 * 9 + c1, r2 * 9 + c2];
          if (corners.some((c) => grid.placed[c] !== 0)) continue;
          if (new Set(corners.map(boxOf)).size !== 2) continue;
          const common = corners.reduce((m, c) => m & grid.candidates[c]!, 0x1ff);
          const shared = candList(common);
          for (let i = 0; i < shared.length; i++) {
            for (let j = i + 1; j < shared.length; j++) {
              const a = shared[i]!;
              const b = shared[j]!;
              const pair = bit(a) | bit(b);
              const floor = corners.filter((c) => grid.candidates[c] === pair);
              if (floor.length === 0) continue;
              const roof = corners.filter((c) => grid.candidates[c] !== pair);
              yield { corners, a, b, pair, floor, roof };
            }
          }
        }
      }
    }
  }
}

/** The row/column (and box, if they share one) that two cells both sit in. */
function sharedUnits(x: CellIndex, y: CellIndex): Unit[] {
  const ys = new Set(UNITS_OF[y]!);
  return UNITS_OF[x]!.filter((u) => ys.has(u));
}

const holds = (grid: Grid, c: CellIndex, d: Digit) =>
  grid.placed[c] === 0 && hasCand(grid.candidates[c]!, d);

/** Cells of `unit` still holding `d`. */
const spotsIn = (grid: Grid, unit: Unit, d: Digit) =>
  unit.cells.filter((c) => holds(grid, c, d));

const unitName = (u: Unit) => `${u.kind === 'col' ? 'column' : u.kind} ${u.index + 1}`;

type ExtendedKind =
  | 'unique-rectangle-2'
  | 'unique-rectangle-3'
  | 'unique-rectangle-4'
  | 'unique-rectangle-5'
  | 'unique-rectangle-6'
  | 'hidden-rectangle';

interface Found {
  eliminations: Elimination[];
  extra?: HighlightGroup[];
  why: string;
}

/**
 * Each type is a different way the rectangle is kept from settling on just a
 * and b — the deadly pattern that would give the puzzle two solutions.
 *
 *  - Type 2 / 5: every extra candidate in the non-floor corners is the same
 *    digit x, so one of them must be x; x leaves any cell seeing all of them.
 *    Type 2 is two such corners sharing a line, Type 5 any other shape.
 *  - Type 3: two roof corners share a unit, so between them they are one
 *    "virtual cell" holding their extras. With n more cells in that unit they
 *    make a naked subset, clearing its digits from the rest of the unit.
 *  - Type 4: two roof corners share a unit where a has no other spot. One of
 *    them is a, so if the other were b the rectangle would be a/b again —
 *    b leaves both.
 *  - Type 6: floor on one diagonal, roof on the other, and a appears only on
 *    the rectangle in both of its rows (or both columns). A roof corner being
 *    a forces a onto the other roof corner and b onto the floor: deadly, so a
 *    leaves both roof corners.
 *  - Hidden Rectangle: from a floor corner, the opposite corner D sees a only
 *    on the rectangle along its row and its column. If D were b, a would fill
 *    both corners beside it and the floor corner would be b: deadly, so b
 *    leaves D.
 */
function tryKind(grid: Grid, r: Rectangle, kind: ExtendedKind): Found | null {
  const { a, b, pair, floor, roof } = r;
  const extrasOf = (c: CellIndex) => grid.candidates[c]! & ~pair;
  const sharesLine = (x: CellIndex, y: CellIndex) =>
    rowOf(x) === rowOf(y) || colOf(x) === colOf(y);

  switch (kind) {
    case 'unique-rectangle-2':
    case 'unique-rectangle-5': {
      if (roof.length < 2) return null;
      const x = extrasOf(roof[0]!);
      if (candCount(x) !== 1 || roof.some((c) => extrasOf(c) !== x)) return null;
      const isType2 = roof.length === 2 && sharesLine(roof[0]!, roof[1]!);
      if (isType2 !== (kind === 'unique-rectangle-2')) return null;
      const d = candList(x)[0]!;
      const targets = commonPeers(roof).filter(
        (c) => !r.corners.includes(c) && holds(grid, c, d),
      );
      if (targets.length === 0) return null;
      return {
        eliminations: targets.map((cell) => ({ cell, digit: d })),
        why: `one of ${roof.map(cellName).join(', ')} must be ${d}`,
      };
    }

    case 'unique-rectangle-3': {
      if (roof.length !== 2 || !sharesLine(roof[0]!, roof[1]!)) return null;
      const extras = extrasOf(roof[0]!) | extrasOf(roof[1]!);
      for (const unit of sharedUnits(roof[0]!, roof[1]!)) {
        const others = unit.cells.filter(
          (c) => grid.placed[c] === 0 && !roof.includes(c),
        );
        for (let n = 1; n <= 3; n++) {
          for (const idx of combinations(others.length, n)) {
            const subset = idx.map((i) => others[i]!);
            const union = subset.reduce((m, c) => m | grid.candidates[c]!, extras);
            if (candCount(union) !== n + 1) continue;
            const eliminations: Elimination[] = [];
            for (const c of others) {
              if (subset.includes(c)) continue;
              for (const d of candList(grid.candidates[c]! & union)) {
                eliminations.push({ cell: c, digit: d });
              }
            }
            if (eliminations.length === 0) continue;
            return {
              eliminations,
              extra: [{ role: 'cover', cells: subset, digits: candList(union) }],
              why: `${roof.map(cellName).join(' and ')} act as one cell holding ${candList(
                extras,
              ).join(
                '/',
              )}; with ${subset.map(cellName).join(', ')} that is a naked set of ${candList(
                union,
              ).join('/')} in ${unitName(unit)}`,
            };
          }
        }
      }
      return null;
    }

    case 'unique-rectangle-4': {
      if (roof.length !== 2 || !sharesLine(roof[0]!, roof[1]!)) return null;
      for (const unit of sharedUnits(roof[0]!, roof[1]!)) {
        for (const [d, e] of [
          [a, b],
          [b, a],
        ] as const) {
          if (spotsIn(grid, unit, d).length !== 2) continue;
          return {
            eliminations: roof.map((cell) => ({ cell, digit: e })),
            why: `${d} is locked to ${roof.map(cellName).join(' and ')} in ${unitName(unit)}`,
          };
        }
      }
      return null;
    }

    case 'unique-rectangle-6': {
      if (floor.length !== 2 || sharesLine(floor[0]!, floor[1]!)) return null;
      // Corners are r1c1, r1c2, r2c1, r2c2: 0 and 2 give the rows, 0 and 1 the columns.
      const lines = (axis: 'row' | 'col') =>
        [r.corners[0]!, r.corners[axis === 'row' ? 2 : 1]!].map((c) =>
          UNITS_OF[c]!.find((u) => u.kind === axis)!,
        );
      for (const d of [a, b]) {
        for (const axis of ['row', 'col'] as const) {
          const us = lines(axis);
          if (!us.every((u) => spotsIn(grid, u, d).length === 2)) continue;
          return {
            eliminations: roof.map((cell) => ({ cell, digit: d })),
            why: `${d} appears only on the rectangle in ${us.map(unitName).join(' and ')}`,
          };
        }
      }
      return null;
    }

    case 'hidden-rectangle': {
      for (const f of floor) {
        const i = r.corners.indexOf(f);
        const dCell = r.corners[3 - i]!;
        if (floor.includes(dCell)) continue;
        const row = UNITS_OF[dCell]!.find((u) => u.kind === 'row')!;
        const col = UNITS_OF[dCell]!.find((u) => u.kind === 'col')!;
        for (const [d, e] of [
          [a, b],
          [b, a],
        ] as const) {
          if (spotsIn(grid, row, d).length !== 2 || spotsIn(grid, col, d).length !== 2)
            continue;
          return {
            eliminations: [{ cell: dCell, digit: e }],
            extra: [{ role: 'cover', cells: [f], digits: [a, b] }],
            why: `${d} appears only on the rectangle in ${unitName(row)} and ${unitName(col)}`,
          };
        }
      }
      return null;
    }
  }
}

const TYPE_LABEL: Record<ExtendedKind, string> = {
  'unique-rectangle-2': 'Unique Rectangle (Type 2)',
  'unique-rectangle-3': 'Unique Rectangle (Type 3)',
  'unique-rectangle-4': 'Unique Rectangle (Type 4)',
  'unique-rectangle-5': 'Unique Rectangle (Type 5)',
  'unique-rectangle-6': 'Unique Rectangle (Type 6)',
  'hidden-rectangle': 'Hidden Rectangle',
};

/** Pattern detection for one extended type, independent of the guard. */
export function extendedRectangleCandidate(grid: Grid, kind: ExtendedKind): Step | null {
  for (const r of rectangles(grid)) {
    const found = tryKind(grid, r, kind);
    if (found === null) continue;
    return makeStep({
      technique: kind as TechniqueId,
      eliminations: found.eliminations,
      highlights: [
        { role: 'base', cells: r.floor, digits: [r.a, r.b] },
        { role: 'related', cells: r.roof, digits: [r.a, r.b] },
        ...(found.extra ?? []),
        {
          role: 'elimination',
          cells: [...new Set(found.eliminations.map((e) => e.cell))],
          digits: [...new Set(found.eliminations.map((e) => e.digit))],
        },
      ],
      description: `${TYPE_LABEL[kind]} on ${r.a}/${r.b} at ${r.corners
        .map(cellName)
        .join(', ')}: ${found.why} → eliminate ${found.eliminations
        .map((e) => `${e.digit} from ${cellName(e.cell)}`)
        .join(', ')}.`,
    });
  }
  return null;
}

const extendedRectangle =
  (kind: ExtendedKind): Technique =>
  (grid) => {
    const step = extendedRectangleCandidate(grid, kind);
    if (step === null) return null;
    if (!hasUniqueSolution(grid)) return null; // guard: unsound otherwise
    return step;
  };

export const uniqueRectangle2 = extendedRectangle('unique-rectangle-2');
export const uniqueRectangle3 = extendedRectangle('unique-rectangle-3');
export const uniqueRectangle4 = extendedRectangle('unique-rectangle-4');
export const uniqueRectangle5 = extendedRectangle('unique-rectangle-5');
export const uniqueRectangle6 = extendedRectangle('unique-rectangle-6');
export const hiddenRectangle = extendedRectangle('hidden-rectangle');
