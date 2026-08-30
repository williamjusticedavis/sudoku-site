/**
 * Cross-Hatching and Last Possible Number — teaching-only relabels of Hidden
 * Single (see `singles.ts`). Both converge on the same underlying fact (a
 * digit has exactly one legal cell left in a unit); they exist as separate
 * lessons because a human notices that fact two different ways:
 *
 *  - Cross-Hatching : active scanline elimination (crossing out where a digit
 *    can't go, row/col/box), often with zero candidate marks on the board.
 *  - Last Possible Number : spotted passively via candidates already
 *    pencilled in — the fact only emerges once earlier eliminations (a
 *    locked-candidates or subset move, say) have thinned that unit's marks.
 *
 * The split is computed, not guessed: for the unit/digit/cell a Hidden
 * Single names, recompute each OTHER empty cell's candidates from placed
 * peers alone (ignoring every candidate eliminated by an earlier technique).
 * If that alone already rules the digit out everywhere but the found cell,
 * a plain scan would have caught it -> Cross-Hatching. If some other cell's
 * peer-only candidates still include the digit -- it only reads as "gone"
 * because of accumulated eliminations -- the fact depends on the candidate
 * list -> Last Possible Number.
 *
 * These are NOT part of `PATTERN_TECHNIQUES`/`TECHNIQUES` in solver.ts and
 * never change the main solver's priority order or step labels; they exist
 * only for labelling the Learn section's curated lesson puzzles.
 */

import {
  ALL_CANDIDATES,
  SIZE,
  bit,
  cellName,
  colOf,
  rowOf,
  type CellIndex,
  type Digit,
  type Grid,
} from '../grid.js';
import { PEERS } from '../units.js';
import { UNITS, type Unit } from '../units.js';
import { makeStep, type Arrow, type Step, type Technique } from '../step.js';

/** A cell's candidates from placed peers alone, ignoring accumulated eliminations. */
function peerOnlyMask(grid: Grid, cell: CellIndex): number {
  let mask = ALL_CANDIDATES;
  for (const p of PEERS[cell]!) {
    const d = grid.placed[p]!;
    if (d !== 0) mask &= ~bit(d as Digit);
  }
  return mask;
}

/** True iff every OTHER empty cell in the unit is blocked from `digit` by a
 * placed peer alone -- i.e. a plain scan finds this Hidden Single. */
function isPureScan(grid: Grid, unit: Unit, digit: Digit, spot: CellIndex): boolean {
  for (const c of unit.cells) {
    if (c === spot || grid.placed[c] !== 0) continue;
    if ((peerOnlyMask(grid, c) & bit(digit)) !== 0) return false;
  }
  return true;
}

/** Every OTHER unit (row/column/box) that shares a cell with `unit` and
 * already holds `digit` placed somewhere in it — i.e. a scanline that crosses
 * `unit` and rules the digit out of the cell(s) they share. Cross-hatching's
 * "cover" highlight: exactly the lines doing the excluding, nothing a blocking
 * cell's OTHER units (that don't cross `unit`) would drag in. */
function crossingLines(grid: Grid, unit: Unit, digit: Digit): CellIndex[] {
  const target = new Set(unit.cells);
  const cover = new Set<CellIndex>();
  for (const other of UNITS) {
    if (other === unit) continue;
    if (!other.cells.some((c) => target.has(c))) continue;
    if (!other.cells.some((c) => grid.placed[c] === digit)) continue;
    for (const c of other.cells) cover.add(c);
  }
  return [...cover];
}

/** For each empty, excluded cell of `unit`, the one peer outside `unit` that
 * holds `digit` and is therefore the specific reason THAT cell is blocked —
 * an arrow from the blocking digit to the cell it rules out. Every excluded
 * cell gets exactly one: a peer sharing its row or column is preferred (a
 * clean straight line), but if that's the ONLY reason a cell is blocked — no
 * row/column peer holds the digit, just a box-mate that shares neither (one
 * of the 4 "diagonal" cells in any 3×3 box) — that box-mate is used instead.
 * Leaving such a cell arrow-less would make it look unexplained; the diagonal
 * line is the honest picture even though it's less tidy than a straight one. */
function blockingArrows(
  grid: Grid,
  unit: Unit,
  digit: Digit,
  related: CellIndex[],
): Arrow[] {
  const inUnit = new Set(unit.cells);
  const arrows: Arrow[] = [];
  for (const c of related) {
    if (grid.placed[c] !== 0) continue;
    let diagonal: CellIndex | null = null;
    let straight: CellIndex | null = null;
    for (const p of PEERS[c]!) {
      if (inUnit.has(p) || grid.placed[p] !== digit) continue;
      if (rowOf(p) === rowOf(c) || colOf(p) === colOf(c)) {
        straight = p;
        break;
      }
      diagonal ??= p;
    }
    const from = straight ?? diagonal;
    if (from !== null) arrows.push({ from, to: c });
  }
  return arrows;
}

/** Find the first Hidden Single fact matching `wantPureScan`, built exactly
 * like `hiddenSingle` in singles.ts but filtered and relabelled. */
function findLabelled(
  grid: Grid,
  technique: 'cross-hatching' | 'last-possible-number',
  wantPureScan: boolean,
  describe: (digit: Digit, spot: CellIndex, unit: Unit) => string,
): Step | null {
  for (const unit of UNITS) {
    let placedMask = 0;
    for (const c of unit.cells) {
      const d = grid.placed[c]!;
      if (d !== 0) placedMask |= 1 << (d - 1);
    }
    for (let d = 1 as Digit; d <= SIZE; d++) {
      if ((placedMask & (1 << (d - 1))) !== 0) continue;
      let spot: CellIndex = -1;
      let count = 0;
      for (const c of unit.cells) {
        if (grid.placed[c] === 0 && (grid.candidates[c]! & (1 << (d - 1))) !== 0) {
          spot = c;
          count++;
          if (count > 1) break;
        }
      }
      if (count !== 1) continue;
      if (isPureScan(grid, unit, d, spot) !== wantPureScan) continue;

      const related = unit.cells.filter((c) => c !== spot);
      // Cross-hatching is the scanline technique — show the rows/columns/boxes
      // actually doing the crossing-out. Last Possible Number reads pencil
      // marks instead, so it gets no cover lines.
      const cover = technique === 'cross-hatching' ? crossingLines(grid, unit, d) : [];
      const arrows =
        technique === 'cross-hatching' ? blockingArrows(grid, unit, d, related) : [];
      return makeStep({
        technique,
        placements: [{ cell: spot, digit: d }],
        highlights: [
          { role: 'placement', cells: [spot], digits: [d] },
          { role: 'related', cells: related, digits: [d] },
          ...(cover.length > 0
            ? [{ role: 'scan' as const, cells: cover, digits: [d] }]
            : []),
        ],
        ...(arrows.length > 0 ? { arrows } : {}),
        description: describe(d, spot, unit),
      });
    }
  }
  return null;
}

export const crossHatching: Technique = (grid: Grid): Step | null =>
  findLabelled(
    grid,
    'cross-hatching',
    true,
    (d, spot, unit) =>
      `Cross-hatching: scanning ${unit.kind} ${unit.index + 1} shows ${d} only fits in ${cellName(spot)}.`,
  );

export const lastPossibleNumber: Technique = (grid: Grid): Step | null =>
  findLabelled(
    grid,
    'last-possible-number',
    false,
    (d, spot, unit) =>
      `Last possible number: candidates show ${d} only fits in ${cellName(spot)} within ${
        unit.kind
      } ${unit.index + 1}.`,
  );
