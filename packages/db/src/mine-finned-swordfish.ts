/**
 * One-off: find a clean Finned Swordfish teaching example. Puzzle 1 of the
 * original set fired while a hidden single sat unplayed at r5c4 — a learner
 * who spots that solves the position without ever needing the swordfish.
 * Puzzles 2 and 3 were already clean and are kept as-is.
 *
 *   pnpm --filter @sudoku/db exec tsx src/mine-finned-swordfish.ts [count]
 */
import {
  parseGrid,
  hint,
  TECHNIQUES,
  nakedSingle,
  hiddenSingle,
  finnedSwordfish,
  swordfish,
  type Grid,
} from '@sudoku/engine';
import { SOLUTIONS, dig, transform } from './mine-harness.js';

const WANT = Number(process.argv[2] ?? 3);

// Exclude both finned and plain Swordfish (a plain one on the same digit
// would fire first and mask the finned pattern).
const LEADUP = TECHNIQUES.filter((t) => t !== finnedSwordfish && t !== swordfish);

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
    const step = finnedSwordfish(g);
    if (step) {
      if (hasBeginnerMove(g)) return null;
      // Exactly one fin — a 2-fin base reads messier for a first example
      // (the other clean puzzles in this set have single fins).
      const fin = step.highlights.find((h) => h.role === 'fin')?.cells ?? [];
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
if (found.length === 0) console.log('No clean Finned Swordfish example found.');
