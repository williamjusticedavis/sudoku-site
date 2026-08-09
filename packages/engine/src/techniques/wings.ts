/**
 * The wing family — short chains anchored on bivalue cells.
 *
 *  - XY-Wing : a bivalue pivot {X,Y} with two bivalue pincers {X,Z} and {Y,Z},
 *    both seeing the pivot. Whatever the pivot is, one pincer becomes Z, so Z is
 *    eliminated from any cell seeing BOTH pincers.
 *  - XYZ-Wing: a trivalue pivot {X,Y,Z} with pincers {X,Z} and {Y,Z}. Z is
 *    eliminated from any cell seeing all THREE (pivot included).
 *  - W-Wing  : two bivalue cells with the same {X,Y}, not seeing each other,
 *    joined by a strong link (conjugate pair) on one candidate X. Then Y is
 *    eliminated from any cell seeing both wing cells.
 *
 * All returns are elimination-only; null unless something is removed.
 */

import {
  candCount,
  candList,
  cellName,
  hasCand,
  onlyCand,
  type CellIndex,
  type Digit,
  type Grid,
} from '../grid.js';
import { PEERS, UNITS, commonPeers, sees } from '../units.js';
import { makeStep, type Step, type Technique } from '../step.js';

const maskOf = (grid: Grid, c: CellIndex): number => grid.candidates[c]!;
const bivalue = (grid: Grid, c: CellIndex): boolean =>
  grid.placed[c] === 0 && candCount(grid.candidates[c]!) === 2;

export const xyWing: Technique = (grid: Grid): Step | null => {
  for (let pivot = 0; pivot < 81; pivot++) {
    if (!bivalue(grid, pivot)) continue;
    const pivotMask = maskOf(grid, pivot);
    const [x, y] = candList(pivotMask) as [Digit, Digit];

    const pincers = PEERS[pivot]!.filter((c) => bivalue(grid, c));
    for (let i = 0; i < pincers.length; i++) {
      for (let j = i + 1; j < pincers.length; j++) {
        const p1 = pincers[i]!;
        const p2 = pincers[j]!;
        const m1 = maskOf(grid, p1);
        const m2 = maskOf(grid, p2);

        // Each pincer shares exactly one pivot digit (and they differ), and the
        // remaining digit Z is the same in both and not a pivot digit.
        const z1 = m1 & ~pivotMask;
        const z2 = m2 & ~pivotMask;
        if (z1 !== z2 || candCount(z1) !== 1) continue;
        const s1 = m1 & pivotMask;
        const s2 = m2 & pivotMask;
        if (candCount(s1) !== 1 || candCount(s2) !== 1 || s1 === s2) continue;

        const z = onlyCand(z1)!;
        const targets = commonPeers([p1, p2]).filter(
          (c) => c !== pivot && grid.placed[c] === 0 && hasCand(grid.candidates[c]!, z),
        );
        if (targets.length === 0) continue;

        return makeStep({
          technique: 'xy-wing',
          eliminations: targets.map((cell) => ({ cell, digit: z })),
          highlights: [
            { role: 'base', cells: [pivot], digits: [x, y] },
            { role: 'related', cells: [p1, p2], digits: [z] },
            { role: 'elimination', cells: targets, digits: [z] },
          ],
          description: `XY-Wing: pivot ${cellName(pivot)} {${x},${y}} with pincers ${cellName(
            p1,
          )}, ${cellName(p2)} → eliminate ${z} from ${targets.map(cellName).join(', ')}.`,
        });
      }
    }
  }
  return null;
};

export const xyzWing: Technique = (grid: Grid): Step | null => {
  for (let pivot = 0; pivot < 81; pivot++) {
    if (grid.placed[pivot] !== 0 || candCount(grid.candidates[pivot]!) !== 3) continue;
    const pivotMask = maskOf(grid, pivot);

    const pincers = PEERS[pivot]!.filter((c) => bivalue(grid, c));
    for (let i = 0; i < pincers.length; i++) {
      for (let j = i + 1; j < pincers.length; j++) {
        const p1 = pincers[i]!;
        const p2 = pincers[j]!;
        const m1 = maskOf(grid, p1);
        const m2 = maskOf(grid, p2);

        // Both pincers ⊆ pivot, together they cover it, sharing exactly Z.
        if ((m1 & pivotMask) !== m1 || (m2 & pivotMask) !== m2) continue;
        if ((m1 | m2) !== pivotMask) continue;
        const zMask = m1 & m2;
        if (candCount(zMask) !== 1) continue;

        const z = onlyCand(zMask)!;
        const targets = commonPeers([pivot, p1, p2]).filter(
          (c) => grid.placed[c] === 0 && hasCand(grid.candidates[c]!, z),
        );
        if (targets.length === 0) continue;

        return makeStep({
          technique: 'xyz-wing',
          eliminations: targets.map((cell) => ({ cell, digit: z })),
          highlights: [
            { role: 'base', cells: [pivot], digits: candList(pivotMask) },
            { role: 'related', cells: [p1, p2], digits: [z] },
            { role: 'elimination', cells: targets, digits: [z] },
          ],
          description: `XYZ-Wing: pivot ${cellName(pivot)} {${candList(pivotMask).join(
            ',',
          )}} with pincers ${cellName(p1)}, ${cellName(p2)} → eliminate ${z} from ${targets
            .map(cellName)
            .join(', ')}.`,
        });
      }
    }
  }
  return null;
};

export const wWing: Technique = (grid: Grid): Step | null => {
  // Collect bivalue cells grouped by their two-candidate mask.
  const byMask = new Map<number, CellIndex[]>();
  for (let c = 0; c < 81; c++) {
    if (!bivalue(grid, c)) continue;
    const m = maskOf(grid, c);
    (byMask.get(m) ?? byMask.set(m, []).get(m)!).push(c);
  }

  for (const [mask, cells] of byMask) {
    if (cells.length < 2) continue;
    const [d1, d2] = candList(mask) as [Digit, Digit];

    for (let i = 0; i < cells.length; i++) {
      for (let j = i + 1; j < cells.length; j++) {
        const a = cells[i]!;
        const b = cells[j]!;
        if (sees(a, b)) continue; // wings must not see each other

        // Try each candidate as the strong-link digit; the OTHER is eliminated.
        for (const [link, other] of [
          [d1, d2],
          [d2, d1],
        ] as [Digit, Digit][]) {
          for (const unit of UNITS) {
            const linkCells = unit.cells.filter(
              (c) => grid.placed[c] === 0 && hasCand(grid.candidates[c]!, link),
            );
            if (linkCells.length !== 2) continue; // conjugate pair on `link`
            const [s1, s2] = linkCells as [CellIndex, CellIndex];
            if (s1 === a || s1 === b || s2 === a || s2 === b) continue;

            const linksAB = (sees(s1, a) && sees(s2, b)) || (sees(s1, b) && sees(s2, a));
            if (!linksAB) continue;

            const targets = commonPeers([a, b]).filter(
              (c) => grid.placed[c] === 0 && hasCand(grid.candidates[c]!, other),
            );
            if (targets.length === 0) continue;

            return makeStep({
              technique: 'w-wing',
              eliminations: targets.map((cell) => ({ cell, digit: other })),
              highlights: [
                { role: 'base', cells: [a, b], digits: [d1, d2] },
                { role: 'related', cells: [s1, s2], digits: [link] },
                { role: 'elimination', cells: targets, digits: [other] },
              ],
              description: `W-Wing: ${cellName(a)}, ${cellName(b)} {${d1},${d2}} linked by a strong link on ${link} (${cellName(
                s1,
              )}, ${cellName(s2)}) → eliminate ${other} from ${targets.map(cellName).join(', ')}.`,
            });
          }
        }
      }
    }
  }
  return null;
};
