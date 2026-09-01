import { useCallback, useMemo, useRef, useState } from 'react';
import {
  PEERS,
  applyStep,
  auditUserCandidates,
  cellName,
  checkForMistakes,
  cloneGrid,
  countSolutions,
  explainStep,
  findConflicts,
  hint as engineHint,
  isSolved,
  makeStep,
  parseGrid,
  replay,
  serializeGrid,
  solveAll,
  type CellIndex,
  type ExplainBeat,
  type Grid,
  type Mistake,
  type Step,
} from '@sudoku/engine';
import { beatAsStep } from './highlights.js';

const EMPTY = '.'.repeat(81);
// Floor on how long the solving spinner stays visible — most puzzles solve
// in a few ms, too fast to register as "spinning" without this.
const MIN_SOLVING_MS = 500;
// Sentinel beat index meaning "the last beat of whatever step is showing" —
// the reading position a step is left at once it's applied (its result), so
// walking backwards from there is what uncovers the reasoning.
const LAST_BEAT = Number.MAX_SAFE_INTEGER;

export type SolverStatus = 'editing' | 'solved' | 'stuck';

/** Why a grid can't be solved — surfaced as a modal with the specific reason(s). */
export interface SolveProblem {
  readonly reason: 'conflict' | 'unsolvable' | 'multiple';
  /** Specific mistakes to list (from checkForMistakes); only 'conflict' has any. */
  readonly mistakes: readonly Mistake[];
}

/** A board's candidates as a per-cell notes array — the same shape `autoNotes`
 * fills in. Reads the grid as replayed (so any step's eliminations, including a
 * `user-notes` step, are already reflected); it does not recompute from placed
 * digits. */
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
  /** User pencil-mark candidates per cell (9-bit mask). Shown only in empty
   * cells. Primarily a display aid, but a Solve/Hint audits them first (see
   * `userNotesStep`): marks that check out against the engine's candidates and
   * the real solution are folded in as a step so the user's hand-eliminations
   * aren't redone, and marks that don't are discarded wholesale. */
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
  /** A step the engine has found but NOT applied yet: a hint is read through
   * its beats first, exactly like a lesson, and only lands on the board when
   * the last beat's Apply is taken. */
  readonly pendingStep: Step | null;
  /** Narration beats for the step being read (pending, else the viewed one) —
   * the same templates the Learn lessons are built from. */
  readonly beats: readonly ExplainBeat[];
  /** Index into `beats` of the beat on screen. */
  readonly beat: number;
  /** The current beat in engine-Step shape, for the grid's highlight and
   * candidate-marker helpers. */
  readonly beatStep: Step | null;
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
  /** Find the next step and start reading it. While a step is pending this
   * advances a beat (and applies it at the end), so one button can drive the
   * whole walkthrough. */
  hint(): void;
  /** One move forward/back through the narration: within the current step's
   * beats, then across steps. Forward on a pending step's last beat applies
   * it; back off its first beat drops the hint. */
  readNext(): void;
  readPrev(): void;
  /** Commit the pending step to the board without reading the rest of it. */
  applyPending(): void;
  /** Undo/redo the last mutating action (edits, notes, hint, solve). Bounded
   * to the current puzzle — Load/Clear discard the stacks rather than let
   * you undo into an unrelated previous grid. */
  undo(): void;
  redo(): void;
  /** View the board after `n` applied steps (non-destructive scrubbing),
   * opening that step's explanation at its first beat. */
  viewStep(n: number): void;
  check(): void;
  /** True while the step panel is hidden — the solve is still there, just out
   * of the way (no panel, no dimming, no highlights). */
  readonly stepsHidden: boolean;
  /** Put the walkthrough away without losing it. Snaps the view to the end of
   * the solve first, so the board shows all the work rather than whatever
   * mid-scrub position was being read. */
  hideSteps(): void;
  showSteps(): void;
  /**
   * "Take it from here": keep the digits on screen but drop the solve — the
   * viewed board becomes the puzzle, its candidates become the notes, and the
   * step list goes away. Same re-base a manual edit does, which is what keeps
   * a user's own solving from ever conflicting with a stale step list.
   */
  takeOver(): void;
  /** Close the panel when it's only showing a mistake check. */
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
  const [pending, setPending] = useState<Step | null>(null);
  const [beat, setBeat] = useState(LAST_BEAT);
  const [stepsHidden, setStepsHidden] = useState(false);
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
  const currentStep = viewIndex > 0 ? (history[viewIndex - 1] ?? null) : null;

  // Narration for the step being read. A pending step is narrated against the
  // live board (it hasn't been applied); an applied one against the board as
  // it stood BEFORE it — the position its reasoning actually describes.
  const beats = useMemo<readonly ExplainBeat[]>(() => {
    if (pending) return explainStep(pending, full);
    if (!currentStep) return [];
    return explainStep(currentStep, replay(base, [...history], viewIndex - 1));
  }, [pending, full, currentStep, base, history, viewIndex]);

  // `beat` is stored unclamped (LAST_BEAT means "however many this step has"),
  // so switching steps never needs to know the new step's beat count.
  const beatIndex = beats.length === 0 ? 0 : Math.min(beat, beats.length - 1);
  const onLastBeat = beats.length === 0 || beatIndex === beats.length - 1;

  // Which board the beat is read against: every beat but the last describes
  // the position before the step landed, so scrubbing back through a step's
  // reasoning rolls the board back with it. A pending step is never applied,
  // so it always reads against the current board.
  const boardIndex = pending || onLastBeat ? viewIndex : Math.max(0, viewIndex - 1);
  const display = useMemo(
    () => replay(base, [...history], boardIndex),
    [base, history, boardIndex],
  );

  const beatStep = useMemo(
    () => (beats.length === 0 ? null : beatAsStep(beats[beatIndex]!)),
    [beats, beatIndex],
  );

  const clueCount = useMemo(() => [...base].filter((c) => c !== '.').length, [base]);
  const status: SolverStatus = isSolved(full) ? 'solved' : stuck ? 'stuck' : 'editing';

  /** Guard a solve/hint request against the puzzle. */
  const validate = useCallback((): 'empty' | SolveProblem | null => {
    if (clueCount === 0) return 'empty';
    const g = parseGrid(base);
    if (findConflicts(g).length > 0) {
      return { reason: 'conflict', mistakes: checkForMistakes(g).mistakes };
    }
    // Cap 2 so this distinguishes unsolvable / unique / multiple. Several
    // techniques (BUG+1, Unique Rectangle) assume a unique solution and would
    // misfire otherwise, and `auditUserCandidates` compares the user's marks
    // against *the* solution — with more than one, a perfectly valid mark could
    // be called wrong just because the search happened to land elsewhere.
    const solutions = countSolutions(parseGrid(base), 2);
    if (solutions === 0) return { reason: 'unsolvable', mistakes: [] };
    if (solutions > 1) return { reason: 'multiple', mistakes: [] };
    return null;
  }, [clueCount, base]);

  /**
   * Fold the user's hand-edited pencil marks into a replayable step, so work
   * they already did isn't discarded and then walked through again a step at a
   * time. `auditUserCandidates` verifies every mark against the engine's own
   * candidates AND the puzzle's real solution; one bad cell voids the whole set
   * (the engine's all-or-nothing policy — no partial credit), and the caller
   * falls back to solving from the placed digits alone.
   *
   * Returns `step: null` when there's nothing to add — no marks at all, or
   * marks the engine already agrees with. That also makes a second Solve on the
   * same board a no-op, since by then the marks equal the replayed candidates.
   */
  const userNotesStep = useCallback((): {
    step: Step | null;
    bad: readonly CellIndex[];
  } => {
    if (notes.every((m) => m === 0)) return { step: null, bad: [] };
    const audit = auditUserCandidates(full, notes);
    if (!audit.ok) return { step: null, bad: audit.badCells };
    if (audit.eliminations.length === 0) return { step: null, bad: [] };
    const n = audit.eliminations.length;
    return {
      step: makeStep({
        technique: 'user-notes',
        eliminations: [...audit.eliminations],
        highlights: [
          {
            role: 'elimination',
            cells: [...new Set(audit.eliminations.map((e) => e.cell))],
          },
        ],
        description: `Your notes — ${n} candidate${n === 1 ? '' : 's'} you already ruled out`,
      }),
      bad: [],
    };
  }, [full, notes]);

  /** Notice text for marks that failed the audit, naming the offending cells. */
  const badNotesNotice = useCallback((bad: readonly CellIndex[]): string => {
    const names = bad.map(cellName);
    const shown = names.slice(0, 3).join(', ');
    const rest = names.length > 3 ? ` and ${names.length - 3} more` : '';
    return `Your notes rule out a digit that belongs in ${shown}${rest}. Notes reset — solving from the puzzle instead.`;
  }, []);

  const resetSolve = useCallback(() => {
    setStepsHidden(false);
    setHistory([]);
    setViewIndex(0);
    setPending(null);
    setBeat(LAST_BEAT);
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
      // Commit the VIEWED board (honours scrubbing — not the fully-hinted end
      // state) plus this edit into `base`.
      const placed = [...serializeGrid(display)];
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
    [display, resetSolve, pushUndo],
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
    // The candidates of the currently VIEWED board (honours scrubbing back
    // through history — not the fully-hinted end state). Taken from the
    // replayed grid rather than recomputed from placed digits, so it never
    // resurrects candidates that steps already eliminated.
    pushUndo();
    setNotes(computeCandidates(display));
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
    // Mid-read: the same button walks the beats and applies at the end, so
    // "Hint" never abandons a step the user is halfway through.
    if (pending) {
      if (beatIndex < beats.length - 1) setBeat(beatIndex + 1);
      else applyPendingRef.current();
      return;
    }
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
    // Verified hand-eliminations go in first, so the hint picks up from where
    // the user actually is rather than re-deriving work they already did.
    const { step: userStep, bad } = userNotesStep();
    if (bad.length > 0) {
      setNotice(badNotesNotice(bad));
      // Do the reset the notice promises here, not as a side effect of a later
      // setNotes — a hint that comes back null never reaches one.
      setNotes(computeCandidates(full));
    }
    const g = cloneGrid(full);
    if (userStep) applyStep(g, userStep);
    const step = engineHint(g);
    // The user's own verified eliminations aren't a technique to be walked
    // through — they're work already done, so they land immediately and the
    // pending read is the technique the engine found on top of them.
    if (userStep) {
      const nextHistory = [...history, userStep];
      setHistory(nextHistory);
      setViewIndex(nextHistory.length);
      setNotes(computeCandidates(replay(base, nextHistory)));
    }
    if (step) {
      setPending(step);
      setBeat(0);
      setStuck(false);
    } else {
      setStuck(true);
    }
  }, [
    validate,
    full,
    history,
    base,
    pending,
    beatIndex,
    beats.length,
    pushUndo,
    userNotesStep,
    badNotesNotice,
  ]);

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
        // Verified hand-eliminations go in first, so the solve starts from the
        // user's actual position instead of replaying work they already did.
        const { step: userStep, bad } = userNotesStep();
        if (bad.length > 0) {
          setNotice(badNotesNotice(bad));
          // Do the reset the notice promises here, not as a side effect of a later
          // setNotes — a hint that comes back null never reaches one.
          setNotes(computeCandidates(full));
        }
        const next = cloneGrid(full);
        if (userStep) applyStep(next, userStep);
        const result = solveAll(next);
        const nextHistory = [
          ...history,
          ...(userStep ? [userStep] : []),
          ...result.steps,
        ];
        setHistory(nextHistory);
        setViewIndex(nextHistory.length);
        setPending(null);
        setBeat(LAST_BEAT);
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
  }, [validate, full, history, base, pushUndo, userNotesStep, badNotesNotice]);

  /** Beat count of the step at view position `n` (1-based), without building
   * it twice — used to know whether a beat is a step's last one. */
  const beatCountAt = useCallback(
    (n: number): number => {
      const step = n > 0 ? history[n - 1] : undefined;
      if (!step) return 0;
      return explainStep(step, replay(base, [...history], n - 1)).length;
    },
    [base, history],
  );

  /** Board a beat is read against — every beat but a step's last describes the
   * position before that step landed. */
  const boardIndexOf = useCallback(
    (view: number, idx: number, count: number) =>
      count === 0 || idx >= count - 1 ? view : Math.max(0, view - 1),
    [],
  );

  /** Re-derive the pencil marks for the board a beat move just exposed, the
   * same way scrubbing between steps does. */
  const syncNotes = useCallback(
    (view: number, idx: number, count: number) => {
      if (history.length === 0) return;
      setNotes(
        computeCandidates(replay(base, [...history], boardIndexOf(view, idx, count))),
      );
    },
    [base, history, boardIndexOf],
  );

  /** Jump to a step, opening it at `startBeat` (`LAST_BEAT` = its outcome). */
  const goToStep = useCallback(
    (n: number, startBeat: number) => {
      const clamped = Math.max(0, Math.min(n, history.length));
      setViewIndex(clamped);
      setPending(null);
      setBeat(startBeat);
      syncNotes(clamped, startBeat, beatCountAt(clamped));
    },
    [history.length, syncNotes, beatCountAt],
  );

  // Picking a step out of the list opens its explanation at the beginning —
  // someone who clicks "XY-Wing" wants to be told what an XY-Wing is, not
  // dropped on the closing "remove 9 from r1c8" line.
  const viewStep = useCallback((n: number) => goToStep(n, 0), [goToStep]);

  const applyPending = useCallback(() => {
    if (!pending) return;
    pushUndo();
    const nextHistory = [...history, pending];
    setHistory(nextHistory);
    setViewIndex(nextHistory.length);
    setPending(null);
    // Land on the outcome, not back at the opening beat — the step has been
    // taken, so the board and the narration should both show it done.
    setBeat(LAST_BEAT);
    setNotes(computeCandidates(replay(base, nextHistory)));
    setStuck(false);
  }, [pending, history, base, pushUndo]);

  // `hint` is defined above and calls this at a pending step's last beat; the
  // ref carries that one reference without reordering the two.
  const applyPendingRef = useRef(applyPending);
  applyPendingRef.current = applyPending;

  /**
   * One forward move through the solve, at beat granularity: advance within
   * the step being read, apply it if it's a pending one that's been read
   * through, else open the next applied step at its first beat. Backwards
   * mirrors it, landing on the previous step's outcome.
   */
  const readNext = useCallback(() => {
    if (beats.length > 0 && beatIndex < beats.length - 1) {
      setBeat(beatIndex + 1);
      if (!pending) syncNotes(viewIndex, beatIndex + 1, beats.length);
      return;
    }
    if (pending) {
      applyPending();
      return;
    }
    if (viewIndex < history.length) goToStep(viewIndex + 1, 0);
  }, [
    beats.length,
    beatIndex,
    pending,
    applyPending,
    syncNotes,
    viewIndex,
    history.length,
    goToStep,
  ]);

  const readPrev = useCallback(() => {
    if (beats.length > 0 && beatIndex > 0) {
      setBeat(beatIndex - 1);
      if (!pending) syncNotes(viewIndex, beatIndex - 1, beats.length);
      return;
    }
    // Backing out of a pending step's first beat drops the hint entirely —
    // nothing was applied, so there's nothing to undo.
    if (pending) {
      setPending(null);
      setBeat(LAST_BEAT);
      return;
    }
    if (viewIndex > 0) goToStep(viewIndex - 1, LAST_BEAT);
  }, [beats.length, beatIndex, pending, syncNotes, viewIndex, goToStep]);

  const check = useCallback(() => {
    // Overlay the user's pencil marks so impossible-candidate / missing-digit
    // checks apply to what the user actually noted (computed candidates elsewhere).
    const g = parseGrid(serializeGrid(full));
    for (let i = 0; i < 81; i++) {
      if (g.placed[i] === 0 && notes[i] !== 0) g.candidates[i] = notes[i]!;
    }
    // Structural problems, then the solution-backed pass that catches a mark
    // set which is structurally fine but rules out the digit that belongs. Both
    // halves, so this button can't disagree with what Solve tells you.
    const structural = checkForMistakes(g).mistakes;
    const wrong = auditUserCandidates(full, notes).wrongEliminations.map(
      (e): Mistake => ({ kind: 'wrong-elimination', cell: e.cell, digit: e.digit }),
    );
    const found = [...structural, ...wrong];
    setMistakes(found);
    setNotice(
      found.length === 0
        ? 'No mistakes found (checked digit conflicts, impossible candidates, missing digits, and notes that rule out the right digit).'
        : `Found ${found.length} problem(s).`,
    );
  }, [full, notes]);

  const hideSteps = useCallback(() => {
    // Snap to the end of the solve on the way out: hiding at step 12 of 51
    // would otherwise leave a half-applied board on screen with the
    // explanation for it now gone.
    if (history.length > 0) goToStep(history.length, LAST_BEAT);
    // A pending hint was never applied — there's nothing to keep.
    setPending(null);
    setMistakes(null);
    setStepsHidden(true);
  }, [history.length, goToStep]);

  const showSteps = useCallback(() => setStepsHidden(false), []);

  const takeOver = useCallback(() => {
    if (history.length === 0) return;
    pushUndo();
    // Exactly what a manual edit does (see `setDigit`): the board being viewed
    // becomes the new `base`, so nothing on screen is lost and no step list
    // survives that wasn't replayed from it.
    setBase(serializeGrid(display));
    setNotes(computeCandidates(display));
    resetSolve();
    // After resetSolve, which clears the notice — the board changing hands is
    // otherwise only visible as the status badge flipping back to "editing".
    setNotice(
      'The solve is yours now — these digits are the puzzle, and the notes are their candidates. Undo brings the step list back.',
    );
  }, [history.length, display, pushUndo, resetSolve]);

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
    pendingStep: pending,
    beats,
    beat: beatIndex,
    beatStep,
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
    readNext,
    readPrev,
    applyPending,
    undo,
    redo,
    viewStep,
    check,
    stepsHidden,
    hideSteps,
    showSteps,
    takeOver,
    dismiss,
    clearProblem,
  };
}

export { serializeGrid };
