/**
 * One-off: re-mine XY-Chain example puzzles.
 *
 * The originally-seeded xy-chain puzzles fire on a degenerate 2-cell "chain"
 * (a single bivalue link — indistinguishable from a naked pair's reasoning).
 * This searches for puzzles whose chain (the engine Step's `base` path) is
 * 4+ cells, so the lesson actually shows a chain being followed.
 *
 * Source: the 100 committed 17-clue solutions, multiplied by random sudoku
 * symmetry transforms into effectively unlimited distinct solved grids; holes
 * are then dug back out keeping a unique solution.
 *
 * Necessity = the puzzle is still stuck when `xyChain` is removed from the
 * pattern set (no forcing-chain backstop) — the original puzzle-set criterion.
 *
 *   pnpm --filter @sudoku/db exec tsx src/mine-xy-chain.ts
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
  xyChain,
  nakedSingle,
  hiddenSingle,
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

  cell = permuteLines(cell);
  cell = transpose(cell);
  cell = permuteLines(cell);
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
  rows: number;
  cols: number;
  necessary: boolean;
  elims: number;
  clues: number;
  desc: string;
}

const rowOf = (i: number) => Math.floor(i / 9);
const colOf = (i: number) => i % 9;

// Capture with the full solver (incl. forcing-chain backstop) minus XY-Chain —
// identical to seed.ts's `fireTarget` lead-up. Necessity uses the pattern set
// only (no backstop).
const CAPTURE_LEADUP = TECHNIQUES.filter((t) => t !== xyChain);
const NECESSITY_SET = PATTERN_TECHNIQUES.filter((t) => t !== xyChain);

function evaluate(puzzle: string): Candidate | null {
  const g = parseGrid(puzzle);
  let step = null as ReturnType<typeof xyChain>;
  for (let i = 0; i < 400; i++) {
    step = xyChain(g);
    if (step) break;
    if (!hint(g, CAPTURE_LEADUP)) break;
  }
  if (!step) return null;
  // Reject a fired position with a naked/hidden single sitting unplayed —
  // a learner who spots that solves it without ever needing the chain.
  if (nakedSingle(g) !== null || hiddenSingle(g) !== null) return null;

  const path = step.highlights.find((h) => h.role === 'base')?.cells ?? [];
  const chain = path.length;
  const necessary = solveAll(parseGrid(puzzle), NECESSITY_SET).status !== 'solved';

  return {
    puzzle,
    chain,
    rows: new Set(path.map(rowOf)).size,
    cols: new Set(path.map(colOf)).size,
    necessary,
    elims: step.eliminations.length,
    clues: (puzzle.match(/[1-9]/g) ?? []).length,
    desc: step.description,
  };
}

// chain >= 5 AND spread across >= 3 rows and >= 3 columns — so it can't be
// mistaken for a Pointing/Claiming move (those live in one line + one box).
const MIN_CHAIN = 5;
const MIN_SPREAD = 3;
const keep = (c: Candidate) =>
  c.chain >= MIN_CHAIN && c.rows >= MIN_SPREAD && c.cols >= MIN_SPREAD;
const TARGET_NEC = 3; // stop once this many necessity-verified kept candidates found
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
  if (c && keep(c) && !found.some((f) => f.puzzle === c!.puzzle)) {
    found.push(c);
    process.stdout.write(
      `  hit #${found.length}: chain=${c.chain} spread=${c.rows}x${c.cols} necessary=${c.necessary} elims=${c.elims} clues=${c.clues}\n`,
    );
  }
  if (found.filter((f) => f.necessary).length >= TARGET_NEC && found.length >= 6) break;
}

found.sort((a, b) => Number(b.necessary) - Number(a.necessary) || b.chain - a.chain);

console.log(`\ntried ${tried} puzzles in ${((Date.now() - start) / 1000).toFixed(0)}s`);
console.log(
  `kept candidates (chain>=${MIN_CHAIN}, spread>=${MIN_SPREAD}): ${found.length}`,
);
console.log(`  necessity-verified: ${found.filter((f) => f.necessary).length}\n`);
for (const c of found.slice(0, 15)) {
  console.log(
    `${c.puzzle}   chain=${c.chain} spread=${c.rows}x${c.cols} nec=${c.necessary} elims=${c.elims} clues=${c.clues}`,
  );
  console.log(`   ${c.desc}`);
}
