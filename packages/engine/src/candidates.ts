/**
 * Candidate computation and (de)serialization.
 *
 * `computeCandidates` is the load-time source of truth: it derives every empty
 * cell's candidate mask purely from placed digits, ignoring any user-supplied
 * notation (per project rule — never trust the user's marks). It runs exactly
 * ONCE, at `parseGrid`. After that, `applyStep` maintains candidates
 * incrementally; re-running this mid-solve would erase technique eliminations.
 */

import {
  ALL_CANDIDATES,
  CELL_COUNT,
  SIZE,
  bit,
  candList,
  emptyGrid,
  type Digit,
  type Grid,
} from './grid.js';
import { PEERS } from './units.js';

/**
 * Recompute candidate masks for every empty cell from placed digits alone.
 * Placed cells get a zero mask. Mutates `grid.candidates` in place.
 */
export function computeCandidates(grid: Grid): Grid {
  for (let i = 0; i < CELL_COUNT; i++) {
    if (grid.placed[i] !== 0) {
      grid.candidates[i] = 0;
      continue;
    }
    let mask = ALL_CANDIDATES;
    for (const p of PEERS[i]!) {
      const d = grid.placed[p]!;
      if (d !== 0) mask &= ~bit(d as Digit);
    }
    grid.candidates[i] = mask;
  }
  return grid;
}

/**
 * Parse an 81-character grid string into a Grid with candidates computed.
 * Empty cells may be `.`, `0`, or space. Any other non-digit is rejected.
 * Whitespace/newlines between cells is ignored, so pretty-printed grids parse.
 */
export function parseGrid(input: string): Grid {
  const chars = input.replace(/[\r\n\t ]/g, '');
  if (chars.length !== CELL_COUNT) {
    throw new Error(
      `Expected ${CELL_COUNT} cells, got ${chars.length} after stripping whitespace.`,
    );
  }
  const grid = emptyGrid();
  for (let i = 0; i < CELL_COUNT; i++) {
    const ch = chars[i]!;
    if (ch === '.' || ch === '0') {
      grid.placed[i] = 0;
    } else if (ch >= '1' && ch <= '9') {
      grid.placed[i] = ch.charCodeAt(0) - 48;
    } else {
      throw new Error(`Invalid character '${ch}' at position ${i}.`);
    }
  }
  return computeCandidates(grid);
}

/** Serialize placed digits to an 81-char string (`.` for empty). */
export function serializeGrid(grid: Grid): string {
  let out = '';
  for (let i = 0; i < CELL_COUNT; i++) {
    const d = grid.placed[i]!;
    out += d === 0 ? '.' : String(d);
  }
  return out;
}

/**
 * Parse an EXTENDED grid format that can carry user-supplied candidate marks,
 * not just placed digits. Input is 81 whitespace/comma-separated tokens:
 *
 *   `1`..`9`   a placed digit
 *   `.` `0` `-` an empty cell with NO user marks (candidates computed fresh here)
 *   `[159]`    an empty cell whose user candidate set is {1,5,9}
 *   `159`      shorthand for the same (a bare run of 2+ digits)
 *
 * Cells marked with `[...]`/runs keep EXACTLY the user's set — deliberately
 * distinct from what `computeCandidates` would derive. Unmarked empties (`.`)
 * are filled from placed digits so the grid is complete. This grid is NOT yet
 * trusted for solving; run it through `reconcileNotation` (see validate.ts),
 * which validates the marks with `checkForMistakes` and resets to the computed
 * candidates on any problem.
 */
export function parseGridWithCandidates(input: string): Grid {
  const tokens = input
    .trim()
    .split(/[\s,]+/)
    .filter((t) => t.length > 0);
  if (tokens.length !== CELL_COUNT) {
    throw new Error(`Expected ${CELL_COUNT} tokens, got ${tokens.length}.`);
  }
  const grid = emptyGrid();
  const marked: boolean[] = new Array(CELL_COUNT).fill(false);

  for (let i = 0; i < CELL_COUNT; i++) {
    const tok = tokens[i]!;
    if (/^[1-9]$/.test(tok)) {
      grid.placed[i] = Number(tok);
      grid.candidates[i] = 0;
      continue;
    }
    if (tok === '.' || tok === '0' || tok === '-') {
      continue; // empty, no user marks — filled in below
    }
    const bracket = /^\[([1-9]+)\]$/.exec(tok);
    const digits = bracket ? bracket[1]! : /^[1-9]{2,}$/.test(tok) ? tok : null;
    if (digits === null) {
      throw new Error(`Invalid cell token '${tok}' at position ${i}.`);
    }
    let mask = 0;
    for (const ch of digits) mask |= bit(Number(ch) as Digit);
    grid.candidates[i] = mask;
    marked[i] = true;
  }

  // Fill unmarked empties from placed digits (leaves user marks untouched).
  for (let i = 0; i < CELL_COUNT; i++) {
    if (grid.placed[i] !== 0 || marked[i]) continue;
    let mask = ALL_CANDIDATES;
    for (const p of PEERS[i]!) {
      const d = grid.placed[p]!;
      if (d !== 0) mask &= ~bit(d as Digit);
    }
    grid.candidates[i] = mask;
  }
  return grid;
}

/**
 * Serialize to the extended format: placed digits as-is, empty cells as
 * `[candidates]` (or `.` when a cell somehow has none). Rows are space-separated
 * and newline-joined so the output pastes back into `parseGridWithCandidates`.
 */
export function serializeGridWithCandidates(grid: Grid): string {
  const tokens: string[] = [];
  for (let i = 0; i < CELL_COUNT; i++) {
    if (grid.placed[i] !== 0) {
      tokens.push(String(grid.placed[i]));
    } else {
      const ds = candList(grid.candidates[i]!);
      tokens.push(ds.length > 0 ? `[${ds.join('')}]` : '.');
    }
  }
  const rows: string[] = [];
  for (let r = 0; r < SIZE; r++) rows.push(tokens.slice(r * SIZE, r * SIZE + SIZE).join(' '));
  return rows.join('\n');
}

/** Pretty 9x9 rendering of placed digits, for debugging/tests. */
export function formatGrid(grid: Grid): string {
  const rows: string[] = [];
  for (let r = 0; r < SIZE; r++) {
    let line = '';
    for (let c = 0; c < SIZE; c++) {
      const d = grid.placed[r * SIZE + c]!;
      line += (d === 0 ? '.' : String(d)) + (c % 3 === 2 && c < 8 ? ' | ' : ' ');
    }
    rows.push(line.trimEnd());
    if (r % 3 === 2 && r < 8) rows.push('------+-------+------');
  }
  return rows.join('\n');
}
