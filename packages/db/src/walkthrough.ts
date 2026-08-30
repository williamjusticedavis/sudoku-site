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
 * (6 shared templates cover 21 of the 28 tactics; the rest get a small
 * bespoke template each). The cells and digits in every beat come straight
 * from the engine Step — only the sentence scaffolding is templated.
 */
import {
  cellName,
  commonPeers,
  parseGrid,
  parseGridWithCandidates,
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
  /** Learn-only decorative lines (green, no arrowhead) — see `HintStep.xLines`. */
  xLines?: { from: number; to: number }[];
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
  const baseIsRows = rowSet.size <= colSet.size;
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

  // Plain (unfinned) X-Wing: outline both base lines from beat 1, draw the
  // pattern's 4 corner cells as a literal green X (not just "two rows and
  // two columns" for the learner to cross mentally), and wash the whole
  // cover lines red as soon as they're named — same "mark everything in
  // play, not just what ends up eliminated" convention as the naked/hidden
  // subset and locked-candidates templates.
  if (n === 2 && fin.length === 0) {
    const outlineGroups = baseVals.map((v) => ({
      role: 'outline-unit',
      cells: lineCellsOf(baseIsRows ? v * 9 : v, baseIsRows ? 'row' : 'col'),
    }));
    const baseGroup = { role: 'base', cells: [...base], digits: [d] };
    // The 4 corners, connected diagonally so opposite corners form an X.
    const idx = (r: number, c: number) => r * 9 + c;
    const [r0, r1] = baseIsRows ? baseVals : coverVals;
    const [c0, c1] = baseIsRows ? coverVals : baseVals;
    const xLines = [
      { from: idx(r0!, c0!), to: idx(r1!, c1!) },
      { from: idx(r0!, c1!), to: idx(r1!, c0!) },
    ];
    const coverOutlineGroups = coverVals.map((v) => ({
      role: 'outline-unit',
      cells: lineCellsOf(baseIsRows ? v : v * 9, baseIsRows ? 'col' : 'row'),
    }));
    const coverCells = new Set(coverOutlineGroups.flatMap((g) => g.cells));
    const baseSet = new Set(base);
    // Only empty cells need the red wash — a cell that already holds a digit
    // isn't a candidate to strike, marking it just adds noise.
    const wash = {
      role: 'elimination',
      cells: [...coverCells].filter((c) => !baseSet.has(c) && grid.placed[c] === 0),
    };
    return [
      {
        text: `Digit ${d} in ${baseKind} ${digits(baseNums)} only fits in ${coverKind} ${digits(coverNums)}. The 4 cells where they cross — ${cells(base)} — form an X: if ${cellName(idx(r0!, c0!))} is ${d}, ${cellName(idx(r1!, c1!))} must be ${d} too — and if ${cellName(idx(r0!, c1!))} is ${d}, ${cellName(idx(r1!, c0!))} must be ${d} too.`,
        roles: [],
        groups: [baseGroup, ...outlineGroups],
        xLines,
      },
      {
        text: `Each of those ${baseKind} needs a ${d}, and they can only take it in ${coverKind} ${digits(coverNums)} — so those ${coverKind} are spoken for.`,
        roles: [],
        groups: [baseGroup, ...outlineGroups],
        xLines,
      },
      {
        text: `Any other cell in ${coverKind} ${digits(coverNums)}, outside ${baseKind} ${digits(baseNums)}, therefore can't be ${d}.`,
        roles: [],
        groups: [baseGroup, wash, ...outlineGroups, ...coverOutlineGroups],
        xLines,
      },
      {
        text: `Remove ${d} from ${cells(elim)}.`,
        roles: [],
        groups: [baseGroup, wash, ...outlineGroups, ...coverOutlineGroups],
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

/** Skyscraper: same 4-cell shape as X-Wing (two parallel strong links) but
 * the free ends DON'T share the cross-axis line the way X-Wing's do — only
 * the two inner ("roof") ends share it. Framed explicitly against X-Wing
 * (which the learner has usually just done) rather than as a generic
 * "chain", and the final elimination washes every empty cell that sees both
 * free ends red, not just the ones actually losing the candidate — same
 * "mark everything in play" convention as the other templates. */
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

  const outlineGroups = [lineCellsOf(o1, axis), lineCellsOf(o2, axis)].map((cs) => ({
    role: 'outline-unit',
    cells: cs,
  }));
  const baseGroup = { role: 'base', cells: [o1, o2], digits: [d] };
  const relatedGroup = { role: 'related', cells: [e1, e2], digits: [d] };
  const xLines = [{ from: e1, to: e2 }];
  const endsSet = new Set([o1, o2, e1, e2]);
  const wash = {
    role: 'elimination',
    cells: commonPeers([o1, o2]).filter((c) => grid.placed[c] === 0 && !endsSet.has(c)),
  };

  return [
    {
      text: `${cellName(o1)} and ${cellName(e1)} are the only two spots for ${d} in ${lineLabel} ${
        lineOf(o1) + 1
      }; ${cellName(e2)} and ${cellName(o2)} are the only two spots in ${lineLabel} ${
        lineOf(o2) + 1
      }. That's close to an X-Wing's 4-cell shape — but it doesn't line up the same way: ${crossLabel} ${
        crossOf(e1) + 1
      } lines up between the two ${lineLabel}s (${cellName(e1)} and ${cellName(
        e2,
      )}), while the outer ends ${cellName(o1)} and ${cellName(o2)} sit in different ${crossLabel}s — so there's no clean box to strike a whole line from.`,
      roles: [],
      groups: [baseGroup, relatedGroup, ...outlineGroups],
      xLines,
    },
    {
      text: `${cellName(e1)} and ${cellName(e2)} share ${crossLabel} ${
        crossOf(e1) + 1
      }, so at most one of them is ${d}. Whichever one isn't, its own ${lineLabel} has nowhere else to put ${d} except its outer end — so ${d} always lands in ${cellName(
        o1,
      )} or ${cellName(o2)}.`,
      roles: [],
      groups: [baseGroup, relatedGroup, ...outlineGroups],
      xLines,
    },
    {
      text: `Any cell that sees both ${cellName(o1)} and ${cellName(o2)} must therefore see ${aDigit(
        d,
      )} — so it can't be ${d} itself.`,
      roles: [],
      groups: [baseGroup, relatedGroup, wash, ...outlineGroups],
      xLines,
    },
    {
      text: `Remove ${d} from ${cells(elim)}.`,
      roles: [],
      groups: [baseGroup, relatedGroup, wash, ...outlineGroups],
      xLines,
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
