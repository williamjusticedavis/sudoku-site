import type { SolveProblem } from './useSolver.js';
import { describeMistake, mistakeKey } from './describeMistake.js';

export function ProblemBody({ problem }: { problem: SolveProblem | null }) {
  if (!problem) return null;
  if (problem.reason === 'unsolvable') {
    return (
      <p>
        There is a mistake: this grid has no valid solution. Double-check your entries and
        try again.
      </p>
    );
  }
  return (
    <div>
      <p>There is a mistake — the same digit appears more than once in a unit:</p>
      <ul className="mt-2 list-inside list-disc text-rose-600 dark:text-rose-400">
        {problem.mistakes.map((m) => (
          <li key={mistakeKey(m)}>{describeMistake(m)}</li>
        ))}
      </ul>
    </div>
  );
}
