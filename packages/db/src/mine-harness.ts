/**
 * Shared puzzle-generation harness for the `mine-*.ts` scripts.
 *
 * Every miner needs the same three things before it can start testing whether
 * a puzzle shows its tactic well: a supply of solved grids, a way to turn one
 * solved grid into effectively unlimited distinct ones, and a way to dig clues
 * back out while keeping the solution unique. Only the acceptance test after
 * that differs per tactic, which is what each script is actually about.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { hasUniqueSolution, parseGrid } from '@sudoku/engine';

/** The committed 17-clue solution set, the seed corpus every miner draws from.
 * Read relative to `process.cwd()`, so miners must run from `packages/db`
 * (which `pnpm --filter @sudoku/db exec` does). */
export const SOLUTIONS: string[] = readFileSync(
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

/** In-place Fisher-Yates. Returns the same array for convenient chaining. */
export function shuffle<T>(a: T[]): T[] {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}

/**
 * Relabel and permute a solved grid into a different solved grid.
 *
 * These are the sudoku symmetries — the transformations that map a valid grid
 * to another valid grid: relabelling the nine digits, permuting the three
 * bands and the rows within each band (and the same for columns, reached by
 * transposing), and an optional final transpose. That turns a hundred stored
 * solutions into an effectively unlimited supply of distinct ones.
 */
export function transform(s: string): string {
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

  cell = permuteLines(cell); // rows
  cell = transpose(cell);
  cell = permuteLines(cell); // columns, which the transpose turned into rows
  cell = transpose(cell);
  if (Math.random() < 0.5) cell = transpose(cell);
  return cell.join('');
}

/**
 * Remove clues from a solved grid for as long as the solution stays unique,
 * visiting cells in random order. The result is a minimal puzzle in the sense
 * that no single removed clue could have been kept — not that no smaller
 * puzzle exists for that solution.
 */
export function dig(solved: string): string {
  const order = shuffle([...Array(81).keys()]);
  const arr = solved.split('');
  for (const c of order) {
    const old = arr[c]!;
    arr[c] = '0';
    if (!hasUniqueSolution(parseGrid(arr.join('')))) arr[c] = old;
  }
  return arr.join('');
}
