# Gridwise

A sudoku solver that shows its working, and a set of lessons teaching the same
techniques it uses.

**Live:** https://sudoku-site-production.up.railway.app

Most solvers hand back a finished grid. This one names every move it makes —
"Skyscraper on 4", "Naked Triple in box 6" — and walks the reasoning a step at
a time, because the interesting part of a sudoku is _why_ a digit goes where it
goes. The 28 techniques it solves with are the same 28 taught in the Learn
section, so a move you don't recognise in the solver has a lesson behind it.

## What it does

- **Solve** — type, paste, or photograph a grid. Hint applies one technique;
  Solve fast-forwards through the rest. Same mechanism, different speed, so the
  step list reads the same either way and can be scrubbed back and forth.
- **Explain** — no brute force in the answer. The engine only ever plays a move
  a person could have found and named. A depth-1 forcing chain is the backstop,
  and it says so when it uses one.
- **Your pencil marks** — hand-written notes are verified against the puzzle's
  real solution and kept if they're right, rather than being trusted or thrown
  away. If any single mark is wrong the whole set resets; there's no partial
  credit, because half-trusted notes are worse than none.
- **Learn** — 28 lessons across four tiers, each with a worked example and
  practice puzzles, ordered by how hard a pattern is to _spot_ rather than to
  describe.

Nothing you solve is stored. The solver holds no state on the server, there are
no accounts, and the feedback form deliberately takes a name and a message and
no email — so the site has no way to contact anybody, by design.

## Repository layout

A pnpm workspace.

| Path              | What it is                                                                                                                                |
| ----------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/engine` | The solving engine. Framework-free TypeScript, no dependencies, runs **in the browser**. Techniques, the step model, narration templates. |
| `packages/db`     | Drizzle schema, migrations, the Learn seed, and the puzzle-mining scripts that produced its example puzzles.                              |
| `apps/web`        | TanStack Start frontend. Solver UI and Learn section; SSR loaders read Learn content straight from Postgres.                              |
| `apps/api`        | Express. Image preprocessing + Tesseract OCR for photographed grids, and a health check. Nothing else routes through it.                  |

The engine is deliberately isolated: it has no framework imports and no I/O, so
the whole solve happens client-side with no round trip.

## Running it locally

Needs Docker and pnpm.

```bash
cp .env.example .env
docker compose up            # web :3000, api :4000, postgres :5432
```

Then, once Postgres is healthy, load the Learn content:

```bash
pnpm db:migrate
pnpm db:seed                 # 28 tactics, 84 puzzles
```

`db:seed` regenerates every lesson's steps by running the real engine against
each puzzle, so it is also the sharpest end-to-end test in the repo: it throws
if a lesson's technique has stopped firing on its example.

Without Docker, run the packages directly (`pnpm --filter @sudoku/web dev`), but
the api needs Tesseract installed at OS level and web needs a reachable Postgres.

### Common commands

```bash
pnpm test                    # engine + api test suites
pnpm typecheck               # all four packages
pnpm lint
pnpm db:studio               # browse the database

pnpm --filter @sudoku/engine solve   # solve a grid from the CLI
```

## Notes for anyone reading the code

- **Technique order is load-bearing.** `PATTERN_TECHNIQUES` in
  `packages/engine/src/solver.ts` is ordered to match the curriculum's
  difficulty tiers, so the solver never reaches for a Master technique where an
  Intermediate one would do. Reordering it changes which step each seeded lesson
  fires on, so it requires a re-seed — `db:seed` will fail loudly rather than
  silently teach the wrong move.
- **Engine tests** live beside the technique they cover, except
  `packages/engine/src/__tests__/`, which holds the cross-cutting ones — grid
  and notation round-trips, plus `oracle.ts`, which loads the vendored puzzle
  fixtures and their precomputed solutions. The technique suites check
  themselves against those: the solver may leave a puzzle stuck, but it must
  never place a digit that disagrees with the known solution.
- Each package has its own README with more detail.

## Credits and licence

The solving engine was written with reference to
[GillesArcas/sudosol](https://github.com/GillesArcas/sudosol) (MIT); its licence
is kept at `packages/engine/LICENSE-sudosol`.

Digit recognition uses [Tesseract](https://github.com/tesseract-ocr/tesseract),
with a bundled OFL-licensed font for the reference glyph bank
(`apps/api/assets/fonts/LICENSE-OFL.txt`).

This project is MIT licensed — see [LICENSE](LICENSE).
