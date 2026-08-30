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
  lastFreeCell,
  nakedSingle,
  hiddenSingle,
  pointing,
  claiming,
  nakedPair,
  nakedTriple,
  nakedQuad,
  hiddenPair,
  hiddenTriple,
  hiddenQuad,
  xWing,
  skyscraper,
  twoStringKite,
  turbotFish,
  swordfish,
  xyWing,
  wWing,
  xyzWing,
  finnedXWing,
  finnedSwordfish,
  uniqueRectangle,
  bug1,
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
// Every named technique strictly BELOW Master tier (per CLAUDE.md's locked
// curriculum) — that's the "would a learner spot an easier move here" bar.
// Deliberately excludes Simple Coloring's own master-tier siblings (Jellyfish,
// Finned Jellyfish, XY-Chain, ALS-XZ): those coexisting is normal in a
// complex late-game position, not a sign the coloring chain is secretly
// redundant. Also excludes the forcing-chain backstop (not curriculum
// content, see CLAUDE.md) for the same reason as the other mine-*.ts scripts.
const EASIER_CHECK = [
  lastFreeCell,
  nakedSingle,
  hiddenSingle,
  pointing,
  claiming,
  nakedPair,
  nakedTriple,
  nakedQuad,
  hiddenPair,
  hiddenTriple,
  hiddenQuad,
  xWing,
  skyscraper,
  twoStringKite,
  turbotFish,
  swordfish,
  xyWing,
  wWing,
  xyzWing,
  finnedXWing,
  finnedSwordfish,
  uniqueRectangle,
  bug1,
];

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
  // Reject a naked/hidden single sitting unplayed anywhere — those are
  // trivially obvious regardless of where they are, so they're a genuine
  // distraction no matter what the lesson is highlighting.
  if (nakedSingle(g) !== null || hiddenSingle(g) !== null) return null;
  // Beyond that: at any real mid-solve position, OTHER unrelated valid
  // moves existing elsewhere on the board is normal, not a distraction — a
  // learner focused on the highlighted chain wouldn't notice an unrelated
  // naked pair three rows away. What actually makes an example degenerate
  // (confirmed on the original 3 puzzles, which had a technique reproducing
  // the EXACT SAME elimination Claiming/2-String-Kite-style) is a simpler
  // technique justifying the identical (cell, digit) removal. Reject only
  // on that overlap.
  const targets = new Set(step.eliminations.map((e) => `${e.cell}:${e.digit}`));
  for (const t of EASIER_CHECK) {
    const other = t(g);
    if (!other) continue;
    for (const e of other.eliminations) {
      if (targets.has(`${e.cell}:${e.digit}`)) return null;
    }
  }

  const cells = new Set<number>();
  for (const h of step.highlights) {
    if (h.role === 'base' || h.role === 'related') for (const c of h.cells) cells.add(c);
  }
  const chain = cells.size;
  // Reject a chain that collapses into an X-Wing-shaped rectangle — every
  // coloured cell confined to just 2 rows AND 2 columns reads as "this is
  // secretly an X-Wing", not a genuine coloring chain, however many cells
  // it has.
  const rows = new Set([...cells].map((c) => Math.floor(c / 9)));
  const cols = new Set([...cells].map((c) => c % 9));
  if (rows.size <= 2 && cols.size <= 2) return null;

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

const MIN_CHAIN = 3;
const TARGET_NEC_CHAIN = 10; // keep hunting until 3 necessity-verified reach this
const TIME_BUDGET_MS = 300_000;
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
