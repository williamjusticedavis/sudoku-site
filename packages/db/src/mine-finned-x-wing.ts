/**
 * One-off: find Finned X-Wing examples that actually look like an X-Wing —
 * all 4 corners present (both base rows have the digit in both cover
 * columns), plus exactly one extra fin candidate in one of the base rows'
 * own box. The original puzzles 2 and 3 fired on a degenerate 3-cell base
 * (one row missing a corner entirely, covered only by the fin) — technically
 * valid, but doesn't read as "an X-Wing with one extra candidate" the way
 * the lesson describes it.
 *
 *   pnpm --filter @sudoku/db exec tsx src/mine-finned-x-wing.ts [count]
 */
import {
  parseGrid,
  hint,
  TECHNIQUES,
  nakedSingle,
  hiddenSingle,
  finnedXWing,
  xWing,
  type Grid,
} from '@sudoku/engine';
import { SOLUTIONS, dig, transform } from './mine-harness.js';

const WANT = Number(process.argv[2] ?? 3);

// Exclude both the finned and plain X-Wing techniques from lead-up (a plain
// X-Wing on the same digit would fire first and mask the finned pattern).
const LEADUP = TECHNIQUES.filter((t) => t !== finnedXWing && t !== xWing);

function hasBeginnerMove(grid: Grid): boolean {
  return nakedSingle(grid) !== null || hiddenSingle(grid) !== null;
}

interface Candidate {
  puzzle: string;
  clues: number;
  desc: string;
}

function evaluate(puzzle: string): Candidate | null {
  const g = parseGrid(puzzle);
  for (let i = 0; i < 400; i++) {
    const step = finnedXWing(g);
    if (step) {
      if (hasBeginnerMove(g)) return null;
      const base = step.highlights.find((h) => h.role === 'base')?.cells ?? [];
      const fin = step.highlights.find((h) => h.role === 'fin')?.cells ?? [];
      // Want the full 4-corner rectangle (both rows have both cover
      // columns) plus exactly one fin cell — the classic teaching shape.
      if (base.length !== 4) return null;
      if (fin.length !== 1) return null;
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
for (let attempt = 0; attempt < 80000 && found.length < WANT; attempt++) {
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
if (found.length === 0) console.log('No clean 4-corner Finned X-Wing example found.');
