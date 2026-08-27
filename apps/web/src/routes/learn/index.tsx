import { createFileRoute, Link } from '@tanstack/react-router';
import { getTactics } from '../../features/learn/tactics.js';
import { familyFor } from '../../features/learn/families.js';
import {
  TIER_LABEL,
  TIER_ORDER,
  type TacticSummary,
  type Tier,
} from '../../features/learn/types.js';

export const Route = createFileRoute('/learn/')({
  loader: () => getTactics(),
  component: LearnOverview,
});

/** Per-tier tint: a cool→warm progression from Beginner to Master. Class
 * strings are spelled out (not interpolated) so Tailwind keeps them. */
interface TierAccent {
  heading: string;
  rule: string;
  bar: string;
  card: string;
  family: string;
  familyLabel: string;
}
const TIER_ACCENT: Record<Tier, TierAccent> = {
  beginner: {
    heading: 'text-emerald-700 dark:text-emerald-400',
    rule: 'bg-emerald-500/60',
    bar: 'bg-emerald-500',
    card: 'border-emerald-200 hover:border-emerald-400 hover:bg-emerald-50/60 dark:border-emerald-900/70 dark:hover:border-emerald-700 dark:hover:bg-emerald-950/30',
    family: 'border-emerald-300 dark:border-emerald-800/80',
    familyLabel: 'text-emerald-700/80 dark:text-emerald-400/80',
  },
  intermediate: {
    heading: 'text-sky-700 dark:text-sky-400',
    rule: 'bg-sky-500/60',
    bar: 'bg-sky-500',
    card: 'border-sky-200 hover:border-sky-400 hover:bg-sky-50/60 dark:border-sky-900/70 dark:hover:border-sky-700 dark:hover:bg-sky-950/30',
    family: 'border-sky-300 dark:border-sky-800/80',
    familyLabel: 'text-sky-700/80 dark:text-sky-400/80',
  },
  advanced: {
    heading: 'text-amber-700 dark:text-amber-400',
    rule: 'bg-amber-500/60',
    bar: 'bg-amber-500',
    card: 'border-amber-200 hover:border-amber-400 hover:bg-amber-50/60 dark:border-amber-900/70 dark:hover:border-amber-700 dark:hover:bg-amber-950/30',
    family: 'border-amber-300 dark:border-amber-800/80',
    familyLabel: 'text-amber-700/80 dark:text-amber-400/80',
  },
  master: {
    heading: 'text-rose-700 dark:text-rose-400',
    rule: 'bg-rose-500/60',
    bar: 'bg-rose-500',
    card: 'border-rose-200 hover:border-rose-400 hover:bg-rose-50/60 dark:border-rose-900/70 dark:hover:border-rose-700 dark:hover:bg-rose-950/30',
    family: 'border-rose-300 dark:border-rose-800/80',
    familyLabel: 'text-rose-700/80 dark:text-rose-400/80',
  },
};

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
      className={`flex flex-col gap-2 rounded-lg border bg-white p-4 transition-colors dark:bg-neutral-900 ${accent.card}`}
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
            className={`mb-2 text-[11px] font-semibold tracking-wide uppercase ${accent.familyLabel}`}
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
              <TierTactics tactics={list} accent={accent} />
            </section>
          );
        })}
      </div>
    </main>
  );
}
