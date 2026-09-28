/**
 * Single-digit chains — eliminations built from strong links (conjugate pairs)
 * on ONE digit. Skyscraper, 2-String Kite, and Turbot Fish are all the same
 * shape: two conjugate pairs joined by a weak link, differing only in geometry.
 *
 * Strong link on d: a unit where d has exactly two candidate cells — one of the
 * two must be d. Take two strong links (a1,b1) and (a2,b2). If b1 and a2 see
 * each other (a weak link: they can't both be d), then the chain
 *   a1 — b1 = a2 — b2   (=/− alternating strong/weak/strong)
 * forces "a1 is d OR b2 is d". So d can be eliminated from any cell seeing BOTH
 * free ends a1 and b2.
 *
 * Classification (by geometry) so the solver reports the recognisable name:
 *  - Skyscraper   : both strong links are parallel lines (two rows or two cols)
 *                   whose weak-link ends share the perpendicular line.
 *  - 2-String Kite: one row link + one column link whose weak-link ends share a
 *                   box.
 *  - Turbot Fish  : any other two-strong-link + weak-link configuration.
 *
 * All are elimination-only; each exported technique returns only its own class.
 */

import {
  boxOf,
  cellName,
  colOf,
  hasCand,
  rowOf,
  type CellIndex,
  type Digit,
  type Grid,
} from '../grid.js';
import { UNITS, commonPeers, sees, type UnitKind } from '../units.js';
import { makeStep, type Step, type Technique, type TechniqueId } from '../step.js';

interface StrongLink {
  readonly kind: UnitKind;
  readonly a: CellIndex;
  readonly b: CellIndex;
}

type ChainKind = 'skyscraper' | '2-string-kite' | 'turbot-fish';

/** All conjugate pairs (strong links) for digit `d`, across every unit. */
function strongLinks(grid: Grid, d: Digit): StrongLink[] {
  const out: StrongLink[] = [];
  for (const unit of UNITS) {
    const cells = unit.cells.filter(
      (c) => grid.placed[c] === 0 && hasCand(grid.candidates[c]!, d),
    );
    if (cells.length === 2) out.push({ kind: unit.kind, a: cells[0]!, b: cells[1]! });
  }
  return out;
}

function classify(
  l1: StrongLink,
  l2: StrongLink,
  e1: CellIndex,
  e2: CellIndex,
): ChainKind {
  const bothLines = l1.kind !== 'box' && l2.kind !== 'box';
  if (bothLines && l1.kind === l2.kind) {
    const aligned = l1.kind === 'row' ? colOf(e1) === colOf(e2) : rowOf(e1) === rowOf(e2);
    if (aligned) return 'skyscraper';
  }
  const kinds = new Set([l1.kind, l2.kind]);
  if (kinds.has('row') && kinds.has('col') && boxOf(e1) === boxOf(e2))
    return '2-string-kite';
  return 'turbot-fish';
}

const LABEL: Record<ChainKind, string> = {
  skyscraper: 'Skyscraper',
  '2-string-kite': '2-String Kite',
  'turbot-fish': 'Turbot Fish',
};

/** Shared finder; returns the first chain whose class `accept` allows. */
function findChain(grid: Grid, accept: ChainKind): Step | null {
  for (let d = 1 as Digit; d <= 9; d++) {
    const links = strongLinks(grid, d);
    for (let i = 0; i < links.length; i++) {
      for (let j = i + 1; j < links.length; j++) {
        const l1 = links[i]!;
        const l2 = links[j]!;
        // Try each (weak-end from l1, weak-end from l2); the OTHER ends are free.
        const options: [CellIndex, CellIndex, CellIndex, CellIndex][] = [
          [l1.a, l1.b, l2.a, l2.b],
          [l1.a, l1.b, l2.b, l2.a],
          [l1.b, l1.a, l2.a, l2.b],
          [l1.b, l1.a, l2.b, l2.a],
        ];
        for (const [o1, e1, e2, o2] of options) {
          const chain = new Set([o1, e1, e2, o2]);
          if (chain.size !== 4) continue; // all four cells distinct
          if (!sees(e1, e2)) continue; // weak link between the inner ends
          if (o1 === o2 || sees(o1, o2)) continue; // free ends must be separate & non-trivial

          if (classify(l1, l2, e1, e2) !== accept) continue;

          const targets = commonPeers([o1, o2]).filter(
            (c) =>
              !chain.has(c) && grid.placed[c] === 0 && hasCand(grid.candidates[c]!, d),
          );
          if (targets.length === 0) continue;

          return makeStep({
            technique: accept as TechniqueId,
            eliminations: targets.map((cell) => ({ cell, digit: d })),
            highlights: [
              { role: 'base', cells: [o1, o2], digits: [d] },
              { role: 'related', cells: [e1, e2], digits: [d] },
              { role: 'elimination', cells: targets, digits: [d] },
            ],
            description: `${LABEL[accept]} on ${d}: strong links ${cellName(o1)}=${cellName(
              e1,
            )} and ${cellName(e2)}=${cellName(o2)} (weak link ${cellName(e1)}–${cellName(
              e2,
            )}) → eliminate ${d} from ${targets.map(cellName).join(', ')}.`,
          });
        }
      }
    }
  }
  return null;
}

export const skyscraper: Technique = (g) => findChain(g, 'skyscraper');
export const twoStringKite: Technique = (g) => findChain(g, '2-string-kite');
export const turbotFish: Technique = (g) => findChain(g, 'turbot-fish');

/**
 * Empty Rectangle — a Turbot Fish whose box end is a whole row-and-column
 * cross rather than a single cell.
 *
 * In some box, every candidate d lies in row r or column c of that box (the
 * rest of the box — the "empty rectangle" — has none), with at least one on
 * each arm so it isn't just a pointing pair. Then "d in this box" means "d in
 * row r or d in column c". Take a strong link on d in a column c2 outside the
 * box, with one end p in row r and the other end q in row r2 outside the box's
 * rows. The cell t = (r2, c) can't be d: if it were, q (same row) isn't, so p
 * is — and p clears row r of the box while t clears column c, leaving the box
 * no d at all. The same holds with rows and columns swapped.
 */
export const emptyRectangle: Technique = (grid: Grid): Step | null => {
  const hasD = (c: CellIndex, d: Digit) =>
    grid.placed[c] === 0 && hasCand(grid.candidates[c]!, d);

  for (let d = 1 as Digit; d <= 9; d++) {
    const links = strongLinks(grid, d).filter((l) => l.kind !== 'box');
    for (let b = 0; b < 9; b++) {
      const r0 = Math.floor(b / 3) * 3;
      const c0 = (b % 3) * 3;
      const inBox: CellIndex[] = [];
      for (let r = r0; r < r0 + 3; r++)
        for (let c = c0; c < c0 + 3; c++) if (hasD(r * 9 + c, d)) inBox.push(r * 9 + c);
      if (inBox.length < 2) continue;

      for (let r = r0; r < r0 + 3; r++) {
        for (let c = c0; c < c0 + 3; c++) {
          if (!inBox.every((x) => rowOf(x) === r || colOf(x) === c)) continue;
          // One candidate on each arm, off the crossing cell — otherwise every d
          // sits in one line and it's a pointing pair, not a rectangle.
          if (!inBox.some((x) => rowOf(x) === r && colOf(x) !== c)) continue;
          if (!inBox.some((x) => colOf(x) === c && rowOf(x) !== r)) continue;

          for (const link of links) {
            for (const [p, q] of [
              [link.a, link.b],
              [link.b, link.a],
            ] as const) {
              let target: CellIndex;
              if (link.kind === 'col') {
                // p on the cross's row, q's row outside the box: t = (row q, col c).
                if (rowOf(p) !== r || boxOf(p) === b) continue;
                if (Math.floor(rowOf(q) / 3) === Math.floor(r0 / 3)) continue;
                target = rowOf(q) * 9 + c;
              } else {
                // p on the cross's column, q's column outside the box: t = (row r, col q).
                if (colOf(p) !== c || boxOf(p) === b) continue;
                if (Math.floor(colOf(q) / 3) === Math.floor(c0 / 3)) continue;
                target = r * 9 + colOf(q);
              }
              if (!hasD(target, d) || target === p || target === q) continue;

              const line =
                link.kind === 'col' ? `column ${colOf(p) + 1}` : `row ${rowOf(p) + 1}`;
              return makeStep({
                technique: 'empty-rectangle',
                eliminations: [{ cell: target, digit: d }],
                highlights: [
                  { role: 'base', cells: inBox, digits: [d] },
                  { role: 'related', cells: [p, q], digits: [d] },
                  { role: 'elimination', cells: [target], digits: [d] },
                ],
                description: `Empty Rectangle on ${d} in box ${b + 1}: every ${d} in the box is in row ${
                  r + 1
                } or column ${c + 1}; strong link ${cellName(p)}=${cellName(
                  q,
                )} in ${line} → eliminate ${d} from ${cellName(target)}.`,
              });
            }
          }
        }
      }
    }
  }
  return null;
};
