/**
 * Precomputed board geometry: the 27 units (9 rows, 9 columns, 9 boxes), the
 * units each cell belongs to, and each cell's 20 peers. Built once at module
 * load; techniques and candidate computation read these tables.
 */

import { CELL_COUNT, SIZE, boxOf, colOf, rowOf, type CellIndex } from './grid.js';

/** Kind of unit, for step descriptions and technique scans. */
export type UnitKind = 'row' | 'col' | 'box';

export interface Unit {
  readonly kind: UnitKind;
  /** 0..8 within its kind. */
  readonly index: number;
  /** The 9 cell indices in this unit. */
  readonly cells: readonly CellIndex[];
}

function buildUnits(): { rows: Unit[]; cols: Unit[]; boxes: Unit[] } {
  const rows: CellIndex[][] = Array.from({ length: SIZE }, () => []);
  const cols: CellIndex[][] = Array.from({ length: SIZE }, () => []);
  const boxes: CellIndex[][] = Array.from({ length: SIZE }, () => []);

  for (let i = 0; i < CELL_COUNT; i++) {
    rows[rowOf(i)]!.push(i);
    cols[colOf(i)]!.push(i);
    boxes[boxOf(i)]!.push(i);
  }

  const mk = (kind: UnitKind, groups: CellIndex[][]): Unit[] =>
    groups.map((cells, index) => ({ kind, index, cells }));

  return { rows: mk('row', rows), cols: mk('col', cols), boxes: mk('box', boxes) };
}

const built = buildUnits();

/** The 9 row units. */
export const ROWS: readonly Unit[] = built.rows;
/** The 9 column units. */
export const COLS: readonly Unit[] = built.cols;
/** The 9 box units. */
export const BOXES: readonly Unit[] = built.boxes;

/** All 27 units (rows, then columns, then boxes). */
export const UNITS: readonly Unit[] = [...ROWS, ...COLS, ...BOXES];

/** The 3 units (row, column, box) containing each cell. */
export const UNITS_OF: readonly (readonly Unit[])[] = (() => {
  const out: Unit[][] = Array.from({ length: CELL_COUNT }, () => []);
  for (const unit of UNITS) {
    for (const c of unit.cells) out[c]!.push(unit);
  }
  return out;
})();

/** The 20 peers of each cell (cells sharing any unit, excluding itself). */
export const PEERS: readonly (readonly CellIndex[])[] = (() => {
  const out: CellIndex[][] = [];
  for (let i = 0; i < CELL_COUNT; i++) {
    const set = new Set<CellIndex>();
    for (const unit of UNITS_OF[i]!) {
      for (const c of unit.cells) {
        if (c !== i) set.add(c);
      }
    }
    out.push([...set]);
  }
  return out;
})();

/** Peer lookup as sets, for O(1) "does a see b" checks. */
export const PEER_SET: readonly ReadonlySet<CellIndex>[] = PEERS.map((ps) => new Set(ps));

/** True when cells `a` and `b` share a unit (a can "see" b). */
export function sees(a: CellIndex, b: CellIndex): boolean {
  return PEER_SET[a]!.has(b);
}

/** Empty-or-not cells that see every anchor (peer of all of them). */
export function commonPeers(anchors: readonly CellIndex[]): CellIndex[] {
  if (anchors.length === 0) return [];
  const [first, ...rest] = anchors;
  return PEERS[first!]!.filter((c) => rest.every((a) => sees(c, a)));
}
