/**
 * One-off: find XY-Wing examples whose pivot and two pincers are actually
 * spread across the grid (not all three sitting in one row/column, which
 * degenerates into a pattern a learner could mistake for scanning a single
 * line rather than genuinely tracing a wing across boxes). Same no-easier-
 * move-sitting-there bar as the other mine-*.ts scripts.
 *
 *   pnpm --filter @sudoku/db exec tsx src/mine-xy-wing.ts [count]
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  parseGrid,
  hint,
  hasUniqueSolution,
  TECHNIQUES,
  nakedSingle,
  hiddenSingle,
  xyWing,
  type Grid,
} from '@sudoku/engine';

const WANT = Number(process.argv[2] ?? 3);

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

const LEADUP = TECHNIQUES.filter((t) => t !== xyWing);

function hasBeginnerMove(grid: Grid): boolean {
  return nakedSingle(grid) !== null || hiddenSingle(grid) !== null;
}

const rowOf = (c: number) => Math.floor(c / 9);
const colOf = (c: number) => c % 9;

interface Candidate {
  puzzle: string;
  clues: number;
  desc: string;
}

function evaluate(puzzle: string): Candidate | null {
  const g = parseGrid(puzzle);
  for (let i = 0; i < 400; i++) {
    const step = xyWing(g);
    if (step) {
      if (hasBeginnerMove(g)) return null;
      const base = step.highlights.find((h) => h.role === 'base')?.cells ?? [];
      const related = step.highlights.find((h) => h.role === 'related')?.cells ?? [];
      const all = [...base, ...related];
      if (all.length !== 3) return null;
      // Reject if all three cells share a row, column, or box — that's the
      // degenerate "looks like a line scan" shape being avoided.
      const rows = new Set(all.map(rowOf));
      const cols = new Set(all.map(colOf));
      const boxes = new Set(
        all.map((c) => Math.floor(rowOf(c) / 3) * 3 + Math.floor(colOf(c) / 3)),
      );
      if (rows.size === 1 || cols.size === 1 || boxes.size === 1) return null;
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
if (found.length === 0) console.log('No spread-out XY-Wing example found.');
