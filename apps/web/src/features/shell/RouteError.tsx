import { Link, useRouter, type ErrorComponentProps } from '@tanstack/react-router';

/**
 * What a user sees when a route loader throws — in practice, a failed database
 * query on the Learn pages.
 *
 * The framework default rendered the raw thrown message, which for a Drizzle
 * failure is the full SQL text and column list. That is never shown here: the
 * message is gated behind `import.meta.env.DEV` so it helps locally and cannot
 * reach production. The real error still goes to the server logs regardless.
 *
 * Rendered inside the root Outlet (via `defaultErrorComponent`), so the site
 * header survives and there is always a way out. The Solver link is the useful
 * escape hatch specifically because the solver runs entirely in the browser and
 * keeps working when the database is down.
 */
export function RouteError({ error }: ErrorComponentProps) {
  const router = useRouter();

  return (
    <main className="mx-auto w-full max-w-lg px-4 py-16 text-center">
      <h1 className="mb-2 text-2xl font-bold text-neutral-900 dark:text-neutral-100">
        Something went wrong
      </h1>
      <p className="mb-6 text-neutral-600 dark:text-neutral-400">
        We couldn&rsquo;t load this page. It&rsquo;s probably temporary — try again in a
        moment.
      </p>

      <div className="flex items-center justify-center gap-2">
        <button
          type="button"
          onClick={() => void router.invalidate()}
          className="rounded-md bg-blue-600 px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-blue-500"
        >
          Try again
        </button>
        <Link
          to="/"
          className="rounded-md border border-neutral-300 px-5 py-2.5 text-sm font-medium transition-colors hover:bg-neutral-100 dark:border-neutral-700 dark:hover:bg-neutral-800"
        >
          Go to the solver
        </Link>
      </div>

      <p className="mt-6 text-sm text-neutral-500 dark:text-neutral-400">
        The solver works offline in your browser, so it&rsquo;s unaffected.
      </p>

      {import.meta.env.DEV && (
        <details className="mt-8 text-left">
          <summary className="cursor-pointer text-xs font-semibold tracking-wide text-neutral-500 uppercase dark:text-neutral-400">
            Error detail (dev only)
          </summary>
          <pre className="mt-2 overflow-x-auto rounded-md bg-neutral-100 p-3 text-xs whitespace-pre-wrap text-rose-700 dark:bg-neutral-900 dark:text-rose-400">
            {error instanceof Error ? (error.stack ?? error.message) : String(error)}
          </pre>
        </details>
      )}
    </main>
  );
}
