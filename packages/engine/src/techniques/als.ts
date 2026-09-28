/**
 * ALS-XZ — the Almost Locked Set doubly/singly-linked rule.
 *
 * An Almost Locked Set (ALS) is a set of N cells inside a single unit whose
 * combined candidates number exactly N+1 (a bivalue cell is the N=1 case). If
 * any one of its candidates is removed, it becomes a locked set (N cells, N
 * candidates), forcing all of them.
 *
 * ALS-XZ: take two ALSs A and B with disjoint cells that share candidates.
 *  - X is a "restricted common candidate" (RCC): a shared digit whose cells in A
 *    all see every X-cell in B, so X can be placed in at most one of the two
 *    ALSs.
 *  - Given a valid RCC X, any OTHER shared candidate Z is confined to A ∪ B:
 *    whichever ALS does not take X becomes locked and must supply Z. Therefore Z
 *    can be eliminated from any cell outside A ∪ B that sees every Z-cell in both
 *    A and B.
 *
 * ALS enumeration is bounded by `MAX_ALS` cells to stay tractable; this is the
 * last technique the solver tries, so it only runs when everything simpler is
 * stuck. Elimination-only.
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
import { UNITS, commonPeers, sees } from '../units.js';
import { makeStep, type Elimination, type Step, type Technique } from '../step.js';
import { combinations } from './util.js';

/** Largest ALS (in cells) to enumerate. 4 covers the common ALS-XZ patterns. */
const MAX_ALS = 4;

export interface Als {
  readonly cells: readonly CellIndex[];
  readonly mask: number; // union of candidates (popcount === cells.length + 1)
}

/** All ALSs (size 1..maxSize) across every unit. */
export function enumerateAls(grid: Grid, maxSize = MAX_ALS): Als[] {
  const out: Als[] = [];
  const seen = new Set<string>(); // dedupe identical cell-sets from overlapping units
  for (const unit of UNITS) {
    const empties = unit.cells.filter((c) => grid.placed[c] === 0);
    for (let size = 1; size <= Math.min(maxSize, empties.length); size++) {
      for (const combo of combinations(empties.length, size)) {
        const cells = combo.map((i) => empties[i]!);
        let mask = 0;
        for (const c of cells) mask |= grid.candidates[c]!;
        if (candCount(mask) !== size + 1) continue;
        const key = [...cells].sort((a, b) => a - b).join(',');
        if (seen.has(key)) continue;
        seen.add(key);
        out.push({ cells, mask });
      }
    }
  }
  return out;
}

/** Cells of an ALS that contain digit d. */
function cellsWith(grid: Grid, als: Als, d: Digit): CellIndex[] {
  return als.cells.filter((c) => hasCand(grid.candidates[c]!, d));
}

/** True when every cell in `xs` sees every cell in `ys`. */
function allSee(xs: CellIndex[], ys: CellIndex[]): boolean {
  const common = commonPeers(ys);
  const set = new Set(common);
  return xs.every((x) => set.has(x));
}

export const alsXz: Technique = (grid: Grid): Step | null => {
  const list = enumerateAls(grid);

  for (let i = 0; i < list.length; i++) {
    for (let j = i + 1; j < list.length; j++) {
      const a = list[i]!;
      const b = list[j]!;
      // Cells must be disjoint.
      if (a.cells.some((c) => b.cells.includes(c))) continue;

      const common = a.mask & b.mask;
      if (candCount(common) < 2) continue; // need an RCC and a separate Z
      const shared = candList(common);

      for (const x of shared) {
        const ax = cellsWith(grid, a, x);
        const bx = cellsWith(grid, b, x);
        if (ax.length === 0 || bx.length === 0) continue;
        if (!allSee(ax, bx)) continue; // X is a restricted common candidate

        for (const z of shared) {
          if (z === x) continue;
          const zCells = [...cellsWith(grid, a, z), ...cellsWith(grid, b, z)];
          if (zCells.length === 0) continue;

          const inPattern = new Set<CellIndex>([...a.cells, ...b.cells]);
          const targets = commonPeers(zCells).filter(
            (c) =>
              !inPattern.has(c) &&
              grid.placed[c] === 0 &&
              hasCand(grid.candidates[c]!, z),
          );
          if (targets.length === 0) continue;

          const eliminations: Elimination[] = targets.map((cell) => ({ cell, digit: z }));
          return makeStep({
            technique: 'als-xz',
            eliminations,
            highlights: [
              { role: 'base', cells: [...a.cells], digits: candList(a.mask) },
              { role: 'cover', cells: [...b.cells], digits: candList(b.mask) },
              { role: 'related', cells: [...ax, ...bx], digits: [x] },
              { role: 'elimination', cells: targets, digits: [z] },
            ],
            description: `ALS-XZ: ALS {${a.cells.map(cellName).join(',')}} and {${b.cells
              .map(cellName)
              .join(
                ',',
              )}} share restricted common ${x}; ${z} is locked to them → eliminate ${z} from ${targets
              .map(cellName)
              .join(', ')}.`,
          });
        }
      }
    }
  }
  return null;
};

/**
 * Death Blossom — a "stem" cell with one ALS "petal" per candidate.
 *
 * For each candidate d of the stem there is an ALS (not containing the stem)
 * in which every cell holding d sees the stem, and the petals share no cells.
 * Whichever digit the stem turns out to be, the matching petal loses it and
 * locks onto its other digits. If every petal holds some digit z the stem
 * doesn't, z is therefore in one of the petals whatever happens, and it
 * leaves every cell that sees all the petals' z cells.
 */
export const deathBlossom: Technique = (grid: Grid): Step | null => {
  const list = enumerateAls(grid).filter((a) => a.cells.length >= 2);

  for (let stem = 0; stem < 81; stem++) {
    if (grid.placed[stem] !== 0) continue;
    const stemDigits = candList(grid.candidates[stem]!);
    if (stemDigits.length < 2 || stemDigits.length > 3) continue;

    // Petals available for each stem digit.
    const options = stemDigits.map((d) =>
      list.filter(
        (a) =>
          !a.cells.includes(stem) &&
          (a.mask & (1 << (d - 1))) !== 0 &&
          cellsWith(grid, a, d).every((c) => sees(c, stem)),
      ),
    );
    if (options.some((o) => o.length === 0)) continue;

    const chosen: Als[] = [];
    const tryPetals = (i: number): Step | null => {
      if (i === stemDigits.length) return bloom(grid, stem, stemDigits, chosen);
      for (const petal of options[i]!) {
        if (chosen.some((p) => p.cells.some((c) => petal.cells.includes(c)))) continue;
        chosen.push(petal);
        const step = tryPetals(i + 1);
        chosen.pop();
        if (step) return step;
      }
      return null;
    };
    const step = tryPetals(0);
    if (step) return step;
  }
  return null;
};

function bloom(
  grid: Grid,
  stem: CellIndex,
  stemDigits: Digit[],
  petals: Als[],
): Step | null {
  const shared = petals.reduce((m, p) => m & p.mask, 0x1ff) & ~grid.candidates[stem]!;
  for (const z of candList(shared)) {
    const zCells = petals.flatMap((p) => cellsWith(grid, p, z));
    const inPattern = new Set([stem, ...petals.flatMap((p) => p.cells)]);
    const targets = commonPeers(zCells).filter(
      (c) => !inPattern.has(c) && grid.placed[c] === 0 && hasCand(grid.candidates[c]!, z),
    );
    if (targets.length === 0) continue;
    const eliminations: Elimination[] = targets.map((cell) => ({ cell, digit: z }));
    return makeStep({
      technique: 'death-blossom',
      eliminations,
      highlights: [
        { role: 'base', cells: [stem], digits: stemDigits },
        ...petals.map((p, i) => ({
          role: 'cover' as const,
          cells: [...p.cells],
          digits: [stemDigits[i]!, z],
        })),
        { role: 'elimination', cells: targets, digits: [z] },
      ],
      description: `Death Blossom: stem ${cellName(stem)} (${stemDigits.join(
        '/',
      )}) with petals ${petals
        .map((p, i) => `${stemDigits[i]}: ${p.cells.map(cellName).join('/')}`)
        .join('; ')} → ${z} is in a petal either way → eliminate ${z} from ${targets
        .map(cellName)
        .join(', ')}.`,
    });
  }
  return null;
}
