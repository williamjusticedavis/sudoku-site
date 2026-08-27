/**
 * One-off: re-mine Simple Coloring example puzzles.
 *
 * The originally-seeded simple-coloring puzzles fire via a degenerate 2-cell
 * coloured component — visually indistinguishable from Pointing/Claiming. This
 * searches for puzzles where the coloured cluster is LONG (many conjugate-pair
 * links), so the lesson actually shows what makes Coloring distinctive.
 *
 * Source: the 100 committed 17-clue solutions, multiplied by random sudoku
 * symmetry transforms (digit relabel, band/stack/row/col permutation,
 * transpose) into effectively unlimited distinct solved grids; holes are then
 * dug back out keeping a unique solution.
 *
 * Prints the best candidates found. Necessity = the puzzle is still stuck when
 * `simpleColoring` is removed from the pattern set (no forcing-chain backstop).
 *
 *   pnpm --filter @sudoku/db exec tsx src/mine-simple-coloring.ts
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  parseGrid,
  hint,
  solveAll,
  hasUniqueSolution,
  PATTERN_TECHNIQUES,
  TECHNIQUES,
  simpleColoring,
} from '@sudoku/engine';

const SOLUTIONS = readFileSync(
  join(
    process.cwd(),
    '../../packages/engine/tests/fixtures/17clue_100subset.solutions.csv',
  ),
  'utf8',
)
  .trim()
  .split('\n')
  .map((l) => l.trim())
  .filter((l) => /^[1-9]{81}$/.test(l));

function shuffle<T>(a: T[]): T[] {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}

/** Apply a random symmetry that preserves solvedness. */
function transform(s: string): string {
  const digits = s.split('').map(Number);
  const perm = shuffle([1, 2, 3, 4, 5, 6, 7, 8, 9]);
  let cell = digits.map((d) => perm[d - 1]!);

  const permuteLines = (flat: number[]): number[] => {
    // reorder rows: permute the 3 bands, then the 3 rows within each band
    const rows: number[][] = [];
    for (let r = 0; r < 9; r++) rows.push(flat.slice(r * 9, r * 9 + 9));
    const bandOrder = shuffle([0, 1, 2]);
    const out: number[] = [];
    for (const b of bandOrder) {
      for (const ri of shuffle([0, 1, 2])) out.push(...rows[b * 3 + ri]!);
    }
    return out;
  };

  const transpose = (flat: number[]): number[] => {
    const out = new Array<number>(81);
    for (let r = 0; r < 9; r++) {
      for (let c = 0; c < 9; c++) out[c * 9 + r] = flat[r * 9 + c]!;
    }
    return out;
  };

  cell = permuteLines(cell); // rows
  cell = transpose(cell);
  cell = permuteLines(cell); // columns (now rows)
  cell = transpose(cell);
  if (Math.random() < 0.5) cell = transpose(cell);
  return cell.join('');
}

/** Remove clues in random order, keeping a unique solution — down to minimal. */
function dig(solved: string): string {
  const order = shuffle([...Array(81).keys()]);
  const arr = solved.split('');
  for (const c of order) {
    const old = arr[c]!;
    arr[c] = '0';
    if (!hasUniqueSolution(parseGrid(arr.join('')))) arr[c] = old;
  }
  return arr.join('');
}

interface Candidate {
  puzzle: string;
  chain: number;
  edges: number;
  necessary: boolean;
  elims: number;
  clues: number;
  desc: string;
}

// Capture uses the FULL solver (incl. forcing-chain backstop) minus Simple
// Coloring — identical to seed.ts's `fireTarget` lead-up. Necessity uses the
// pattern set only (no backstop), matching the puzzle-set's original criterion.
const CAPTURE_LEADUP = TECHNIQUES.filter((t) => t !== simpleColoring);
const NECESSITY_SET = PATTERN_TECHNIQUES.filter((t) => t !== simpleColoring);

/** Reproduce seed.ts's `fireTarget`: advance with the solver minus Simple
 * Coloring until `simpleColoring` itself fires, and measure THAT step — the one
 * the lesson will actually show. */
function evaluate(puzzle: string): Candidate | null {
  const g = parseGrid(puzzle);
  let step = null as ReturnType<typeof simpleColoring>;
  for (let i = 0; i < 400; i++) {
    step = simpleColoring(g);
    if (step) break;
    if (!hint(g, CAPTURE_LEADUP)) break;
  }
  if (!step) return null;

  const cells = new Set<number>();
  for (const h of step.highlights) {
    if (h.role === 'base' || h.role === 'related') for (const c of h.cells) cells.add(c);
  }
  const chain = cells.size;

  const necessary = solveAll(parseGrid(puzzle), NECESSITY_SET).status !== 'solved';

  return {
    puzzle,
    chain,
    edges: chain - 1,
    necessary,
    elims: step.eliminations.length,
    clues: (puzzle.match(/[1-9]/g) ?? []).length,
    desc: step.description,
  };
}

const MIN_CHAIN = 8;
const TARGET_NEC_CHAIN = 10; // keep hunting until 3 necessity-verified reach this
const TIME_BUDGET_MS = 150_000;
const start = Date.now();
const found: Candidate[] = [];
let tried = 0;

while (Date.now() - start < TIME_BUDGET_MS) {
  const base = SOLUTIONS[Math.floor(Math.random() * SOLUTIONS.length)]!;
  const puzzle = dig(transform(base));
  tried++;
  let c: Candidate | null = null;
  try {
    c = evaluate(puzzle);
  } catch {
    c = null;
  }
  if (c && c.chain >= MIN_CHAIN) {
    if (!found.some((f) => f.puzzle === c!.puzzle)) {
      found.push(c);
      process.stdout.write(
        `  hit #${found.length}: chain=${c.chain} necessary=${c.necessary} elims=${c.elims} clues=${c.clues}\n`,
      );
    }
  }
  const strongNec = found.filter(
    (f) => f.necessary && f.chain >= TARGET_NEC_CHAIN,
  ).length;
  if (strongNec >= 3) break;
}

found.sort((a, b) => Number(b.necessary) - Number(a.necessary) || b.chain - a.chain);

console.log(`\ntried ${tried} puzzles in ${((Date.now() - start) / 1000).toFixed(0)}s`);
console.log(`candidates with chain >= ${MIN_CHAIN}: ${found.length}`);
console.log(`  necessity-verified: ${found.filter((f) => f.necessary).length}\n`);
for (const c of found.slice(0, 12)) {
  console.log(
    `${c.puzzle}   chain=${c.chain} nec=${c.necessary} elims=${c.elims} clues=${c.clues}`,
  );
  console.log(`   ${c.desc}`);
}
