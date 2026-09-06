# @sudoku/engine

The solving engine. Plain TypeScript with **no runtime dependencies and no
framework imports**, so it runs unchanged in the browser — the whole solve
happens client-side with no server round trip.

## What it is for

It solves a grid the way a person would explain it: by applying a named
technique, saying which cells it looked at and why, and moving on. Every move
comes back as a `Step` carrying the technique id, the cells involved in their
roles (base, cover, fin, elimination…), and the narration beats the UI draws.

Brute force exists only as an oracle in the tests, never in an answer.

## Shape of the API

```ts
import { parseGrid, hint, solveAll, isValid } from '@sudoku/engine';

const grid = parseGrid(
  '53..7....6..195....98....6.8...6...34..8.3..17...2...6.6....28....419..5....8..79',
);

isValid(grid); // false if a digit is duplicated in a unit
const step = hint(grid); // the next technique to play, with its explanation
const result = solveAll(grid); // { status, steps } — status is solved | stuck | invalid
```

`solve()` is something different and easy to mistake for the above: it is a
plain backtracking search in `validate.ts` with no techniques in it, used for
uniqueness checking and as the tests' oracle. It returns a finished grid, never
an explanation.

- `candidates.ts` — parsing, serialization, candidate computation. `parseBoard`
  accepts either a plain 81-character string or bracket-candidate notation.
- `solver.ts` — the solving loop and `PATTERN_TECHNIQUES`, the ordered list it
  walks. **The order is load-bearing** — see the comment above it before
  changing anything.
- `techniques/` — one file per technique family; the solver's own set.
- `teaching/` — relabels used only by the Learn curriculum. Never registered in
  `TECHNIQUES`, and they never affect the solver's step labels.
- `explain/` — display names and the narration templates shared by the solver
  page and the seeded lessons, so a technique reads the same in both.

## Solving loop

Recompute state → walk the techniques in order → apply the **first** one that
qualifies → start again from the top. Restarting matters: applying any technique
can unlock a trivially simple move elsewhere, and that simpler move is the one a
learner should be shown.

Hint and Solve are the same mechanism at different speeds, not two code paths.

## Commands

```bash
pnpm --filter @sudoku/engine test
pnpm --filter @sudoku/engine solve   # solve a grid from the CLI
```

Tests sit beside the technique they cover. `src/__tests__/` holds the
cross-cutting ones — grid and notation round-trips, plus `oracle.ts`, which
loads the vendored puzzle fixtures and their precomputed solutions so the
technique suites can check themselves against them.

The invariant those fixture runs assert is _consistency_, not completeness: the
technique solver is allowed to leave a puzzle stuck, but it must never place a
digit that disagrees with the known solution.

## Licence

MIT. Logic was adapted with reference to
[GillesArcas/sudosol](https://github.com/GillesArcas/sudosol) (MIT) — its notice
is kept at `LICENSE-sudosol`.
