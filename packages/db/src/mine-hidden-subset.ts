/**
 * One-off: find clean Hidden Pair/Triple/Quad puzzles whose fired position
 * has zero beginner-tier moves (naked single, hidden single) present — same
 * bug class as Cross-Hatching/Last Possible Number/Pointing: a puzzle firing
 * on the intended technique while an easier one sits there unapplied,
 * distracting a learner hunting for it themselves.
 *
 * Unlike Pointing/Claiming, Hidden Pair/Triple/Quad are three fully separate
 * lessons (own `technique` each in seed.ts's CURRICULUM, not a combinator),
 * so lead-up here only excludes the ONE technique being mined — matching
 * seed.ts's own `excluded()` for these slugs exactly. A coexisting hidden
 * triple/quad while mining a hidden pair is fine (intermediate tier or
 * above, same bar as earlier lessons' "advanced tactics are fine" rule);
 * only naked/hidden SINGLE disqualifies.
 *
 * Same mining approach as the other mine-*.ts scripts: random-symmetry-
 * transform + dig against the vendored 17-clue solved grids, replaying
 * seed.ts's fireTarget loop.
 *
 *   pnpm --filter @sudoku/db exec tsx src/mine-hidden-subset.ts <pair|triple|quad> [count]
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
  hiddenPair,
  hiddenTriple,
  hiddenQuad,
  UNITS,
  type Grid,
  type Technique,
} from '@sudoku/engine';

const KIND = (process.argv[2] ?? 'pair') as 'pair' | 'triple' | 'quad';
const WANT = Number(process.argv[3] ?? 3);
const N = KIND === 'pair' ? 2 : KIND === 'triple' ? 3 : 4;
const TARGET: Technique =
  KIND === 'pair' ? hiddenPair : KIND === 'triple' ? hiddenTriple : hiddenQuad;

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

const LEADUP = TECHNIQUES.filter((t) => t !== TARGET);

function hasBeginnerMove(grid: Grid): boolean {
  return nakedSingle(grid) !== null || hiddenSingle(grid) !== null;
}

/** Every hidden-N-subset present right now, across all units — not just the
 * first one the target technique would report. Enumerates every n-digit
 * combination of a unit's still-needed digits via bitmask, same criterion
 * the engine itself uses: confined to exactly n cells, with at least one
 * cell holding a candidate outside the n digits (otherwise it's already
 * "naked", not newly discoverable as hidden). */
function countHiddenSubsetOpportunities(grid: Grid, n: number): number {
  let count = 0;
  for (const unit of UNITS) {
    const empties = unit.cells.filter((c) => grid.placed[c] === 0);
    let placedMask = 0;
    for (const c of unit.cells)
      if (grid.placed[c] !== 0) placedMask |= 1 << (grid.placed[c]! - 1);
    const avail: number[] = [];
    for (let d = 1; d <= 9; d++) if ((placedMask & (1 << (d - 1))) === 0) avail.push(d);
    if (avail.length < n) continue;

    const combo = (start: number, chosen: number[]) => {
      if (chosen.length === n) {
        const chosenMask = chosen.reduce((m, d) => m | (1 << (d - 1)), 0);
        const cellSet = new Set<number>();
        for (const c of empties)
          if ((grid.candidates[c]! & chosenMask) !== 0) cellSet.add(c);
        if (cellSet.size !== n) return;
        let extra = false;
        for (const c of cellSet)
          if ((grid.candidates[c]! & ~chosenMask) !== 0) extra = true;
        if (extra) count++;
        return;
      }
      for (let i = start; i < avail.length; i++) combo(i + 1, [...chosen, avail[i]!]);
    };
    combo(0, []);
  }
  return count;
}

interface Candidate {
  puzzle: string;
  clues: number;
  desc: string;
  firedOnRaw: boolean;
}

function evaluate(puzzle: string): Candidate | null {
  const g = parseGrid(puzzle);
  for (let i = 0; i < 400; i++) {
    const step = TARGET(g);
    if (step) {
      if (hasBeginnerMove(g)) return null;
      if (countHiddenSubsetOpportunities(g, N) !== 1) return null;
      return {
        puzzle,
        clues: puzzle.split('').filter((c) => c !== '0').length,
        desc: step.description,
        firedOnRaw: i === 0,
      };
    }
    if (!hint(g, LEADUP)) return null;
  }
  return null;
}

const found: Candidate[] = [];
for (let attempt = 0; attempt < 40000 && found.length < WANT; attempt++) {
  const base = SOLUTIONS[attempt % SOLUTIONS.length]!;
  const solved = transform(base);
  const puz = dig(solved);
  const cand = evaluate(puz);
  if (cand) found.push(cand);
}

found.sort((a, b) => a.clues - b.clues);
for (const c of found) {
  console.log(`clues=${c.clues} firedOnRaw=${c.firedOnRaw} desc="${c.desc}"`);
  console.log(c.puzzle);
  console.log();
}
if (found.length === 0) console.log(`No unambiguous hidden ${KIND} example found.`);
