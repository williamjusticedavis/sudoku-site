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
import {
  parseGrid,
  hint,
  TECHNIQUES,
  hiddenSingle,
  crossHatching,
  UNITS,
  PEERS,
  type Grid,
  type Unit,
} from '@sudoku/engine';
import { SOLUTIONS, dig, transform } from './mine-harness.js';

const KIND = (process.argv[2] ?? 'row') as 'row' | 'column' | 'box';

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
