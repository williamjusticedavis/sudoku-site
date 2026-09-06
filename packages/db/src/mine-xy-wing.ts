/**
 * One-off: find XY-Wing examples whose pivot and two pincers are actually
 * spread across the grid (not all three sitting in one row/column, which
 * degenerates into a pattern a learner could mistake for scanning a single
 * line rather than genuinely tracing a wing across boxes). Same no-easier-
 * move-sitting-there bar as the other mine-*.ts scripts.
 *
 *   pnpm --filter @sudoku/db exec tsx src/mine-xy-wing.ts [count]
 */
import {
  parseGrid,
  hint,
  TECHNIQUES,
  nakedSingle,
  hiddenSingle,
  xyWing,
  type Grid,
} from '@sudoku/engine';
import { SOLUTIONS, dig, transform } from './mine-harness.js';

const WANT = Number(process.argv[2] ?? 3);

const LEADUP = TECHNIQUES.filter((t) => t !== xyWing);

function hasBeginnerMove(grid: Grid): boolean {
  return nakedSingle(grid) !== null || hiddenSingle(grid) !== null;
}

const rowOf = (c: number) => Math.floor(c / 9);
const colOf = (c: number) => c % 9;

interface Candidate {
  puzzle: string;
  clues: number;
  desc: string;
}

function evaluate(puzzle: string): Candidate | null {
  const g = parseGrid(puzzle);
  for (let i = 0; i < 400; i++) {
    const step = xyWing(g);
    if (step) {
      if (hasBeginnerMove(g)) return null;
      const base = step.highlights.find((h) => h.role === 'base')?.cells ?? [];
      const related = step.highlights.find((h) => h.role === 'related')?.cells ?? [];
      const all = [...base, ...related];
      if (all.length !== 3) return null;
      // Reject if all three cells share a row, column, or box — that's the
      // degenerate "looks like a line scan" shape being avoided.
      const rows = new Set(all.map(rowOf));
      const cols = new Set(all.map(colOf));
      const boxes = new Set(
        all.map((c) => Math.floor(rowOf(c) / 3) * 3 + Math.floor(colOf(c) / 3)),
      );
      if (rows.size === 1 || cols.size === 1 || boxes.size === 1) return null;
      return {
        puzzle,
        clues: puzzle.split('').filter((c) => c !== '0').length,
        desc: step.description,
      };
    }
    if (!hint(g, LEADUP)) return null;
  }
  return null;
}

const found: Candidate[] = [];
for (let attempt = 0; attempt < 60000 && found.length < WANT; attempt++) {
  const base = SOLUTIONS[attempt % SOLUTIONS.length]!;
  const solved = transform(base);
  const puz = dig(solved);
  const cand = evaluate(puz);
  if (cand) found.push(cand);
}

found.sort((a, b) => a.clues - b.clues);
for (const c of found) {
  console.log(`clues=${c.clues} desc="${c.desc}"`);
  console.log(c.puzzle);
  console.log();
}
if (found.length === 0) console.log('No spread-out XY-Wing example found.');
