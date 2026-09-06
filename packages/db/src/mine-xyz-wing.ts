/**
 * One-off: find clean XYZ-Wing examples whose fired position has zero
 * easier moves sitting there — naked/hidden single, naked/hidden pair,
 * naked/hidden triple/quad, pointing/claiming, X-Wing, Skyscraper, or
 * 2-String Kite. Puzzles 2 and 3 of the original teaching set fired with a
 * naked triple sitting right there — distracting, since a learner who spots
 * it solves the position that way instead of via XYZ-Wing.
 *
 *   pnpm --filter @sudoku/db exec tsx src/mine-xyz-wing.ts [count]
 */
import {
  parseGrid,
  hint,
  TECHNIQUES,
  nakedSingle,
  hiddenSingle,
  nakedPair,
  nakedTriple,
  nakedQuad,
  hiddenPair,
  hiddenTriple,
  hiddenQuad,
  pointing,
  claiming,
  xWing,
  skyscraper,
  twoStringKite,
  xyzWing,
  type Grid,
} from '@sudoku/engine';
import { SOLUTIONS, dig, transform } from './mine-harness.js';

const WANT = Number(process.argv[2] ?? 3);

const LEADUP = TECHNIQUES.filter((t) => t !== xyzWing);

const EASIER = [
  nakedSingle,
  hiddenSingle,
  nakedPair,
  nakedTriple,
  nakedQuad,
  hiddenPair,
  hiddenTriple,
  hiddenQuad,
  pointing,
  claiming,
  xWing,
  skyscraper,
  twoStringKite,
];
function hasEasierMove(grid: Grid): boolean {
  return EASIER.some((t) => t(grid) !== null);
}

interface Candidate {
  puzzle: string;
  clues: number;
  desc: string;
}

function evaluate(puzzle: string): Candidate | null {
  const g = parseGrid(puzzle);
  for (let i = 0; i < 400; i++) {
    const step = xyzWing(g);
    if (step) {
      if (hasEasierMove(g)) return null;
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
if (found.length === 0) console.log('No clean XYZ-Wing example found.');
