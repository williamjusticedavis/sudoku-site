import { createFileRoute, Link } from '@tanstack/react-router';
import { getTactics } from '../../features/learn/tactics.js';
import { PageLoading } from '../../features/shell/PageLoading.js';
import { familyFor } from '../../features/learn/families.js';
import {
  TIER_LABEL,
  TIER_ORDER,
  type TacticSummary,
  type Tier,
} from '../../features/learn/types.js';
import { TIER_ACCENT, type TierAccent } from '../../features/learn/tierAccent.js';

export const Route = createFileRoute('/learn/')({
  loader: () => getTactics(),
  component: LearnOverview,
  // Declared per route rather than router-wide: a defaultPendingComponent also
  // wraps the root match in <Suspense>, which breaks hydration (see router.tsx).
  pendingComponent: PageLoading,
  pendingMs: 300,
  pendingMinMs: 400,
});

/** The two Learn entries that aren't tactics — How Sudoku Works and Strong
 * Links & Weak Links. A tactic card is a raised white/neutral-900 panel on the
 * page ground; these are filled instead, so they sit *in* the page rather than
 * on it and read as something to read rather than something to work through.
 * (They already had no progress bar, and a dashed border — but dashed is also
 * the family-group marker a few lines down, so it wasn't distinguishing much.)
 *
 * Deliberately neutral rather than tier-tinted, including the one that lives
 * under Intermediate: the point being made is that it's a different *kind* of
 * thing, not a different difficulty, and a tier colour would say the opposite.
 *
 * "Filled" means opposite directions per theme, and that's on purpose. Light
 * mode fills *up* from the near-white page; dark mode fills *down*, darker than
 * both the page and the tactic cards. A pale grey panel in dark mode flattens
 * the whole card — the title stops reading as a heading even though its
 * contrast ratio is fine — so recessed is the only version that works in both. */
const infoCard = [
  'flex flex-col gap-1 rounded-lg border-2 border-dashed p-4 transition-colors',
  'border-neutral-300 bg-neutral-100 hover:border-neutral-400 hover:bg-neutral-200/70',
  'dark:border-neutral-600 dark:bg-black/40 dark:hover:border-neutral-500 dark:hover:bg-black/60',
].join(' ');

/** 0-100 completion for a tactic. No auth yet, so everything reads as
 * not started; wire this to `user_tactic_progress` when auth lands. */
function progressFor(): number {
  return 0;
}

function ProgressBar({ value, fill }: { value: number; fill: string }) {
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-neutral-200 dark:bg-neutral-800">
      <div
        className={`h-full rounded-full ${fill}`}
        style={{ width: `${Math.round(value)}%` }}
      />
    </div>
  );
}

function TacticCard({ tactic, accent }: { tactic: TacticSummary; accent: TierAccent }) {
  return (
    <Link
      to="/learn/$slug"
      params={{ slug: tactic.slug }}
      className={`flex flex-col gap-2 rounded-lg border-2 bg-white p-4 transition-colors dark:bg-neutral-900 ${accent.card}`}
    >
      <div className="font-semibold text-neutral-900 dark:text-neutral-100">
        {tactic.name}
      </div>
      <p className="grow text-sm text-neutral-600 dark:text-neutral-400">
        {tactic.description}
      </p>
      <ProgressBar value={progressFor()} fill={accent.bar} />
    </Link>
  );
}

/** Render a tier's tactics, wrapping adjacent family members in a tinted
 * dashed group. */
function TierTactics({
  tactics,
  accent,
}: {
  tactics: TacticSummary[];
  accent: TierAccent;
}) {
  const out: React.ReactNode[] = [];
  for (let i = 0; i < tactics.length;) {
    const tactic = tactics[i]!;
    const family = familyFor(tactic.slug);
    const partner = tactics[i + 1];
    if (family && partner && family.slugs.includes(partner.slug)) {
      out.push(
        <div
          key={tactic.slug}
          className={`rounded-xl border border-dashed p-3 sm:col-span-2 ${accent.family}`}
        >
          <div
            className={`mb-2 text-[0.6875rem] font-semibold tracking-wide uppercase ${accent.familyLabel}`}
          >
            {family.label}
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <TacticCard tactic={tactic} accent={accent} />
            <TacticCard tactic={partner} accent={accent} />
          </div>
        </div>,
      );
      i += 2;
    } else {
      out.push(<TacticCard key={tactic.slug} tactic={tactic} accent={accent} />);
      i += 1;
    }
  }
  return <div className="grid gap-3 sm:grid-cols-2">{out}</div>;
}

function LearnOverview() {
  const tactics = Route.useLoaderData();
  const byTier: Record<Tier, TacticSummary[]> = {
    beginner: [],
    intermediate: [],
    advanced: [],
    master: [],
  };
  for (const t of tactics) byTier[t.tier].push(t);

  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-8">
      <header className="mb-8">
        <h1 className="text-2xl font-bold text-neutral-900 dark:text-neutral-100">
          Learn
        </h1>
        <p className="mt-1 text-neutral-600 dark:text-neutral-400">
          Solving techniques, from the first digit you place to the patterns that crack
          the hardest grids. Each lesson walks one real puzzle.
        </p>
      </header>

      <Link to="/learn/basics" className={`mb-8 ${infoCard}`}>
        <div className="font-semibold text-neutral-900 dark:text-neutral-100">
          New to sudoku? Start here
        </div>
        <p className="text-sm text-neutral-600 dark:text-neutral-400">
          How Sudoku Works — the single rule, what &ldquo;solved&rdquo; means, and the
          words (unit, candidate) every lesson below assumes you know.
        </p>
      </Link>

      <div className="flex flex-col gap-10">
        {TIER_ORDER.map((tier) => {
          const list = byTier[tier];
          if (list.length === 0) return null;
          const accent = TIER_ACCENT[tier];
          const done = list.filter(() => progressFor() >= 100).length;
          return (
            <section key={tier}>
              <div className="mb-2 flex items-baseline justify-between gap-4">
                <h2 className={`text-lg font-semibold ${accent.heading}`}>
                  {TIER_LABEL[tier]}
                </h2>
                <span className="text-sm text-neutral-500 dark:text-neutral-400">
                  {done} / {list.length}
                </span>
              </div>
              <div className={`mb-4 h-0.5 w-full rounded-full ${accent.rule}`} />
              {/* Sits above Intermediate, not Advanced: Skyscraper is the first
                  lesson that needs this vocabulary and it's an Intermediate one,
                  so a learner meeting "strong link" for the first time should
                  already have passed this card. */}
              {tier === 'intermediate' && (
                <Link to="/learn/strong-weak-links" className={`mb-3 ${infoCard}`}>
                  <div className="font-semibold text-neutral-900 dark:text-neutral-100">
                    Strong Links &amp; Weak Links
                  </div>
                  <p className="text-sm text-neutral-600 dark:text-neutral-400">
                    Not a tactic — the vocabulary Skyscraper and the chain-shaped lessons
                    after it lean on. Read this first if "strong link" and "weak link" are
                    new.
                  </p>
                </Link>
              )}
              <TierTactics tactics={list} accent={accent} />
            </section>
          );
        })}
      </div>
    </main>
  );
}
