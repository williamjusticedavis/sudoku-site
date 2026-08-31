import { Link } from '@tanstack/react-router';

const action =
  'rounded-md px-5 py-2.5 text-sm font-medium transition-colors border border-neutral-300 hover:bg-neutral-100 dark:border-neutral-700 dark:hover:bg-neutral-800';
const actionPrimary =
  'rounded-md bg-blue-600 px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-blue-500';

/**
 * Shown for a URL that doesn't resolve. Wired up as the router's
 * defaultNotFoundComponent (the framework default was an unstyled "Not Found"
 * string with no way back), and reused by the lesson route for the narrower
 * case of a tactic slug that doesn't exist.
 *
 * `title`/`message` let a route say something more specific than "page"; the
 * two escape links are the same either way, since those are the only two places
 * worth offering from a dead end.
 */
export function NotFound({
  title = 'Page not found',
  message = "That link doesn't lead anywhere. It may be out of date, or the address may have a typo in it.",
}: {
  title?: string;
  message?: string;
}) {
  return (
    <main className="mx-auto w-full max-w-lg px-4 py-16 text-center">
      <p className="mb-2 text-sm font-semibold tracking-wide text-neutral-500 uppercase dark:text-neutral-400">
        404
      </p>
      <h1 className="mb-2 text-2xl font-bold text-neutral-900 dark:text-neutral-100">
        {title}
      </h1>
      <p className="mb-6 text-neutral-600 dark:text-neutral-400">{message}</p>
      <div className="flex items-center justify-center gap-2">
        <Link to="/" className={actionPrimary}>
          Go to the solver
        </Link>
        <Link to="/learn" className={action}>
          Browse lessons
        </Link>
      </div>
    </main>
  );
}
