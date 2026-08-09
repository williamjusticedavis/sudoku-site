/**
 * Naked and hidden subsets (pairs, triples, quads) — the k = 2..4 generalisation
 * of naked/hidden singles. Both directions share one enumeration core over a
 * unit's cells and digit-position sets; the fish family reuses the same
 * "positions of a digit within a set of lines" idea next.
 *
 *  - Naked subset  : k cells in a unit whose candidate UNION is exactly k digits
 *                    → those k digits can be removed from the unit's OTHER cells.
 *  - Hidden subset : k digits in a unit confined to exactly k cells → every
 *                    OTHER candidate can be removed from those k cells.
 *
 * A technique returns null unless it produces at least one elimination — a step
 * that changed nothing would spin the solver loop forever.
 */

import {
  candCount,
  candList,
  cellName,
  hasCand,
  type CellIndex,
  type Digit,
  type Grid,
} from '../grid.js';
import { UNITS, type Unit } from '../units.js';
import { makeStep, type Elimination, type Step, type Technique, type TechniqueId } from '../step.js';
import { combinations } from './util.js';

const SIZE_WORD: Record<number, string> = { 2: 'pair', 3: 'triple', 4: 'quad' };

function unitLabel(u: Unit): string {
  return `${u.kind} ${u.index + 1}`;
}

function digitsLabel(mask: number): string {
  return candList(mask).join(',');
}

// ── Naked subsets ───────────────────────────────────────────────────────────

function findNaked(grid: Grid, k: number, technique: TechniqueId): Step | null {
  for (const unit of UNITS) {
    // Candidate cells: empty, with 2..k candidates (a 1-candidate cell is a
    // naked single, handled earlier).
    const cells = unit.cells.filter((c) => {
      const n = candCount(grid.candidates[c]!);
      return grid.placed[c] === 0 && n >= 2 && n <= k;
    });
    if (cells.length < k) continue;

    for (const combo of combinations(cells.length, k)) {
      const picked = combo.map((i) => cells[i]!);
      let union = 0;
      for (const c of picked) union |= grid.candidates[c]!;
      if (candCount(union) !== k) continue;

      // Eliminate the k union digits from the unit's other empty cells.
      const digits = candList(union);
      const pickedSet = new Set(picked);
      const eliminations: Elimination[] = [];
      for (const c of unit.cells) {
        if (grid.placed[c] !== 0 || pickedSet.has(c)) continue;
        for (const d of digits) {
          if (hasCand(grid.candidates[c]!, d)) eliminations.push({ cell: c, digit: d });
        }
      }
      if (eliminations.length === 0) continue;

      return makeStep({
        technique,
        eliminations,
        highlights: [
          { role: 'base', cells: picked, digits },
          { role: 'elimination', cells: [...new Set(eliminations.map((e) => e.cell))], digits },
        ],
        description: `Naked ${SIZE_WORD[k]} (${digitsLabel(union)}) in ${unitLabel(unit)} at ${picked
          .map(cellName)
          .join(', ')} → remove ${digitsLabel(union)} from the rest of the ${unit.kind}.`,
      });
    }
  }
  return null;
}

// ── Hidden subsets ──────────────────────────────────────────────────────────

function findHidden(grid: Grid, k: number, technique: TechniqueId): Step | null {
  for (const unit of UNITS) {
    // Positions (within the unit) of each still-unplaced digit.
    const positions = new Map<Digit, CellIndex[]>();
    let placedMask = 0;
    for (const c of unit.cells) {
      const p = grid.placed[c]!;
      if (p !== 0) placedMask |= 1 << (p - 1);
    }
    for (let d = 1 as Digit; d <= 9; d++) {
      if ((placedMask & (1 << (d - 1))) !== 0) continue;
      const cells: CellIndex[] = [];
      for (const c of unit.cells) {
        if (grid.placed[c] === 0 && hasCand(grid.candidates[c]!, d)) cells.push(c);
      }
      // 2..k positions: a 1-position digit is a hidden single (handled earlier).
      if (cells.length >= 2 && cells.length <= k) positions.set(d, cells);
    }
    const digitPool = [...positions.keys()];
    if (digitPool.length < k) continue;

    for (const combo of combinations(digitPool.length, k)) {
      const digits = combo.map((i) => digitPool[i]!);
      const cellSet = new Set<CellIndex>();
      for (const d of digits) for (const c of positions.get(d)!) cellSet.add(c);
      if (cellSet.size !== k) continue;

      // Strip every candidate other than the k digits from those k cells.
      const digitMask = digits.reduce((m, d) => m | (1 << (d - 1)), 0);
      const eliminations: Elimination[] = [];
      for (const c of cellSet) {
        for (const e of candList(grid.candidates[c]!)) {
          if ((digitMask & (1 << (e - 1))) === 0) eliminations.push({ cell: c, digit: e });
        }
      }
      if (eliminations.length === 0) continue;

      const cells = [...cellSet];
      return makeStep({
        technique,
        eliminations,
        highlights: [{ role: 'base', cells, digits }],
        description: `Hidden ${SIZE_WORD[k]} (${digits.join(',')}) in ${unitLabel(
          unit,
        )}: only ${cells.map(cellName).join(', ')} can hold them → remove other candidates there.`,
      });
    }
  }
  return null;
}

export const nakedPair: Technique = (g) => findNaked(g, 2, 'naked-pair');
export const nakedTriple: Technique = (g) => findNaked(g, 3, 'naked-triple');
export const nakedQuad: Technique = (g) => findNaked(g, 4, 'naked-quad');
export const hiddenPair: Technique = (g) => findHidden(g, 2, 'hidden-pair');
export const hiddenTriple: Technique = (g) => findHidden(g, 3, 'hidden-triple');
export const hiddenQuad: Technique = (g) => findHidden(g, 4, 'hidden-quad');
