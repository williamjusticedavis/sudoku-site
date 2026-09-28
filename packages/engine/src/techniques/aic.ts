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
 * Two extensions widen the links available. A grouped node is a digit in the
 * two or three cells where a box meets a row or column ("it's in one of
 * these"). An Almost Locked Set — n cells in a unit holding n+1 digits — gives
 * a strong link between any two of its digits: rule one out of the set and the
 * other n lock in, so each of them is in it somewhere. Chains using an ALS are
 * reported as ALS Chain.
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
import { UNITS, commonPeers, sees } from '../units.js';
import { enumerateAls } from './als.js';
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

/**
 * A chain node: a digit in one cell, or — in grouped chains — a digit in the
 * two or three cells where a box meets a row or column, read as "the digit is
 * in one of these cells".
 */
interface Node {
  readonly cells: readonly CellIndex[];
  readonly digit: Digit;
}

const label = (n: Node) => `(${n.digit})${n.cells.map(cellName).join('/')}`;

interface Graph {
  nodes: Node[];
  strong: number[][];
  weak: number[][];
}

interface GraphOptions {
  singleDigit: boolean;
  grouped: boolean;
  /** Largest Almost Locked Set used as a node, or 0 for none. */
  als: number;
}

function buildGraph(grid: Grid, opts: GraphOptions): Graph {
  const holds = (c: CellIndex, d: Digit) =>
    grid.placed[c] === 0 && hasCand(grid.candidates[c]!, d);
  const nodes: Node[] = [];
  const ids = new Map<string, number>();
  const nodeId = (cells: CellIndex[], digit: Digit): number => {
    const key = `${digit}:${[...cells].sort((a, b) => a - b).join(',')}`;
    let id = ids.get(key);
    if (id === undefined) {
      id = nodes.length;
      ids.set(key, id);
      nodes.push({ cells, digit });
    }
    return id;
  };
  for (let c = 0; c < 81; c++) {
    for (let d = 1 as Digit; d <= 9; d++) if (holds(c, d)) nodeId([c], d);
  }
  if (opts.grouped) {
    for (const box of UNITS.filter((u) => u.kind === 'box')) {
      for (const line of UNITS.filter((u) => u.kind !== 'box')) {
        const cross = box.cells.filter((c) => line.cells.includes(c));
        if (cross.length === 0) continue;
        for (let d = 1 as Digit; d <= 9; d++) {
          const cs = cross.filter((c) => holds(c, d));
          if (cs.length >= 2) nodeId(cs, d);
        }
      }
    }
  }
  // An ALS (n cells, n+1 digits) with one digit ruled out locks onto the rest,
  // so "x is somewhere in it" and "z is somewhere in it" are strongly linked.
  const alsLinks: [number, number][] = [];
  if (opts.als > 1) {
    for (const set of enumerateAls(grid, opts.als)) {
      if (set.cells.length < 2) continue;
      const groups = candList(set.mask).map((d) =>
        nodeId(
          set.cells.filter((c) => hasCand(grid.candidates[c]!, d)),
          d,
        ),
      );
      for (let x = 0; x < groups.length; x++)
        for (let y = x + 1; y < groups.length; y++)
          alsLinks.push([groups[x]!, groups[y]!]);
    }
  }
  const single = (c: CellIndex, d: Digit) => ids.get(`${d}:${c}`)!;

  const strong: number[][] = nodes.map(() => []);
  const weak: number[][] = nodes.map(() => []);
  for (const [a, b] of alsLinks) {
    if (!strong[a]!.includes(b)) strong[a]!.push(b);
    if (!strong[b]!.includes(a)) strong[b]!.push(a);
  }
  const link = (adj: number[][], a: number, b: number) => {
    if (!adj[a]!.includes(b)) adj[a]!.push(b);
    if (!adj[b]!.includes(a)) adj[b]!.push(a);
  };
  const within = (n: Node, cells: readonly CellIndex[]) =>
    n.cells.every((c) => cells.includes(c));
  const disjoint = (a: Node, b: Node) => a.cells.every((c) => !b.cells.includes(c));

  // Strong: two disjoint nodes that together hold every spot for the digit in a unit.
  const byDigit = Array.from({ length: 10 }, () => [] as number[]);
  nodes.forEach((n, i) => byDigit[n.digit]!.push(i));
  for (const unit of UNITS) {
    for (let d = 1 as Digit; d <= 9; d++) {
      const spots = unit.cells.filter((c) => holds(c, d));
      if (spots.length < 2) continue;
      const inUnit = byDigit[d]!.filter((i) => within(nodes[i]!, unit.cells));
      for (let x = 0; x < inUnit.length; x++) {
        for (let y = x + 1; y < inUnit.length; y++) {
          const [a, b] = [nodes[inUnit[x]!]!, nodes[inUnit[y]!]!];
          if (!disjoint(a, b) || a.cells.length + b.cells.length !== spots.length)
            continue;
          link(strong, inUnit[x]!, inUnit[y]!);
        }
      }
    }
  }
  // Weak: disjoint same-digit nodes whose cells all see each other.
  for (let d = 1; d <= 9; d++) {
    const same = byDigit[d]!;
    for (let x = 0; x < same.length; x++) {
      for (let y = x + 1; y < same.length; y++) {
        const [a, b] = [nodes[same[x]!]!, nodes[same[y]!]!];
        if (!disjoint(a, b)) continue;
        if (a.cells.every((p) => b.cells.every((q) => sees(p, q))))
          link(weak, same[x]!, same[y]!);
      }
    }
  }
  if (!opts.singleDigit) {
    // In a cell: two candidates are weakly linked, and strongly if they're all it has.
    for (let c = 0; c < 81; c++) {
      if (grid.placed[c] !== 0) continue;
      const own = candList(grid.candidates[c]!).map((d) => single(c, d));
      for (let x = 0; x < own.length; x++) {
        for (let y = x + 1; y < own.length; y++) {
          link(weak, own[x]!, own[y]!);
          if (own.length === 2) link(strong, own[x]!, own[y]!);
        }
      }
    }
  }
  return { nodes, strong, weak };
}

/** Would candidate (c, e) being true make node `n` false? */
function weakTo(c: CellIndex, e: Digit, n: Node): boolean {
  if (n.cells.length === 1 && n.cells[0] === c) return n.digit !== e;
  return n.digit === e && !n.cells.includes(c) && n.cells.every((p) => sees(p, c));
}

interface Found {
  chain: number[];
  placements: Placement[];
  eliminations: Elimination[];
}

/**
 * What "`a` or `z` is true" removes: every candidate that would make both
 * ends false. When the chain comes back to its own single-cell start, that
 * candidate is true.
 */
function conclude(
  grid: Grid,
  a: Node,
  z: Node,
  same: boolean,
): Omit<Found, 'chain'> | null {
  if (same) {
    if (a.cells.length !== 1) return null;
    return { placements: [{ cell: a.cells[0]!, digit: a.digit }], eliminations: [] };
  }
  const around =
    a.cells.length === 1 ? [a.cells[0]!, ...commonPeers(a.cells)] : commonPeers(a.cells);
  const eliminations: Elimination[] = [];
  for (const c of around) {
    if (grid.placed[c] !== 0) continue;
    for (const e of candList(grid.candidates[c]!)) {
      if (weakTo(c, e, a) && weakTo(c, e, z)) eliminations.push({ cell: c, digit: e });
    }
  }
  return eliminations.length > 0 ? { placements: [], eliminations } : null;
}

/**
 * Shortest productive chain, or null. Breadth-first from every node, over
 * states (node, true?): a node is reached true across a strong link and false
 * across a weak one, and the start is assumed false.
 */
function search(grid: Grid, g: Graph): Found | null {
  let best: Found | null = null;
  const parent = new Int32Array(g.nodes.length * 2);

  for (let start = 0; start < g.nodes.length; start++) {
    if (g.strong[start]!.length === 0) continue;
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
        for (const m of (isTrue ? g.weak : g.strong)[s >> 1]!) {
          const t = m * 2 + (isTrue ? 0 : 1);
          if (parent[t] !== -1) continue;
          parent[t] = s;
          next.push(t);
          if (isTrue || n < 3) continue;
          const got = conclude(grid, g.nodes[start]!, g.nodes[m]!, m === start);
          if (!got) continue;
          const chain: number[] = [];
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

function toStep(g: Graph, found: Found): Step {
  const chain = found.chain.map((i) => g.nodes[i]!);
  const { placements, eliminations } = found;
  const oneDigit = chain.every((n) => n.digit === chain[0]!.digit);
  const grouped = chain.some((n) => n.cells.length > 1);
  // A strong link between two digits that isn't inside one cell can only come
  // from an Almost Locked Set.
  const viaAls = chain.some((n, i) => {
    const m = chain[i + 1];
    if (!m || i % 2 === 1 || m.digit === n.digit) return false;
    return !(n.cells.length === 1 && m.cells.length === 1 && n.cells[0] === m.cells[0]);
  });
  const technique = viaAls ? 'als-chain' : oneDigit ? 'x-chain' : 'aic';
  const nodes: HighlightGroup[] = chain.map((n, i) => ({
    role: i === 0 || i === chain.length - 1 ? 'base' : 'related',
    cells: [...n.cells],
    digits: [n.digit],
  }));
  const notation = chain
    .map((n, i) => (i === 0 ? label(n) : `${i % 2 === 1 ? ' = ' : ' - '}${label(n)}`))
    .join('');
  const name = viaAls
    ? 'ALS Chain'
    : `${grouped ? 'Grouped ' : ''}${oneDigit ? `X-Chain on ${chain[0]!.digit}` : 'AIC'}`;
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

const chainTechnique =
  (opts: GraphOptions): Technique =>
  (grid) => {
    const g = buildGraph(grid, opts);
    const found = search(grid, g);
    return found ? toStep(g, found) : null;
  };

export const xChain = chainTechnique({ singleDigit: true, grouped: false, als: 0 });
export const aic = chainTechnique({ singleDigit: false, grouped: false, als: 0 });
/** Runs only once plain chains are exhausted, so a chain through a box-line
 * group is reported only where no ungrouped chain would do. */
export const groupedAic = chainTechnique({ singleDigit: false, grouped: true, als: 0 });
export const alsAic = chainTechnique({ singleDigit: false, grouped: true, als: 3 });
