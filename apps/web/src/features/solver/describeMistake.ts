import { cellName, type Mistake } from '@sudoku/engine';

export function describeMistake(m: Mistake): string {
  switch (m.kind) {
    case 'digit-conflict':
      return `${m.digit} repeated in ${m.unitKind} ${m.unitIndex + 1} (${cellName(
        m.cells[0],
      )}, ${cellName(m.cells[1])})`;
    case 'impossible-candidate':
      return `${cellName(m.cell)} can't be ${m.digit} — ${cellName(
        m.conflictingCell,
      )} already has it`;
    case 'missing-digit':
      return `${m.digit} has no place left in ${m.unitKind} ${m.unitIndex + 1}`;
  }
}

/** A stable, unique-per-occurrence React key — the mistake's own identifying
 * fields, not its position in the list. */
export function mistakeKey(m: Mistake): string {
  switch (m.kind) {
    case 'digit-conflict':
      return `digit-conflict-${m.digit}-${m.cells[0]}-${m.cells[1]}`;
    case 'impossible-candidate':
      return `impossible-candidate-${m.cell}-${m.digit}-${m.conflictingCell}`;
    case 'missing-digit':
      return `missing-digit-${m.digit}-${m.unitKind}-${m.unitIndex}`;
  }
}
