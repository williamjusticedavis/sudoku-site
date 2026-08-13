import type { Step } from '@sudoku/engine';

export type CellRole = 'base' | 'cover' | 'fin' | 'related' | 'elimination' | 'placement';

/**
 * Map each highlighted cell to a single role for rendering. Later roles in
 * `PRIORITY` win, so the decisive cells (placement/elimination) show over
 * supporting ones (base/related) when a cell appears in more than one group.
 */
const PRIORITY: CellRole[] = [
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
