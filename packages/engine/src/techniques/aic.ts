/**
 * Alternating Inference Chains — the general form behind every chain technique.
 *
 * Nodes are single candidates (a digit in a cell). Two kinds of link join them:
 *  - strong: at least one end is true — the digit has only two spots in a unit
 *    (a conjugate pair), or the cell has only two candidates;
 *  - weak: at most one end is true — the same digit in two cells that see each
 *    other, or two digits in the same cell.
 * A chain alternates strong, weak, strong, …, starting and ending on a strong
 * link. Read from one end: if the first candidate is false, the strong link
 * makes the next true, the weak link makes the one after false, and so on, so
 * the last candidate is true. Either way round, one of the two ends is true.
 * What that removes:
 *  - ends are the same digit in two cells → that digit leaves every cell seeing both;
 *  - ends are two digits in one cell → the cell is one of them, the rest go;
 *  - ends are different digits in cells that see each other → each end's cell
 *    loses the other end's digit;
 *  - the chain comes back to its own start → that candidate is true.
 *
 * X-Chain is the one-digit case: only conjugate pairs for strong links and
 * same-digit sightings for weak ones. It gets its own technique (and runs
 * first) because a single-digit chain is far easier to follow. The search is
 * breadth-first, so the chain reported is always a shortest one that removes
 * something.
 */

import {
  candList,
  cellName,
  hasCand,
  type CellIndex,
  type Digit,
  type Grid,
} from '../grid.js';
import { PEERS, UNITS, commonPeers, sees } from '../units.js';
import {
  makeStep,
  type Elimination,
  type HighlightGroup,
  type Placement,
  type Step,
  type Technique,
} from '../step.js';

/** Longest chain searched, in links. */
const MAX_LINKS = 13;

type Node = number; // cell * 9 + (digit - 1)
const cellOf = (n: Node): CellIndex => Math.floor(n / 9);
const digitOf = (n: Node): Digit => ((n % 9) + 1) as Digit;
const nodeOf = (c: CellIndex, d: Digit): Node => c * 9 + d - 1;
const label = (n: Node) => `(${digitOf(n)})${cellName(cellOf(n))}`;

interface Links {
  strong: Node[][];
  weak: Node[][];
}

function buildLinks(grid: Grid, singleDigit: boolean): Links {
  const strong: Node[][] = Array.from({ length: 729 }, () => []);
  const weak: Node[][] = Array.from({ length: 729 }, () => []);
  const holds = (c: CellIndex, d: Digit) =>
    grid.placed[c] === 0 && hasCand(grid.candidates[c]!, d);

  for (const unit of UNITS) {
    for (let d = 1 as Digit; d <= 9; d++) {
      const spots = unit.cells.filter((c) => holds(c, d));
      if (spots.length !== 2) continue;
      const [a, b] = [nodeOf(spots[0]!, d), nodeOf(spots[1]!, d)];
      if (!strong[a]!.includes(b)) strong[a]!.push(b);
      if (!strong[b]!.includes(a)) strong[b]!.push(a);
    }
  }
  for (let c = 0; c < 81; c++) {
    if (grid.placed[c] !== 0) continue;
    const ds = candList(grid.candidates[c]!);
    if (!singleDigit && ds.length === 2) {
      strong[nodeOf(c, ds[0]!)]!.push(nodeOf(c, ds[1]!));
      strong[nodeOf(c, ds[1]!)]!.push(nodeOf(c, ds[0]!));
    }
    for (const d of ds) {
      const n = nodeOf(c, d);
      for (const p of PEERS[c]!) if (holds(p, d)) weak[n]!.push(nodeOf(p, d));
      if (!singleDigit) for (const e of ds) if (e !== d) weak[n]!.push(nodeOf(c, e));
    }
  }
  return { strong, weak };
}

interface Found {
  chain: Node[];
  placements: Placement[];
  eliminations: Elimination[];
}

/** What "`a` or `z` is true" removes from the grid. */
function conclude(grid: Grid, a: Node, z: Node): Omit<Found, 'chain'> | null {
  if (a === z) {
    return { placements: [{ cell: cellOf(a), digit: digitOf(a) }], eliminations: [] };
  }
  const [ca, da, cz, dz] = [cellOf(a), digitOf(a), cellOf(z), digitOf(z)];
  const has = (c: CellIndex, d: Digit) =>
    grid.placed[c] === 0 && hasCand(grid.candidates[c]!, d);
  let eliminations: Elimination[] = [];
  if (da === dz) {
    eliminations = commonPeers([ca, cz])
      .filter((c) => has(c, da))
      .map((cell) => ({ cell, digit: da }));
  } else if (ca === cz) {
    eliminations = candList(grid.candidates[ca]!)
      .filter((d) => d !== da && d !== dz)
      .map((digit) => ({ cell: ca, digit }));
  } else if (sees(ca, cz)) {
    if (has(ca, dz)) eliminations.push({ cell: ca, digit: dz });
    if (has(cz, da)) eliminations.push({ cell: cz, digit: da });
  }
  return eliminations.length > 0 ? { placements: [], eliminations } : null;
}

/**
 * Shortest productive chain, or null. Breadth-first from every candidate,
 * over states (node, true?): a node is reached true across a strong link and
 * false across a weak one, and the start is assumed false.
 */
function search(grid: Grid, links: Links): Found | null {
  let best: Found | null = null;
  const parent = new Int32Array(729 * 2);

  for (let start = 0; start < 729; start++) {
    const c0 = cellOf(start);
    if (grid.placed[c0] !== 0 || !hasCand(grid.candidates[c0]!, digitOf(start))) continue;
    if (links.strong[start]!.length === 0) continue;
    // Only a strictly shorter chain can replace the best so far.
    const limit = best ? best.chain.length - 2 : MAX_LINKS;

    parent.fill(-1);
    const s0 = start * 2; // state = node * 2 + (1 when true)
    parent[s0] = s0;
    let frontier = [s0];
    let found: Found | null = null;
    for (let n = 1; n <= limit && frontier.length > 0 && !found; n++) {
      const next: number[] = [];
      for (const s of frontier) {
        const isTrue = (s & 1) === 1;
        for (const m of (isTrue ? links.weak : links.strong)[s >> 1]!) {
          const t = m * 2 + (isTrue ? 0 : 1);
          if (parent[t] !== -1) continue;
          parent[t] = s;
          next.push(t);
          if (isTrue || n < 3) continue;
          const got = conclude(grid, start, m);
          if (!got) continue;
          const chain: Node[] = [];
          for (let x = t; ; x = parent[x]!) {
            chain.push(x >> 1);
            if (x === s0) break;
          }
          found = { chain: chain.reverse(), ...got };
          break;
        }
        if (found) break;
      }
      frontier = next;
    }
    if (found) best = found;
  }
  return best;
}

function toStep(found: Found, technique: 'x-chain' | 'aic'): Step {
  const { chain, placements, eliminations } = found;
  const nodes: HighlightGroup[] = chain.map((n, i) => ({
    role: i === 0 || i === chain.length - 1 ? 'base' : 'related',
    cells: [cellOf(n)],
    digits: [digitOf(n)],
  }));
  const notation = chain
    .map((n, i) => (i === 0 ? label(n) : `${i % 2 === 1 ? ' = ' : ' - '}${label(n)}`))
    .join('');
  const name = technique === 'x-chain' ? `X-Chain on ${digitOf(chain[0]!)}` : 'AIC';
  const result =
    placements.length > 0
      ? `${cellName(placements[0]!.cell)} must be ${placements[0]!.digit}`
      : `eliminate ${eliminations.map((e) => `${e.digit} from ${cellName(e.cell)}`).join(', ')}`;
  return makeStep({
    technique,
    placements,
    eliminations,
    highlights: [
      ...nodes,
      ...(placements.length > 0
        ? [
            {
              role: 'placement' as const,
              cells: [placements[0]!.cell],
              digits: [placements[0]!.digit],
            },
          ]
        : [
            {
              role: 'elimination' as const,
              cells: [...new Set(eliminations.map((e) => e.cell))],
              digits: [...new Set(eliminations.map((e) => e.digit))],
            },
          ]),
    ],
    description: `${name}: ${notation} → ${result}.`,
  });
}

export const xChain: Technique = (grid: Grid): Step | null => {
  const found = search(grid, buildLinks(grid, true));
  return found ? toStep(found, 'x-chain') : null;
};

export const aic: Technique = (grid: Grid): Step | null => {
  const found = search(grid, buildLinks(grid, false));
  if (!found) return null;
  const oneDigit = found.chain.every((n) => digitOf(n) === digitOf(found.chain[0]!));
  return toStep(found, oneDigit ? 'x-chain' : 'aic');
};
