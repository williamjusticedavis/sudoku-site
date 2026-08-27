/**
 * Turn one engine `Step` into a progressive, Oakever-style walkthrough: a short
 * sequence of explanatory beats that each reveal a bit more of the pattern's
 * highlighted cells, building up to the elimination/placement and ending on the
 * "Apply" beat.
 *
 * Each beat becomes one `HintStep` in a puzzle's `stepData[]`:
 *  - `explanation`  — the beat's narration (engine cell names / digits filled in)
 *  - `highlights`   — the CUMULATIVE subset of the final step's highlight groups
 *                     revealed so far
 *  - `placements` / `eliminations` — empty until the final beat, which carries
 *                     the real ones so the last button reads "Apply"
 *
 * Narration is templated per technique-role-family, not hand-written per puzzle
 * (7 shared families cover 24 of 29 tactics; the rest get a small bespoke
 * template). The cells and digits in every beat come straight from the engine
 * Step — only the sentence scaffolding is templated.
 */
import { cellName, type Step } from '@sudoku/engine';
import type { HintStep } from './index.js';

type Role = 'base' | 'cover' | 'fin' | 'placement' | 'elimination' | 'related';

interface Beat {
  text: string;
  /** Highlight-group roles visible by the end of this beat (cumulative). The
   * cells come from the engine Step's groups of those roles. */
  roles: Role[];
  /** Explicit highlight groups for this beat, overriding `roles`. Use when a
   * template needs to re-shape the Step's cells (e.g. split one group in two). */
  groups?: { role: string; cells: number[]; digits?: number[] }[];
}

// --- geometry / formatting helpers ----------------------------------------
const rowOf = (i: number) => Math.floor(i / 9);
const colOf = (i: number) => i % 9;
const boxOf = (i: number) => Math.floor(rowOf(i) / 3) * 3 + Math.floor(colOf(i) / 3);

/** "row 3" / "column 7" / "box 5" if the cells share one; else a fallback. */
function unitLabel(cells: readonly number[], fallback = 'that unit'): string {
  if (cells.length === 0) return fallback;
  const [f] = cells;
  if (cells.every((c) => rowOf(c) === rowOf(f!))) return `row ${rowOf(f!) + 1}`;
  if (cells.every((c) => colOf(c) === colOf(f!))) return `column ${colOf(f!) + 1}`;
  if (cells.every((c) => boxOf(c) === boxOf(f!))) return `box ${boxOf(f!) + 1}`;
  return fallback;
}

function joinWith(items: string[], conj: 'and' | 'or'): string {
  if (items.length === 0) return '';
  if (items.length === 1) return items[0]!;
  if (items.length === 2) return `${items[0]} ${conj} ${items[1]}`;
  return `${items.slice(0, -1).join(', ')} ${conj} ${items[items.length - 1]}`;
}
const cells = (cs: readonly number[]) => joinWith(cs.map(cellName), 'and');
/** Digit list joined with "and" — for sets that are all used (subsets, UR). */
const digits = (ds: readonly number[]) => joinWith(ds.map(String), 'and');
/** Digit list joined with "or" — for the candidates of a single cell. */
const digitsOr = (ds: readonly number[]) => joinWith(ds.map(String), 'or');
/** "a" / "an" for reading a digit aloud (only 8 takes "an"). */
const aDigit = (d: number) => (d === 8 ? 'an 8' : `a ${d}`);

function group(step: Step, role: Role) {
  return step.highlights.find((g) => g.role === role);
}
const groupCells = (step: Step, role: Role) => group(step, role)?.cells ?? [];
const groupDigits = (step: Step, role: Role) => group(step, role)?.digits ?? [];

/** The one digit an elimination-only step removes (or the first, if several). */
function elimDigit(step: Step): number {
  return step.eliminations[0]?.digit ?? groupDigits(step, 'elimination')[0] ?? 0;
}
const elimCells = (step: Step) => [...new Set(step.eliminations.map((e) => e.cell))];

// --- templates ----------------------------------------------------------

/** Singles: a digit has exactly one legal home in a unit. */
function placeTemplate(step: Step): Beat[] {
  const spot = step.placements[0]!;
  const d = spot.digit;
  const p = cellName(spot.cell);
  const rel = groupCells(step, 'related');
  const unit = unitLabel([spot.cell, ...rel]);

  const beats: Beat[] = [];
  if (rel.length > 0) {
    beats.push({
      text: `Look at ${unit}. Every empty cell in it except ${p} is already kept from being ${d} by a ${d} it can see.`,
      roles: ['related'],
    });
    beats.push({
      text: `That leaves ${p} as the only cell in ${unit} where ${d} can still go.`,
      roles: ['related', 'placement'],
    });
  } else {
    beats.push({
      text: `${p} has only one candidate left — every other digit is used by a cell it can see.`,
      roles: [],
    });
    beats.push({
      text: `So ${p} can only be ${d}.`,
      roles: ['placement'],
    });
  }
  beats.push({
    text: `Place ${d} in ${p}.`,
    roles: ['related', 'placement'],
  });
  return beats;
}

/** BUG+1: uniqueness forces the one trivalue cell. */
function bugTemplate(step: Step): Beat[] {
  const spot = step.placements[0]!;
  const d = spot.digit;
  const p = cellName(spot.cell);
  return [
    {
      text: `Every unsolved cell now has exactly two candidates — except ${p}, which still has three.`,
      roles: [],
    },
    {
      text: `If ${p} were one of its two "pair" digits, every remaining cell would be bivalue and the puzzle would have more than one solution. A valid puzzle can't allow that.`,
      roles: ['placement'],
    },
    {
      text: `So ${p} must take its odd third candidate. Place ${d} in ${p}.`,
      roles: ['placement'],
    },
  ];
}

/** Pointing / Claiming: a digit locked to a box∩line, cleared from the rest.
 * Which one is decided by the slug, not geometry (a 2-cell base shares both a
 * box and a line, so geometry alone is ambiguous). */
function lockedTemplate(step: Step, slug: string): Beat[] {
  const base = groupCells(step, 'base');
  const d = groupDigits(step, 'base')[0] ?? elimDigit(step);
  const elim = elimCells(step);
  const boxLabel = `box ${boxOf(base[0]!) + 1}`;

  if (slug === 'pointing') {
    // base sits in a box, confined to one line; clear that line.
    const lineLabel = unitLabel([...base, ...elim]);
    return [
      {
        text: `In ${boxLabel}, ${d} can only go in ${cells(base)} — and they all lie in ${lineLabel}.`,
        roles: ['base'],
      },
      {
        text: `Wherever ${d} lands in ${boxLabel}, it's somewhere in ${lineLabel}. So ${d} can't be anywhere else in ${lineLabel}.`,
        roles: ['base', 'elimination'],
      },
      { text: `Remove ${d} from ${cells(elim)}.`, roles: ['base', 'elimination'] },
    ];
  }

  // claiming: base sits in a line, confined to one box; clear the rest of the box.
  const lineLabel = unitLabel(base);
  return [
    {
      text: `In ${lineLabel}, ${d} can only go in ${cells(base)} — and they all sit in ${boxLabel}.`,
      roles: ['base'],
    },
    {
      text: `Wherever ${d} lands in ${lineLabel}, it's inside ${boxLabel}. So ${d} can't be anywhere else in ${boxLabel}.`,
      roles: ['base', 'elimination'],
    },
    { text: `Remove ${d} from ${cells(elim)}.`, roles: ['base', 'elimination'] },
  ];
}

/** Naked pair/triple/quad: N cells share N candidates. */
function nakedSubsetTemplate(step: Step): Beat[] {
  const base = groupCells(step, 'base');
  const ds = groupDigits(step, 'base');
  const n = base.length;
  const word = n === 2 ? 'pair' : n === 3 ? 'triple' : 'quad';
  const elim = elimCells(step);
  return [
    {
      text: `${cells(base)} between them hold only the digits ${digits(ds)} — ${n} cells, ${n} candidates. That's a naked ${word}.`,
      roles: ['base'],
    },
    {
      text: `Those ${n} cells must use up ${digits(ds)} among themselves, in some order — nothing else fits.`,
      roles: ['base'],
    },
    {
      text: `So none of ${digits(ds)} can appear anywhere else in ${unitLabel([...base, ...elim])}.`,
      roles: ['base', 'elimination'],
    },
    {
      text: `Remove ${digits(ds)} from ${cells(elim)} wherever they appear.`,
      roles: ['base', 'elimination'],
    },
  ];
}

/** Hidden pair/triple/quad: N digits confined to N cells (no distinct elim
 * cells — the removals sit on the base cells and show as struck candidates). */
function hiddenSubsetTemplate(step: Step): Beat[] {
  const base = groupCells(step, 'base');
  const ds = groupDigits(step, 'base');
  const n = base.length;
  const word = n === 2 ? 'pair' : n === 3 ? 'triple' : 'quad';
  return [
    {
      text: `In ${unitLabel(base)}, the digits ${digits(ds)} can only go in these ${n} cells: ${cells(base)}. That's a hidden ${word}.`,
      roles: ['base'],
    },
    {
      text: `${n} digits with only ${n} possible homes — they're locked to those cells, one digit each.`,
      roles: ['base'],
    },
    {
      text: `So every other candidate in ${cells(base)} is impossible and can be struck out.`,
      roles: ['base'],
    },
  ];
}

/** Fish (X-Wing / Swordfish / Jellyfish), plain and finned. */
function fishTemplate(step: Step): Beat[] {
  const base = groupCells(step, 'base');
  const d = groupDigits(step, 'base')[0] ?? elimDigit(step);
  const fin = groupCells(step, 'fin');
  const elim = elimCells(step);

  // The fish is defined on whichever axis has fewer distinct lines; its size is
  // that count (2 = X-Wing, 3 = Swordfish, 4 = Jellyfish).
  const rowSet = new Set(base.map(rowOf));
  const colSet = new Set(base.map(colOf));
  const baseIsRows = rowSet.size <= colSet.size;
  const n = Math.min(rowSet.size, colSet.size);
  const bare = n === 2 ? 'X-Wing' : n === 3 ? 'Swordfish' : 'Jellyfish';
  const size = fin.length > 0 ? `finned ${bare}` : bare;
  const aSize = size === 'X-Wing' ? 'an X-Wing' : `a ${size}`;

  const baseKind = baseIsRows ? 'rows' : 'columns';
  const coverKind = baseIsRows ? 'columns' : 'rows';
  const baseNums = [...(baseIsRows ? rowSet : colSet)]
    .sort((a, b) => a - b)
    .map((v) => v + 1);
  const coverNums = [...(baseIsRows ? colSet : rowSet)]
    .sort((a, b) => a - b)
    .map((v) => v + 1);

  const beats: Beat[] = [
    {
      text: `Across ${baseKind} ${digits(baseNums)}, digit ${d} is pinned to just ${n} ${coverKind}: ${digits(coverNums)}. That's ${aSize} on ${d}.`,
      roles: ['base'],
    },
    {
      text: `Each of those ${baseKind} needs a ${d}, and they can only take it in ${coverKind} ${digits(coverNums)} — so those ${coverKind} are spoken for.`,
      roles: ['base'],
    },
  ];
  if (fin.length > 0) {
    beats.push({
      text: `There's one extra spot — the fin at ${cells(fin)} — where ${d} could also sit. That weakens the deduction: it only holds for cells that also see the fin.`,
      roles: ['base', 'fin'],
    });
    beats.push({
      text: `Any other cell in ${coverKind} ${digits(coverNums)} that also sees the fin still can't be ${d}.`,
      roles: ['base', 'fin', 'elimination'],
    });
    beats.push({
      text: `Remove ${d} from ${cells(elim)}.`,
      roles: ['base', 'fin', 'elimination'],
    });
  } else {
    beats.push({
      text: `Any other cell in ${coverKind} ${digits(coverNums)}, outside ${baseKind} ${digits(baseNums)}, therefore can't be ${d}.`,
      roles: ['base', 'elimination'],
    });
    beats.push({
      text: `Remove ${d} from ${cells(elim)}.`,
      roles: ['base', 'elimination'],
    });
  }
  return beats;
}

/** Single-digit chains: Skyscraper / 2-String Kite / Turbot Fish. */
function chainTemplate(step: Step): Beat[] {
  const b = groupCells(step, 'base');
  const r = groupCells(step, 'related');
  const d = groupDigits(step, 'base')[0] ?? elimDigit(step);
  const elim = elimCells(step);
  return [
    {
      text: `${cells(b)} are the two ends of a short single-digit chain on ${d} — linked so that at least one of them is ${d}.`,
      roles: ['base'],
    },
    {
      text: `${cells(r)} carry that link across the grid: whichever way it resolves, ${d} is forced into one end of the chain or the other.`,
      roles: ['base', 'related'],
    },
    {
      text: `Any cell that sees both ends must therefore see ${aDigit(d)} — so it can't be ${d} itself.`,
      roles: ['base', 'related', 'elimination'],
    },
    {
      text: `Remove ${d} from ${cells(elim)}.`,
      roles: ['base', 'related', 'elimination'],
    },
  ];
}

/** XY-Wing / XYZ-Wing: a pivot with two pincers. */
function wingPivotTemplate(step: Step): Beat[] {
  const pivot = groupCells(step, 'base');
  const pivotDs = groupDigits(step, 'base');
  const pincers = groupCells(step, 'related');
  const z = groupDigits(step, 'related')[0] ?? elimDigit(step);
  const elim = elimCells(step);
  const xyz = pivotDs.length === 3;
  return [
    {
      text: `${cells(pivot)} can only be ${digitsOr(pivotDs)} — the pivot of the wing.`,
      roles: ['base'],
    },
    {
      text: `Its pincers ${cells(pincers)} each share a digit with the pivot and both also hold ${z}. ${
        xyz
          ? `Whatever the pivot turns out to be, one of the pivot or a pincer is ${z}.`
          : `Whichever value the pivot takes, one pincer is forced to ${z}.`
      }`,
      roles: ['base', 'related'],
    },
    {
      text: `So any cell that sees ${
        xyz ? 'the pivot and both pincers' : 'both pincers'
      } can't be ${z}.`,
      roles: ['base', 'related', 'elimination'],
    },
    {
      text: `Remove ${z} from ${cells(elim)}.`,
      roles: ['base', 'related', 'elimination'],
    },
  ];
}

/** W-Wing: two cells with the same pair, bridged by a strong link. */
function wingPairTemplate(step: Step): Beat[] {
  const pair = groupCells(step, 'base');
  const pairDs = groupDigits(step, 'base');
  const link = groupCells(step, 'related');
  const linkDigit = groupDigits(step, 'related')[0];
  const y = elimDigit(step);
  const x = pairDs.find((v) => v !== y) ?? linkDigit ?? pairDs[0];
  const elim = elimCells(step);
  return [
    {
      text: `${cells(pair)} both hold only ${digitsOr(pairDs)}.`,
      roles: ['base'],
    },
    {
      text: `${cells(link)} are a strong link on ${x}, connecting the two. If neither of ${cells(pair)} is ${x}, the link forces both of them to be ${y}.`,
      roles: ['base', 'related'],
    },
    {
      text: `Either way, ${y} ends up in one of ${cells(pair)} — so any cell seeing both of them can't be ${y}.`,
      roles: ['base', 'related', 'elimination'],
    },
    {
      text: `Remove ${y} from ${cells(elim)}.`,
      roles: ['base', 'related', 'elimination'],
    },
  ];
}

/** XY-Chain: an alternating chain of bivalue cells. The two ends get their own
 * colour (`related`) from the first beat — they're what the elimination hangs
 * on — while the links between them stay `base`. */
function xyChainTemplate(step: Step): Beat[] {
  const path = groupCells(step, 'base');
  const d = groupDigits(step, 'base')[0] ?? elimDigit(step);
  const ends: [number, number] = [path[0]!, path[path.length - 1]!];
  const links = path.slice(1, -1);
  const elim = elimCells(step);

  const linkG = { role: 'base', cells: [...links], digits: [d] };
  const endG = { role: 'related', cells: [...ends], digits: [d] };
  const elimG = { role: 'elimination', cells: [...elim], digits: [d] };

  return [
    {
      text: `${cells(path)} form a chain of bivalue cells — each link's value forces the next. Its two ends, ${cells(ends)}, are picked out separately.`,
      roles: [],
      groups: [linkG, endG],
    },
    {
      text: `Follow it from either end: if ${cellName(ends[0])} isn't ${d}, the links march along and make ${cellName(ends[1])} be ${d} — and vice versa. One end is always ${d}.`,
      roles: [],
      groups: [linkG, endG],
    },
    {
      text: `So any cell that sees both ends, ${cells(ends)}, can't be ${d}.`,
      roles: [],
      groups: [linkG, endG, elimG],
    },
    {
      text: `Remove ${d} from ${cells(elim)}.`,
      roles: [],
      groups: [linkG, endG, elimG],
    },
  ];
}

/** Unique Rectangle (type 1): three corners share a pair. */
function uniqueRectangleTemplate(step: Step): Beat[] {
  const floor = groupCells(step, 'base');
  const ds = groupDigits(step, 'base');
  const extra = groupCells(step, 'elimination');
  return [
    {
      text: `${cells(floor)} sit at three corners of a rectangle spanning two boxes, and all three hold just ${digits(ds)}.`,
      roles: ['base'],
    },
    {
      text: `If the fourth corner also held only ${digits(ds)}, you could swap ${digits(ds)} around the rectangle and get a second solution. A proper puzzle has exactly one.`,
      roles: ['base'],
    },
    {
      text: `So the fourth corner, ${cells(extra)}, must be something other than ${digits(ds)}.`,
      roles: ['base', 'elimination'],
    },
    {
      text: `Remove ${digits(ds)} from ${cells(extra)}.`,
      roles: ['base', 'elimination'],
    },
  ];
}

/** Simple Coloring: two-colour a conjugate-pair chain, then Rule 4. */
function coloringTemplate(step: Step): Beat[] {
  const colourA = groupCells(step, 'base');
  const colourB = groupCells(step, 'related');
  const d = groupDigits(step, 'base')[0] ?? elimDigit(step);
  const elim = elimCells(step);

  if (colourB.length === 0) {
    // Rule 2 shape: base = the surviving colour, elimination = the false colour.
    return [
      {
        text: `Follow the strong links on ${d} and two-colour the chain. ${cells(colourA)} are one colour.`,
        roles: ['base'],
      },
      {
        text: `The other colour repeats inside a single unit — it would place ${d} twice — so that colour is entirely false.`,
        roles: ['base', 'elimination'],
      },
      {
        text: `Remove ${d} from ${cells(elim)}.`,
        roles: ['base', 'elimination'],
      },
    ];
  }

  return [
    {
      text: `Follow every strong link on ${d} and two-colour the chain. One colour: ${cells(colourA)}.`,
      roles: ['base'],
    },
    {
      text: `The other colour: ${cells(colourB)}. Exactly one of the two colours is the true set of ${d}s — we just don't know which yet.`,
      roles: ['base', 'related'],
    },
    {
      text: `${cells(elim)} each see a cell of BOTH colours. Whichever colour is true, one of those neighbours is ${d}.`,
      roles: ['base', 'related', 'elimination'],
    },
    {
      text: `Remove ${d} from ${cells(elim)}.`,
      roles: ['base', 'related', 'elimination'],
    },
  ];
}

/** ALS-XZ: two almost-locked sets with a restricted common digit. */
function alsXzTemplate(step: Step): Beat[] {
  const alsA = groupCells(step, 'base');
  const alsB = groupCells(step, 'cover');
  const x = groupDigits(step, 'related')[0] ?? 0;
  const z = elimDigit(step);
  const elim = elimCells(step);
  return [
    {
      text: `Two Almost Locked Sets — each one cell short of being locked to its digits: one is ${cells(alsA)}, the other is ${cells(alsB)}.`,
      roles: ['base', 'cover'],
    },
    {
      text: `They share ${x} as a restricted common digit: ${x} can be in at most one of the two sets.`,
      roles: ['base', 'cover', 'related'],
    },
    {
      text: `Whichever set misses out on ${x} becomes fully locked, which forces ${z} to appear in it — so ${z} can't survive in any cell that sees all of ${z}'s spots across both sets.`,
      roles: ['base', 'cover', 'related', 'elimination'],
    },
    {
      text: `Remove ${z} from ${cells(elim)}.`,
      roles: ['base', 'cover', 'related', 'elimination'],
    },
  ];
}

// --- dispatch ---------------------------------------------------------------

type Template = (step: Step, slug: string) => Beat[];

const BY_SLUG: Record<string, Template> = {
  'last-free-cell': placeTemplate,
  'naked-single': placeTemplate,
  'cross-hatching': placeTemplate,
  'last-possible-number': placeTemplate,
  'bug+1': bugTemplate,
  pointing: lockedTemplate,
  claiming: lockedTemplate,
  'naked-pair': nakedSubsetTemplate,
  'naked-triple': nakedSubsetTemplate,
  'naked-quad': nakedSubsetTemplate,
  'hidden-pair': hiddenSubsetTemplate,
  'hidden-triple': hiddenSubsetTemplate,
  'hidden-quad': hiddenSubsetTemplate,
  'x-wing': fishTemplate,
  swordfish: fishTemplate,
  jellyfish: fishTemplate,
  'finned-x-wing': fishTemplate,
  'finned-swordfish': fishTemplate,
  'finned-jellyfish': fishTemplate,
  skyscraper: chainTemplate,
  '2-string-kite': chainTemplate,
  'turbot-fish': chainTemplate,
  'xy-wing': wingPivotTemplate,
  'xyz-wing': wingPivotTemplate,
  'w-wing': wingPairTemplate,
  'xy-chain': xyChainTemplate,
  'unique-rectangle': uniqueRectangleTemplate,
  'simple-coloring': coloringTemplate,
  'als-xz': alsXzTemplate,
};

/**
 * Build the beat list for one puzzle. `gridBefore` (the placed-digit string at
 * the firing position, or undefined when the step fires on the raw puzzle) is
 * copied onto every beat so the lesson board shows the same position throughout.
 */
export function buildWalkthrough(
  step: Step,
  slug: string,
  gridBefore: string | undefined,
): HintStep[] {
  const template = BY_SLUG[slug];
  if (!template) throw new Error(`[walkthrough] no template for "${slug}"`);
  const beats = template(step, slug);

  return beats.map((beat, i) => {
    const last = i === beats.length - 1;
    const highlights =
      beat.groups ??
      step.highlights
        .filter((g) => beat.roles.includes(g.role as Role))
        .map((g) => ({
          role: g.role,
          cells: [...g.cells],
          ...(g.digits ? { digits: [...g.digits] } : {}),
        }));
    const hs: HintStep = {
      technique: step.technique,
      explanation: beat.text,
      highlights,
      placements: last
        ? step.placements.map((p) => ({ cell: p.cell, digit: p.digit }))
        : [],
      eliminations: last
        ? step.eliminations.map((e) => ({ cell: e.cell, digit: e.digit }))
        : [],
    };
    if (gridBefore) hs.gridBefore = gridBefore;
    return hs;
  });
}
