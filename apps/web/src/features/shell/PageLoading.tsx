/**
 * Shown while a route loader is in flight.
 *
 * Measured before writing this: with no pending component, TanStack keeps the
 * *previous* page fully rendered and swaps atomically when the loader resolves.
 * So the problem was never a blank flash — it was silence. Against a deliberately
 * slowed loader, a MutationObserver recorded exactly one DOM change, 5.1s after
 * the click, with nothing in between. Clicking "Learn" looked like it had done
 * nothing, which invites a second click.
 *
 * Deliberately plain: the two Learn routes have quite different shapes (a tier
 * list of cards vs. a board beside a walkthrough panel), so a skeleton tuned to
 * either one would be wrong on the other. This is the router-wide default.
 */
export function PageLoading() {
  return (
    <main
      role="status"
      aria-live="polite"
      className="mx-auto flex w-full max-w-lg flex-col items-center gap-4 px-4 py-24"
    >
      <svg
        viewBox="0 0 24 24"
        aria-hidden
        className="h-7 w-7 animate-spin text-neutral-400 motion-reduce:animate-none dark:text-neutral-500"
      >
        <circle
          cx="12"
          cy="12"
          r="10"
          fill="none"
          strokeWidth="3"
          className="stroke-current opacity-25"
        />
        <path
          d="M12 2a10 10 0 0 1 10 10"
          fill="none"
          strokeWidth="3"
          strokeLinecap="round"
          className="stroke-current"
        />
      </svg>
      <p className="text-sm text-neutral-500 dark:text-neutral-400">Loading…</p>
    </main>
  );
}
