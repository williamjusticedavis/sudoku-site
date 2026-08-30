/**
 * One-off: find a clean replacement cross-hatching puzzle for a given unit
 * kind (row/column/box) whose fired position has EXACTLY ONE pure-scan
 * opportunity on the whole board — no second, unrelated hidden single a
 * learner could stumble onto instead and get confused about which one the
 * lesson means (that's what was wrong with the original row-3 puzzle: 7
 * simultaneous opportunities at the fired position, not just the intended one).
 *
 * Same lead-up as seed.ts's `fireTarget`: solve with the full technique set
 * minus hiddenSingle (cross-hatching's un-relabelled twin) until crossHatching
 * fires, replaying the same random-symmetry-transform + dig approach as
 * mine-simple-coloring.ts against the vendored 17-clue solved grids so the
 * search space isn't limited to the 100 original puzzle shapes verbatim.
 *
 *   pnpm --filter @sudoku/db exec tsx src/mine-cross-hatching.ts <row|column|box>
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  parseGrid,
  hint,
  hasUniqueSolution,
  TECHNIQUES,
  hiddenSingle,
  crossHatching,
  UNITS,
  PEERS,
  type Grid,
  type Unit,
} from '@sudoku/engine';

const KIND = (process.argv[2] ?? 'row') as 'row' | 'column' | 'box';

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

/** Mirrors crossHatching's own internal pure-scan check (teachingSingles.ts) —
 * duplicated here since it's not exported, only used for this one-off search. */
function isPureScan(grid: Grid, unit: Unit, digit: number, spot: number): boolean {
  const bit = (d: number) => 1 << (d - 1);
  const peerOnlyMask = (cell: number): number => {
    let mask = 0b111111111;
    for (const p of PEERS[cell]!) {
      const d = grid.placed[p]!;
      if (d !== 0) mask &= ~bit(d);
    }
    return mask;
  };
  for (const c of unit.cells) {
    if (c === spot || grid.placed[c] !== 0) continue;
    if ((peerOnlyMask(c) & bit(digit)) !== 0) return false;
  }
  return true;
}

/** Every pure-scan hidden single present on the board right now, across all
 * units/digits — not just the first one crossHatching would report. */
function countPureScanOpportunities(grid: Grid): number {
  let count = 0;
  for (const unit of UNITS) {
    let placedMask = 0;
    for (const c of unit.cells) {
      const d = grid.placed[c]!;
      if (d !== 0) placedMask |= 1 << (d - 1);
    }
    for (let d = 1; d <= 9; d++) {
      if ((placedMask & (1 << (d - 1))) !== 0) continue;
      let spot = -1;
      let hits = 0;
      for (const c of unit.cells) {
        if (grid.placed[c] === 0 && (grid.candidates[c]! & (1 << (d - 1))) !== 0) {
          spot = c;
          hits++;
          if (hits > 1) break;
        }
      }
      if (hits !== 1) continue;
      if (isPureScan(grid, unit, d, spot)) count++;
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
    const step = crossHatching(g);
    if (step) {
      if (!step.description.includes(`scanning ${KIND} `)) return null;
      if (countPureScanOpportunities(g) !== 1) return null;
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
for (let attempt = 0; attempt < 30000 && found.length < 5; attempt++) {
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
if (found.length === 0)
  console.log(`No unambiguous ${KIND}-based cross-hatching example found.`);
