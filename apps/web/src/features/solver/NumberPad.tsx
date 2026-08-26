import { useRef } from 'react';

interface NumberPadProps {
  disabled: boolean;
  notesMode: boolean;
  onDigit(digit: number): void;
  onErase(): void;
}

const padBtn =
  'touch-manipulation rounded-md border border-neutral-300 bg-white py-3 font-medium text-neutral-900 disabled:cursor-not-allowed disabled:opacity-40 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100';

/** On-screen digit entry (mobile only) — the grid has no real <input>, so
 * tapping a cell never opens the OS keyboard. This is how touch users place
 * digits/notes; desktop keeps using the physical keyboard.
 *
 * Fires on pointerdown, not click: mobile browsers hold the click event for
 * ~300ms after touch to see if it's a double-tap, which read as visible lag
 * between tapping a digit and it appearing. `onClick` is kept as a fallback
 * (guarded against double-firing after a pointerdown already handled it) so
 * keyboard activation — Enter/Space, which never fires pointerdown — still
 * works. */
export function NumberPad({ disabled, notesMode, onDigit, onErase }: NumberPadProps) {
  const firedAtRef = useRef(0);
  const fire = (action: () => void) => {
    firedAtRef.current = Date.now();
    action();
  };
  const guardClick = (action: () => void) => {
    if (Date.now() - firedAtRef.current < 500) return; // already fired via pointerdown
    fire(action);
  };

  return (
    <div className="grid w-full max-w-[560px] grid-cols-5 gap-1.5 lg:hidden">
      {Array.from({ length: 9 }, (_, k) => k + 1).map((d) => (
        <button
          key={d}
          type="button"
          disabled={disabled}
          onPointerDown={() => fire(() => onDigit(d))}
          onClick={() => guardClick(() => onDigit(d))}
          aria-label={notesMode ? `Toggle note ${d}` : `Enter ${d}`}
          className={`${padBtn} text-lg`}
        >
          {d}
        </button>
      ))}
      <button
        type="button"
        disabled={disabled}
        onPointerDown={() => fire(onErase)}
        onClick={() => guardClick(onErase)}
        aria-label="Erase"
        className={`${padBtn} text-sm`}
      >
        ⌫
      </button>
    </div>
  );
}
