/**
 * Simple Coloring (a.k.a. Singles Chains) — single-digit coloring over the
 * conjugate-pair graph.
 *
 * For one digit d, build a graph whose edges are the strong links (conjugate
 * pairs: units where d has exactly two candidate cells). Each connected
 * component is 2-colourable, and the two colours represent the two mutually
 * exclusive truth assignments for d along that chain — exactly one colour is the
 * set of true cells.
 *
 * Two eliminations follow:
 *  - Rule 2 (colour appears twice in a unit): if two cells of the SAME colour
 *    share a unit, that colour cannot be the true set (it would place d twice),
 *    so d is eliminated from every cell of that colour.
 *  - Rule 4 (cell sees both colours): any cell (outside the chain) that sees a
 *    cell of each colour must be able to see a true d, so d is eliminated there.
 *
 * Elimination-only; returns the first component that yields an elimination.
 */

import {
  cellName,
  hasCand,
  type CellIndex,
  type Digit,
  type Grid,
} from '../grid.js';
import { UNITS, sees } from '../units.js';
import { makeStep, type Elimination, type Step, type Technique } from '../step.js';

/** Conjugate pairs for digit d: unit-pairs where d has exactly two cells. */
function conjugateEdges(grid: Grid, d: Digit): [CellIndex, CellIndex][] {
  const edges: [CellIndex, CellIndex][] = [];
  for (const unit of UNITS) {
    const cells = unit.cells.filter(
      (c) => grid.placed[c] === 0 && hasCand(grid.candidates[c]!, d),
    );
    if (cells.length === 2) edges.push([cells[0]!, cells[1]!]);
  }
  return edges;
}

export const simpleColoring: Technique = (grid: Grid): Step | null => {
  for (let d = 1 as Digit; d <= 9; d++) {
    const edges = conjugateEdges(grid, d);
    if (edges.length === 0) continue;

    // Adjacency over cells touched by conjugate pairs.
    const adj = new Map<CellIndex, CellIndex[]>();
    for (const [a, b] of edges) {
      (adj.get(a) ?? adj.set(a, []).get(a)!).push(b);
      (adj.get(b) ?? adj.set(b, []).get(b)!).push(a);
    }

    const color = new Map<CellIndex, 0 | 1>();
    const seen = new Set<CellIndex>();

    for (const start of adj.keys()) {
      if (seen.has(start)) continue;

      // BFS 2-colour this component.
      const comp: CellIndex[] = [];
      const queue: CellIndex[] = [start];
      color.set(start, 0);
      seen.add(start);
      while (queue.length) {
        const cur = queue.shift()!;
        comp.push(cur);
        const cc = color.get(cur)!;
        for (const nb of adj.get(cur) ?? []) {
          if (!seen.has(nb)) {
            seen.add(nb);
            color.set(nb, (cc ^ 1) as 0 | 1);
            queue.push(nb);
          }
        }
      }
      if (comp.length < 2) continue;

      const group = (col: 0 | 1): CellIndex[] => comp.filter((c) => color.get(c) === col);
      const c0 = group(0);
      const c1 = group(1);

      // Rule 2: a colour that appears twice in a unit is entirely false.
      for (const [col, cells] of [
        [0, c0],
        [1, c1],
      ] as [0 | 1, CellIndex[]][]) {
        let clash = false;
        for (let i = 0; i < cells.length && !clash; i++) {
          for (let j = i + 1; j < cells.length; j++) {
            if (sees(cells[i]!, cells[j]!)) {
              clash = true;
              break;
            }
          }
        }
        if (!clash) continue;
        const eliminations: Elimination[] = cells.map((cell) => ({ cell, digit: d }));
        return makeStep({
          technique: 'simple-coloring',
          eliminations,
          highlights: [
            { role: 'base', cells: col === 0 ? c1 : c0, digits: [d] },
            { role: 'elimination', cells, digits: [d] },
          ],
          description: `Simple Coloring on ${d}: one colour repeats in a unit, so all ${cells
            .map(cellName)
            .join(', ')} are false → eliminate ${d}.`,
        });
      }

      // Rule 4: an outside cell seeing both colours loses d.
      const compSet = new Set(comp);
      const eliminations: Elimination[] = [];
      for (let cell = 0; cell < 81; cell++) {
        if (compSet.has(cell) || grid.placed[cell] !== 0) continue;
        if (!hasCand(grid.candidates[cell]!, d)) continue;
        if (c0.some((x) => sees(cell, x)) && c1.some((x) => sees(cell, x))) {
          eliminations.push({ cell, digit: d });
        }
      }
      if (eliminations.length > 0) {
        return makeStep({
          technique: 'simple-coloring',
          eliminations,
          highlights: [
            { role: 'base', cells: c0, digits: [d] },
            { role: 'related', cells: c1, digits: [d] },
            { role: 'elimination', cells: eliminations.map((e) => e.cell), digits: [d] },
          ],
          description: `Simple Coloring on ${d}: ${eliminations
            .map((e) => cellName(e.cell))
            .join(', ')} see both colours of the chain → eliminate ${d}.`,
        });
      }
    }
  }
  return null;
};
