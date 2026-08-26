import type { Step } from '@sudoku/engine';

interface MobileStepperProps {
  step: Step | null;
  viewIndex: number;
  totalSteps: number;
  onPrev(): void;
  onNext(): void;
}

/** Docked bottom bar (mobile only) — lets you step through the solve without
 * scrolling down to the step list and back up to see the grid. */
export function MobileStepper({
  step,
  viewIndex,
  totalSteps,
  onPrev,
  onNext,
}: MobileStepperProps) {
  return (
    <div
      className="fixed inset-x-0 bottom-0 z-30 border-t border-neutral-300 bg-white/95 px-2 backdrop-blur-sm lg:hidden dark:border-neutral-700 dark:bg-neutral-900/95"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      <div className="flex items-center gap-1 py-2">
        <button
          type="button"
          aria-label="Previous step"
          onClick={onPrev}
          disabled={viewIndex <= 0}
          className="shrink-0 rounded-md p-2 text-neutral-500 hover:bg-neutral-100 disabled:opacity-30 dark:text-neutral-400 dark:hover:bg-neutral-800"
        >
          <ChevronLeftIcon />
        </button>

        <div className="min-w-0 flex-1 px-1 text-center">
          {step ? (
            <>
              <div className="flex items-center justify-center gap-2 text-[11px] font-semibold tracking-wide text-neutral-500 uppercase">
                <span className="truncate">{step.technique}</span>
                <span className="shrink-0 tabular-nums text-neutral-400">
                  {viewIndex}/{totalSteps}
                </span>
              </div>
              <p className="truncate text-xs text-neutral-700 dark:text-neutral-300">
                {step.description}
              </p>
            </>
          ) : (
            <p className="text-xs text-neutral-500 dark:text-neutral-400">
              Tap next to take the first step.
            </p>
          )}
        </div>

        <button
          type="button"
          aria-label="Next step"
          onClick={onNext}
          disabled={viewIndex >= totalSteps}
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
