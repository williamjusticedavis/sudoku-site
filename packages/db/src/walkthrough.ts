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
 * (5 shared templates cover 18 of the 28 tactics — singles, naked/hidden
 * subsets, the fish family, and XY-/XYZ-Wing; the other 10 each get a small
 * bespoke template, including Skyscraper/2-String Kite/Turbot Fish, which
 * used to share one generic "chain" template before each got its own
 * strong/weak-link-aware narration). The cells and digits in every beat come
 * straight from the engine Step — only the sentence scaffolding is templated.
 */
import {
  cellName,
  commonPeers,
  hasCand,
  parseGrid,
  parseGridWithCandidates,
  sees,
  type Digit,
  type Grid,
  type Step,
} from '@sudoku/engine';
import type { HintStep } from './index.js';

/** A lesson board string is either a plain 81-char digit string or the
 * bracket-candidate notation from `serializeGridWithCandidates` — mirrors
 * the web app's `parseLessonGrid`. */
function parseBoard(board: string): Grid {
  return /[[\s]/.test(board) ? parseGridWithCandidates(board) : parseGrid(board);
}

type Role = 'base' | 'cover' | 'fin' | 'placement' | 'elimination' | 'related' | 'scan';

interface Beat {
  text: string;
  /** Highlight-group roles visible by the end of this beat (cumulative). The
   * cells come from the engine Step's groups of those roles. */
  roles: Role[];
  /** Explicit highlight groups for this beat, overriding `roles`. Use when a
   * template needs to re-shape the Step's cells (e.g. split one group in two). */
  groups?: { role: string; cells: number[]; digits?: number[] }[];
  /** Arrows visible on this beat (verbatim from the step — arrows aren't
   * revealed progressively like highlight roles, a beat either shows them or
   * doesn't). */
  arrows?: { from: number; to: number }[];
  /** Learn-only decorative lines (green, no arrowhead) — see `HintStep.xLines`.
   * `style: 'dashed'` for a weak link (shares a unit, "not both"), solid
   * (the default) for a strong link (conjugate pair, "not one → the other"). */
  xLines?: { from: number; to: number; style?: 'solid' | 'dashed' }[];
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

/** All 9 cells of the row/column containing `cell`. */
function lineCellsOf(cell: number, axis: 'row' | 'col'): number[] {
  const want = axis === 'row' ? rowOf(cell) : colOf(cell);
  const out: number[] = [];
  for (let i = 0; i < 81; i++)
    if ((axis === 'row' ? rowOf(i) : colOf(i)) === want) out.push(i);
  return out;
}

/** All 9 cells of the box containing `cell`. */
function boxCellsOf(cell: number): number[] {
  const want = boxOf(cell);
  const out: number[] = [];
  for (let i = 0; i < 81; i++) if (boxOf(i) === want) out.push(i);
  return out;
}

/** The full 9-cell unit (row, column, or box) every one of `refCells` shares
 * — same detection order as `unitLabel`, but returns the cells instead of a
 * string. `null` if they don't all share one (shouldn't happen for a step
 * whose elimination cells are, by construction, confined to a single unit). */
function fullUnitCellsOf(refCells: readonly number[]): number[] | null {
  if (refCells.length === 0) return null;
  const [f] = refCells;
  if (refCells.every((c) => rowOf(c) === rowOf(f!))) return lineCellsOf(f!, 'row');
  if (refCells.every((c) => colOf(c) === colOf(f!))) return lineCellsOf(f!, 'col');
  if (refCells.every((c) => boxOf(c) === boxOf(f!))) return boxCellsOf(f!);
  return null;
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
    // Cross-hatching's step also carries 'scan' — the rows/columns/boxes
    // crossing this unit that already hold the digit, i.e. the scanlines
    // doing the excluding. Other techniques on this branch have none, so the
    // filter is a no-op for them.
    const supporting = step.highlights.filter(
      (g) => g.role === 'related' || g.role === 'scan',
    );
    beats.push({
      text: `Look at ${unit}. Every empty cell in it except ${p} is already kept from being ${d} by a ${d} it can see.`,
      roles: [],
      groups: [
        ...supporting.map((g) => ({
          role: g.role,
          cells: [...g.cells],
          ...(g.digits ? { digits: [...g.digits] } : {}),
        })),
        { role: 'focus', cells: [spot.cell], digits: [d] },
      ],
      // Cross-hatching only: which specific "2" rules out which specific
      // cell — spelled out instead of left for the learner to trace along
      // the scanned line themselves. Shown only on this opening beat; by the
      // next beat attention has already moved on to the answer.
      ...(step.arrows ? { arrows: step.arrows.map((a) => ({ ...a })) } : {}),
    });
    beats.push({
      text: `That leaves ${p} as the only cell in ${unit} where ${d} can still go.`,
      roles: ['related', 'scan', 'placement'],
    });
  } else {
    beats.push({
      text: `${p} has only one candidate left — every other digit is used by a cell it can see.`,
      roles: [],
      groups: [{ role: 'focus', cells: [spot.cell], digits: [d] }],
    });
    beats.push({
      text: `So ${p} can only be ${d}.`,
      roles: ['placement'],
    });
  }
  beats.push({
    text: `Place ${d} in ${p}.`,
    roles: ['related', 'scan', 'placement'],
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
      text: `If ${p} were one of its two "pair" digits, every remaining cell would be bivalue and the puzzle would have more than one solution. A valid puzzle can't allow that — so don't guess between those two, they're both dead ends that just complete the grave with no further move.`,
      roles: ['placement'],
    },
    {
      text: `So ${p} must take its odd third candidate. Place ${d} in ${p}.`,
      roles: ['placement'],
    },
  ];
}

/** Pointing / Claiming: a digit locked to a box∩line, cleared from the rest.
 * One merged lesson, but still two distinct engine techniques under the
 * hood (see seed.ts's `pointingOrClaiming`) — which direction narrates is
 * read off the step itself, not the (now-shared) slug. */
function lockedTemplate(step: Step, _slug: string, grid: Grid): Beat[] {
  const base = groupCells(step, 'base');
  const d = groupDigits(step, 'base')[0] ?? elimDigit(step);
  const elim = elimCells(step);
  const boxLabel = `box ${boxOf(base[0]!) + 1}`;
  const baseGroup = { role: 'base', cells: [...base], digits: [d] };
  const baseSet = new Set(base);
  const axis = base.every((c) => rowOf(c) === rowOf(base[0]!)) ? 'row' : 'col';
  const boxCells = boxCellsOf(base[0]!);
  const lineCells = lineCellsOf(base[0]!, axis);
  // Every OTHER empty cell of the target unit — not just the ones that
  // actually hold `d` as a candidate — so the wash makes clear the whole
  // unit is in play, not only the cells losing something. Base cells keep
  // their own colour rather than getting swallowed into the wash.
  const wash = (unit: number[]) => ({
    role: 'elimination',
    cells: unit.filter((c) => grid.placed[c] === 0 && !baseSet.has(c)),
  });

  if (step.technique === 'pointing') {
    // base sits in a box, confined to one line; clear that line.
    const lineLabel = unitLabel([...base, ...elim]);
    const lineWash = wash(lineCells);
    return [
      {
        text: `In ${boxLabel}, ${d} can only go in ${cells(base)} — and they all lie in ${lineLabel}.`,
        roles: [],
        groups: [baseGroup, { role: 'outline-unit', cells: boxCells }],
      },
      {
        text: `Wherever ${d} lands in ${boxLabel}, it's somewhere in ${lineLabel}. So ${d} can't be anywhere else in ${lineLabel}.`,
        roles: [],
        groups: [baseGroup, lineWash, { role: 'outline-unit', cells: lineCells }],
      },
      {
        text: `Remove ${d} from ${cells(elim)}.`,
        roles: [],
        groups: [baseGroup, lineWash, { role: 'outline-unit', cells: lineCells }],
      },
    ];
  }

  // claiming: base sits in a line, confined to one box; clear the rest of the box.
  const lineLabel = unitLabel(base);
  const boxWash = wash(boxCells);
  return [
    {
      text: `In ${lineLabel}, ${d} can only go in ${cells(base)} — and they all sit in ${boxLabel}.`,
      roles: [],
      groups: [baseGroup, { role: 'outline-unit', cells: lineCells }],
    },
    {
      text: `Wherever ${d} lands in ${lineLabel}, it's inside ${boxLabel}. So ${d} can't be anywhere else in ${boxLabel}.`,
      roles: [],
      groups: [baseGroup, boxWash, { role: 'outline-unit', cells: boxCells }],
    },
    {
      text: `Remove ${d} from ${cells(elim)}.`,
      roles: [],
      groups: [baseGroup, boxWash, { role: 'outline-unit', cells: boxCells }],
    },
  ];
}

/** Naked pair/triple/quad: N cells share N candidates. */
function nakedSubsetTemplate(step: Step, _slug: string, grid: Grid): Beat[] {
  const base = groupCells(step, 'base');
  const ds = groupDigits(step, 'base');
  const n = base.length;
  const word = n === 2 ? 'pair' : n === 3 ? 'triple' : 'quad';
  const elim = elimCells(step);
  const baseGroup = { role: 'base', cells: [...base], digits: [...ds] };
  const baseSet = new Set(base);
  const unitCells = fullUnitCellsOf([...base, ...elim]) ?? [];
  // Every OTHER empty cell of the unit — not just the ones that actually
  // hold one of `ds` as a candidate — so it's visible that the whole unit
  // is what's constrained, not only the cells that happen to lose something.
  const wash = {
    role: 'elimination',
    cells: unitCells.filter((c) => grid.placed[c] === 0 && !baseSet.has(c)),
  };
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
      roles: [],
      groups: [baseGroup, wash, { role: 'outline-unit', cells: unitCells }],
    },
    {
      text: `Remove ${digits(ds)} from ${cells(elim)} wherever they appear.`,
      roles: [],
      groups: [baseGroup, wash, { role: 'outline-unit', cells: unitCells }],
    },
  ];
}

/** Hidden pair/triple/quad: N digits confined to N cells (no distinct elim
 * cells — the removals sit on the base cells and show as struck candidates).
 * No red "affected unit" wash like the naked-subset/locked-candidates
 * templates: every bit of the reasoning happens ON the base cells
 * themselves, there's no separate set of "other cells in the unit" that's
 * in play, so there's nothing distinct to wash — just the unit outline, so
 * "Look at {unit}" has something to point at from the first beat. */
function hiddenSubsetTemplate(step: Step): Beat[] {
  const base = groupCells(step, 'base');
  const ds = groupDigits(step, 'base');
  const n = base.length;
  const word = n === 2 ? 'pair' : n === 3 ? 'triple' : 'quad';
  const baseGroup = { role: 'base', cells: [...base], digits: [...ds] };
  const outline = { role: 'outline-unit', cells: fullUnitCellsOf(base) ?? [] };
  return [
    {
      text: `In ${unitLabel(base)}, the digits ${digits(ds)} can only go in these ${n} cells: ${cells(base)}. That's a hidden ${word}.`,
      roles: [],
      groups: [baseGroup, outline],
    },
    {
      text: `${n} digits with only ${n} possible homes — they're locked to those cells, one digit each.`,
      roles: [],
      groups: [baseGroup, outline],
    },
    {
      text: `So every other candidate in ${cells(base)} is impossible and can be struck out.`,
      roles: [],
      groups: [baseGroup, outline],
    },
  ];
}

/** Fish (X-Wing / Swordfish / Jellyfish), plain and finned. */
function fishTemplate(step: Step, _slug: string, grid: Grid): Beat[] {
  const base = groupCells(step, 'base');
  const d = groupDigits(step, 'base')[0] ?? elimDigit(step);
  const fin = groupCells(step, 'fin');
  const elim = elimCells(step);

  // The fish is defined on whichever axis has fewer distinct lines; its size is
  // that count (2 = X-Wing, 3 = Swordfish, 4 = Jellyfish).
  const rowSet = new Set(base.map(rowOf));
  const colSet = new Set(base.map(colOf));
  // When both axes have the same count (e.g. a 3-row/3-col Swordfish), row-vs-
  // column size alone can't tell which one is actually the base — the engine
  // itself picked one specific orientation (see fish.ts's ORIENTATIONS search
  // order) and only that one produces a valid fish; guessing wrong here mislabels
  // which lines get outlined and which get the red wash. The step's own
  // description ("... on d: rows/columns X,Y,Z confine...") names the real
  // orientation directly, so read it from there instead of re-deriving it.
  const descOrientation = /:\s*(rows|columns)\s/.exec(step.description)?.[1];
  const baseIsRows =
    descOrientation === 'rows'
      ? true
      : descOrientation === 'columns'
        ? false
        : rowSet.size <= colSet.size;
  const n = Math.min(rowSet.size, colSet.size);
  const bare = n === 2 ? 'X-Wing' : n === 3 ? 'Swordfish' : 'Jellyfish';
  const size = fin.length > 0 ? `finned ${bare}` : bare;
  const aSize = size === 'X-Wing' ? 'an X-Wing' : `a ${size}`;

  const baseKind = baseIsRows ? 'rows' : 'columns';
  const coverKind = baseIsRows ? 'columns' : 'rows';
  const baseVals = [...(baseIsRows ? rowSet : colSet)].sort((a, b) => a - b);
  const coverVals = [...(baseIsRows ? colSet : rowSet)].sort((a, b) => a - b);
  const baseNums = baseVals.map((v) => v + 1);
  const coverNums = coverVals.map((v) => v + 1);

  // X-Wing/Swordfish/Jellyfish, plain OR finned: outline every base line
  // from beat 1 and wash the cover cells red as soon as they're named — same
  // "mark everything in play, not just what ends up eliminated" convention
  // as the naked/hidden subset and locked-candidates templates. Finned
  // narrows the wash to cover cells that also see the fin (the only ones the
  // weaker deduction actually covers). X-Wing only (n===2) additionally
  // draws the pattern's 4 corners as a literal green X — Swordfish/Jellyfish's
  // 3-/4-line shape doesn't reduce to a clean X, so they skip that part.
  if (n === 2 || n === 3 || n === 4) {
    const outlineGroups = baseVals.map((v) => ({
      role: 'outline-unit',
      cells: lineCellsOf(baseIsRows ? v * 9 : v, baseIsRows ? 'row' : 'col'),
    }));
    const baseGroup = { role: 'base', cells: [...base], digits: [d] };
    const finGroup =
      fin.length > 0 ? { role: 'fin', cells: [...fin], digits: [d] } : null;
    const coverOutlineGroups = coverVals.map((v) => ({
      role: 'outline-unit',
      cells: lineCellsOf(baseIsRows ? v : v * 9, baseIsRows ? 'col' : 'row'),
    }));
    const coverCells = new Set(coverOutlineGroups.flatMap((g) => g.cells));
    const baseSet = new Set(base);
    // Only empty cells need the red wash — a cell that already holds a digit
    // isn't a candidate to strike, marking it just adds noise. Finned: only
    // cells that also see the fin are actually covered by the deduction.
    const wash = {
      role: 'elimination',
      cells: [...coverCells].filter(
        (c) =>
          !baseSet.has(c) &&
          grid.placed[c] === 0 &&
          (fin.length === 0 || fin.some((f) => sees(c, f))),
      ),
    };
    const beatGroups = [baseGroup, ...(finGroup ? [finGroup] : []), ...outlineGroups];
    const finalGroups = [
      baseGroup,
      ...(finGroup ? [finGroup] : []),
      wash,
      ...outlineGroups,
      ...coverOutlineGroups,
    ];

    let xLines: { from: number; to: number }[] = [];
    let introText: string;
    if (n === 2) {
      // The 4 corners, connected diagonally so opposite corners form an X.
      const idx = (r: number, c: number) => r * 9 + c;
      const [r0, r1] = baseIsRows ? baseVals : coverVals;
      const [c0, c1] = baseIsRows ? coverVals : baseVals;
      xLines = [
        { from: idx(r0!, c0!), to: idx(r1!, c1!) },
        { from: idx(r0!, c1!), to: idx(r1!, c0!) },
      ];
      introText =
        fin.length > 0
          ? `Digit ${d} in ${baseKind} ${digits(baseNums)} only fits in ${coverKind} ${digits(coverNums)} — the 4 cells ${cells(base)} form an X — plus one extra candidate at the fin, ${cells(fin)}.`
          : `Digit ${d} in ${baseKind} ${digits(baseNums)} only fits in ${coverKind} ${digits(coverNums)}. The 4 cells where they cross — ${cells(base)} — form an X: if ${cellName(idx(r0!, c0!))} is ${d}, ${cellName(idx(r1!, c1!))} must be ${d} too — and if ${cellName(idx(r0!, c1!))} is ${d}, ${cellName(idx(r1!, c0!))} must be ${d} too.`;
    } else {
      introText =
        fin.length > 0
          ? `Across ${baseKind} ${digits(baseNums)}, digit ${d} is pinned to just ${n} ${coverKind}: ${digits(coverNums)} — plus one extra candidate at the fin, ${cells(fin)}. That's ${aSize} on ${d}, with a fin.`
          : `Across ${baseKind} ${digits(baseNums)}, digit ${d} is pinned to just ${n} ${coverKind}: ${digits(coverNums)}. That's ${aSize} on ${d}.`;
    }

    const beat3Text =
      fin.length > 0
        ? `The extra candidate at the fin weakens the deduction: only cells in ${coverKind} ${digits(coverNums)} that also see the fin are still guaranteed safe to clear.`
        : `Any other cell in ${coverKind} ${digits(coverNums)}, outside ${baseKind} ${digits(baseNums)}, therefore can't be ${d}.`;

    return [
      {
        text: introText,
        roles: [],
        groups: beatGroups,
        xLines,
      },
      {
        text: `Each of those ${baseKind} needs a ${d}, and they can only take it in ${coverKind} ${digits(coverNums)} — so those ${coverKind} are spoken for.`,
        roles: [],
        groups: beatGroups,
        xLines,
      },
      {
        text: beat3Text,
        roles: [],
        groups: finalGroups,
        xLines,
      },
      {
        text: `Remove ${d} from ${cells(elim)}.`,
        roles: [],
        groups: finalGroups,
        xLines,
      },
    ];
  }

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

/** Turbot Fish: the general case of a 2-strong-link chain — either strong
 * link (and the weak link between their inner ends) can be a row, column, OR
 * box, unlike Skyscraper (both strong links aligned rows/cols) or 2-String
 * Kite (row+col strong links, box-sharing weak link). Same opening move as
 * Kite: start on the two related (inner) cells and their shared unit — the
 * most direct connection in the pattern — before bringing in the two free
 * ends and their own separate strong links. Each relevant row/column/box
 * gets outlined only once the beat reading it actually names it. */
function turbotFishTemplate(step: Step, _slug: string, grid: Grid): Beat[] {
  const b = groupCells(step, 'base'); // the two free ends
  const r = groupCells(step, 'related'); // the two inner ends
  const d = groupDigits(step, 'base')[0] ?? elimDigit(step);
  const elim = elimCells(step);

  // Order is preserved from the engine's chain-building (base[0]/related[0]
  // are the two ends of one strong link, base[1]/related[1] the other) — no
  // need to re-derive the pairing by geometry.
  const o1 = b[0]!;
  const e1 = r[0]!;
  const o2 = b[1]!;
  const e2 = r[1]!;

  // Two cells can coincidentally share a row/column even when the actual
  // strong link the engine found there is really a box link (e.g. the far
  // ends just happen to line up in a column that already has other
  // candidates for d — sharing a line is not proof it's a 2-candidate line).
  // A STRONG link must additionally check the count: exactly 2 candidate
  // cells for d in that unit, and they're the two we think they are. The
  // weak link between e1/e2 has no such requirement — any shared unit
  // genuinely proves "at most one of them is d" — so it stays geometric.
  const sharedAxisOf = (x: number, y: number): 'row' | 'col' | 'box' =>
    rowOf(x) === rowOf(y) ? 'row' : colOf(x) === colOf(y) ? 'col' : 'box';
  const unitCellsOf = (c: number, axis: 'row' | 'col' | 'box') =>
    axis === 'box' ? boxCellsOf(c) : lineCellsOf(c, axis);
  const label = (axis: 'row' | 'col' | 'box') =>
    axis === 'box' ? 'box' : axis === 'row' ? 'row' : 'column';
  const numOf = (c: number, axis: 'row' | 'col' | 'box') =>
    (axis === 'box' ? boxOf(c) : axis === 'row' ? rowOf(c) : colOf(c)) + 1;
  const strongAxisOf = (x: number, y: number): 'row' | 'col' | 'box' => {
    const isStrongIn = (cells: number[]) => {
      const cands = cells.filter(
        (c) => grid.placed[c] === 0 && hasCand(grid.candidates[c]!, d as Digit),
      );
      return cands.length === 2 && cands.includes(x) && cands.includes(y);
    };
    if (rowOf(x) === rowOf(y) && isStrongIn(lineCellsOf(x, 'row'))) return 'row';
    if (colOf(x) === colOf(y) && isStrongIn(lineCellsOf(x, 'col'))) return 'col';
    return 'box';
  };

  const axis1 = strongAxisOf(o1, e1);
  const axis2 = strongAxisOf(o2, e2);
  const weakAxis = sharedAxisOf(e1, e2);

  const outline1 = { role: 'outline-unit', cells: unitCellsOf(o1, axis1) };
  const outline2 = { role: 'outline-unit', cells: unitCellsOf(o2, axis2) };
  const weakOutline = { role: 'outline-unit', cells: unitCellsOf(e1, weakAxis) };
  const base1 = { role: 'base', cells: [o1], digits: [d] };
  const related1 = { role: 'related', cells: [e1], digits: [d] };
  const baseGroup = { role: 'base', cells: [o1, o2], digits: [d] };
  const relatedGroup = { role: 'related', cells: [e1, e2], digits: [d] };
  // Solid = strong link, dashed = weak — see the concept page linked from
  // this lesson's overview. Each strong link's own line appears the moment
  // that link is introduced; the dashed weak link joins once beat 3 names it.
  const strongLine1 = { from: o1, to: e1, style: 'solid' as const };
  const strongLine2 = { from: o2, to: e2, style: 'solid' as const };
  const weakLine = { from: e1, to: e2, style: 'dashed' as const };
  const endsSet = new Set([o1, o2, e1, e2]);
  const wash = {
    role: 'elimination',
    cells: commonPeers([o1, o2]).filter((c) => grid.placed[c] === 0 && !endsSet.has(c)),
  };

  return [
    {
      text: `${cellName(o1)} and ${cellName(e1)} are the only two spots for ${d} in ${label(
        axis1,
      )} ${numOf(o1, axis1)} — a strong link: whichever one isn't ${d}, the other one is.`,
      roles: [],
      groups: [base1, related1, outline1],
      xLines: [strongLine1],
    },
    {
      text: `${cellName(e2)} and ${cellName(o2)} are the same kind of strong link, in ${label(
        axis2,
      )} ${numOf(o2, axis2)} this time.`,
      roles: [],
      groups: [baseGroup, relatedGroup, outline1, outline2],
      xLines: [strongLine1, strongLine2],
    },
    {
      text: `${cellName(e1)} and ${cellName(e2)} also share ${label(weakAxis)} ${numOf(
        e1,
        weakAxis,
      )} — a weak link: at most one of them is ${d}. Whichever one isn't, its own ${label(
        axis1,
      )}/${label(
        axis2,
      )} has nowhere else to put ${d} except its outer end — either way, ${d} lands in ${cellName(
        o1,
      )} or ${cellName(o2)}.`,
      roles: [],
      groups: [baseGroup, relatedGroup, outline1, outline2, weakOutline],
      xLines: [strongLine1, strongLine2, weakLine],
    },
    {
      text: `Any cell that sees both ${cellName(o1)} and ${cellName(o2)} must therefore see ${aDigit(
        d,
      )} — so it can't be ${d} itself.`,
      roles: [],
      groups: [baseGroup, relatedGroup, wash, outline1, outline2, weakOutline],
      xLines: [strongLine1, strongLine2, weakLine],
    },
    {
      text: `Remove ${d} from ${cells(elim)}.`,
      roles: [],
      groups: [baseGroup, relatedGroup, wash, outline1, outline2, weakOutline],
      xLines: [strongLine1, strongLine2, weakLine],
    },
  ];
}

/** Skyscraper: two parallel strong links (both rows, or both columns) whose
 * inner ("roof") ends line up on the cross axis — a weak link. Narrated as
 * three short beats before the payoff (one strong link, the other strong
 * link, the weak link joining their roofs) rather than one bulky beat that
 * dumps the whole pattern at once — each beat's own cells keep the same
 * base/related colouring they'll keep for the rest of the walkthrough. */
function skyscraperTemplate(step: Step, _slug: string, grid: Grid): Beat[] {
  const b = groupCells(step, 'base'); // the two free ends
  const r = groupCells(step, 'related'); // the two inner ("roof") ends
  const d = groupDigits(step, 'base')[0] ?? elimDigit(step);
  const elim = elimCells(step);

  const axis: 'row' | 'col' =
    rowOf(b[0]!) === rowOf(r[0]!) || rowOf(b[0]!) === rowOf(r[1]!) ? 'row' : 'col';
  const lineOf = (c: number) => (axis === 'row' ? rowOf(c) : colOf(c));
  const crossOf = (c: number) => (axis === 'row' ? colOf(c) : rowOf(c));
  const lineLabel = axis === 'row' ? 'row' : 'column';
  const crossLabel = axis === 'row' ? 'column' : 'row';
  const partnerOf = (c: number) => r.find((e) => lineOf(e) === lineOf(c))!;

  const o1 = b[0]!;
  const e1 = partnerOf(o1);
  const o2 = b[1]!;
  const e2 = r.find((e) => e !== e1)!;

  const outline1 = { role: 'outline-unit', cells: lineCellsOf(o1, axis) };
  const outline2 = { role: 'outline-unit', cells: lineCellsOf(o2, axis) };
  const base1 = { role: 'base', cells: [o1], digits: [d] };
  const related1 = { role: 'related', cells: [e1], digits: [d] };
  const baseBoth = { role: 'base', cells: [o1, o2], digits: [d] };
  const relatedBoth = { role: 'related', cells: [e1, e2], digits: [d] };
  // Solid = strong link, dashed = weak — see the concept page linked from
  // this lesson's overview. Each strong link's own line appears the moment
  // that link is introduced; the dashed weak link joins once beat 3 names it.
  const strongLine1 = { from: o1, to: e1, style: 'solid' as const };
  const strongLine2 = { from: o2, to: e2, style: 'solid' as const };
  const weakLine = { from: e1, to: e2, style: 'dashed' as const };
  const endsSet = new Set([o1, o2, e1, e2]);
  const wash = {
    role: 'elimination',
    cells: commonPeers([o1, o2]).filter((c) => grid.placed[c] === 0 && !endsSet.has(c)),
  };

  return [
    {
      text: `${cellName(o1)} and ${cellName(e1)} are the only two spots for ${d} in ${lineLabel} ${
        lineOf(o1) + 1
      } — a strong link: whichever one isn't ${d}, the other one is.`,
      roles: [],
      groups: [base1, related1, outline1],
      xLines: [strongLine1],
    },
    {
      text: `${cellName(e2)} and ${cellName(o2)} are the same kind of strong link, in ${lineLabel} ${
        lineOf(o2) + 1
      } this time.`,
      roles: [],
      groups: [baseBoth, relatedBoth, outline1, outline2],
      xLines: [strongLine1, strongLine2],
    },
    {
      text: `${cellName(e1)} and ${cellName(e2)} also share ${crossLabel} ${
        crossOf(e1) + 1
      } — a weak link: at most one of them is ${d}. That's close to an X-Wing's 4-cell shape, but only the two inner ends line up like that; the outer ends ${cellName(
        o1,
      )} and ${cellName(o2)} sit in different ${crossLabel}s, so there's no clean box to strike a whole line from.`,
      roles: [],
      groups: [baseBoth, relatedBoth, outline1, outline2],
      xLines: [strongLine1, strongLine2, weakLine],
    },
    {
      text: `Whichever of ${cellName(e1)}/${cellName(e2)} isn't ${d}, its own ${lineLabel} has nowhere else to put ${d} except its outer end — so ${d} always lands in ${cellName(
        o1,
      )} or ${cellName(o2)}. Any cell that sees both must therefore see ${aDigit(
        d,
      )} — so it can't be ${d} itself.`,
      roles: [],
      groups: [baseBoth, relatedBoth, wash, outline1, outline2],
      xLines: [strongLine1, strongLine2, weakLine],
    },
    {
      text: `Remove ${d} from ${cells(elim)}.`,
      roles: [],
      groups: [baseBoth, relatedBoth, wash, outline1, outline2],
      xLines: [strongLine1, strongLine2, weakLine],
    },
  ];
}

/** 2-String Kite: one row strong link + one column strong link, whose inner
 * ends share a box. Narrated the same way as Skyscraper now that the
 * strong/weak link vocabulary exists: one strong link, then the other, then
 * how their inner ends relate (a weak link, via the shared box), then the
 * elimination the two free ends produce together. Each cell keeps ONE role
 * (and colour) for the whole walkthrough — related cells stay related, base
 * cells stay base, from whichever beat first reveals them — only which
 * cells are VISIBLE grows beat to beat, never which colour an already-
 * visible cell recolours to. */
function kiteTemplate(step: Step, _slug: string, grid: Grid): Beat[] {
  const b = groupCells(step, 'base'); // the two free ends
  const r = groupCells(step, 'related'); // the two inner ends (share a box)
  const d = groupDigits(step, 'base')[0] ?? elimDigit(step);
  const elim = elimCells(step);

  const o1 = b[0]!;
  const o2 = b[1]!;
  const axisTo = (o: number, e: number): 'row' | 'col' =>
    rowOf(e) === rowOf(o) ? 'row' : 'col';
  const e1 = r.find((e) => rowOf(e) === rowOf(o1) || colOf(e) === colOf(o1))!;
  const e2 = r.find((e) => e !== e1)!;
  const axis1 = axisTo(o1, e1);
  const axis2 = axisTo(o2, e2);
  const label = (axis: 'row' | 'col') => (axis === 'row' ? 'row' : 'column');
  const numOf = (c: number, axis: 'row' | 'col') =>
    (axis === 'row' ? rowOf(c) : colOf(c)) + 1;

  const line1 = { role: 'outline-unit', cells: lineCellsOf(o1, axis1) };
  const line2 = { role: 'outline-unit', cells: lineCellsOf(o2, axis2) };
  const boxOutline = { role: 'outline-unit', cells: boxCellsOf(e1) };
  const base1 = { role: 'base', cells: [o1], digits: [d] };
  const related1 = { role: 'related', cells: [e1], digits: [d] };
  const baseBoth = { role: 'base', cells: [o1, o2], digits: [d] };
  const relatedBoth = { role: 'related', cells: [e1, e2], digits: [d] };
  // Solid = strong link, dashed = weak — see the concept page linked from
  // this lesson's overview. Each strong link's own line appears the moment
  // that link is introduced; the dashed weak link joins once beat 3 names it.
  const strongLine1 = { from: o1, to: e1, style: 'solid' as const };
  const strongLine2 = { from: o2, to: e2, style: 'solid' as const };
  const weakLine = { from: e1, to: e2, style: 'dashed' as const };
  const endsSet = new Set([o1, o2, e1, e2]);
  const wash = {
    role: 'elimination',
    cells: commonPeers([o1, o2]).filter((c) => grid.placed[c] === 0 && !endsSet.has(c)),
  };

  return [
    {
      text: `${cellName(o1)} and ${cellName(e1)} are the only two spots for ${d} in ${label(
        axis1,
      )} ${numOf(o1, axis1)} — a strong link: whichever one isn't ${d}, the other one is.`,
      roles: [],
      groups: [base1, related1, line1],
      xLines: [strongLine1],
    },
    {
      text: `${cellName(e2)} and ${cellName(o2)} are the same kind of strong link, in ${label(
        axis2,
      )} ${numOf(o2, axis2)} this time.`,
      roles: [],
      groups: [baseBoth, relatedBoth, line1, line2],
      xLines: [strongLine1, strongLine2],
    },
    {
      text: `${cellName(e1)} and ${cellName(e2)} also sit together in box ${
        boxOf(e1) + 1
      } — a weak link: at most one of them is ${d}. Whichever one isn't, its own ${label(
        axis1,
      )}/${label(axis2)} has only one other place to put ${d}: the far end. So ${d} always ends up in ${cellName(
        o1,
      )} or ${cellName(o2)}.`,
      roles: [],
      groups: [baseBoth, relatedBoth, line1, line2, boxOutline],
      xLines: [strongLine1, strongLine2, weakLine],
    },
    {
      text: `Any cell that sees both ${cellName(o1)} and ${cellName(o2)} must therefore see ${aDigit(
        d,
      )} — so it can't be ${d} itself.`,
      roles: [],
      groups: [baseBoth, relatedBoth, wash, line1, line2, boxOutline],
      xLines: [strongLine1, strongLine2, weakLine],
    },
    {
      text: `Remove ${d} from ${cells(elim)}.`,
      roles: [],
      groups: [baseBoth, relatedBoth, wash, line1, line2, boxOutline],
      xLines: [strongLine1, strongLine2, weakLine],
    },
  ];
}

/** XY-Wing / XYZ-Wing: a pivot with two pincers. Elimination beat washes
 * every empty cell that sees all the relevant anchors (both pincers for
 * XY-Wing; the pivot and both pincers for XYZ-Wing) red, not just the ones
 * that end up losing the candidate — same convention as the other bespoke
 * templates. */
function wingPivotTemplate(step: Step, _slug: string, grid: Grid): Beat[] {
  const pivot = groupCells(step, 'base');
  const pivotDs = groupDigits(step, 'base');
  const pincers = groupCells(step, 'related');
  const z = groupDigits(step, 'related')[0] ?? elimDigit(step);
  const elim = elimCells(step);
  const xyz = pivotDs.length === 3;
  const anchors = xyz ? [...pivot, ...pincers] : pincers;
  const anchorSet = new Set(anchors);
  const wash = {
    role: 'elimination',
    cells: commonPeers(anchors).filter((c) => grid.placed[c] === 0 && !anchorSet.has(c)),
  };
  const baseGroup = { role: 'base', cells: [...pivot], digits: [...pivotDs] };
  const relatedGroup = { role: 'related', cells: [...pincers], digits: [z] };
  return [
    {
      text: `${cells(pivot)} can only be ${digitsOr(pivotDs)}${
        xyz ? '' : ' — exactly two candidates left'
      } — the pivot of the wing.`,
      roles: ['base'],
    },
    {
      text: `Its pincers ${cells(pincers)} are bivalue too — each down to exactly two candidates, sharing one digit with the pivot and both also holding ${z}. ${
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
      roles: [],
      groups: [baseGroup, relatedGroup, wash],
    },
    {
      text: `Remove ${z} from ${cells(elim)}.`,
      roles: [],
      groups: [baseGroup, relatedGroup, wash],
    },
  ];
}

/** W-Wing: two cells with the same pair, bridged by a strong link. Solid
 * line for the strong link between the two link cells; dashed lines for the
 * two weak links (each pair cell to the link cell it sees) — see the
 * concept page linked from this lesson's overview. Elimination beat washes
 * every empty cell that sees both pair cells red, not just the ones that
 * end up losing the candidate. */
function wingPairTemplate(step: Step, _slug: string, grid: Grid): Beat[] {
  const pair = groupCells(step, 'base');
  const pairDs = groupDigits(step, 'base');
  const link = groupCells(step, 'related');
  const linkDigit = groupDigits(step, 'related')[0];
  const y = elimDigit(step);
  const x = pairDs.find((v) => v !== y) ?? linkDigit ?? pairDs[0];
  const elim = elimCells(step);

  const [a, b] = pair as [number, number];
  const [s1, s2] = link as [number, number];
  // Match each pair cell to the link cell it actually sees (the weak link) —
  // could be s1-a/s2-b or s1-b/s2-a depending on the puzzle's geometry.
  const straight = sees(s1, a) && sees(s2, b);
  const [wa, wb] = straight ? [s1, s2] : [s2, s1];
  const strongLine = { from: s1, to: s2, style: 'solid' as const };
  const weakLines = [
    { from: wa, to: a, style: 'dashed' as const },
    { from: wb, to: b, style: 'dashed' as const },
  ];
  const baseSet = new Set(pair);
  const wash = {
    role: 'elimination',
    cells: commonPeers(pair).filter((c) => grid.placed[c] === 0 && !baseSet.has(c)),
  };

  return [
    {
      text: `${cells(pair)} both hold only ${digitsOr(pairDs)}.`,
      roles: ['base'],
    },
    {
      text: `${cells(link)} are a strong link on ${x}, connecting the two. If neither of ${cells(pair)} is ${x}, the link forces both of them to be ${y}.`,
      roles: ['base', 'related'],
      xLines: [strongLine, ...weakLines],
    },
    {
      text: `Either way, ${y} ends up in one of ${cells(pair)} — so any cell seeing both of them can't be ${y}.`,
      roles: [],
      groups: [
        ...(step.highlights.filter((g) => g.role === 'base' || g.role === 'related') as {
          role: string;
          cells: number[];
          digits?: number[];
        }[]),
        wash,
      ],
      xLines: [strongLine, ...weakLines],
    },
    {
      text: `Remove ${y} from ${cells(elim)}.`,
      roles: [],
      groups: [
        ...(step.highlights.filter((g) => g.role === 'base' || g.role === 'related') as {
          role: string;
          cells: number[];
          digits?: number[];
        }[]),
        wash,
      ],
      xLines: [strongLine, ...weakLines],
    },
  ];
}

/** XY-Chain: an alternating chain of bivalue cells. The two ends get their
 * own colour (`base`, purple) from the first beat — they're what the
 * elimination hangs on — while the links between them stay `related` (light
 * blue). Deliberately the reverse of every other bespoke template's
 * base/related split: here the *ends* are the star of the show, not the
 * connecting links, so the ends get the more prominent colour. Each hop
 * between consecutive cells is a weak link (they see each other and share
 * the link digit — sharing a unit is exactly "not both", not a forced
 * either/or), drawn dashed; a bivalue cell's own strong link (its two
 * candidates) is implicit in it being circled, not drawn as a separate line.
 * Elimination beat washes every empty cell that sees both ends red, not
 * just the ones actually losing the candidate. */
function xyChainTemplate(step: Step, _slug: string, grid: Grid): Beat[] {
  const path = groupCells(step, 'base');
  const d = groupDigits(step, 'base')[0] ?? elimDigit(step);
  const ends: [number, number] = [path[0]!, path[path.length - 1]!];
  const links = path.slice(1, -1);
  const elim = elimCells(step);

  const linkG = { role: 'related', cells: [...links], digits: [d] };
  const endG = { role: 'base', cells: [...ends], digits: [d] };
  const pathSet = new Set(path);
  const wash = {
    role: 'elimination',
    cells: commonPeers(ends).filter((c) => grid.placed[c] === 0 && !pathSet.has(c)),
  };
  const xLines = path.slice(0, -1).map((c, i) => ({
    from: c,
    to: path[i + 1]!,
    style: 'dashed' as const,
  }));

  return [
    {
      text: `${cells(path)} form a chain of bivalue cells — each link's value forces the next. Its two ends, ${cells(ends)}, are picked out separately.`,
      roles: [],
      groups: [linkG, endG],
      xLines,
    },
    {
      text: `Follow it from either end: if ${cellName(ends[0])} isn't ${d}, the links march along and make ${cellName(ends[1])} be ${d} — and vice versa. One end is always ${d}.`,
      roles: [],
      groups: [linkG, endG],
      xLines,
    },
    {
      text: `So any cell that sees both ends, ${cells(ends)}, can't be ${d}.`,
      roles: [],
      groups: [linkG, endG, wash],
      xLines,
    },
    {
      text: `Remove ${d} from ${cells(elim)}.`,
      roles: [],
      groups: [linkG, endG, wash],
      xLines,
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

type Template = (step: Step, slug: string, grid: Grid) => Beat[];

const BY_SLUG: Record<string, Template> = {
  'last-free-cell': placeTemplate,
  'naked-single': placeTemplate,
  'cross-hatching': placeTemplate,
  'last-possible-number': placeTemplate,
  'bug+1': bugTemplate,
  pointing: lockedTemplate,
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
  skyscraper: skyscraperTemplate,
  '2-string-kite': kiteTemplate,
  'turbot-fish': turbotFishTemplate,
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
 * `boardGrid` is that same position (or the raw puzzle, when `gridBefore` is
 * undefined) — parsed so templates that need to know which cells are already
 * placed (e.g. locked-candidates' whole-line wash) can ask.
 */
export function buildWalkthrough(
  step: Step,
  slug: string,
  gridBefore: string | undefined,
  boardGrid: string,
): HintStep[] {
  const template = BY_SLUG[slug];
  if (!template) throw new Error(`[walkthrough] no template for "${slug}"`);
  const beats = template(step, slug, parseBoard(boardGrid));

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
    if (beat.arrows) hs.arrows = beat.arrows;
    if (beat.xLines) hs.xLines = beat.xLines;
    return hs;
  });
}
