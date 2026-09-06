/**
 * One-off: find clean Turbot Fish examples whose fired position has zero
 * easier moves sitting there — not just naked/hidden single (the usual bar)
 * but also naked/hidden pair/triple/quad, pointing/claiming, and the two
 * simpler chain shapes (X-Wing, Skyscraper, 2-String Kite) it could be
 * confused with. The original teaching puzzle had a blatant hidden pair
 * sitting right at the firing position — distracting, since a learner who
 * spots it will solve the position that way instead of via Turbot Fish.
 *
 * Same mining approach as the other mine-*.ts scripts: random-symmetry-
 * transform + dig against the vendored 17-clue solved grids, replaying
 * seed.ts's fireTarget loop.
 *
 *   pnpm --filter @sudoku/db exec tsx src/mine-turbot-fish.ts [count]
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
  turbotFish,
  type Grid,
} from '@sudoku/engine';
import { SOLUTIONS, dig, transform } from './mine-harness.js';

const WANT = Number(process.argv[2] ?? 3);

const LEADUP = TECHNIQUES.filter((t) => t !== turbotFish);

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
    const step = turbotFish(g);
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
if (found.length === 0) console.log('No clean Turbot Fish example found.');
