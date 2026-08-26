import type { ReactNode } from 'react';

interface ToolbarIconButtonProps {
  label: string;
  shortcut?: string;
  onClick(): void;
  disabled?: boolean;
  children: ReactNode;
}

/** Icon-only button with a small custom tooltip (matches the app's look —
 * native `title` tooltips are slow to appear and styled by the OS). */
export function ToolbarIconButton({
  label,
  shortcut,
  onClick,
  disabled,
  children,
}: ToolbarIconButtonProps) {
  return (
    <div className="group relative">
      <button
        type="button"
        aria-label={label}
        onClick={onClick}
        disabled={disabled}
        className="rounded-md p-2 text-neutral-500 transition-colors hover:bg-neutral-100 hover:text-neutral-900 disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:bg-transparent dark:text-neutral-400 dark:hover:bg-neutral-800 dark:hover:text-neutral-100"
      >
        {children}
      </button>
      <span className="pointer-events-none absolute top-full left-1/2 z-30 mt-1 -translate-x-1/2 rounded-md bg-neutral-900 px-2 py-1 text-xs whitespace-nowrap text-white opacity-0 shadow-lg transition-opacity delay-150 group-hover:opacity-100 dark:bg-neutral-100 dark:text-neutral-900">
        {label}
        {shortcut ? ` (${shortcut})` : ''}
      </span>
    </div>
  );
}
