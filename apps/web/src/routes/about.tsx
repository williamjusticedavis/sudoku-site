import { createFileRoute, Link } from '@tanstack/react-router';
import { getTactics } from '../features/learn/tactics.js';
import { PageLoading } from '../features/shell/PageLoading.js';
import { TIER_LABEL, TIER_ORDER, type Tier } from '../features/learn/types.js';
import { canonicalLink, seo } from '../features/seo/meta.js';

export const Route = createFileRoute('/about')({
  head: () => ({
    meta: seo({
      title: 'About',
      description:
        'Gridwise is a sudoku solver that shows its working, and a course in the techniques it uses. A side project, built for the love of the game.',
      path: '/about',
    }),
    links: [canonicalLink('/about')],
  }),
  // The lesson counts below come from the database rather than being written
  // into the copy. The curriculum is locked, but "locked" and "will never be
  // renumbered" are different things — the schema comment that claimed exactly
  // five tables was true when it was written too.
  loader: () => getTactics(),
  component: AboutPage,
  // Declared per route rather than router-wide, same reason as /learn: a
  // defaultPendingComponent wraps the root match in <Suspense> and breaks
  // hydration (see router.tsx).
  pendingComponent: PageLoading,
  pendingMs: 300,
  pendingMinMs: 400,
});

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-lg font-semibold text-neutral-900 dark:text-neutral-100">
        {title}
      </h2>
      <div className="flex flex-col gap-3 text-base leading-relaxed text-neutral-700 dark:text-neutral-300">
        {children}
      </div>
    </section>
  );
}

const inlineLink =
  'font-medium text-blue-600 underline decoration-blue-600/30 underline-offset-2 hover:decoration-blue-600 dark:text-blue-400 dark:decoration-blue-400/30 dark:hover:decoration-blue-400';

function AboutPage() {
  const tactics = Route.useLoaderData();

  const perTier = TIER_ORDER.map((tier: Tier) => ({
    tier,
    count: tactics.filter((t) => t.tier === tier).length,
  }));

  return (
    // No BackButton: that component belongs to the Learn flow, and this page is
    // reached from the footer on any route — there is no one place to go back to.
    <main className="mx-auto w-full max-w-3xl px-4 py-8">
      <h1 className="mb-2 text-3xl font-bold text-neutral-900 dark:text-neutral-100">
        About Gridwise
      </h1>
      <p className="mb-8 text-base text-neutral-600 dark:text-neutral-400">
        A sudoku solver that shows its working, and a course in the techniques it uses.
      </p>

      <div className="flex flex-col gap-10">
        <Section title="What this is">
          <p>
            Most sudoku solvers hand you a finished grid. That answers the puzzle and
            teaches you nothing — you still can&rsquo;t see what you missed.
          </p>
          <p>
            Gridwise is built the other way round. Every digit it places comes from a
            named solving technique, with an explanation of the pattern, the cells it
            rests on, and what it rules out. The{' '}
            <Link to="/" className={inlineLink}>
              Solver
            </Link>{' '}
            applies those techniques to whatever puzzle you bring it;{' '}
            <Link to="/learn" className={inlineLink}>
              Learn
            </Link>{' '}
            teaches you to spot the same ones yourself.
          </p>
          <p>
            It&rsquo;s a side project, built in spare time for the love of the game rather
            than to any deadline. That shows in both directions: nothing here exists
            because a roadmap called for it, and the parts that got the most attention are
            the ones that were the most fun to get right — the technique explanations,
            mostly. If something is missing or wrong, the{' '}
            <Link to="/feedback" className={inlineLink}>
              feedback page
            </Link>{' '}
            is the way to say so.
          </p>
        </Section>

        <Section title="How the solver works">
          <p>
            It never guesses and it never brute-forces an answer onto the board. It walks
            its list of techniques from the easiest, applies the first one that fits, then
            starts again from the top — because applying any technique can open up a much
            simpler move somewhere else, and that simpler move is the one worth showing
            you.
          </p>
          <p>
            Hint and Solve are the same machinery at different speeds. Hint stops after
            one move and talks you through it; Solve runs to the end and leaves the whole
            list behind, which you can scrub back and forth through to see the grid
            exactly as it stood at any point.
          </p>
          <p>
            Pencil marks you write yourself are checked rather than thrown away.
            They&rsquo;re tested against what the solver works out independently{' '}
            <em>and</em> against the puzzle&rsquo;s real solution; if every one holds up,
            the eliminations you already found are folded straight into the solve, so you
            aren&rsquo;t walked back through your own work. A single mark that rules out a
            digit which genuinely belongs voids the set and it solves from the placed
            digits instead, telling you which cell was wrong.
          </p>
        </Section>

        <Section title="The lessons">
          <p>
            {tactics.length} techniques, each its own lesson: the pattern explained in
            prose, then a real puzzle where it fires, walked move by move on a grid chosen
            to show that one idea clearly. After the worked example you get practice
            puzzles to spot it in yourself.
          </p>
          <p>
            They&rsquo;re grouped into four tiers ordered by how hard a pattern is to{' '}
            <em>notice</em> in a real grid, not by how complicated it is to describe —
            which is why Jellyfish sits in Master while X-Wing, the same shape at a
            smaller scale, is Intermediate.
          </p>
          <ul className="flex flex-col gap-1">
            {perTier.map(({ tier, count }) => (
              <li key={tier}>
                <span className="font-medium text-neutral-900 dark:text-neutral-100">
                  {TIER_LABEL[tier]}
                </span>{' '}
                — {count} {count === 1 ? 'lesson' : 'lessons'}
              </li>
            ))}
          </ul>
          <p>
            New to sudoku itself? Start with{' '}
            <Link to="/learn/basics" className={inlineLink}>
              How Sudoku Works
            </Link>
            , at the top of Learn.
          </p>
        </Section>

        <Section title="Your puzzles aren't stored">
          <p>
            The solver keeps nothing. Nothing you type, paste or photograph is saved
            anywhere — not to an account, not to the database, not between visits. Close
            the tab and the puzzle is gone; there is no history to come back to and
            re-entering the grid is the only way to resume.
          </p>
          <p>
            That&rsquo;s a deliberate choice rather than a missing feature. The one thing
            this site does store is what you send through the{' '}
            <Link to="/feedback" className={inlineLink}>
              feedback form
            </Link>
            , which is a name and a message and nothing else.
          </p>
        </Section>

        <Section title="Credits">
          <p>
            The solving engine was adapted in part from{' '}
            <a
              href="https://github.com/GillesArcas/sudosol"
              target="_blank"
              rel="noreferrer"
              className={inlineLink}
            >
              sudosol
            </a>{' '}
            by Gilles Arcas, used under the MIT licence. Grateful for it — the technique
            set it implements is a long way past where this would have started from
            scratch.
          </p>
          <p>
            Built with TypeScript, TanStack Start, Tailwind and Postgres. The engine
            itself is framework-free and runs entirely in your browser, which is why
            nothing about your puzzle needs to leave it.
          </p>
        </Section>
      </div>
    </main>
  );
}
