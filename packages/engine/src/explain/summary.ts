import { cellName } from '../grid.js';
import type { Step } from '../step.js';

function join(items: string[], conj: 'and' | 'or' = 'and'): string {
  if (items.length === 0) return '';
  if (items.length === 1) return items[0]!;
  if (items.length === 2) return `${items[0]} ${conj} ${items[1]}`;
  return `${items.slice(0, -1).join(', ')} ${conj} ${items[items.length - 1]}`;
}

/** Cell list, abbreviated past three so a wide elimination doesn't wrap the
 * whole step list ("r1c8, r3c8, r7c8 and 2 more"). */
function cellList(cells: readonly number[]): string {
  const names = cells.map(cellName);
  if (names.length <= 3) return join(names);
  return `${names.slice(0, 3).join(', ')} and ${names.length - 3} more`;
}

/**
 * One plain-English line describing what a step DID — the step list's
 * right-hand text. Deliberately not the engine's `description`: that spells
 * out the pattern in set notation (`ALS-XZ: ALS {r1c2,r1c5} and {...}`), which
 * is the wrong altitude for a scannable list. The pattern's reasoning lives in
 * the walkthrough beats; the list only needs the outcome.
 */
export function summarizeStep(step: Step): string {
  if (step.placements.length > 0) {
    const p = step.placements[0]!;
    return `${cellName(p.cell)} must be ${p.digit}`;
  }
  if (step.eliminations.length === 0) return 'no change';

  if (step.technique === 'user-notes') {
    const n = step.eliminations.length;
    return `${n} candidate${n === 1 ? '' : 's'} you had already ruled out`;
  }

  const digitSet = [...new Set(step.eliminations.map((e) => e.digit))].sort(
    (a, b) => a - b,
  );
  const cells = [...new Set(step.eliminations.map((e) => e.cell))];

  // One digit swept out of several cells is the common case and reads best
  // digit-first; several digits leaving one cell reads better cell-first.
  if (digitSet.length === 1) {
    return `removes ${digitSet[0]} from ${cellList(cells)}`;
  }
  if (cells.length === 1) {
    return `removes ${join(digitSet.map(String))} from ${cellName(cells[0]!)}`;
  }
  return `removes ${join(digitSet.map(String))} from ${cellList(cells)}`;
}
