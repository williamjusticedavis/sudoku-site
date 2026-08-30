/**
 * One-off: find clean replacement Last Possible Number puzzles (indices 1
 * and 2) whose fired position has EXACTLY ONE hidden-single opportunity on
 * the whole board — no second, unrelated one (pure-scan/cross-hatching-style
 * OR another candidate-read one) a learner could land on instead and wonder
 * why it's not "the" answer. Same bug class as mine-cross-hatching.ts found
 * for Cross-Hatching's row-3 puzzle.
 *
 * Unlike Cross-Hatching's uniqueness check, this counts BOTH pure-scan and
 * non-pure-scan hidden singles — a pure-scan one is still fully visible in
 * the candidates a Last-Possible-Number learner is reading, so it's just as
 * distracting here, whereas a candidate-only one is invisible to a
 * Cross-Hatching learner scanning placed digits and so didn't need counting
 * there.
 *
 * Same lead-up as seed.ts's `fireTarget`: solve with the full technique set
 * minus hiddenSingle until lastPossibleNumber fires, searched via the same
 * random-symmetry-transform + dig approach as mine-simple-coloring.ts.
 *
 *   pnpm --filter @sudoku/db exec tsx src/mine-last-possible-number.ts [count]
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  parseGrid,
  hint,
  hasUniqueSolution,
  TECHNIQUES,
  hiddenSingle,
  lastPossibleNumber,
  UNITS,
  type Grid,
} from '@sudoku/engine';

const WANT = Number(process.argv[2] ?? 2);

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

const LEADUP = TECHNIQUES.filter((t) => t !== hiddenSingle);

/** Every naked single present right now — a cell down to exactly one
 * candidate. Orthogonal to hidden singles (a cell can be a naked single
 * without confining its digit to one cell of any of its units, and vice
 * versa), so it needs its own check: it's an even more obvious find than a
 * Last Possible Number, and one sitting unapplied on the board is a
 * distraction, not a bonus. */
function countNakedSingles(grid: Grid): number {
  let count = 0;
  for (let c = 0; c < 81; c++) {
    if (grid.placed[c] !== 0) continue;
    const mask = grid.candidates[c]!;
    if (mask !== 0 && (mask & (mask - 1)) === 0) count++;
  }
  return count;
}

/** Every hidden single present right now — pure-scan and candidate-only
 * alike, since both are visible in the pencil marks a Last Possible Number
 * learner is reading. */
function countHiddenSingleOpportunities(grid: Grid): number {
  let count = 0;
  for (const unit of UNITS) {
    let placedMask = 0;
    for (const c of unit.cells) {
      const d = grid.placed[c]!;
      if (d !== 0) placedMask |= 1 << (d - 1);
    }
    for (let d = 1; d <= 9; d++) {
      if ((placedMask & (1 << (d - 1))) !== 0) continue;
      let hits = 0;
      for (const c of unit.cells) {
        if (grid.placed[c] === 0 && (grid.candidates[c]! & (1 << (d - 1))) !== 0) {
          hits++;
          if (hits > 1) break;
        }
      }
      if (hits === 1) count++;
    }
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
    const step = lastPossibleNumber(g);
    if (step) {
      if (countHiddenSingleOpportunities(g) !== 1) return null;
      if (countNakedSingles(g) !== 0) return null;
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
for (let attempt = 0; attempt < 30000 && found.length < WANT; attempt++) {
  const base = SOLUTIONS[attempt % SOLUTIONS.length]!;
  const solved = transform(base);
  const puzzle = dig(solved);
  const cand = evaluate(puzzle);
  if (cand) found.push(cand);
}

found.sort((a, b) => a.clues - b.clues);
for (const c of found) {
  console.log(`clues=${c.clues} firedOnRaw=${c.firedOnRaw} desc="${c.desc}"`);
  console.log(c.puzzle);
  console.log();
}
if (found.length === 0) console.log('No unambiguous Last Possible Number example found.');
