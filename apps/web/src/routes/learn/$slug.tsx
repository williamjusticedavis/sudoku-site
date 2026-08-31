import { useMemo, useState } from 'react';
import { createFileRoute, Link, notFound } from '@tanstack/react-router';
import { applyStep, cellName, serializeGridWithCandidates } from '@sudoku/engine';
import { getTactic } from '../../features/learn/tactics.js';
import { familyFor } from '../../features/learn/families.js';
import { LessonBoard } from '../../features/learn/LessonBoard.js';
import { TACTIC_OVERVIEW } from '../../features/learn/overviews.js';
import { parseLessonGrid, toEngineStep } from '../../features/learn/stepAdapter.js';
import { NotFound } from '../../features/shell/NotFound.js';
import { PageLoading } from '../../features/shell/PageLoading.js';
import {
  TIER_LABEL,
  type LessonStep,
  type TacticDetail,
} from '../../features/learn/types.js';

export const Route = createFileRoute('/learn/$slug')({
  loader: async ({ params }) => {
    const tactic = await getTactic({ data: params.slug });
    if (!tactic) throw notFound();
    return tactic;
  },
  component: LessonPage,
  // Declared per route rather than router-wide: a defaultPendingComponent also
  // wraps the root match in <Suspense>, which breaks hydration (see router.tsx).
  pendingComponent: PageLoading,
  pendingMs: 300,
  pendingMinMs: 400,
  notFoundComponent: () => (
    <NotFound
      title="Lesson not found"
      message="There's no lesson at that address. It may have been renamed, or the link may have a typo in it."
    />
  ),
});

// Tactics simple enough that pencil marks aren't part of spotting them —
// showing candidates anyway implies they're needed when they're not.
const NO_CANDIDATES_SLUGS = new Set(['last-free-cell', 'cross-hatching']);

// A nudge toward the board's double-click-to-explore trick, shown only on a
// practice puzzle's "try it yourself" prompt — only for tactics where that
// trick is actually the way you'd realistically spot the pattern by eye.
const EXPLORE_TIPS: Record<string, string> = {
  'cross-hatching':
    'Tip: double-click a placed number to dim every cell it (and its other copies) rules out — the same blocked-out area cross-hatching scans for.',
  'last-possible-number':
    'Tip: double-click a placed number to bold that digit in every cell’s pencil marks too — makes it easy to spot the one cell where it’s still left.',
};

const btn =
  'rounded-md px-5 py-2.5 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40';
const btnPrimary = `${btn} bg-blue-600 text-white hover:bg-blue-500`;
const btnGhost = `${btn} border border-neutral-300 hover:bg-neutral-100 dark:border-neutral-700 dark:hover:bg-neutral-800`;
const tacticNavLink =
  'flex max-w-[48%] flex-col gap-0.5 rounded-md px-3 py-2 text-sm text-neutral-800 transition-colors hover:bg-neutral-100 dark:text-neutral-200 dark:hover:bg-neutral-800';

/** Short confirmation of the board change an "Apply" click just made — kept
 * separate from `step.explanation` (the reasoning) so applying doesn't just
 * echo the sentence the learner already read. */
function appliedSummary(step: LessonStep): string {
  const placed = step.placements ?? [];
  const eliminated = step.eliminations ?? [];
  if (placed.length > 0) {
    const where = placed.map((p) => `${p.digit} in ${cellName(p.cell)}`).join(', ');
    return `Placed ${where}.`;
  }
  if (eliminated.length > 0) {
    const digits = [...new Set(eliminated.map((e) => e.digit))];
    const cells = eliminated.map((e) => cellName(e.cell)).join(', ');
    return `Removed ${digits.join(', ')} from ${cells}.`;
  }
  return 'Applied.';
}

/**
 * Puzzle-level navigation for a tactic's curated examples.
 *
 * Distinct from `ProgressDots` below, which tracks beats *within* one puzzle's
 * walkthrough. Before this the flow only ran forwards (Apply → next puzzle), so
 * someone on puzzle 3 had no way back to re-read example 1 without leaving the
 * lesson. Numbered rather than dotted precisely so it doesn't read as more step
 * progress.
 */
function PuzzleTabs({
  count,
  active,
  onSelect,
}: {
  count: number;
  active: number;
  onSelect: (index: number) => void;
}) {
  return (
    <div
      className="flex items-center gap-1.5"
      aria-label="Choose a puzzle"
      role="tablist"
    >
      {Array.from({ length: count }, (_, i) => {
        const current = i === active;
        return (
          <button
            key={i}
            type="button"
            role="tab"
            aria-selected={current}
            aria-label={`Puzzle ${i + 1} of ${count}`}
            onClick={() => onSelect(i)}
            className={`h-7 w-7 rounded-md text-sm font-medium transition-colors ${
              current
                ? 'bg-blue-600 text-white'
                : 'border border-neutral-300 text-neutral-600 hover:bg-neutral-100 dark:border-neutral-700 dark:text-neutral-400 dark:hover:bg-neutral-800'
            }`}
          >
            {i + 1}
          </button>
        );
      })}
    </div>
  );
}

function ProgressDots({ count, active }: { count: number; active: number }) {
  return (
    <div className="flex items-center gap-2">
      {Array.from({ length: count }, (_, i) => (
        <span
          key={i}
          className={`h-2.5 w-2.5 rounded-full ${
            i === active
              ? 'bg-blue-600 dark:bg-blue-400'
              : i < active
                ? 'bg-blue-300 dark:bg-blue-700'
                : 'bg-neutral-300 dark:bg-neutral-700'
          }`}
        />
      ))}
    </div>
  );
}

function LessonPage() {
  const tactic = Route.useLoaderData() as TacticDetail;
  const family = familyFor(tactic.slug);

  const [puzzleIndex, setPuzzleIndex] = useState(0);
  const [stepIndex, setStepIndex] = useState(0);
  const [applied, setApplied] = useState(false);
  // Teaching example plays the walkthrough straight away; practice puzzles wait
  // for the learner to ask for the hint.
  const [revealed, setRevealed] = useState(tactic.puzzles[0]?.isTeachingExample ?? false);

  const puzzle = tactic.puzzles[puzzleIndex];
  const steps = puzzle?.stepData ?? [];
  const step = steps[stepIndex] ?? null;
  const finalStep = steps[steps.length - 1] ?? null;
  const isFinalStep = stepIndex === steps.length - 1;
  const isLastPuzzle = puzzleIndex === tactic.puzzles.length - 1;

  // The position the walkthrough runs on: the step's firing grid, plus the
  // eliminations/placement once "Apply" is pressed on the final beat.
  const boardGrid = useMemo(() => {
    if (!puzzle || !finalStep) return puzzle?.gridState ?? '';
    const base = finalStep.gridBefore ?? puzzle.gridState;
    if (!applied) return base;
    const grid = parseLessonGrid(base);
    applyStep(grid, toEngineStep(finalStep));
    return serializeGridWithCandidates(grid);
  }, [puzzle, finalStep, applied]);

  if (!puzzle || !step || !finalStep) {
    return (
      <main className="mx-auto w-full max-w-3xl px-4 py-16 text-center text-neutral-600 dark:text-neutral-400">
        This lesson has no puzzle data yet.
      </main>
    );
  }

  function goToPuzzle(index: number) {
    setPuzzleIndex(index);
    setStepIndex(0);
    setApplied(false);
    setRevealed(tactic.puzzles[index]?.isTeachingExample ?? false);
  }

  const done = applied && isLastPuzzle;

  return (
    <main className="mx-auto w-full max-w-7xl px-4 py-8">
      <Link
        to="/learn"
        className="mb-2 inline-flex items-center gap-1.5 text-sm font-medium text-neutral-600 transition-colors hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-neutral-100"
      >
        <svg viewBox="0 0 16 16" aria-hidden className="h-4 w-4 fill-none stroke-current">
          <path d="M10 3 5 8l5 5" strokeWidth="1.75" strokeLinecap="round" />
        </svg>
        All lessons
      </Link>
      {/* Tier and family are context, not destinations — plain text, so the
          back link above is the only thing that looks clickable here. */}
      <div className="mb-1 flex items-center gap-2 text-xs font-medium tracking-wide text-neutral-500 uppercase dark:text-neutral-400">
        <span>{TIER_LABEL[tactic.tier]}</span>
        {family && (
          <>
            <span aria-hidden>·</span>
            <span>{family.label}</span>
          </>
        )}
      </div>
      <h1 className="mb-6 text-3xl font-bold text-neutral-900 dark:text-neutral-100">
        {tactic.name}
      </h1>

      <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_28rem]">
        <div className="flex justify-center">
          <LessonBoard
            grid={boardGrid}
            step={revealed ? step : null}
            dimOutsideFocus={revealed && !applied}
            focusMode={tactic.slug === 'bug+1' ? 'empty' : 'cells'}
            showCandidates={!NO_CANDIDATES_SLUGS.has(tactic.slug)}
            interactive={!revealed}
          />
        </div>

        <div className="flex flex-col gap-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <PuzzleTabs
              count={tactic.puzzles.length}
              active={puzzleIndex}
              onSelect={goToPuzzle}
            />
            {revealed && <ProgressDots count={steps.length} active={stepIndex} />}
          </div>
          <p className="-mt-2 text-sm text-neutral-500 dark:text-neutral-400">
            Puzzle {puzzleIndex + 1} of {tactic.puzzles.length}
            {puzzle.isTeachingExample ? ' · teaching example' : ' · practice'}
          </p>

          <div className="rounded-lg border border-neutral-200 bg-white p-5 dark:border-neutral-800 dark:bg-neutral-900">
            <p className="text-base leading-relaxed text-neutral-800 dark:text-neutral-200">
              {!revealed
                ? `Try to spot the ${tactic.name.toLowerCase()} yourself. Ask for the hint when you want the walkthrough.`
                : applied && isFinalStep
                  ? appliedSummary(step)
                  : step.explanation}
            </p>
            {!revealed && EXPLORE_TIPS[tactic.slug] && (
              <p className="mt-2 text-sm text-neutral-500 dark:text-neutral-400">
                {EXPLORE_TIPS[tactic.slug]}
              </p>
            )}
          </div>

          {!revealed ? (
            <div className="flex items-center gap-2">
              <button
                type="button"
                className={btnPrimary}
                onClick={() => setRevealed(true)}
              >
                Show hint
              </button>
            </div>
          ) : done ? (
            <div className="flex flex-col gap-3">
              <div className="rounded-lg border border-emerald-300 bg-emerald-50 p-5 text-base text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300">
                Lesson complete.{' '}
                {tactic.next ? (
                  <>
                    Next up:{' '}
                    <Link
                      to="/learn/$slug"
                      params={{ slug: tactic.next.slug }}
                      className="font-medium underline"
                    >
                      {tactic.next.name}
                    </Link>
                    .
                  </>
                ) : (
                  <>
                    That&rsquo;s the last tactic in the curriculum —{' '}
                    <Link to="/learn" className="font-medium underline">
                      back to Learn
                    </Link>
                    .
                  </>
                )}
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  className={btnGhost}
                  onClick={() => setApplied(false)}
                >
                  Back
                </button>
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <button
                type="button"
                className={btnGhost}
                disabled={stepIndex === 0 && !applied}
                onClick={() => {
                  if (applied) setApplied(false);
                  else setStepIndex((i) => Math.max(0, i - 1));
                }}
              >
                Back
              </button>

              {applied ? (
                <button
                  type="button"
                  className={btnPrimary}
                  onClick={() => goToPuzzle(puzzleIndex + 1)}
                >
                  {isLastPuzzle ? 'Finish' : 'Next puzzle'}
                </button>
              ) : isFinalStep ? (
                <button
                  type="button"
                  className={btnPrimary}
                  onClick={() => setApplied(true)}
                >
                  Apply
                </button>
              ) : (
                <button
                  type="button"
                  className={btnPrimary}
                  onClick={() => setStepIndex((i) => i + 1)}
                >
                  Next
                </button>
              )}
            </div>
          )}

          <div className="mt-1 rounded-lg border border-neutral-200 bg-neutral-50 p-5 dark:border-neutral-800 dark:bg-neutral-900/60">
            <h2 className="mb-2 text-xs font-semibold tracking-wide text-neutral-500 uppercase dark:text-neutral-400">
              About {tactic.name}
            </h2>
            <p className="text-sm leading-relaxed text-neutral-600 dark:text-neutral-400">
              {TACTIC_OVERVIEW[tactic.slug] ?? tactic.description}
            </p>
          </div>

          {/* Move between lessons without a round trip through the tier
              overview. Curriculum order, so these cross tier boundaries. */}
          <nav
            aria-label="Nearby lessons"
            className="flex items-stretch justify-between gap-3 border-t border-neutral-200 pt-4 dark:border-neutral-800"
          >
            {tactic.prev ? (
              <Link
                to="/learn/$slug"
                params={{ slug: tactic.prev.slug }}
                className={tacticNavLink}
              >
                <span className="text-xs text-neutral-500 dark:text-neutral-400">
                  ← Previous
                </span>
                <span className="font-medium">{tactic.prev.name}</span>
              </Link>
            ) : (
              <span />
            )}
            {tactic.next && (
              <Link
                to="/learn/$slug"
                params={{ slug: tactic.next.slug }}
                className={`${tacticNavLink} text-right`}
              >
                <span className="text-xs text-neutral-500 dark:text-neutral-400">
                  Next →
                </span>
                <span className="font-medium">{tactic.next.name}</span>
              </Link>
            )}
          </nav>
        </div>
      </div>
    </main>
  );
}
