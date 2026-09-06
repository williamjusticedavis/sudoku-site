/**
 * One-off: find a clean, visually-spread X-Wing teaching example. The
 * original teaching puzzle's base rows/cols were adjacent (rows 4-5, cols
 * 3-4) — a 2x2 block that reads as "a box" to a new learner instead of "two
 * rows, two columns spread across the grid" (the actual shape of the
 * pattern). This miner requires the two base rows AND the two cover columns
 * to be spread apart (not adjacent, ideally in different box-bands/stacks),
 * plus the usual no-easier-move-sitting-there bar from the other mine-*.ts
 * scripts.
 *
 *   pnpm --filter @sudoku/db exec tsx src/mine-x-wing.ts [count]
 */
import {
  parseGrid,
  hint,
  TECHNIQUES,
  nakedSingle,
  hiddenSingle,
  xWing,
  type Grid,
} from '@sudoku/engine';
import { SOLUTIONS, dig, transform } from './mine-harness.js';

const WANT = Number(process.argv[2] ?? 3);

const LEADUP = TECHNIQUES.filter((t) => t !== xWing);

function hasBeginnerMove(grid: Grid): boolean {
  return nakedSingle(grid) !== null || hiddenSingle(grid) !== null;
}

interface Candidate {
  puzzle: string;
  clues: number;
  desc: string;
  rows: number[];
  cols: number[];
}

function evaluate(puzzle: string): Candidate | null {
  const g = parseGrid(puzzle);
  for (let i = 0; i < 400; i++) {
    const step = xWing(g);
    if (step) {
      if (hasBeginnerMove(g)) return null;
      const base = step.highlights.find((h) => h.role === 'base')?.cells ?? [];
      if (base.length !== 4) return null; // want a clean, non-finned-shaped 4-corner case
      const rows = [...new Set(base.map((c) => Math.floor(c / 9)))].sort((a, b) => a - b);
      const cols = [...new Set(base.map((c) => c % 9))].sort((a, b) => a - b);
      if (rows.length !== 2 || cols.length !== 2) return null;
      // Require the two base rows and the two cover columns to be spread —
      // not adjacent, and ideally in different box bands/stacks.
      const rowGap = rows[1]! - rows[0]!;
      const colGap = cols[1]! - cols[0]!;
      if (rowGap < 3 || colGap < 3) return null;
      const rowBand = (r: number) => Math.floor(r / 3);
      const colStack = (c: number) => Math.floor(c / 3);
      if (rowBand(rows[0]!) === rowBand(rows[1]!)) return null;
      if (colStack(cols[0]!) === colStack(cols[1]!)) return null;
      return {
        puzzle,
        clues: puzzle.split('').filter((c) => c !== '0').length,
        desc: step.description,
        rows: rows.map((r) => r + 1),
        cols: cols.map((c) => c + 1),
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
  console.log(`clues=${c.clues} rows=${c.rows} cols=${c.cols} desc="${c.desc}"`);
  console.log(c.puzzle);
  console.log();
}
if (found.length === 0) console.log('No spread-out X-Wing example found.');
