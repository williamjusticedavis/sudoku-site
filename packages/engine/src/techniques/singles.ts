/**
 * Singles — the simplest placements. All three place a digit (never eliminate),
 * so their highlights use the `placement` role for the solved cell and
 * `related` for the cells that justify it.
 *
 *  - Last Free Cell : a unit has exactly one empty cell → fill the missing digit.
 *  - Naked Single   : a cell has exactly one candidate → place it.
 *  - Hidden Single  : within a unit, a digit has exactly one candidate cell.
 *
 * Last Free Cell is a strict subset of Naked Single (a lone empty cell always
 * has one candidate), but it is kept separate: it is the most teachable move and
 * ranks first in difficulty order, so the solver reports it as such.
 */

import {
  ALL_CANDIDATES,
  SIZE,
  cellName,
  onlyCand,
  type CellIndex,
  type Digit,
  type Grid,
} from '../grid.js';
import { UNITS } from '../units.js';
import { makeStep, type Step, type Technique } from '../step.js';

/** A unit with exactly one empty cell → the missing digit is forced. */
export const lastFreeCell: Technique = (grid: Grid): Step | null => {
  for (const unit of UNITS) {
    let empty: CellIndex = -1;
    let present = 0; // mask of placed digits in the unit
    let emptyCount = 0;
    for (const c of unit.cells) {
      const d = grid.placed[c]!;
      if (d === 0) {
        empty = c;
        emptyCount++;
        if (emptyCount > 1) break;
      } else {
        present |= 1 << (d - 1);
      }
    }
    if (emptyCount !== 1) continue;

    const missing = onlyCand(ALL_CANDIDATES & ~present);
    if (missing === null) continue; // unit was inconsistent; skip

    const related = unit.cells.filter((c) => c !== empty);
    return makeStep({
      technique: 'last-free-cell',
      placements: [{ cell: empty, digit: missing }],
      highlights: [
        { role: 'placement', cells: [empty], digits: [missing] },
        { role: 'related', cells: related },
      ],
      description: `Last free cell: ${missing} is the only digit missing from ${unit.kind} ${
        unit.index + 1
      }, so it goes in ${cellName(empty)}.`,
    });
  }
  return null;
};

/** A cell with exactly one remaining candidate → place it. */
export const nakedSingle: Technique = (grid: Grid): Step | null => {
  for (let c = 0; c < grid.placed.length; c++) {
    if (grid.placed[c] !== 0) continue;
    const only = onlyCand(grid.candidates[c]!);
    if (only === null) continue;
    return makeStep({
      technique: 'naked-single',
      placements: [{ cell: c, digit: only }],
      highlights: [{ role: 'placement', cells: [c], digits: [only] }],
      description: `Naked single: ${cellName(c)} has only candidate ${only}.`,
    });
  }
  return null;
};

/** Within a unit, a digit that fits in exactly one cell → place it there. */
export const hiddenSingle: Technique = (grid: Grid): Step | null => {
  for (const unit of UNITS) {
    // Digits still needed in this unit (not already placed).
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

      const related = unit.cells.filter((c) => c !== spot);
      return makeStep({
        technique: 'hidden-single',
        placements: [{ cell: spot, digit: d }],
        highlights: [
          { role: 'placement', cells: [spot], digits: [d] },
          { role: 'related', cells: related, digits: [d] },
        ],
        description: `Hidden single: ${d} fits only in ${cellName(spot)} within ${
          unit.kind
        } ${unit.index + 1}.`,
      });
    }
  }
  return null;
};
