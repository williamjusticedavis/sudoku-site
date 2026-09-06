# @sudoku/db

Postgres schema, migrations, and the Learn content seed. Drizzle ORM.

`apps/web` reads this directly from its SSR loaders; `apps/api` uses it only for
the health check's `select 1`.

## Schema

Three tables, deliberately.

| Table            | What it holds                                                                                                           |
| ---------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `tactics`        | The 28 Learn lessons — slug, name, tier, description. Static reference data.                                            |
| `tactic_puzzles` | Curated example puzzles per tactic (at least 3 each) with their pre-generated walkthrough steps.                        |
| `feedback`       | Name + message from the site's feedback form. No email column: the site holds no contact details for anyone, by design. |

Nothing is user-scoped. There are no accounts, no progress tracking, and solves
are never persisted — the solver is stateless and ephemeral on purpose. Adding a
table for any of that is a product decision, not a gap to be filled in passing.

## Commands

```bash
pnpm db:generate   # write a migration from a schema change (never hand-write SQL)
pnpm db:migrate
pnpm db:seed       # 28 tactics, 84 puzzles
pnpm db:studio     # browse the data — this is how feedback gets read; there is no admin page
```

## The seed is generated, not written

`seed.ts` does not contain hand-written lesson steps. For each puzzle it runs the
**real engine**, plays whatever easier moves come first, and captures the target
technique's actual `Step` — description, highlights, eliminations — verbatim.

That makes it the sharpest end-to-end test in the repo: if a technique stops
firing on its example puzzle, the seed throws instead of quietly teaching the
wrong move. It also means **reordering `PATTERN_TECHNIQUES` in the engine
requires a re-seed**, because the order decides which step each lesson fires on.

## `mine-*.ts`

The scripts that produced the example puzzles. Each searches for a puzzle where
its tactic is not just _present_ but is genuinely the move to make — no simpler
technique sitting unplayed at the same position, and no other technique
producing the same elimination, which would let a learner solve it without ever
using the tactic being taught.

They share `mine-harness.ts` (solved-grid corpus, symmetry transforms, and clue
digging); each script adds only its own acceptance test. Re-run one when a
lesson needs a better example:

```bash
pnpm --filter @sudoku/db exec tsx src/mine-x-wing.ts 3
```
