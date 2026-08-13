import { createFileRoute } from '@tanstack/react-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { BOXES, COLS, PEERS, ROWS, cellName, type Mistake } from '@sudoku/engine';
import { useSolver, type SolveProblem } from '../features/solver/useSolver.js';
import { buildHighlightMap } from '../features/solver/highlights.js';
import { SudokuGrid, type Interaction } from '../features/solver/SudokuGrid.js';
import { Modal } from '../features/solver/Modal.js';

export const Route = createFileRoute('/')({ component: SolverPage });

const EXAMPLE =
  '53..7....6..195....98....6.8...6...34..8.3..17...2...6.6....28....419..5....8..79';

function describeMistake(m: Mistake): string {
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

const btn =
  'rounded-md px-3 py-2 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40';
const btnPrimary = `${btn} bg-blue-600 text-white hover:bg-blue-500`;
const btnGhost = `${btn} border border-neutral-300 hover:bg-neutral-100 dark:border-neutral-700 dark:hover:bg-neutral-800`;
const btnActive = `${btn} border border-blue-500 bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-200`;
const groupLabel =
  'mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-neutral-500 dark:text-neutral-400';

function SolverPage() {
  const s = useSolver();
  const [pasteOpen, setPasteOpen] = useState(false);
  const [pasteText, setPasteText] = useState('');
  const [confirmClear, setConfirmClear] = useState(false);
  const [confirmClearNotes, setConfirmClearNotes] = useState(false);
  const [notesMode, setNotesMode] = useState(false);
  const [shiftHeld, setShiftHeld] = useState(false);
  // Cell to flash (a placed digit that blocks a candidate the user tried to add).
  const [flashCell, setFlashCell] = useState<number | null>(null);
  const [flashId, setFlashId] = useState(0);
  // Digit whose every instance is highlighted (set by double-clicking a number).
  const [digitHighlight, setDigitHighlight] = useState<number | null>(null);
  const highlight = buildHighlightMap(s.currentStep);
  const panelOpen = s.history.length > 0 || s.mistakes !== null;

  // Cells flagged by the last mistake check (conflicts + impossible marks;
  // missing-digit highlights its whole unit).
  const mistakeCells = useMemo(() => {
    const set = new Set<number>();
    for (const m of s.mistakes ?? []) {
      if (m.kind === 'digit-conflict') {
        set.add(m.cells[0]);
        set.add(m.cells[1]);
      } else if (m.kind === 'impossible-candidate') {
        set.add(m.cell);
      } else {
        // missing-digit: only mark the filled cells of the unit (the whole
        // row/column/box painted red is too heavy on the eye).
        const units = m.unitKind === 'row' ? ROWS : m.unitKind === 'col' ? COLS : BOXES;
        for (const c of units[m.unitIndex]!.cells) {
          if (s.display.placed[c] !== 0) set.add(c);
        }
      }
    }
    return set;
  }, [s.mistakes, s.display]);

  const hasNotes = useMemo(() => s.notes.some((mask) => mask !== 0), [s.notes]);

  // Track Shift so the Notes indicator reflects the transient shift-to-note.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Shift') setShiftHeld(e.type === 'keydown');
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('keyup', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('keyup', onKey);
    };
  }, []);

  // Click on empty page area (not the grid, not a control) deselects.
  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      const t = e.target as HTMLElement | null;
      if (
        t?.closest('button, input, textarea, select, a, [role="grid"], [role="dialog"]')
      ) {
        return;
      }
      s.select(null);
      setDigitHighlight(null);
    };
    window.addEventListener('mousedown', onDown);
    return () => window.removeEventListener('mousedown', onDown);
  }, [s.select]);

  // Interaction highlighting: cells seen by the selection ('peer', slight) and
  // every instance of the double-clicked digit ('match', strong).
  const interaction = useMemo(() => {
    const placed = s.display.placed;
    const active: number[] = [];
    if (digitHighlight !== null) {
      for (let i = 0; i < 81; i++) if (placed[i] === digitHighlight) active.push(i);
    } else if (s.selected !== null) {
      active.push(s.selected);
    }
    const map = new Map<number, Interaction>();
    for (const c of active) for (const p of PEERS[c]!) map.set(p, 'peer');
    // The active cell(s) themselves get the strong (gold) highlight — for a
    // single selection that's the clicked cell; for a double-click it's every
    // instance of that digit.
    for (const c of active) map.set(c, 'match');
    return map;
  }, [s.display, s.selected, digitHighlight]);

  // A plain click selects (and clears any digit highlight); a double-click
  // highlights all instances of that cell's digit.
  const handleSelect = useCallback(
    (cell: number | null) => {
      s.select(cell);
      setDigitHighlight(null);
    },
    [s],
  );
  const handleActivate = useCallback(
    (cell: number) => {
      const d = s.display.placed[cell] ?? 0;
      s.select(cell);
      setDigitHighlight(d === 0 ? null : d);
    },
    [s],
  );

  const flashBlocker = useCallback(
    (cell: number, digit: number): boolean => {
      const blocker = PEERS[cell]!.find((p) => s.display.placed[p] === digit);
      if (blocker !== undefined) {
        setFlashCell(blocker);
        setFlashId((n) => n + 1);
        return true;
      }
      return false;
    },
    [s.display],
  );

  // Placing a digit a peer already uses is rejected — flash the blocker so it's
  // clear why (you can't have the same digit twice in a unit). Deleting is fine.
  const handlePlaceDigit = useCallback(
    (cell: number, digit: number | null) => {
      if (digit !== null && flashBlocker(cell, digit)) return;
      s.setDigit(cell, digit);
    },
    [s, flashBlocker],
  );

  // Same rule for pencil marks; removing an existing mark is always allowed.
  const handleToggleNote = useCallback(
    (cell: number, digit: number) => {
      const alreadyMarked = ((s.notes[cell] ?? 0) & (1 << (digit - 1))) !== 0;
      if (!alreadyMarked && flashBlocker(cell, digit)) return;
      s.toggleNote(cell, digit);
    },
    [s, flashBlocker],
  );

  // Keep the newest applied step in view as the list grows.
  const listRef = useRef<HTMLOListElement>(null);
  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
  }, [s.history.length]);

  return (
    <main className="mx-auto max-w-5xl px-4 py-6 lg:flex lg:h-dvh lg:flex-col lg:overflow-hidden">
      <header className="mb-6 lg:shrink-0">
        <h1 className="text-2xl font-bold">Sudoku Solver</h1>
        <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
          Type or paste a puzzle. Solve it all at once, or take one hint at a time and
          keep going yourself. Everything runs in your browser.
        </p>
      </header>

      <div className="flex flex-col gap-6 lg:min-h-0 lg:flex-1 lg:flex-row">
        {/* Toolbar: grouped actions, left of the grid on large screens */}
        <aside className="flex flex-col gap-4 lg:w-44 lg:shrink-0">
          <div>
            <h3 className={groupLabel}>Solve</h3>
            <div className="flex flex-wrap gap-2 lg:flex-col">
              <button
                type="button"
                className={`${btnPrimary} lg:w-full`}
                onClick={s.solve}
                disabled={s.clueCount === 0}
              >
                Solve
              </button>
              <button
                type="button"
                className={`${btnGhost} lg:w-full`}
                onClick={s.hint}
                disabled={s.clueCount === 0}
              >
                Hint
              </button>
            </div>
          </div>

          <div>
            <h3 className={groupLabel}>Marks</h3>
            <div className="flex flex-wrap gap-2 lg:flex-col">
              <button
                type="button"
                aria-pressed={notesMode || shiftHeld}
                className={`${notesMode || shiftHeld ? btnActive : btnGhost} lg:w-full`}
                onClick={() => setNotesMode((n) => !n)}
                title="Pencil-mark mode — type digits to add/remove notes (or hold Shift)"
              >
                Notes{notesMode || shiftHeld ? ' ✓' : ''}
              </button>
              <button
                type="button"
                className={`${btnGhost} lg:w-full`}
                onClick={s.autoNotes}
                disabled={s.clueCount === 0}
                title="Fill every empty cell with its possible notes"
              >
                Auto notes
              </button>
              <button
                type="button"
                className={`${btnGhost} lg:w-full`}
                onClick={() => setConfirmClearNotes(true)}
                disabled={!hasNotes}
                title="Erase every pencil-marked note on the grid"
              >
                Clear notes
              </button>
            </div>
          </div>

          <div>
            <h3 className={groupLabel}>Grid</h3>
            <div className="flex flex-wrap gap-2 lg:flex-col">
              <button type="button" className={`${btnGhost} lg:w-full`} onClick={s.check}>
                Check for mistakes
              </button>
              <button
                type="button"
                className={`${btnGhost} lg:w-full`}
                onClick={() => setPasteOpen((o) => !o)}
              >
                Paste
              </button>
              <button
                type="button"
                className={`${btnGhost} lg:w-full`}
                onClick={() => s.load(EXAMPLE)}
              >
                Load example
              </button>
              <button
                type="button"
                className={`${btnGhost} lg:w-full`}
                onClick={() => setConfirmClear(true)}
                disabled={s.clueCount === 0}
              >
                Clear
              </button>
            </div>
          </div>
        </aside>

        {/* Left: grid + status */}
        <section className="flex flex-col items-start gap-4">
          <SudokuGrid
            placed={s.display.placed}
            notes={s.notes}
            userCells={s.userCells}
            selected={s.selected}
            highlight={highlight}
            mistakeCells={mistakeCells}
            interaction={interaction}
            highlightDigit={digitHighlight}
            editable
            notesMode={notesMode}
            flashCell={flashCell}
            flashId={flashId}
            onSelect={handleSelect}
            onActivate={handleActivate}
            onDigit={handlePlaceDigit}
            onToggleNote={handleToggleNote}
            onClearNotes={s.clearCellNotes}
          />

          {pasteOpen && (
            <div className="w-full max-w-md">
              <textarea
                value={pasteText}
                onChange={(e) => setPasteText(e.target.value)}
                placeholder="Paste 81 characters (digits 1–9, . or 0 for blanks). Whitespace is ignored."
                rows={3}
                className="w-full rounded-md border border-neutral-300 bg-transparent p-2 font-mono text-sm dark:border-neutral-700"
              />
              <button
                type="button"
                className={btnPrimary}
                onClick={() => {
                  s.load(pasteText);
                  setPasteOpen(false);
                }}
              >
                Load
              </button>
            </div>
          )}

          <div className="flex items-center gap-3">
            <StatusBadge status={s.status} />
            {s.history.length > 0 && (
              <span className="text-sm text-neutral-500 dark:text-neutral-400">
                {s.viewIndex} / {s.history.length} step{s.history.length === 1 ? '' : 's'}
              </span>
            )}
          </div>
          {s.notice && (
            <p className="max-w-md text-sm text-amber-700 dark:text-amber-400">
              {s.notice}
            </p>
          )}
        </section>

        {/* Right: solve process */}
        {panelOpen && (
          <section className="flex min-h-0 min-w-0 flex-1 flex-col">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-semibold">
                {s.history.length > 0 ? 'Steps' : 'Mistake check'}
              </h2>
              <button
                type="button"
                aria-label="Close solve panel"
                onClick={s.dismiss}
                className="rounded p-1 text-lg leading-none text-neutral-500 hover:bg-neutral-100 hover:text-neutral-900 dark:hover:bg-neutral-800 dark:hover:text-neutral-100"
              >
                ✕
              </button>
            </div>

            {s.currentStep && (
              <div className="mb-4 rounded-md border border-neutral-200 p-3 dark:border-neutral-800">
                <div className="text-xs font-semibold tracking-wide text-neutral-500 uppercase">
                  {s.currentStep.technique}
                </div>
                <p className="mt-1 text-sm">{s.currentStep.description}</p>
              </div>
            )}

            {s.mistakes && (
              <div className="mb-4">
                {s.mistakes.length === 0 ? (
                  <p className="text-sm text-emerald-600 dark:text-emerald-400">
                    No problems found.
                  </p>
                ) : (
                  <ul className="list-inside list-disc text-sm text-rose-600 dark:text-rose-400">
                    {s.mistakes.map((m, i) => (
                      <li key={i}>{describeMistake(m)}</li>
                    ))}
                  </ul>
                )}
              </div>
            )}

            {s.history.length > 0 && (
              <ol
                ref={listRef}
                className="max-h-[60vh] min-h-0 flex-1 space-y-1 overflow-y-auto pr-1 lg:max-h-none"
              >
                {s.history.map((step, i) => {
                  const isCurrent = i === s.viewIndex - 1;
                  const isFuture = i >= s.viewIndex; // applied later than the current view
                  return (
                    <li key={i}>
                      <button
                        type="button"
                        onClick={() => s.viewStep(i + 1)}
                        title="Jump to this step"
                        className={[
                          'w-full rounded px-2 py-1 text-left text-sm',
                          isCurrent
                            ? 'bg-blue-100 dark:bg-blue-900/50'
                            : 'hover:bg-neutral-100 dark:hover:bg-neutral-800',
                          isFuture ? 'opacity-50' : '',
                        ].join(' ')}
                      >
                        <span className="mr-2 tabular-nums text-neutral-400">
                          {i + 1}.
                        </span>
                        <span className="font-medium">{step.technique}</span>
                        <span className="ml-1 text-neutral-500 dark:text-neutral-400">
                          {step.description}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ol>
            )}
          </section>
        )}
      </div>

      {/* Confirm clearing the grid */}
      <Modal
        open={confirmClear}
        title="Clear the grid?"
        onClose={() => setConfirmClear(false)}
        actions={
          <>
            <button
              type="button"
              className={btnGhost}
              onClick={() => setConfirmClear(false)}
            >
              Cancel
            </button>
            <button
              type="button"
              className={`${btn} bg-rose-600 text-white hover:bg-rose-500`}
              onClick={() => {
                s.clear();
                setConfirmClear(false);
              }}
            >
              Clear
            </button>
          </>
        }
      >
        This removes everything you&apos;ve entered. This can&apos;t be undone.
      </Modal>

      {/* Confirm clearing all notes */}
      <Modal
        open={confirmClearNotes}
        title="Clear all notes?"
        onClose={() => setConfirmClearNotes(false)}
        actions={
          <>
            <button
              type="button"
              className={btnGhost}
              onClick={() => setConfirmClearNotes(false)}
            >
              Cancel
            </button>
            <button
              type="button"
              className={`${btn} bg-rose-600 text-white hover:bg-rose-500`}
              onClick={() => {
                s.clearAllNotes();
                setConfirmClearNotes(false);
              }}
            >
              Clear notes
            </button>
          </>
        }
      >
        This removes every pencil-marked note on the grid. This can&apos;t be undone.
      </Modal>

      {/* Grid can't be solved (a mistake) */}
      <Modal
        open={s.problem !== null}
        title="This grid can't be solved"
        onClose={s.clearProblem}
        actions={
          <button type="button" className={btnPrimary} onClick={s.clearProblem}>
            OK
          </button>
        }
      >
        <ProblemBody problem={s.problem} />
      </Modal>
    </main>
  );
}

function ProblemBody({ problem }: { problem: SolveProblem | null }) {
  if (!problem) return null;
  if (problem.reason === 'unsolvable') {
    return (
      <p>
        There is a mistake: this grid has no valid solution. Double-check your entries and
        try again.
      </p>
    );
  }
  return (
    <div>
      <p>There is a mistake — the same digit appears more than once in a unit:</p>
      <ul className="mt-2 list-inside list-disc text-rose-600 dark:text-rose-400">
        {problem.mistakes.map((m, i) => (
          <li key={i}>{describeMistake(m)}</li>
        ))}
      </ul>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    solved:
      'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/60 dark:text-emerald-200',
    stuck: 'bg-amber-100 text-amber-800 dark:bg-amber-900/60 dark:text-amber-200',
    editing: 'bg-neutral-100 text-neutral-700 dark:bg-neutral-800 dark:text-neutral-300',
  };
  return (
    <span
      className={`rounded-full px-3 py-1 text-xs font-medium ${styles[status] ?? styles.editing}`}
    >
      {status}
    </span>
  );
}
