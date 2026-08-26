import { useCallback, useMemo, useState } from 'react';
import {
  PEERS,
  checkForMistakes,
  cloneGrid,
  countSolutions,
  findConflicts,
  hint as engineHint,
  isSolved,
  parseGrid,
  replay,
  serializeGrid,
  solveAll,
  type Grid,
  type Mistake,
  type Step,
} from '@sudoku/engine';

const EMPTY = '.'.repeat(81);
// Floor on how long the solving spinner stays visible — most puzzles solve
// in a few ms, too fast to register as "spinning" without this.
const MIN_SOLVING_MS = 500;

export type SolverStatus = 'editing' | 'solved' | 'stuck';

/** Why a grid can't be solved — surfaced as a modal with the specific reason(s). */
export interface SolveProblem {
  readonly reason: 'conflict' | 'unsolvable';
  /** Specific mistakes to list (from checkForMistakes); empty for 'unsolvable'. */
  readonly mistakes: readonly Mistake[];
}

/** Engine-computed candidates for a board (never the user's notation) as a
 * per-cell notes array — the same shape `autoNotes` fills in manually. */
function computeCandidates(g: Grid): Uint16Array {
  const next = new Uint16Array(81);
  for (let i = 0; i < 81; i++) if (g.placed[i] === 0) next[i] = g.candidates[i]!;
  return next;
}

/** Normalize arbitrary pasted text to an 81-char givens string, or null. */
export function sanitizePuzzle(input: string): string | null {
  const cleaned = [...input]
    .filter((c) => /[0-9.]/.test(c))
    .map((c) => (c === '0' ? '.' : c));
  return cleaned.length === 81 ? cleaned.join('') : null;
}

/** Everything undo/redo needs to fully restore a moment in the current
 * puzzle's editing session. `notes`/`history` are never mutated in place
 * elsewhere (always replaced with a new array/typed-array), so it's safe to
 * keep bare references here instead of deep-copying. */
interface Snapshot {
  base: string;
  userCells: string;
  notes: Uint16Array;
  history: readonly Step[];
  viewIndex: number;
  stuck: boolean;
}

export interface UseSolver {
  /** The grid to render — the state at the currently-viewed step. */
  readonly display: Grid;
  /** User pencil-mark candidates per cell (9-bit mask). Display aid only —
   * never used for solving. Shown only in empty cells. */
  readonly notes: Uint16Array;
  /** 81 chars marking cells the USER typed (vs engine-filled) — for styling. */
  readonly userCells: string;
  /** Every applied step (hints and solve). Never truncated by scrubbing. */
  readonly history: readonly Step[];
  /** How many steps are applied in the current view (0..history.length). */
  readonly viewIndex: number;
  readonly status: SolverStatus;
  /** True while a Solve is running (fast in practice, but the engine call is
   * synchronous — this drives a loading state so the UI doesn't look frozen). */
  readonly solving: boolean;
  /** The step at the current view — drives the highlight + detail box. */
  readonly currentStep: Step | null;
  readonly problem: SolveProblem | null;
  readonly mistakes: readonly Mistake[] | null;
  readonly notice: string | null;
  readonly selected: number | null;
  readonly clueCount: number;
  readonly canUndo: boolean;
  readonly canRedo: boolean;
  /** Show a message in the notice banner (the same one paste/load failures use). */
  setNotice(message: string): void;
  select(cell: number | null): void;
  setDigit(cell: number, digit: number | null): void;
  /** Toggle a pencil-mark candidate in a cell. */
  toggleNote(cell: number, digit: number): void;
  /** Erase all pencil marks in a cell. */
  clearCellNotes(cell: number): void;
  /** Erase every pencil mark on the whole grid. */
  clearAllNotes(): void;
  /** Fill every empty cell's notes with the engine-computed candidates. */
  autoNotes(): void;
  clear(): void;
  load(input: string): void;
  solve(): void;
  hint(): void;
  /** Undo/redo the last mutating action (edits, notes, hint, solve). Bounded
   * to the current puzzle — Load/Clear discard the stacks rather than let
   * you undo into an unrelated previous grid. */
  undo(): void;
  redo(): void;
  /** View the board after `n` applied steps (non-destructive scrubbing). */
  viewStep(n: number): void;
  check(): void;
  /** Close the solve panel (clears the step list; keeps the board). */
  dismiss(): void;
  clearProblem(): void;
}

export function useSolver(): UseSolver {
  // `base` is the placed-digit string that `history` replays from. Manual edits
  // commit the full board back into `base` and reset history.
  const [base, setBase] = useState<string>(EMPTY);
  const [userCells, setUserCells] = useState<string>(EMPTY);
  const [notes, setNotes] = useState<Uint16Array>(() => new Uint16Array(81));
  const [history, setHistory] = useState<readonly Step[]>([]);
  const [viewIndex, setViewIndex] = useState(0);
  const [stuck, setStuck] = useState(false);
  const [solving, setSolving] = useState(false);
  const [problem, setProblem] = useState<SolveProblem | null>(null);
  const [mistakes, setMistakes] = useState<readonly Mistake[] | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [selected, setSelected] = useState<number | null>(null);
  const [undoStack, setUndoStack] = useState<readonly Snapshot[]>([]);
  const [redoStack, setRedoStack] = useState<readonly Snapshot[]>([]);

  // Full state (all steps) drives status + the next hint; display honours the view.
  const full = useMemo(() => replay(base, [...history]), [base, history]);
  const display = useMemo(
    () => replay(base, [...history], viewIndex),
    [base, history, viewIndex],
  );

  const clueCount = useMemo(() => [...base].filter((c) => c !== '.').length, [base]);
  const status: SolverStatus = isSolved(full) ? 'solved' : stuck ? 'stuck' : 'editing';
  const currentStep = viewIndex > 0 ? (history[viewIndex - 1] ?? null) : null;

  /** Guard a solve/hint request against the puzzle. */
  const validate = useCallback((): 'empty' | SolveProblem | null => {
    if (clueCount === 0) return 'empty';
    const g = parseGrid(base);
    if (findConflicts(g).length > 0) {
      return { reason: 'conflict', mistakes: checkForMistakes(g).mistakes };
    }
    if (countSolutions(parseGrid(base), 1) === 0) {
      return { reason: 'unsolvable', mistakes: [] };
    }
    return null;
  }, [clueCount, base]);

  const resetSolve = useCallback(() => {
    setHistory([]);
    setViewIndex(0);
    setStuck(false);
    setProblem(null);
    setMistakes(null);
    setNotice(null);
  }, []);

  // Snapshot the current session state before a mutation, for undo. Any new
  // action invalidates the redo stack (standard undo/redo semantics).
  const pushUndo = useCallback(() => {
    setUndoStack((prev) => [
      ...prev,
      { base, userCells, notes, history, viewIndex, stuck },
    ]);
    setRedoStack([]);
  }, [base, userCells, notes, history, viewIndex, stuck]);

  const setDigit = useCallback(
    (cell: number, digit: number | null) => {
      pushUndo();
      // Commit the full board (incl. any hint fills) plus this edit into `base`.
      const placed = [...serializeGrid(full)];
      placed[cell] = digit === null ? '.' : String(digit);
      setBase(placed.join(''));
      setUserCells((prev) => {
        const arr = [...prev];
        arr[cell] = digit === null ? '.' : String(digit);
        return arr.join('');
      });
      // Placing a digit clears that cell's notes and removes it from peers'.
      setNotes((prev) => {
        const next = prev.slice();
        next[cell] = 0;
        if (digit !== null) {
          const mask = 1 << (digit - 1);
          for (const p of PEERS[cell]!) next[p] = next[p]! & ~mask;
        }
        return next;
      });
      resetSolve();
    },
    [full, resetSolve, pushUndo],
  );

  const toggleNote = useCallback(
    (cell: number, digit: number) => {
      if (full.placed[cell] !== 0) return; // only annotate empty cells
      pushUndo();
      setNotes((prev) => {
        const next = prev.slice();
        next[cell] = next[cell]! ^ (1 << (digit - 1));
        return next;
      });
    },
    [full, pushUndo],
  );

  const clearCellNotes = useCallback(
    (cell: number) => {
      pushUndo();
      setNotes((prev) => {
        const next = prev.slice();
        next[cell] = 0;
        return next;
      });
    },
    [pushUndo],
  );

  const clearAllNotes = useCallback(() => {
    pushUndo();
    setNotes(new Uint16Array(81));
  }, [pushUndo]);

  const autoNotes = useCallback(() => {
    // Engine-computed candidates from the currently VIEWED board (honours
    // scrubbing back through history — not the fully-hinted end state).
    const g = parseGrid(serializeGrid(display));
    pushUndo();
    setNotes(computeCandidates(g));
  }, [display, pushUndo]);

  const clear = useCallback(() => {
    setBase(EMPTY);
    setUserCells(EMPTY);
    setNotes(new Uint16Array(81));
    setSelected(null);
    // A fresh grid isn't undoable into the discarded one — same reasoning as
    // load() below.
    setUndoStack([]);
    setRedoStack([]);
    resetSolve();
  }, [resetSolve]);

  const load = useCallback(
    (input: string) => {
      const puzzle = sanitizePuzzle(input);
      if (!puzzle) {
        setNotice(
          'Could not read a puzzle — expected 81 cells (digits 1–9, . or 0 for blanks).',
        );
        return;
      }
      setBase(puzzle);
      setUserCells(puzzle);
      setNotes(new Uint16Array(81));
      // Loading a new puzzle isn't a step in the previous one's history.
      setUndoStack([]);
      setRedoStack([]);
      resetSolve();
    },
    [resetSolve],
  );

  const hint = useCallback(() => {
    const v = validate();
    if (v === 'empty') {
      setNotice('Enter or paste a puzzle first.');
      return;
    }
    if (v) {
      setProblem(v);
      return;
    }
    // A hint/solve is a new action on the grid — a check result from before
    // it no longer describes the current state.
    setMistakes(null);
    setNotice(null);
    pushUndo();
    const step = engineHint(cloneGrid(full));
    if (step) {
      const nextHistory = [...history, step];
      setHistory(nextHistory);
      setViewIndex(nextHistory.length);
      setStuck(false);
      setNotes(computeCandidates(replay(base, nextHistory)));
    } else {
      setStuck(true);
    }
  }, [validate, full, history, base, pushUndo]);

  const solve = useCallback(() => {
    const v = validate();
    if (v === 'empty') {
      setNotice('Enter or paste a puzzle first.');
      return;
    }
    if (v) {
      setProblem(v);
      return;
    }
    setMistakes(null);
    setNotice(null);
    pushUndo();
    setSolving(true);
    const started = Date.now();
    // solveAll is synchronous; two rAFs guarantee the "solving" state above
    // has actually painted (spinner visible) before the blocking call below
    // runs, instead of the UI just freezing.
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        const next = cloneGrid(full);
        const result = solveAll(next);
        const nextHistory = [...history, ...result.steps];
        setHistory(nextHistory);
        setViewIndex(nextHistory.length);
        setStuck(result.status !== 'solved' && !isSolved(next));
        setNotes(computeCandidates(replay(base, nextHistory)));
        // Most puzzles solve in a few ms — too fast for the spinner to read
        // as "spinning" (just one static frame). Keep it visible for a
        // minimum stretch so it's an actual perceivable loading state.
        const remaining = MIN_SOLVING_MS - (Date.now() - started);
        if (remaining > 0) setTimeout(() => setSolving(false), remaining);
        else setSolving(false);
      });
    });
  }, [validate, full, history, base, pushUndo]);

  const viewStep = useCallback(
    (n: number) => {
      const clamped = Math.max(0, Math.min(n, history.length));
      setViewIndex(clamped);
      // Scrubbing to a different step shows a different board — re-derive
      // candidates for it rather than leaving stale notes from the last step.
      if (history.length > 0) {
        setNotes(computeCandidates(replay(base, [...history], clamped)));
      }
    },
    [history, base],
  );

  const check = useCallback(() => {
    // Overlay the user's pencil marks so impossible-candidate / missing-digit
    // checks apply to what the user actually noted (computed candidates elsewhere).
    const g = parseGrid(serializeGrid(full));
    for (let i = 0; i < 81; i++) {
      if (g.placed[i] === 0 && notes[i] !== 0) g.candidates[i] = notes[i]!;
    }
    const report = checkForMistakes(g);
    setMistakes(report.mistakes);
    setNotice(
      report.ok
        ? 'No mistakes found (checked digit conflicts, impossible candidates, and missing digits).'
        : `Found ${report.mistakes.length} problem(s).`,
    );
  }, [full, notes]);

  const dismiss = useCallback(() => resetSolve(), [resetSolve]);
  const clearProblem = useCallback(() => setProblem(null), []);

  const undo = useCallback(() => {
    if (undoStack.length === 0) return;
    const last = undoStack[undoStack.length - 1]!;
    setRedoStack((r) => [...r, { base, userCells, notes, history, viewIndex, stuck }]);
    setUndoStack((u) => u.slice(0, -1));
    setBase(last.base);
    setUserCells(last.userCells);
    setNotes(last.notes);
    setHistory(last.history);
    setViewIndex(last.viewIndex);
    setStuck(last.stuck);
    setProblem(null);
    setMistakes(null);
    setNotice(null);
  }, [undoStack, base, userCells, notes, history, viewIndex, stuck]);

  const redo = useCallback(() => {
    if (redoStack.length === 0) return;
    const last = redoStack[redoStack.length - 1]!;
    setUndoStack((u) => [...u, { base, userCells, notes, history, viewIndex, stuck }]);
    setRedoStack((r) => r.slice(0, -1));
    setBase(last.base);
    setUserCells(last.userCells);
    setNotes(last.notes);
    setHistory(last.history);
    setViewIndex(last.viewIndex);
    setStuck(last.stuck);
    setProblem(null);
    setMistakes(null);
    setNotice(null);
  }, [redoStack, base, userCells, notes, history, viewIndex, stuck]);

  return {
    display,
    notes,
    userCells,
    history,
    viewIndex,
    status,
    solving,
    currentStep,
    problem,
    mistakes,
    notice,
    selected,
    clueCount,
    canUndo: undoStack.length > 0,
    canRedo: redoStack.length > 0,
    setNotice,
    select: setSelected,
    setDigit,
    toggleNote,
    clearCellNotes,
    clearAllNotes,
    autoNotes,
    clear,
    load,
    solve,
    hint,
    undo,
    redo,
    viewStep,
    check,
    dismiss,
    clearProblem,
  };
}

export { serializeGrid };
