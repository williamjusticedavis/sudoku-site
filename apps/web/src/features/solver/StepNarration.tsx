import { Link } from '@tanstack/react-router';
import {
  lessonSlugFor,
  techniqueName,
  type ExplainBeat,
  type Step,
} from '@sudoku/engine';

interface StepNarrationProps {
  /** The step being read — pending (not yet applied) or the viewed one. */
  step: Step;
  beats: readonly ExplainBeat[];
  beat: number;
  /** True while the step hasn't been applied to the board yet. */
  pending: boolean;
  /** Whether a move in each direction is still possible — a move can cross
   * into the neighbouring step, so this isn't just "beat 0" / "last beat". */
  canPrev: boolean;
  canNext: boolean;
  onPrev(): void;
  onNext(): void;
  onApply(): void;
}

/**
 * The solver's read-out for one step: the technique's proper name and the same
 * beat-by-beat narration its Learn lesson uses, walked with the same controls.
 * Before this, the panel printed the engine's own one-line description — set
 * notation and all — which told a reader who already knew the pattern what had
 * happened, and told everyone else nothing.
 */
export function StepNarration({
  step,
  beats,
  beat,
  pending,
  canPrev,
  canNext,
  onPrev,
  onNext,
  onApply,
}: StepNarrationProps) {
  const current = beats[beat];
  const last = beats.length === 0 || beat === beats.length - 1;
  const slug = lessonSlugFor(step.technique);

  return (
    <div
      className={[
        'rounded-md border p-3',
        pending
          ? 'border-blue-300 bg-blue-50/60 dark:border-blue-800 dark:bg-blue-950/30'
          : 'border-neutral-200 dark:border-neutral-800',
      ].join(' ')}
    >
      <div className="text-xs font-semibold tracking-wide text-neutral-500 uppercase">
        {techniqueName(step.technique)}
      </div>

      <p className="mt-1 text-sm">{current?.explanation ?? step.description}</p>

      {slug && (
        // Named rather than "Learn this": the reader may not yet know what the
        // header word even means, which is exactly when this link is worth
        // following. Its own row — the question is too long to sit beside the
        // technique name without crowding it.
        <Link
          to="/learn/$slug"
          params={{ slug }}
          // New tab on purpose: the solver keeps nothing between visits (no
          // solve persistence, by design), so navigating away in place would
          // throw away the grid and the step the reader is standing on.
          target="_blank"
          rel="noreferrer"
          className="mt-2 inline-block text-xs text-blue-600 underline underline-offset-2 hover:no-underline dark:text-blue-400"
        >
          What is {techniqueName(step.technique)}?
        </Link>
      )}

      <div className="mt-3 flex items-center gap-2">
        <button
          type="button"
          onClick={onPrev}
          disabled={!canPrev}
          className="rounded border border-neutral-300 px-2 py-1 text-xs disabled:opacity-30 hover:bg-neutral-100 dark:border-neutral-700 dark:hover:bg-neutral-800"
        >
          ← Back
        </button>
        <span className="tabular-nums text-xs text-neutral-500 dark:text-neutral-400">
          {beats.length === 0 ? '—' : `${beat + 1} / ${beats.length}`}
        </span>
        {pending && last ? (
          <button
            type="button"
            onClick={onApply}
            className="ml-auto rounded bg-blue-600 px-3 py-1 text-xs font-medium text-white hover:bg-blue-500"
          >
            Apply
          </button>
        ) : (
          <button
            type="button"
            onClick={onNext}
            disabled={!canNext}
            className="ml-auto rounded border border-neutral-300 px-2 py-1 text-xs disabled:opacity-30 hover:bg-neutral-100 dark:border-neutral-700 dark:hover:bg-neutral-800"
          >
            Next →
          </button>
        )}
      </div>
    </div>
  );
}
