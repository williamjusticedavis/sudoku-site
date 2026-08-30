/**
 * One-off: re-mine ALS-XZ example puzzles.
 *
 * The originally-seeded ALS-XZ puzzles use a 1-cell ALS on one side (a bivalue
 * cell) plus a 4-cell ALS on the other — which reads as a naked quad/quint, not
 * a two-ALS chain. This searches for puzzles where BOTH almost-locked sets have
 * >= 2 cells and sit in DIFFERENT units, so the pattern actually looks like
 * ALS-XZ.
 *
 * Source: the 100 committed 17-clue solutions × random sudoku symmetry
 * transforms; holes dug back out keeping a unique solution.
 *
 * Necessity = still stuck when `alsXz` is removed from the pattern set (which
 * still has every naked/hidden subset, fish, wing, colouring) — so a
 * necessity-verified hit is provably not a disguised naked subset.
 *
 *   pnpm --filter @sudoku/db exec tsx src/mine-als-xz.ts
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
  alsXz,
  nakedSingle,
  lastFreeCell,
  nakedPair,
  nakedTriple,
  nakedQuad,
  hiddenPair,
  hiddenTriple,
  hiddenQuad,
  hiddenSingle,
  pointing,
  claiming,
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
    for (let r = 0; r < 9; r++)
      for (let c = 0; c < 9; c++) out[c * 9 + r] = flat[r * 9 + c]!;
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

const rowOf = (i: number) => Math.floor(i / 9);
const colOf = (i: number) => i % 9;
const boxOf = (i: number) => Math.floor(rowOf(i) / 3) * 3 + Math.floor(colOf(i) / 3);
/** All cells share one row, column, or box. */
function oneUnit(cs: number[]): boolean {
  const same = (f: (i: number) => number) => cs.every((c) => f(c) === f(cs[0]!));
  return cs.length <= 1 || same(rowOf) || same(colOf) || same(boxOf);
}

const ALL_INDEXES = [...Array(81).keys()];
function unitOf(cells: number[], f: (i: number) => number): number[] | null {
  const v = f(cells[0]!);
  return cells.every((c) => f(c) === v) ? ALL_INDEXES.filter((i) => f(i) === v) : null;
}

/** An ALS "reads as an almost-naked-subset" when adding a single other empty
 * cell of its unit would lock it — i.e. some other cell's candidates are a
 * subset of the ALS's candidate digits. Those examples look like a naked
 * quint/quad rather than an ALS-XZ chain. */
function readsAsSubset(
  g: ReturnType<typeof parseGrid>,
  cells: number[],
  digits: number[],
): boolean {
  let mask = 0;
  for (const d of digits) mask |= 1 << (d - 1);
  for (const f of [rowOf, colOf, boxOf]) {
    const unit = unitOf(cells, f);
    if (!unit) continue;
    for (const c of unit) {
      if (g.placed[c] !== 0 || cells.includes(c)) continue;
      const cc = g.candidates[c]!;
      if (cc !== 0 && (cc & ~mask) === 0) return true; // candidates ⊆ ALS digits
    }
  }
  return false;
}

interface Candidate {
  puzzle: string;
  a: number;
  b: number;
  necessary: boolean;
  /** true when a single, or ANY naked/hidden subset, is playable at the firing
   * position — reject these: the lesson would show an obvious fill or a
   * naked-quad-shaped move sitting there while it teaches ALS-XZ. (Hidden
   * singles, locked candidates, fish, wings staying available is fine — they
   * don't make ALS-XZ look like something simpler.) */
  simplerAtFire: boolean;
  /** true when either ALS is one cell away from being a locked (naked) subset in
   * its unit — reads as "almost a naked quint" rather than an ALS-XZ chain. */
  subsetShaped: boolean;
  elims: number;
  clues: number;
  desc: string;
}

const CAPTURE_LEADUP = TECHNIQUES.filter((t) => t !== alsXz);
const NECESSITY_SET = PATTERN_TECHNIQUES.filter((t) => t !== alsXz);
// moves that, left playable at the firing point, either give away a fill or make
// ALS-XZ read as a naked/hidden subset
const SIMPLER = [
  nakedSingle,
  lastFreeCell,
  nakedPair,
  nakedTriple,
  nakedQuad,
  hiddenPair,
  hiddenTriple,
  hiddenQuad,
];
// Every named technique strictly below Master tier — used to check for the
// OTHER kind of degenerate hit (found the hard way on Simple Coloring):
// not "something simpler is ALSO playable somewhere", which is normal at
// any real position, but "something simpler reproduces the exact SAME
// elimination" — genuinely redundant, not a real ALS-XZ example.
const EASIER = [
  ...SIMPLER,
  hiddenSingle,
  pointing,
  claiming,
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

function evaluate(puzzle: string): Candidate | null {
  const g = parseGrid(puzzle);
  let step = null as ReturnType<typeof alsXz>;
  for (let i = 0; i < 400; i++) {
    step = alsXz(g);
    if (step) break;
    if (!hint(g, CAPTURE_LEADUP)) break;
  }
  if (!step) return null;

  // `g` is now the firing position — is anything simpler still playable here?
  const probe = parseGrid(puzzle);
  for (let i = 0; i < 400; i++) {
    if (alsXz(probe)) break;
    if (!hint(probe, CAPTURE_LEADUP)) break;
  }
  const simplerAtFire = SIMPLER.some((t) => t(probe) !== null);

  // Same-elimination overlap check (see EASIER's comment above).
  const targets = new Set(step.eliminations.map((e) => `${e.cell}:${e.digit}`));
  const redundant = EASIER.some((t) => {
    const other = t(g);
    if (!other) return false;
    return other.eliminations.some((e) => targets.has(`${e.cell}:${e.digit}`));
  });
  if (redundant) return null;

  const aG = step.highlights.find((h) => h.role === 'base');
  const bG = step.highlights.find((h) => h.role === 'cover');
  const aCells = aG?.cells ?? [];
  const bCells = bG?.cells ?? [];
  const necessary = solveAll(parseGrid(puzzle), NECESSITY_SET).status !== 'solved';
  const subsetShaped =
    readsAsSubset(g, [...aCells], [...(aG?.digits ?? [])]) ||
    readsAsSubset(g, [...bCells], [...(bG?.digits ?? [])]);

  return {
    puzzle,
    a: aCells.length,
    b: bCells.length,
    necessary,
    simplerAtFire,
    subsetShaped,
    elims: step.eliminations.length,
    clues: (puzzle.match(/[1-9]/g) ?? []).length,
    desc: step.description,
  };
}

// Both ALS multi-cell, two different units, nothing simpler playable at the
// firing position, and neither ALS reads as an almost-naked-subset.
const keep = (c: Candidate, aCells: number[], bCells: number[]) =>
  c.a >= 2 &&
  c.b >= 2 &&
  !oneUnit([...aCells, ...bCells]) &&
  !c.simplerAtFire &&
  !c.subsetShaped;

const TIME_BUDGET_MS = 200_000;
const start = Date.now();
const found: Candidate[] = [];
let tried = 0;

while (Date.now() - start < TIME_BUDGET_MS) {
  const bs = SOLUTIONS[Math.floor(Math.random() * SOLUTIONS.length)]!;
  const puzzle = dig(transform(bs));
  tried++;
  let c: Candidate | null = null;
  let aCells: number[] = [];
  let bCells: number[] = [];
  try {
    // rebuild the step once to get the cell lists for the oneUnit check
    const g = parseGrid(puzzle);
    let step = null as ReturnType<typeof alsXz>;
    for (let i = 0; i < 400; i++) {
      step = alsXz(g);
      if (step) break;
      if (!hint(g, CAPTURE_LEADUP)) break;
    }
    if (step) {
      aCells = [...(step.highlights.find((h) => h.role === 'base')?.cells ?? [])];
      bCells = [...(step.highlights.find((h) => h.role === 'cover')?.cells ?? [])];
      c = evaluate(puzzle);
    }
  } catch {
    c = null;
  }
  if (c && keep(c, aCells, bCells) && !found.some((f) => f.puzzle === c!.puzzle)) {
    found.push(c);
    process.stdout.write(
      `  hit #${found.length}: A=${c.a} B=${c.b} necessary=${c.necessary} elims=${c.elims} clues=${c.clues}\n`,
    );
  }
  if (found.filter((f) => f.necessary).length >= 4 || found.length >= 12) break;
}

found.sort(
  (x, y) =>
    Number(y.necessary) - Number(x.necessary) ||
    y.a + y.b - (x.a + x.b) ||
    y.elims - x.elims,
);

console.log(`\ntried ${tried} puzzles in ${((Date.now() - start) / 1000).toFixed(0)}s`);
console.log(`kept (both ALS >=2 cells, different units): ${found.length}`);
console.log(`  necessity-verified: ${found.filter((f) => f.necessary).length}\n`);
for (const c of found.slice(0, 15)) {
  console.log(
    `${c.puzzle}   A=${c.a} B=${c.b} nec=${c.necessary} elims=${c.elims} clues=${c.clues}`,
  );
  console.log(`   ${c.desc}`);
}
