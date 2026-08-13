import { memo, useCallback, useEffect, useRef, type KeyboardEvent } from 'react';
import type { CellRole } from './highlights.js';

/** Transient, user-interaction highlighting (independent of solve-step roles). */
export type Interaction = 'match' | 'peer';

interface SudokuGridProps {
  /** 81 placed digits (0 = empty) — the grid to display. */
  placed: Int8Array;
  /** User pencil-mark candidate masks per cell (shown only in empty cells). */
  notes: Uint16Array;
  /** 81-char mask of cells the USER typed — shown bold vs engine-filled cells. */
  userCells: string;
  selected: number | null;
  highlight: Map<number, CellRole>;
  /** Cells flagged by the last mistake check. */
  mistakeCells: ReadonlySet<number>;
  /** Interaction highlights: same-digit ('match') and seen-cells ('peer'). */
  interaction: Map<number, Interaction>;
  /** Digit to emphasise inside pencil marks (from double-click), or null. */
  highlightDigit: number | null;
  editable: boolean;
  /** When true, typing a digit toggles a pencil mark instead of placing it. */
  notesMode: boolean;
  /** A placed digit to flash (it blocked a candidate the user tried to add). */
  flashCell: number | null;
  /** Bumped each time a flash is triggered, to restart the animation. */
  flashId: number;
  onSelect(cell: number | null): void;
  /** Double-click — used to highlight all instances of a digit. */
  onActivate(cell: number): void;
  onDigit(cell: number, digit: number | null): void;
  onToggleNote(cell: number, digit: number): void;
  onClearNotes(cell: number): void;
}

const INTERACTION_BG: Record<Interaction, string> = {
  match: 'bg-yellow-200 dark:bg-yellow-600/40',
  peer: 'bg-neutral-300/70 dark:bg-neutral-700/70',
};

const ROLE_BG: Record<CellRole, string> = {
  placement: 'bg-emerald-200 dark:bg-emerald-800/70',
  elimination: 'bg-rose-200 dark:bg-rose-800/70',
  base: 'bg-sky-200 dark:bg-sky-800/70',
  cover: 'bg-indigo-200 dark:bg-indigo-800/70',
  fin: 'bg-amber-200 dark:bg-amber-700/70',
  related: 'bg-neutral-200 dark:bg-neutral-700/60',
};

const MISTAKE_BG = 'bg-rose-300 dark:bg-rose-800';

/** The 3x3 pencil-mark grid for an empty cell. */
function NoteMarks({
  mask,
  highlightDigit,
}: {
  mask: number;
  highlightDigit: number | null;
}) {
  return (
    <div className="grid h-full w-full grid-cols-3 grid-rows-3 text-[9px] leading-none font-normal text-neutral-500 sm:text-[10px] dark:text-neutral-400">
      {Array.from({ length: 9 }, (_, k) => {
        const d = k + 1;
        const has = (mask & (1 << k)) !== 0;
        const hot = has && highlightDigit === d;
        return (
          <span
            key={k}
            className={`flex items-center justify-center ${
              hot ? 'font-bold text-yellow-600 dark:text-yellow-300' : ''
            }`}
          >
            {has ? d : ''}
          </span>
        );
      })}
    </div>
  );
}

interface CellProps {
  index: number;
  digit: number;
  noteMask: number;
  isUser: boolean;
  role: CellRole | undefined;
  inter: Interaction | undefined;
  isSelected: boolean;
  isMistake: boolean;
  highlightDigit: number | null;
  onSelect(index: number): void;
  onDoubleClick(index: number): void;
}

/** One cell — memoized so only cells whose props actually change re-render. */
const Cell = memo(function Cell({
  index,
  digit,
  noteMask,
  isUser,
  role,
  inter,
  isSelected,
  isMistake,
  highlightDigit,
  onSelect,
  onDoubleClick,
}: CellProps) {
  const col = index % 9;
  const row = Math.floor(index / 9);

  // Background priority: flagged mistakes, then solve-step role, then interaction
  // highlights, then the plain cell colour (single utility to avoid conflicts).
  const bg = isMistake
    ? MISTAKE_BG
    : role
      ? ROLE_BG[role]
      : inter
        ? INTERACTION_BG[inter]
        : 'bg-white dark:bg-neutral-900';

  return (
    <button
      type="button"
      role="gridcell"
      onPointerDown={() => onSelect(index)}
      onClick={() => onSelect(index)}
      onDoubleClick={() => onDoubleClick(index)}
      className={[
        'flex h-10 w-10 items-center justify-center text-xl font-medium select-none sm:h-12 sm:w-12 sm:text-2xl',
        'border-r border-b border-neutral-300 dark:border-neutral-700',
        bg,
        isUser
          ? 'font-bold text-neutral-900 dark:text-neutral-100'
          : 'text-blue-600 dark:text-blue-400',
        col % 3 === 2 && col !== 8
          ? 'border-r-2 border-r-neutral-600 dark:border-r-neutral-300'
          : '',
        row % 3 === 2 && row !== 8
          ? 'border-b-2 border-b-neutral-600 dark:border-b-neutral-300'
          : '',
        isMistake
          ? 'z-10 ring-2 ring-inset ring-rose-500'
          : isSelected
            ? 'z-10 ring-2 ring-inset ring-blue-500'
            : '',
      ].join(' ')}
    >
      {digit !== 0 ? (
        digit
      ) : noteMask !== 0 ? (
        <NoteMarks mask={noteMask} highlightDigit={highlightDigit} />
      ) : (
        ''
      )}
    </button>
  );
});

export function SudokuGrid({
  placed,
  notes,
  userCells,
  selected,
  highlight,
  mistakeCells,
  interaction,
  highlightDigit,
  editable,
  notesMode,
  flashCell,
  flashId,
  onSelect,
  onActivate,
  onDigit,
  onToggleNote,
  onClearNotes,
}: SudokuGridProps) {
  const gridRef = useRef<HTMLDivElement>(null);

  // Latest handlers in refs so the memoized cell callbacks can stay stable.
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;
  const onActivateRef = useRef(onActivate);
  onActivateRef.current = onActivate;

  // Keep the selected cell in a ref so a keypress fired a few ms after a click
  // uses the up-to-date selection (React may not have re-rendered yet).
  const selectedRef = useRef(selected);
  useEffect(() => {
    selectedRef.current = selected;
  }, [selected]);

  // Stable callbacks (empty deps) — set the ref synchronously, then notify.
  const handleCellClick = useCallback((cell: number) => {
    selectedRef.current = cell;
    onSelectRef.current(cell);
  }, []);
  const handleCellDoubleClick = useCallback((cell: number) => {
    selectedRef.current = cell;
    onActivateRef.current(cell);
  }, []);

  // Flash a blocking cell twice — imperatively, so it never remounts the cell
  // or interferes with rapid input. Re-runs whenever flashId is bumped.
  useEffect(() => {
    if (flashCell === null) return;
    const cell = gridRef.current?.querySelectorAll('[role="gridcell"]')[flashCell];
    cell?.animate(
      [
        { backgroundColor: 'transparent' },
        { backgroundColor: '#fbbf24' },
        { backgroundColor: 'transparent' },
        { backgroundColor: '#fbbf24' },
        { backgroundColor: 'transparent' },
      ],
      { duration: 700, easing: 'ease-in-out' },
    );
  }, [flashCell, flashId]);

  function handleKey(e: KeyboardEvent<HTMLDivElement>) {
    const sel = selectedRef.current;
    if (sel === null) return;
    const row = Math.floor(sel / 9);
    const col = sel % 9;

    // Use e.code so Shift+<digit> (which changes e.key to a symbol) still works.
    const digitMatch = /^(?:Digit|Numpad)([1-9])$/.exec(e.code);
    if (digitMatch) {
      const d = Number(digitMatch[1]);
      // Notes when the mode is on OR Shift is held (Shift is a transient note key).
      if (editable) {
        if (notesMode || e.shiftKey) onToggleNote(sel, d);
        else onDigit(sel, d);
      }
      e.preventDefault();
    } else if (e.key === 'Backspace' || e.key === 'Delete' || e.code === 'Digit0') {
      if (editable) {
        if (notesMode) onClearNotes(sel);
        else onDigit(sel, null);
      }
      e.preventDefault();
    } else if (e.key === 'ArrowUp' && row > 0) {
      handleCellClick(sel - 9);
      e.preventDefault();
    } else if (e.key === 'ArrowDown' && row < 8) {
      handleCellClick(sel + 9);
      e.preventDefault();
    } else if (e.key === 'ArrowLeft' && col > 0) {
      handleCellClick(sel - 1);
      e.preventDefault();
    } else if (e.key === 'ArrowRight' && col < 8) {
      handleCellClick(sel + 1);
      e.preventDefault();
    }
  }

  return (
    <div
      ref={gridRef}
      role="grid"
      tabIndex={0}
      onKeyDown={handleKey}
      aria-label="Sudoku grid"
      className="inline-grid grid-cols-9 rounded-sm border-2 border-neutral-700 outline-none ring-blue-500 focus:ring-2 dark:border-neutral-300"
    >
      {Array.from({ length: 81 }, (_, i) => (
        <Cell
          key={i}
          index={i}
          digit={placed[i] ?? 0}
          noteMask={notes[i] ?? 0}
          isUser={userCells[i] !== '.'}
          role={highlight.get(i)}
          inter={interaction.get(i)}
          isSelected={selected === i}
          isMistake={mistakeCells.has(i)}
          highlightDigit={highlightDigit}
          onSelect={handleCellClick}
          onDoubleClick={handleCellDoubleClick}
        />
      ))}
    </div>
  );
}
