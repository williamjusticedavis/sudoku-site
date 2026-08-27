/**
 * A Step is the immutable record of a single technique application: what it
 * placed, what it eliminated, which cells formed the pattern, and a
 * human-readable description.
 *
 * Steps are the ONLY time-travel mechanism. Reconstructing the grid at step N
 * means replaying steps 0..N against a fresh `parseGrid` result (see
 * `solver.replay`), so a Step must reproduce identical state on every replay.
 * To guarantee that, every Step returned by a technique is deep-frozen and its
 * fields are `readonly` — nothing may mutate a Step after creation.
 */

import { bit, cellName, type CellIndex, type Digit, type Grid } from './grid.js';
import { PEERS } from './units.js';

/**
 * Identifier of the technique that produced a step. Kept as a string union so
 * it grows technique-by-technique without a central enum; widen as techniques
 * land. `'given'`/`'user'` cover non-technique placements (initial clues, etc.).
 */
export type TechniqueId =
  | 'given'
  | 'user'
  | 'last-free-cell'
  | 'naked-single'
  | 'hidden-single'
  | 'cross-hatching'
  | 'last-possible-number'
  | 'pointing'
  | 'claiming'
  | 'naked-pair'
  | 'naked-triple'
  | 'naked-quad'
  | 'hidden-pair'
  | 'hidden-triple'
  | 'hidden-quad'
  | 'x-wing'
  | 'swordfish'
  | 'jellyfish'
  | 'skyscraper'
  | '2-string-kite'
  | 'turbot-fish'
  | 'simple-coloring'
  | 'finned-x-wing'
  | 'finned-swordfish'
  | 'finned-jellyfish'
  | 'xy-wing'
  | 'xyz-wing'
  | 'w-wing'
  | 'unique-rectangle'
  | 'bug+1'
  | 'xy-chain'
  | 'als-xz'
  | 'forcing-chain'
  | (string & {});

/** A digit placed into a cell. */
export interface Placement {
  readonly cell: CellIndex;
  readonly digit: Digit;
}

/** A candidate removed from a cell. */
export interface Elimination {
  readonly cell: CellIndex;
  readonly digit: Digit;
}

/**
 * Visual role a group of cells plays in a technique, for the Learn UI's
 * dim/highlight display. A single step routinely carries several roles at once
 * (e.g. a Finned Jellyfish shows base cells, cover cells, the fin, and the
 * elimination target — each rendered differently), so highlights are a LIST of
 * role-tagged groups, not a flat cell list.
 *
 * Roles:
 *  - `base` / `cover` — the two sets defining a fish (or the pattern's primary
 *    and secondary structure generally).
 *  - `fin`            — fin cells that make a finned/sashimi variant work.
 *  - `placement`      — a cell being solved (singles, last-free-cell).
 *  - `elimination`    — a cell losing candidates.
 *  - `related`        — supporting / seeing / link cells that explain the logic.
 */
export type HighlightRole =
  'base' | 'cover' | 'fin' | 'placement' | 'elimination' | 'related';

/** A set of cells sharing one visual role, plus the digits it concerns. */
export interface HighlightGroup {
  readonly role: HighlightRole;
  readonly cells: readonly CellIndex[];
  /** Digits this group concerns (e.g. the fish digit, the placed value). */
  readonly digits?: readonly Digit[];
}

/** All role-tagged groups a step wants highlighted. */
export type Highlights = readonly HighlightGroup[];

/** Immutable record of one technique application. */
export interface Step {
  readonly technique: TechniqueId;
  readonly placements: readonly Placement[];
  readonly eliminations: readonly Elimination[];
  readonly highlights: Highlights;
  readonly description: string;
}

/** A pure technique: inspects the grid, returns a Step if it fires, else null. */
export type Technique = (grid: Grid) => Step | null;

/**
 * Build a deep-frozen Step. Techniques should create steps only through this
 * helper so immutability is guaranteed uniformly.
 */
export function makeStep(input: {
  technique: TechniqueId;
  placements?: Placement[];
  eliminations?: Elimination[];
  highlights?: HighlightGroup[];
  description: string;
}): Step {
  const placements = (input.placements ?? []).map((p) => Object.freeze({ ...p }));
  const eliminations = (input.eliminations ?? []).map((e) => Object.freeze({ ...e }));
  const highlights: Highlights = Object.freeze(
    (input.highlights ?? []).map((g) =>
      Object.freeze(
        g.digits === undefined
          ? { role: g.role, cells: Object.freeze([...g.cells]) }
          : {
              role: g.role,
              cells: Object.freeze([...g.cells]),
              digits: Object.freeze([...g.digits]),
            },
      ),
    ),
  );

  return Object.freeze({
    technique: input.technique,
    placements: Object.freeze(placements),
    eliminations: Object.freeze(eliminations),
    highlights,
    description: input.description,
  });
}

/**
 * The SOLE grid mutator. Applies a step's eliminations and placements in place
 * and maintains candidate state incrementally:
 *   - an elimination clears one candidate bit;
 *   - a placement fixes the digit, clears that cell's candidates, and removes
 *     the digit from every peer's candidates.
 *
 * Candidates are never recomputed from scratch here — that would resurrect
 * prior technique eliminations (see solver docs).
 */
export function applyStep(grid: Grid, step: Step): void {
  for (const { cell, digit } of step.eliminations) {
    grid.candidates[cell] = grid.candidates[cell]! & ~bit(digit);
  }
  for (const { cell, digit } of step.placements) {
    grid.placed[cell] = digit;
    grid.candidates[cell] = 0;
    const clear = ~bit(digit);
    for (const p of PEERS[cell]!) {
      grid.candidates[p] = grid.candidates[p]! & clear;
    }
  }
}

/** Convenience: `"r3c7"`-style label for a placement/elimination target. */
export function targetName(t: Placement | Elimination): string {
  return `${cellName(t.cell)}=${t.digit}`;
}
