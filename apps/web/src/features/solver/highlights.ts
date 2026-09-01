import type { ExplainBeat, Step } from '@sudoku/engine';

export type CellRole =
  'base' | 'cover' | 'fin' | 'related' | 'elimination' | 'placement' | 'focus' | 'scan';

/**
 * Map each highlighted cell to a single role for rendering. Later roles in
 * `PRIORITY` win, so the decisive cells (placement/elimination) show over
 * supporting ones (base/related) when a cell appears in more than one group.
 * `focus` is lowest priority — it's a neutral "look here" marker for a beat
 * that hasn't earned a real role yet (e.g. naked single's opening beat), so
 * any later, more specific role on the same cell overrides it. `scan`
 * (cross-hatching's crossing lines) sits just above it, styled quiet enough
 * that it reads as background evidence rather than a decisive cell.
 */
const PRIORITY: CellRole[] = [
  'focus',
  'related',
  'scan',
  'cover',
  'base',
  'fin',
  'elimination',
  'placement',
];

/**
 * Cell background per solve-step role, shared by the solver grid and the Learn
 * lesson board. The two kept separate copies until the solver's steps were
 * given the lessons' narration — at which point a technique showing violet
 * base cells in its lesson and sky-blue ones in the solver was just the same
 * pattern wearing two costumes.
 */
export const ROLE_BG: Record<CellRole, string> = {
  placement: 'bg-emerald-200 dark:bg-emerald-800/70',
  elimination: 'bg-rose-200 dark:bg-rose-800/70',
  base: 'bg-violet-200 dark:bg-violet-900/50',
  cover: 'bg-indigo-200 dark:bg-indigo-800/70',
  fin: 'bg-amber-200 dark:bg-amber-700/70',
  related: 'bg-sky-200 dark:bg-sky-800/70',
  focus: 'bg-slate-300 dark:bg-neutral-600/70',
  scan: 'bg-slate-100 dark:bg-neutral-800/50',
};

/**
 * Adapt a narration beat to the engine `Step` shape, so the highlight and
 * candidate-marker helpers below can read a beat the same way they read a
 * step. Only the fields those helpers touch are populated.
 */
export function beatAsStep(beat: ExplainBeat): Step {
  return {
    technique: beat.technique as Step['technique'],
    description: beat.explanation ?? '',
    highlights: (beat.highlights ?? []) as Step['highlights'],
    placements: (beat.placements ?? []) as Step['placements'],
    eliminations: (beat.eliminations ?? []) as Step['eliminations'],
  };
}

/** Every cell a beat names — highlight groups, placements, eliminations. The
 * set the dim treatment keeps lit. */
export function stepCells(beat: ExplainBeat): number[] {
  const cells: number[] = [];
  for (const g of beat.highlights ?? []) cells.push(...g.cells);
  for (const p of beat.placements ?? []) cells.push(p.cell);
  for (const e of beat.eliminations ?? []) cells.push(e.cell);
  return cells;
}

export function buildHighlightMap(step: Step | null): Map<number, CellRole> {
  const map = new Map<number, CellRole>();
  if (!step) return map;
  for (const role of PRIORITY) {
    for (const group of step.highlights) {
      if (group.role === role) {
        for (const cell of group.cells) map.set(cell, role);
      }
    }
  }
  for (const p of step.placements) map.set(p.cell, 'placement');
  return map;
}

/** Per-cell candidate annotation: the pattern's relevant digit ('marked'), or a
 * digit the step removes ('eliminated'). Rendered as a circle over the pencil
 * mark so a step's logic reads off the candidates themselves, not just cells. */
export type CandidateMarker = 'marked' | 'eliminated';

/**
 * Map cell -> digit -> marker. Built from two step fields:
 *  - non-elimination highlight groups' `digits`, restricted to their `cells`
 *    (e.g. a pointing pair's base cells, a wing's pincer digit) -> 'marked'.
 *  - `eliminations` (the authoritative cell+digit removal list) -> 'eliminated',
 *    which always wins over 'marked' for the same cell+digit.
 */
export function buildCandidateMarkers(
  step: Step | null,
): Map<number, Map<number, CandidateMarker>> {
  const map = new Map<number, Map<number, CandidateMarker>>();
  if (!step) return map;

  const set = (cell: number, digit: number, marker: CandidateMarker) => {
    let forCell = map.get(cell);
    if (!forCell) {
      forCell = new Map();
      map.set(cell, forCell);
    }
    if (marker === 'eliminated' || !forCell.has(digit)) forCell.set(digit, marker);
  };

  for (const group of step.highlights) {
    if (group.role === 'elimination' || group.role === 'placement') continue;
    if (!group.digits) continue;
    for (const cell of group.cells) {
      for (const digit of group.digits) set(cell, digit, 'marked');
    }
  }
  for (const e of step.eliminations) set(e.cell, e.digit, 'eliminated');

  return map;
}
