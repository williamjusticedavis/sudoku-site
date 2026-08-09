/**
 * Tiny CLI to run a grid through the solver and print the step-by-step trace.
 *
 *   pnpm -C packages/engine solve <81-char-grid>
 *   pnpm -C packages/engine solve 53..7....6..195....98....6.8...6...34..8.3..17...2...6.6....28....419..5....8..79
 *
 * Empty cells may be '.' or '0'. Whitespace/newlines are ignored, so a
 * pretty-printed 9x9 block pastes fine (quote it in the shell). Flags:
 *   --no-steps   print only the summary and final grid
 */

import { readFileSync, existsSync } from 'node:fs';
import {
  parseGrid,
  parseGridWithCandidates,
  formatGrid,
  serializeGrid,
} from './candidates.js';
import {
  findConflicts,
  hasUniqueSolution,
  reconcileNotation,
  type Mistake,
} from './validate.js';
import { solveAll } from './solver.js';
import { cellName, isSolved } from './grid.js';
import type { Step } from './step.js';

function describeMistake(m: Mistake): string {
  switch (m.kind) {
    case 'digit-conflict':
      return `digit-conflict: ${m.digit} appears twice in ${m.unitKind} ${
        m.unitIndex + 1
      } (${cellName(m.cells[0])}, ${cellName(m.cells[1])})`;
    case 'impossible-candidate':
      return `impossible-candidate: ${cellName(m.cell)} marks ${m.digit}, but ${cellName(
        m.conflictingCell,
      )} already places ${m.digit}`;
    case 'missing-digit':
      return `missing-digit: ${m.digit} is neither placed nor a candidate anywhere in ${
        m.unitKind
      } ${m.unitIndex + 1}`;
  }
}

function describeStep(step: Step, n: number): string {
  const parts: string[] = [`${String(n).padStart(3)}. [${step.technique}] ${step.description}`];
  if (step.placements.length > 0) {
    parts.push(
      '     place: ' + step.placements.map((p) => `${cellName(p.cell)}=${p.digit}`).join(', '),
    );
  }
  if (step.eliminations.length > 0) {
    parts.push(
      '     elim:  ' +
        step.eliminations.map((e) => `${cellName(e.cell)}≠${e.digit}`).join(', '),
    );
  }
  return parts.join('\n');
}

function main(argv: string[]): number {
  const args = argv.filter((a) => !a.startsWith('--'));
  const showSteps = !argv.includes('--no-steps');
  let raw = args[0];

  if (!raw) {
    console.error('usage: pnpm solve <grid | file> [--no-steps]');
    console.error('  <grid> may be an 81-char digit string, or the extended notation');
    console.error('  format (81 tokens; empty cells as `.` or `[159]` candidate sets).');
    console.error('  A path to a file containing either format also works.');
    return 2;
  }

  // Accept a file path as well as a literal grid string.
  if (existsSync(raw)) raw = readFileSync(raw, 'utf8');

  // Extended notation (carries candidate marks) is signalled by a `[` token.
  const isExtended = raw.includes('[');

  let grid;
  try {
    grid = isExtended ? parseGridWithCandidates(raw) : parseGrid(raw);
  } catch (err) {
    console.error(`Could not parse grid: ${(err as Error).message}`);
    return 2;
  }

  console.log('\nInput:');
  console.log(formatGrid(grid));

  if (isExtended) {
    const { report, reset } = reconcileNotation(grid);
    if (report.ok) {
      console.log('\nNotation check: ✓ no mistakes — user candidates accepted as-is.');
    } else {
      console.log(`\nNotation check: ✗ ${report.mistakes.length} problem(s) found:`);
      for (const m of report.mistakes) console.log(`  - ${describeMistake(m)}`);
      console.log(
        reset
          ? '  → discarded user candidates; recomputed fresh from placed digits.'
          : '',
      );
    }
  }

  const conflicts = findConflicts(grid);
  if (conflicts.length > 0) {
    console.log(`\nInvalid grid — duplicate placed digits:`);
    for (const c of conflicts) {
      console.log(`  ${c.digit} in ${c.unitKind} ${c.unitIndex + 1}`);
    }
    return 1;
  }

  const unique = hasUniqueSolution(grid);
  if (!unique) {
    console.log('\n⚠ Grid does not have a unique solution (0 or multiple). Solving anyway;');
    console.log('  uniqueness-based techniques (BUG+1, Unique Rectangle) are suppressed by');
    console.log('  their own guards.');
  }

  const result = solveAll(grid);

  if (showSteps) {
    console.log(`\nSteps (${result.steps.length}):`);
    result.steps.forEach((s, i) => console.log(describeStep(s, i + 1)));
  }

  // Technique histogram.
  const counts = new Map<string, number>();
  for (const s of result.steps) counts.set(s.technique, (counts.get(s.technique) ?? 0) + 1);
  const histogram = [...counts.entries()].sort((a, b) => b[1] - a[1]);

  console.log(`\nResult: ${result.status}`);
  console.log('Technique usage:');
  for (const [tech, n] of histogram) console.log(`  ${String(n).padStart(3)} × ${tech}`);

  console.log('\nFinal:');
  console.log(formatGrid(grid));
  console.log('\n' + serializeGrid(grid));

  if (isSolved(grid)) {
    console.log('\n✓ Solved.');
    return 0;
  }
  const remaining = grid.placed.filter((d) => d === 0).length;
  console.log(`\n✗ Stuck with ${remaining} cells unsolved (no registered technique applies).`);
  return 1;
}

process.exit(main(process.argv.slice(2)));
