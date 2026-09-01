import { techniqueName, type ExplainBeat, type Step } from '@sudoku/engine';

interface MobileStepperProps {
  step: Step | null;
  /** Narration for `step` — the bar reads one beat at a time, same as the
   * desktop panel, so mobile isn't stuck with the terse engine description. */
  beats: readonly ExplainBeat[];
  beat: number;
  /** True while `step` is a hint that hasn't been applied yet. */
  pending: boolean;
  viewIndex: number;
  totalSteps: number;
  canPrev: boolean;
  canNext: boolean;
  onPrev(): void;
  onNext(): void;
}

/** Docked bottom bar (mobile only) — lets you step through the solve without
 * scrolling down to the step list and back up to see the grid. */
export function MobileStepper({
  step,
  beats,
  beat,
  pending,
  viewIndex,
  totalSteps,
  canPrev,
  canNext,
  onPrev,
  onNext,
}: MobileStepperProps) {
  const lastBeat = beats.length === 0 || beat === beats.length - 1;
  return (
    <div
      className="fixed inset-x-0 bottom-0 z-30 border-t border-neutral-300 bg-white/95 px-2 backdrop-blur-sm lg:hidden dark:border-neutral-700 dark:bg-neutral-900/95"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      <div className="flex items-center gap-1 py-2">
        <button
          type="button"
          aria-label="Previous"
          onClick={onPrev}
          disabled={!canPrev}
          className="shrink-0 rounded-md p-2 text-neutral-500 hover:bg-neutral-100 disabled:opacity-30 dark:text-neutral-400 dark:hover:bg-neutral-800"
        >
          <ChevronLeftIcon />
        </button>

        <div className="min-w-0 flex-1 px-1 text-center">
          {step ? (
            <>
              <div className="flex items-center justify-center gap-2 text-[0.6875rem] font-semibold tracking-wide text-neutral-500 uppercase">
                <span className="truncate">{techniqueName(step.technique)}</span>
                <span className="shrink-0 tabular-nums text-neutral-400">
                  {pending ? 'hint' : `${viewIndex}/${totalSteps}`}
                  {beats.length > 1 ? ` · ${beat + 1}/${beats.length}` : ''}
                </span>
              </div>
              {/* Not truncated: a beat is a sentence, and cutting it off is
                  exactly the terseness this replaced. Two lines max, then
                  it scrolls — the bar stays a fixed height. */}
              <p className="line-clamp-2 text-xs text-neutral-700 dark:text-neutral-300">
                {beats[beat]?.explanation ?? step.description}
              </p>
              {pending && lastBeat && (
                <p className="text-[0.6875rem] font-medium text-blue-600 dark:text-blue-400">
                  Next applies this step
                </p>
              )}
            </>
          ) : (
            <p className="text-xs text-neutral-500 dark:text-neutral-400">
              Tap next to take the first step.
            </p>
          )}
        </div>

        <button
          type="button"
          aria-label={pending && lastBeat ? 'Apply this step' : 'Next'}
          onClick={onNext}
          disabled={!canNext}
          className="shrink-0 rounded-md p-2 text-neutral-500 hover:bg-neutral-100 disabled:opacity-30 dark:text-neutral-400 dark:hover:bg-neutral-800"
        >
          <ChevronRightIcon />
        </button>
      </div>
    </div>
  );
}

function ChevronLeftIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-5 w-5"
      aria-hidden="true"
    >
      <path d="m15 18-6-6 6-6" />
    </svg>
  );
}

function ChevronRightIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-5 w-5"
      aria-hidden="true"
    >
      <path d="m9 18 6-6-6-6" />
    </svg>
  );
}
