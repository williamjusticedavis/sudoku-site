/**
 * XY-Chain — a chain of bivalue cells generalising the XY-Wing.
 *
 * Each cell in the chain is bivalue, and consecutive cells see each other and
 * share a candidate (the "link" digit). Walking the chain alternates the roles
 * of a cell's two candidates: entering a cell on digit p, it must (if p is
 * false here) be its other digit q, which is carried to the next link. If both
 * ENDS of the chain expose the same digit Z as their outward candidate, then
 * whichever way the chain resolves, one end is Z — so Z can be eliminated from
 * any cell seeing both ends.
 *
 * Concretely each end cell is {Z, ·}. Starting assumption: end A is not Z ⇒ A is
 * its other digit ⇒ … ⇒ end B is Z; and vice versa. Either way one end is Z.
 *
 * Implemented as a DFS over bivalue cells. XY-Wing is the length-3 case; this
 * finds chains of any length (bounded for cost). Elimination-only.
 */

import {
  candList,
  cellName,
  hasCand,
  type CellIndex,
  type Digit,
  type Grid,
} from '../grid.js';
import { commonPeers, sees } from '../units.js';
import { makeStep, type Step, type Technique } from '../step.js';

/** Longest chain explored (in cells). Keeps the DFS bounded on hard grids. */
const MAX_LEN = 12;

/** The two candidates of a bivalue cell, or null. */
function pairOf(grid: Grid, c: CellIndex): [Digit, Digit] | null {
  if (grid.placed[c] !== 0) return null;
  const ds = candList(grid.candidates[c]!);
  return ds.length === 2 ? [ds[0]!, ds[1]!] : null;
}

export const xyChain: Technique = (grid: Grid): Step | null => {
  const bivalues: CellIndex[] = [];
  for (let c = 0; c < 81; c++) if (pairOf(grid, c) !== null) bivalues.push(c);

  // Try every bivalue start cell and each of its digits as the eliminated Z.
  for (const start of bivalues) {
    const startPair = pairOf(grid, start)!;
    for (const z of startPair) {
      const carry = startPair[0] === z ? startPair[1] : startPair[0]; // other digit
      const path: CellIndex[] = [start];
      const visited = new Set<CellIndex>([start]);

      // DFS: extend the chain carrying `need` (the digit the next cell links on).
      const dfs = (last: CellIndex, need: Digit): Step | null => {
        if (path.length >= 2) {
          // Chain valid to close when the current end's outward digit is Z.
          // `need` is the digit the last cell resolves to; if that equals Z and
          // the last cell isn't the start, the two ends both expose Z.
          if (need === z && last !== start) {
            const targets = commonPeers([start, last]).filter(
              (t) =>
                !visited.has(t) &&
                grid.placed[t] === 0 &&
                hasCand(grid.candidates[t]!, z),
            );
            if (targets.length > 0) {
              return makeStep({
                technique: 'xy-chain',
                eliminations: targets.map((cell) => ({ cell, digit: z })),
                highlights: [
                  { role: 'base', cells: [...path], digits: [z] },
                  { role: 'elimination', cells: targets, digits: [z] },
                ],
                description: `XY-Chain on ${z}: ${path
                  .map(cellName)
                  .join(' → ')} forces ${z} at one end → eliminate ${z} from ${targets
                  .map(cellName)
                  .join(', ')}.`,
              });
            }
          }
        }
        if (path.length >= MAX_LEN) return null;

        for (const next of bivalues) {
          if (visited.has(next) || !sees(last, next)) continue;
          const pair = pairOf(grid, next)!;
          if (!pair.includes(need)) continue; // must link on the carried digit
          const out = pair[0] === need ? pair[1] : pair[0]; // resolves to other digit

          visited.add(next);
          path.push(next);
          const found = dfs(next, out);
          if (found !== null) return found;
          path.pop();
          visited.delete(next);
        }
        return null;
      };

      const result = dfs(start, carry);
      if (result !== null) return result;
    }
  }
  return null;
};
