/**
 * The fish family: X-Wing (size 2), Swordfish (3), Jellyfish (4), and their
 * finned variants. All share one skeleton.
 *
 * Basic fish on digit d: pick N "base" lines (all rows, or all columns). If the
 * positions of d across those N base lines are confined to exactly N "cover"
 * lines (the perpendicular direction), then in each of those cover lines d must
 * fall on a base line — so d can be eliminated from every cover-line cell that
 * is NOT on a base line.
 *
 * Finned fish: the base positions span N cover lines PLUS a few extra "fin"
 * cells, and all fins lie in a single box. The fish logic still holds for any
 * elimination target that *sees every fin* — i.e. shares that box — so
 * eliminations are the basic-fish targets restricted to the fin's box.
 *
 * Base/cover are symmetric, so the same code runs twice with rows and columns
 * swapped. Returns null unless it produces at least one elimination.
 */

import { boxOf, hasCand, type CellIndex, type Digit, type Grid } from '../grid.js';
import { COLS, ROWS, type Unit } from '../units.js';
import { makeStep, type Elimination, type Step, type Technique, type TechniqueId } from '../step.js';
import { combinations } from './util.js';

interface Orientation {
  /** Base lines (whose d-positions define the fish). */
  readonly base: readonly Unit[];
  /** Cover lines, indexed by cross coordinate. */
  readonly cross: readonly Unit[];
  /** Base-line index of a cell (the coordinate along the base direction). */
  readonly lineOf: (cell: CellIndex) => number;
  /** Cross-line index of a cell (the perpendicular coordinate). */
  readonly crossOf: (cell: CellIndex) => number;
  readonly baseName: string;
  readonly coverName: string;
}

const ROW_BASED: Orientation = {
  base: ROWS,
  cross: COLS,
  lineOf: (c) => Math.floor(c / 9),
  crossOf: (c) => c % 9,
  baseName: 'row',
  coverName: 'column',
};
const COL_BASED: Orientation = {
  base: COLS,
  cross: ROWS,
  lineOf: (c) => c % 9,
  crossOf: (c) => Math.floor(c / 9),
  baseName: 'column',
  coverName: 'row',
};
const ORIENTATIONS = [ROW_BASED, COL_BASED];

const FISH_NAME: Record<number, string> = { 2: 'X-Wing', 3: 'Swordfish', 4: 'Jellyfish' };

interface BaseLine {
  readonly line: number;
  readonly cells: readonly CellIndex[]; // d-candidate cells on this base line
  readonly cross: readonly number[]; // their cross coordinates
}

/** d-candidate positions per base line, keeping lines with `lo..hi` positions. */
function baseLinesFor(grid: Grid, o: Orientation, d: Digit, lo: number, hi: number): BaseLine[] {
  const out: BaseLine[] = [];
  for (let li = 0; li < 9; li++) {
    const cells = o.base[li]!.cells.filter(
      (c) => grid.placed[c] === 0 && hasCand(grid.candidates[c]!, d),
    );
    if (cells.length >= lo && cells.length <= hi) {
      out.push({ line: li, cells, cross: cells.map(o.crossOf) });
    }
  }
  return out;
}

function eliminateInCovers(
  grid: Grid,
  o: Orientation,
  d: Digit,
  cover: Set<number>,
  baseLines: Set<number>,
  restrictBox: number | null,
): Elimination[] {
  const elims: Elimination[] = [];
  for (const x of cover) {
    for (const cell of o.cross[x]!.cells) {
      if (grid.placed[cell] !== 0) continue;
      if (baseLines.has(o.lineOf(cell))) continue; // on a base line — keep
      if (restrictBox !== null && boxOf(cell) !== restrictBox) continue; // must see the fins
      if (hasCand(grid.candidates[cell]!, d)) elims.push({ cell, digit: d });
    }
  }
  return elims;
}

function basicFish(grid: Grid, n: number, technique: TechniqueId): Step | null {
  for (const o of ORIENTATIONS) {
    for (let d = 1 as Digit; d <= 9; d++) {
      const lines = baseLinesFor(grid, o, d, 2, n);
      if (lines.length < n) continue;
      for (const combo of combinations(lines.length, n)) {
        const picked = combo.map((i) => lines[i]!);
        const cover = new Set<number>();
        for (const bl of picked) for (const x of bl.cross) cover.add(x);
        if (cover.size !== n) continue;

        const baseSet = new Set(picked.map((p) => p.line));
        const elims = eliminateInCovers(grid, o, d, cover, baseSet, null);
        if (elims.length === 0) continue;

        const baseCells = picked.flatMap((p) => [...p.cells]);
        return makeStep({
          technique,
          eliminations: elims,
          highlights: [
            { role: 'base', cells: baseCells, digits: [d] },
            { role: 'elimination', cells: [...new Set(elims.map((e) => e.cell))], digits: [d] },
          ],
          description: `${FISH_NAME[n]} on ${d}: ${o.baseName}s ${picked
            .map((p) => p.line + 1)
            .join(',')} confine ${d} to ${n} ${o.coverName}s → eliminate ${d} from those ${o.coverName}s outside the base ${o.baseName}s.`,
        });
      }
    }
  }
  return null;
}

function finnedFish(grid: Grid, n: number, technique: TechniqueId): Step | null {
  for (const o of ORIENTATIONS) {
    for (let d = 1 as Digit; d <= 9; d++) {
      // Allow a few extra positions per base line to admit fins.
      const lines = baseLinesFor(grid, o, d, 2, n + 3);
      if (lines.length < n) continue;

      for (const combo of combinations(lines.length, n)) {
        const picked = combo.map((i) => lines[i]!);
        const basePos = picked.flatMap((p) => p.cells.map((c) => ({ cell: c, cross: o.crossOf(c), line: p.line })));
        const distinctCross = [...new Set(basePos.map((b) => b.cross))];
        if (distinctCross.length <= n) continue; // no room for a fin → basic, handled elsewhere

        for (const cc of combinations(distinctCross.length, n)) {
          const cover = new Set(cc.map((i) => distinctCross[i]!));
          const fins = basePos.filter((b) => !cover.has(b.cross));
          if (fins.length === 0) continue; // basic fish, not finned

          // All fins must share one box (so a target in that box sees them all).
          const finBox = boxOf(fins[0]!.cell);
          if (!fins.every((f) => boxOf(f.cell) === finBox)) continue;

          // Every picked base line must still contribute a genuine (non-fin)
          // cover position — otherwise it isn't part of the fish body.
          if (picked.some((p) => !p.cells.some((c) => cover.has(o.crossOf(c))))) continue;

          const baseSet = new Set(picked.map((p) => p.line));
          const elims = eliminateInCovers(grid, o, d, cover, baseSet, finBox);
          if (elims.length === 0) continue;

          const finCells = [...new Set(fins.map((f) => f.cell))];
          const bodyCells = basePos.map((b) => b.cell).filter((c) => !finCells.includes(c));
          return makeStep({
            technique,
            eliminations: elims,
            highlights: [
              { role: 'base', cells: bodyCells, digits: [d] },
              { role: 'fin', cells: finCells, digits: [d] },
              { role: 'elimination', cells: [...new Set(elims.map((e) => e.cell))], digits: [d] },
            ],
            description: `Finned ${FISH_NAME[n]} on ${d}: ${o.baseName}s ${picked
              .map((p) => p.line + 1)
              .join(',')} with fin in box ${finBox + 1} → eliminate ${d} from cover ${o.coverName} cells that see the fin.`,
          });
        }
      }
    }
  }
  return null;
}

export const xWing: Technique = (g) => basicFish(g, 2, 'x-wing');
export const swordfish: Technique = (g) => basicFish(g, 3, 'swordfish');
export const jellyfish: Technique = (g) => basicFish(g, 4, 'jellyfish');
export const finnedXWing: Technique = (g) => finnedFish(g, 2, 'finned-x-wing');
export const finnedSwordfish: Technique = (g) => finnedFish(g, 3, 'finned-swordfish');
export const finnedJellyfish: Technique = (g) => finnedFish(g, 4, 'finned-jellyfish');
