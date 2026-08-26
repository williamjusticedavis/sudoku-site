interface NumberPadProps {
  disabled: boolean;
  notesMode: boolean;
  onDigit(digit: number): void;
  onErase(): void;
}

/** On-screen digit entry (mobile only) — the grid has no real <input>, so
 * tapping a cell never opens the OS keyboard. This is how touch users place
 * digits/notes; desktop keeps using the physical keyboard. */
export function NumberPad({ disabled, notesMode, onDigit, onErase }: NumberPadProps) {
  return (
    <div className="grid w-full max-w-[560px] grid-cols-5 gap-1.5 lg:hidden">
      {Array.from({ length: 9 }, (_, k) => k + 1).map((d) => (
        <button
          key={d}
          type="button"
          disabled={disabled}
          onClick={() => onDigit(d)}
          aria-label={notesMode ? `Toggle note ${d}` : `Enter ${d}`}
          className="touch-manipulation rounded-md border border-neutral-300 bg-white py-3 text-lg font-medium text-neutral-900 disabled:cursor-not-allowed disabled:opacity-40 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100"
        >
          {d}
        </button>
      ))}
      <button
        type="button"
        disabled={disabled}
        onClick={onErase}
        aria-label="Erase"
        className="touch-manipulation rounded-md border border-neutral-300 bg-white py-3 text-sm font-medium text-neutral-900 disabled:cursor-not-allowed disabled:opacity-40 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100"
      >
        ⌫
      </button>
    </div>
  );
}
