import { useCanGoBack, useRouter } from '@tanstack/react-router';

interface BackButtonProps {
  /** Where to land when there's no history to go back to. */
  fallbackTo: string;
}

/**
 * A "← Back" control for the standalone reference pages (How Sudoku Works,
 * Strong Links & Weak Links). Those aren't reached from one fixed place — the
 * header's `?` opens the first from anywhere, and lesson body text links to the
 * second — so a hardcoded "back to Learn" link would strand anyone who arrived
 * from the solver or from mid-lesson. Go back through history instead.
 *
 * Deep links and new tabs have no history entry to return to; those fall
 * through to `fallbackTo`. The label and markup are the same either way, so the
 * server and the client have nothing to disagree about at hydration —
 * `canGoBack` is only read inside the click handler.
 */
export function BackButton({ fallbackTo }: BackButtonProps) {
  const router = useRouter();
  const canGoBack = useCanGoBack();

  return (
    <button
      type="button"
      onClick={() => {
        if (canGoBack) router.history.back();
        else void router.navigate({ to: fallbackTo });
      }}
      className="-ml-2 mb-3 inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-sm font-medium text-neutral-600 transition-colors hover:bg-neutral-100 hover:text-neutral-900 dark:text-neutral-400 dark:hover:bg-neutral-800 dark:hover:text-neutral-100"
    >
      <span aria-hidden>←</span> Back
    </button>
  );
}
