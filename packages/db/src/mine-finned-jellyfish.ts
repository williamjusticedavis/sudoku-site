/**
 * One-off: find clean Finned Jellyfish examples — no naked/hidden single
 * sitting unplayed at the fired position, exactly one fin. All three
 * originals had a hidden single sitting there, and puzzles 2 and 3 were
 * near-duplicates of each other (same rows/cols/fin, one clue moved by a
 * single cell) — replaced with three distinct clean examples.
 *
 *   pnpm --filter @sudoku/db exec tsx src/mine-finned-jellyfish.ts [count]
 */
import {
  parseGrid,
  hint,
  TECHNIQUES,
  nakedSingle,
  hiddenSingle,
  finnedJellyfish,
  jellyfish,
  type Grid,
} from '@sudoku/engine';
import { SOLUTIONS, dig, transform } from './mine-harness.js';

const WANT = Number(process.argv[2] ?? 3);

// Exclude both finned and plain Jellyfish (a plain one on the same digit
// would fire first and mask the finned pattern).
const LEADUP = TECHNIQUES.filter((t) => t !== finnedJellyfish && t !== jellyfish);

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
    const step = finnedJellyfish(g);
    if (step) {
      if (hasBeginnerMove(g)) return null;
      const fin = step.highlights.find((h) => h.role === 'fin')?.cells ?? [];
      if (fin.length !== 1) return null;
      // Reject a lopsided base — one base line contributing only a single
      // cell reads as "the fish only really has 3 sides" rather than a
      // proper 4-line jellyfish. Require every base line to carry at least 2.
      const base = step.highlights.find((h) => h.role === 'base')?.cells ?? [];
      const perLine = new Map<number, number>();
      for (const c of base) {
        const line = step.description.includes(' rows ') ? Math.floor(c / 9) : c % 9;
        perLine.set(line, (perLine.get(line) ?? 0) + 1);
      }
      if ([...perLine.values()].some((n) => n < 2)) return null;
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
const seenDesc = new Set<string>();
for (let attempt = 0; attempt < 100000 && found.length < WANT; attempt++) {
  const base = SOLUTIONS[attempt % SOLUTIONS.length]!;
  const solved = transform(base);
  const puz = dig(solved);
  const cand = evaluate(puz);
  // Skip near-duplicates of an already-found example (same rows/cols/fin
  // shape reported in the description).
  if (cand && !seenDesc.has(cand.desc)) {
    seenDesc.add(cand.desc);
    found.push(cand);
  }
}

found.sort((a, b) => a.clues - b.clues);
for (const c of found) {
  console.log(`clues=${c.clues} desc="${c.desc}"`);
  console.log(c.puzzle);
  console.log();
}
if (found.length === 0) console.log('No clean Finned Jellyfish example found.');
