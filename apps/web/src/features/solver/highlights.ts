import type { Step } from '@sudoku/engine';

export type CellRole =
  'base' | 'cover' | 'fin' | 'related' | 'elimination' | 'placement' | 'focus';

/**
 * Map each highlighted cell to a single role for rendering. Later roles in
 * `PRIORITY` win, so the decisive cells (placement/elimination) show over
 * supporting ones (base/related) when a cell appears in more than one group.
 * `focus` is lowest priority — it's a neutral "look here" marker for a beat
 * that hasn't earned a real role yet (e.g. naked single's opening beat), so
 * any later, more specific role on the same cell overrides it.
 */
const PRIORITY: CellRole[] = [
  'focus',
  'related',
  'cover',
  'base',
  'fin',
  'elimination',
  'placement',
];

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
