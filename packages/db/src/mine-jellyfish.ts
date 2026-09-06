/**
 * One-off: find a clean Jellyfish teaching example — no naked/hidden single
 * sitting unplayed at the fired position. Puzzle 1 of the original set fired
 * while a hidden single sat at r2c5, distracting from the actual pattern.
 *
 *   pnpm --filter @sudoku/db exec tsx src/mine-jellyfish.ts [count]
 */
import {
  parseGrid,
  hint,
  TECHNIQUES,
  nakedSingle,
  hiddenSingle,
  jellyfish,
  type Grid,
} from '@sudoku/engine';
import { SOLUTIONS, dig, transform } from './mine-harness.js';

const WANT = Number(process.argv[2] ?? 3);

const LEADUP = TECHNIQUES.filter((t) => t !== jellyfish);

function hasBeginnerMove(grid: Grid): boolean {
  return nakedSingle(grid) !== null || hiddenSingle(grid) !== null;
}

interface Candidate {
  puzzle: string;
  clues: number;
  desc: string;
  baseSize: number;
}

function evaluate(puzzle: string): Candidate | null {
  const g = parseGrid(puzzle);
  for (let i = 0; i < 400; i++) {
    const step = jellyfish(g);
    if (step) {
      if (hasBeginnerMove(g)) return null;
      const base = step.highlights.find((h) => h.role === 'base')?.cells ?? [];
      return {
        puzzle,
        clues: puzzle.split('').filter((c) => c !== '0').length,
        desc: step.description,
        baseSize: base.length,
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

// Prefer a fuller base (closer to the 16-cell ideal rectangle) — more
// obviously "a jellyfish shape" than a sparse 8-9 cell base.
found.sort((a, b) => b.baseSize - a.baseSize || a.clues - b.clues);
for (const c of found) {
  console.log(`clues=${c.clues} baseSize=${c.baseSize} desc="${c.desc}"`);
  console.log(c.puzzle);
  console.log();
}
if (found.length === 0) console.log('No clean Jellyfish example found.');
