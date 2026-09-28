/**
 * Sue de Coq — a box-line intersection split between two locked sets.
 *
 * Take two or three open cells C where a box meets a row or column, holding
 * digits V with at least two more digits than cells. Add a set A of cells from
 * the rest of the line and a set B from the rest of the box, where A's and B's
 * candidates (a and b) share no digit, and the digits of C ∪ A ∪ B number
 * exactly as many as its cells.
 *
 * Each a-digit can only sit in A or C (both in the line), each b-digit only in
 * B or C (both in the box), and every other digit only in C — so no digit can
 * appear twice among these cells, and with as many digits as cells, each
 * appears exactly once. So:
 *  - the a-digits, and C's digits outside a and b, leave the rest of the line;
 *  - the b-digits, and C's digits outside a and b, leave the rest of the box.
 */

import { candCount, candList, cellName, type CellIndex, type Grid } from '../grid.js';
import { UNITS } from '../units.js';
import { makeStep, type Elimination, type Step, type Technique } from '../step.js';
import { combinations } from './util.js';

const subsets = (cells: CellIndex[], max: number): CellIndex[][] => {
  const out: CellIndex[][] = [];
  for (let k = 1; k <= Math.min(max, cells.length); k++)
    for (const idx of combinations(cells.length, k)) out.push(idx.map((i) => cells[i]!));
  return out;
};

export const sueDeCoq: Technique = (grid: Grid): Step | null => {
  const open = (c: CellIndex) => grid.placed[c] === 0;
  const maskOf = (cs: CellIndex[]) => cs.reduce((m, c) => m | grid.candidates[c]!, 0);

  for (const box of UNITS.filter((u) => u.kind === 'box')) {
    for (const line of UNITS.filter((u) => u.kind !== 'box')) {
      const cross = box.cells.filter((c) => line.cells.includes(c) && open(c));
      if (cross.length < 2) continue;
      const lineRest = line.cells.filter((c) => open(c) && !box.cells.includes(c));
      const boxRest = box.cells.filter((c) => open(c) && !line.cells.includes(c));

      for (const core of subsets(cross, 3).filter((s) => s.length >= 2)) {
        const v = maskOf(core);
        if (candCount(v) < core.length + 2) continue;
        for (const a of subsets(lineRest, 3)) {
          const aMask = maskOf(a);
          if ((aMask & v) === 0) continue;
          for (const b of subsets(boxRest, 3)) {
            const bMask = maskOf(b);
            if ((bMask & v) === 0 || (aMask & bMask) !== 0) continue;
            const all = v | aMask | bMask;
            if (candCount(all) !== core.length + a.length + b.length) continue;

            const rest = v & ~aMask & ~bMask;
            const eliminations: Elimination[] = [];
            const clear = (cells: CellIndex[], used: CellIndex[], mask: number) => {
              for (const c of cells) {
                if (used.includes(c)) continue;
                for (const d of candList(grid.candidates[c]! & mask))
                  eliminations.push({ cell: c, digit: d });
              }
            };
            clear(
              line.cells.filter((c) => open(c) && !core.includes(c)),
              a,
              aMask | rest,
            );
            clear(
              box.cells.filter((c) => open(c) && !core.includes(c)),
              b,
              bMask | rest,
            );
            if (eliminations.length === 0) continue;

            return makeStep({
              technique: 'sue-de-coq',
              eliminations,
              highlights: [
                { role: 'base', cells: core, digits: candList(v) },
                { role: 'related', cells: a, digits: candList(aMask) },
                { role: 'cover', cells: b, digits: candList(bMask) },
                {
                  role: 'elimination',
                  cells: [...new Set(eliminations.map((e) => e.cell))],
                },
              ],
              description: `Sue de Coq: ${core.map(cellName).join('/')} with ${a
                .map(cellName)
                .join('/')} (line, ${candList(aMask).join('')}) and ${b
                .map(cellName)
                .join('/')} (box, ${candList(bMask).join('')}) hold ${candCount(
                all,
              )} digits in ${candCount(all)} cells → eliminate ${eliminations
                .map((e) => `${e.digit} from ${cellName(e.cell)}`)
                .join(', ')}.`,
            });
          }
        }
      }
    }
  }
  return null;
};
