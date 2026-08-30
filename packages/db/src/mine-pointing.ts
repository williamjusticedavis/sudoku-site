/**
 * One-off: find clean Pointing/Claiming puzzles whose fired position has:
 *   - zero naked singles and zero hidden singles present (no beginner-tier
 *     move sitting there instead — the exact bug already fixed for
 *     Cross-Hatching/Last Possible Number, now showing up here too), and
 *   - exactly one locked-candidates opportunity of the target kind (no
 *     second, different pointing/claiming a learner could apply instead).
 * A coexisting technique at intermediate tier or above (a second box with a
 * DIFFERENT digit locked, a naked pair, whatever) is fine — only a strictly
 * easier move disqualifies a puzzle, per the ask.
 *
 * Same lead-up/mining approach as mine-cross-hatching.ts and
 * mine-last-possible-number.ts: random-symmetry-transform + dig against the
 * vendored 17-clue solved grids, replaying seed.ts's fireTarget loop.
 *
 *   pnpm --filter @sudoku/db exec tsx src/mine-pointing.ts <pointing|claiming> [count]
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
  pointing,
  claiming,
  type Grid,
  type Technique,
} from '@sudoku/engine';

const KIND = (process.argv[2] ?? 'pointing') as 'pointing' | 'claiming';
const WANT = Number(process.argv[3] ?? 3);

// Must be the SAME combinator seed.ts's merged lesson actually fires on —
// not the bare `pointing`/`claiming` technique checked in isolation. Those
// two aren't independent: whichever direction's pattern appears first in
// solve order is the one the merged lesson shows, regardless of which kind
// we're trying to mine an example of. Checking the raw technique alone once
// found a "pointing" puzzle where claiming actually fired first at an
// earlier position — the mined grid didn't demonstrate what it claimed to.
const TARGET: Technique = (grid) => pointing(grid) ?? claiming(grid);

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

// Exclude BOTH pointing and claiming, always — not just the kind being
// mined. seed.ts's merged lesson does the same (its `excluded()` maps the
// combined slug to both real techniques), since they now share one lesson
// slug. Excluding only the target kind here would let the OTHER kind fire
// silently during lead-up and reshape the grid before the target's moment,
// so a puzzle verified clean under this script could still resolve to the
// wrong technique once seeded — exactly the bug that first shipped the
// pointing/claiming puzzles swapped.
const LEADUP = TECHNIQUES.filter((t) => t !== pointing && t !== claiming);

const rowOf = (i: number) => Math.floor(i / 9);
const colOf = (i: number) => i % 9;
const boxOf = (i: number) => Math.floor(rowOf(i) / 3) * 3 + Math.floor(colOf(i) / 3);

function unitCells(kind: 'row' | 'col' | 'box', index: number): number[] {
  const out: number[] = [];
  for (let i = 0; i < 81; i++) {
    const match =
      kind === 'row'
        ? rowOf(i) === index
        : kind === 'col'
          ? colOf(i) === index
          : boxOf(i) === index;
    if (match) out.push(i);
  }
  return out;
}

/** Every naked or hidden single sitting on the board right now — any beginner-
 * tier move that would let a learner sidestep pointing/claiming entirely. */
function hasBeginnerMove(grid: Grid): boolean {
  return nakedSingle(grid) !== null || hiddenSingle(grid) !== null;
}

/** Mirrors the engine's own pointing/claiming loop (locked.ts) but counts
 * every match instead of returning the first — not exported, so duplicated
 * here for this one-off search. */
function countLockedOpportunities(grid: Grid, kind: 'pointing' | 'claiming'): number {
  let count = 0;
  // Pointing: base = box, line = row or col. Claiming: base = row/col, line = box.
  if (kind === 'pointing') {
    for (let b = 0; b < 9; b++) {
      const box = unitCells('box', b);
      let placedMask = 0;
      for (const c of box)
        if (grid.placed[c] !== 0) placedMask |= 1 << (grid.placed[c]! - 1);
      for (let d = 1; d <= 9; d++) {
        if ((placedMask & (1 << (d - 1))) !== 0) continue;
        const cand = box.filter(
          (c) => grid.placed[c] === 0 && (grid.candidates[c]! & (1 << (d - 1))) !== 0,
        );
        if (cand.length < 2) continue;
        const sameRow = cand.every((c) => rowOf(c) === rowOf(cand[0]!));
        const sameCol = cand.every((c) => colOf(c) === colOf(cand[0]!));
        if (!sameRow && !sameCol) continue;
        const line = sameRow
          ? unitCells('row', rowOf(cand[0]!))
          : unitCells('col', colOf(cand[0]!));
        const elim = line.some(
          (c) =>
            boxOf(c) !== b &&
            grid.placed[c] === 0 &&
            (grid.candidates[c]! & (1 << (d - 1))) !== 0,
        );
        if (elim) count++;
      }
    }
  } else {
    for (const axis of ['row', 'col'] as const) {
      for (let l = 0; l < 9; l++) {
        const line = unitCells(axis, l);
        let placedMask = 0;
        for (const c of line)
          if (grid.placed[c] !== 0) placedMask |= 1 << (grid.placed[c]! - 1);
        for (let d = 1; d <= 9; d++) {
          if ((placedMask & (1 << (d - 1))) !== 0) continue;
          const cand = line.filter(
            (c) => grid.placed[c] === 0 && (grid.candidates[c]! & (1 << (d - 1))) !== 0,
          );
          if (cand.length < 2) continue;
          const sameBox = cand.every((c) => boxOf(c) === boxOf(cand[0]!));
          if (!sameBox) continue;
          const box = unitCells('box', boxOf(cand[0]!));
          const elim = box.some(
            (c) =>
              (axis === 'row' ? rowOf(c) !== l : colOf(c) !== l) &&
              grid.placed[c] === 0 &&
              (grid.candidates[c]! & (1 << (d - 1))) !== 0,
          );
          if (elim) count++;
        }
      }
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
    const step = TARGET(g);
    if (step) {
      if (step.technique !== KIND) return null;
      if (hasBeginnerMove(g)) return null;
      if (countLockedOpportunities(g, KIND) !== 1) return null;
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
if (found.length === 0) console.log(`No unambiguous ${KIND} example found.`);
