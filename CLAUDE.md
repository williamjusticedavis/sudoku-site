# Sudoku Solving/Learning Website

## Project overview

A website with two areas: a **solver** (paste/upload/type a sudoku, get it solved
or hinted step-by-step) and a **Learn** section (tiered lessons teaching sudoku
solving techniques, inspired by — but not copying — the Oakever iPhone app's
dim/highlight/stepper lesson style).

## Current phase: Phase 1 — Solving engine only

We are **not** building the website yet. The only active work right now is the
solving engine in `packages/engine`. Do not scaffold `apps/web` or `apps/api`
beyond empty placeholders unless explicitly asked.

Phase 1 goals:

- Implement sudoku solving techniques as individual, testable functions
- Port/adapt logic from `GillesArcas/sudosol` (Python, MIT licensed) as a
  reference — keep the MIT attribution notice in this repo once porting begins
- Go well beyond the original teaching-tactic list (see below) — aim for the
  fuller technique set sudosol and similar solvers implement, since the engine
  needs to reliably solve _any_ valid grid a user submits, not just ones using
  the originally-planned teaching set
- Tests from the start, alongside each technique as it's implemented —
  validate against known datasets (e.g. KyleGough/sudoku's puzzle sets) where
  possible, not just hand-written cases
- Implementation order: whatever groups/ports most easily (e.g. the fish
  family — X-Wing/Swordfish/Jellyfish — share structure and are worth doing
  together), not strict difficulty order

## Tech stack (full project, for context — most of this is Phase 2)

- Frontend: TanStack Start
- Backend: Express (Node.js) — scoped to auth + OCR only. Learn content
  (tactics / tactic_puzzles) is NOT served by Express: it is read via TanStack
  Start server loaders querying `@sudoku/db` directly.
- Database: Postgres, via Drizzle ORM
- Styling: Tailwind + shadcn/ui, dark mode support required
- Keyboard shortcuts: TanStack Hotkeys (currently alpha)
- Deployment: Railway (web, api, and db all deployed there)
- OCR (photo-upload grid detection): Tesseract, server-side, Express handles
  image preprocessing (grid detection/cropping) before OCR
- **Solving engine runs entirely client-side** in the browser (TypeScript) —
  no server round-trip for solving. This is why `packages/engine` must stay
  framework-free and portable.

  ## Data model (Phase 2 — Postgres via Drizzle)

Exactly 5 tables. Do not add more without checking in first — in particular,
do NOT persist solves (see below).

**users**

- id, username (unique), password_hash, created_at

**tactics** (static reference data — seeded once, not user-generated)

- id, slug (e.g. `xy-wing`), name, tier (beginner/intermediate/advanced/master),
  order_in_tier, description

**tactic_puzzles** (curated example puzzles per tactic, at least 3 each)

- id, tactic_id (FK), grid_state, solution_state, step_data (ordered hint
  steps: highlighted cells/units, explanation text per step),
  is_teaching_example (bool — first one per tactic vs. practice ones)

**user_tactic_progress**

- user_id (FK), tactic_id (FK), completed (bool), completed_at — drives the
  per-level progress bar in the Learn section

**user_favorite_tactics**

- user_id (FK), tactic_id (FK) — favoriting a tactic/lesson (e.g. "W-Wing"),
  NOT a puzzle. There is no puzzle-favoriting feature.

### Explicitly excluded — do not build these

- **No solve/solve-step persistence of any kind.** The solver page is fully
  stateless and ephemeral for every user, logged in or not. Closing the tab
  loses the puzzle; re-entering the grid from scratch is required to resume.
  This was a deliberate, explicit decision — don't add a `solves` or
  `solve_steps` table even if it seems like an obvious/easy addition.
- **No `saved_puzzles` table.** Favorites are tactic-scoped only (see
  `user_favorite_tactics` above), not puzzle-scoped.

## Core engine design decisions

- **The engine is the source of truth for candidates, never the user's input.**
  On load, always compute candidates from scratch from placed digits. Never
  trust a user's manual notation marks as correct.
- **Solving loop**: recompute state → walk techniques in confirmed difficulty
  order → apply the _first_ one that qualifies → restart from the top of the
  list (not continue from where you left off) → repeat until solved or stuck.
  Restarting from the top each time matters: applying any technique can
  unlock a trivially simple move elsewhere that should be caught first.
- **Hint and "solve all" are the same mechanism at different speeds.** Each
  hint click applies one technique and appends it to a step list; solve-all
  just fast-forwards through all remaining steps. No separate code paths.
- **Notation error handling**: if a user's submitted notations are wrong, do
  NOT attempt partial-credit reconciliation (this was explored and abandoned
  as impractical — see chat history if curious why). Simply reset to blank
  notation state and notify the user.
- **"Check for mistakes" is intentionally lightweight** — NOT full technique
  verification. Scope is exactly three checks:
  1. Digit conflicts (duplicate placed digit in a row/column/box)
  2. Impossible candidates present (a candidate that contradicts a placed digit)
  3. A digit missing entirely from a unit — neither placed nor present as a
     candidate anywhere in that row/column/box (definite contradiction)
     Do not extend this to catching wrongly-eliminated-but-still-valid
     candidates — that needs full reachability analysis and belongs in
     hint/solve, not this quick-check button.
- Invalid grids (duplicate digits) → reject immediately, no solve attempt.
- Valid grids with multiple solutions → flag and notify (some techniques,
  like BUG+1, assume a unique solution and would misfire otherwise).

## Learn curriculum — tactics table (locked, 2026-08-27)

This is the finalized set of `tactics` rows for seeding, superseding the
original planning list below it in git history. Tiers are based on real
solving-experience findability, not just structural complexity (e.g.
Jellyfish is much harder to spot than X-Wing despite being the same pattern
at a different scale). `order_in_tier` is a placeholder — it's just the
listing order below, never deliberately ranked — cheap to reorder later, not
worth blocking on.

**Beginner**

1. Last Free Cell
2. Naked Single
3. Cross-Hatching — _family: Hidden Single split_ (with Last Possible Number)
4. Last Possible Number — _family: Hidden Single split_ (with Cross-Hatching)

**Intermediate**

1. Pointing — _family: Locked Candidates_ (with Claiming)
2. Claiming — _family: Locked Candidates_ (with Pointing)
3. Naked Pair
4. Naked Triple
5. Naked Quad
6. Hidden Pair
7. Hidden Triple
8. Hidden Quad
9. X-Wing
10. Skyscraper

**Advanced**

1. 2-String Kite
2. Turbot Fish
3. Swordfish
4. XY-Wing
5. W-Wing
6. XYZ-Wing
7. Finned X-Wing
8. Finned Swordfish
9. Unique Rectangle
10. BUG+1

**Master**

1. Jellyfish
2. Finned Jellyfish
3. XY-Chain
4. Simple Coloring
5. ALS-XZ

**Technique families**: two or more tactics that are separate, fully
independent lessons (own progress bar, own practice puzzles) but share the
same underlying engine technique, and should get a shared visual
grouping/label in the Learn tier layout. Known families: Locked Candidates
(Pointing + Claiming — mirror-image logic), Hidden Single split
(Cross-Hatching + Last Possible Number — see below). Exact grouping UI still
open; decide when building the tier layout.

**Hidden Single — retired as a standalone lesson.** Cross-Hatching and Last
Possible Number are the two beginner-friendly ways of noticing the fact the
engine formally calls a Hidden Single (a digit has exactly one legal cell
left in a unit) — Cross-Hatching by active scanline elimination, Last
Possible Number by reading candidates already pencilled in. A third lesson
literally named "Hidden Single" would just re-teach the same concept a
learner already has from one of the other two. Keep "Hidden Single" as
vocabulary/context inside those two lessons' explanatory text (the "the
engine formally calls both of these one thing" note) — no dedicated tactics
row, no dedicated practice puzzles.

**Explicitly excluded from the tactics table** (do not add without checking
in first):

- **WXYZ-Wing** — not implemented in the engine (confirmed 2026-08-27: no
  `wxyzWing` function, no `wxyz-wing` technique id; puzzles tagged for it in
  third-party fixtures solve via other techniques instead). Can't generate
  curated step-by-step lesson content without building it first.
- **Forcing-Chain** — the solver's depth-1 completeness backstop, not a
  technique a human learns to spot the way the others are; closer to a
  guided guess-and-check than an explainable pattern. Not curriculum
  content.

Cross-Hatching and Last Possible Number are teaching-only relabels of
`hiddenSingle`, implemented in `packages/engine/src/teaching/` (kept
separate from `packages/engine/src/techniques/`, which stays exclusively the
solver's own technique set — see `TechniqueId` in `step.ts` and
`crossHatching`/`lastPossibleNumber` in `teaching/teachingSingles.ts`). They
are NOT registered in `solver.ts`'s `PATTERN_TECHNIQUES`/`TECHNIQUES` and
never change the main solving page's step labels or priority order — they
exist only to label the Learn section's curated lesson puzzles.

## Definitions worth preserving precisely

- **Last Free Cell**: a unit has only one empty cell left → trivially fill it.
- **Last Possible Number**: a unit isn't fully filled, but candidate marks
  show a digit can only go in one remaining cell (different from Last Free
  Cell — requires partial candidate awareness, not full completion).
- **Cross-Hatching**: scanline elimination technique; can be done with or
  without candidate marks present — not exclusively a "no candidates" method.
- **BUG+1**: grid reaches a state where every cell has exactly 2 candidates
  except one cell with 3. The puzzle's uniqueness constraint means the two
  "wrong" candidates would create multiple solutions, so the third is correct.
- **W-Wing**: two non-seeing cells share the same two candidates (X,Y),
  connected via a strong link elsewhere in the grid on one candidate.

## Licensing note

`GillesArcas/sudosol` is MIT licensed — free to port/adapt with attribution
kept somewhere in this repo (LICENSE file or README credit).

# context-mode — MANDATORY routing rules

You have context-mode MCP tools available. These rules are NOT optional — they protect your context window from flooding. A single unrouted command can dump 56 KB into context and waste the entire session.

## BLOCKED commands — do NOT attempt these

### curl / wget — BLOCKED

Any Bash command containing `curl` or `wget` is intercepted and replaced with an error message. Do NOT retry.
Instead use:

- `ctx_fetch_and_index(url, source)` to fetch and index web pages
- `ctx_execute(language: "javascript", code: "const r = await fetch(...)")` to run HTTP calls in sandbox

### Inline HTTP — BLOCKED

Any Bash command containing `fetch('http`, `requests.get(`, `requests.post(`, `http.get(`, or `http.request(` is intercepted and replaced with an error message. Do NOT retry with Bash.
Instead use:

- `ctx_execute(language, code)` to run HTTP calls in sandbox — only stdout enters context

### WebFetch — BLOCKED

WebFetch calls are denied entirely. The URL is extracted and you are told to use `ctx_fetch_and_index` instead.
Instead use:

- `ctx_fetch_and_index(url, source)` then `ctx_search(queries)` to query the indexed content

## REDIRECTED tools — use sandbox equivalents

### Bash (>20 lines output)

Bash is ONLY for: `git`, `mkdir`, `rm`, `mv`, `cd`, `ls`, `npm install`, `pip install`, and other short-output commands.
For everything else, use:

- `ctx_batch_execute(commands, queries)` — run multiple commands + search in ONE call
- `ctx_execute(language: "shell", code: "...")` — run in sandbox, only stdout enters context

### Read (for analysis)

If you are reading a file to **Edit** it → Read is correct (Edit needs content in context).
If you are reading to **analyze, explore, or summarize** → use `ctx_execute_file(path, language, code)` instead. Only your printed summary enters context. The raw file content stays in the sandbox.

### Grep (large results)

Grep results can flood context. Use `ctx_execute(language: "shell", code: "grep ...")` to run searches in sandbox. Only your printed summary enters context.

## Tool selection hierarchy

1. **GATHER**: `ctx_batch_execute(commands, queries)` — Primary tool. Runs all commands, auto-indexes output, returns search results. ONE call replaces 30+ individual calls.
2. **FOLLOW-UP**: `ctx_search(queries: ["q1", "q2", ...])` — Query indexed content. Pass ALL questions as array in ONE call.
3. **PROCESSING**: `ctx_execute(language, code)` | `ctx_execute_file(path, language, code)` — Sandbox execution. Only stdout enters context.
4. **WEB**: `ctx_fetch_and_index(url, source)` then `ctx_search(queries)` — Fetch, chunk, index, query. Raw HTML never enters context.
5. **INDEX**: `ctx_index(content, source)` — Store content in FTS5 knowledge base for later search.

## Subagent routing

When spawning subagents (Agent/Task tool), the routing block is automatically injected into their prompt. Bash-type subagents are upgraded to general-purpose so they have access to MCP tools. You do NOT need to manually instruct subagents about context-mode.

## Output constraints

- Keep responses under 500 words.
- Write artifacts (code, configs, PRDs) to FILES — never return them as inline text. Return only: file path + 1-line description.
- When indexing content, use descriptive source labels so others can `ctx_search(source: "label")` later.

## ctx commands

| Command       | Action                                                                                |
| ------------- | ------------------------------------------------------------------------------------- |
| `ctx stats`   | Call the `ctx_stats` MCP tool and display the full output verbatim                    |
| `ctx doctor`  | Call the `ctx_doctor` MCP tool, run the returned shell command, display as checklist  |
| `ctx upgrade` | Call the `ctx_upgrade` MCP tool, run the returned shell command, display as checklist |

## Git workflow

- Commit locally after completing each meaningful unit of work (e.g. a
  technique implementation + its passing tests), not just at session end.
- Use conventional commit prefixes: feat, fix, test, refactor, chore, docs.
- Write commit messages describing _what_ changed and _why_, not just
  restating the diff.
- Do NOT push to the remote automatically — commit locally, then ask me
  before pushing.
- Never commit directly to main if we're using branches — check current
  branch convention with me if unclear.
- **Pre-commit enforcement (husky + lint-staged).** A `.husky/pre-commit` hook
  runs `pnpm lint-staged` on every commit. Config in `lint-staged.config.js`:
  on staged files it runs `prettier --write` (formatting), `eslint --fix`
  (lint/autofix on JS/TS), and `tsc --noEmit` for each touched workspace package
  (via that package's `typecheck` script). Any failure aborts the commit. Do not
  bypass with `--no-verify` unless explicitly asked.
- **Editor formatting.** `.vscode/settings.json` sets Prettier as the default
  formatter with format-on-save and `prettier.requireConfig: true`, so
  VS Code formatting matches the pre-commit hook.

Phase 1 is complete and committed (locally, not pushed). The solving engine in packages/engine solves any valid grid via real, explainable technique logic (28 pattern techniques, including Simple Coloring and ALS-XZ, plus a depth-1 forcing-chain backstop), verified against an independent brute-force oracle across 1137+ puzzles, and personally hand-tested via the CLI by the project owner — including notation input/validation (parseGridWithCandidates, checkForMistakes, reconcileNotation). Do not reopen Phase 1 work unless explicitly asked. One known, deliberately-accepted limitation: technique priority order in solver.ts's TECHNIQUES list reflects implementation convenience (build order), not the finalized difficulty tiers below — this means the solver can occasionally apply a structurally-harder technique (e.g. XY-Wing) before an easier one (e.g. BUG+1) when both are valid on the same grid state. This is accepted as-is for now; do not "fix" it unprompted.

We are now in Phase 2: building the actual website around the engine.

Infra decisions for Phase 2 (decide first, before pages/features)
Docker, full docker-compose for local dev: web (TanStack Start), api (Express), db (Postgres) all running together via one docker-compose up. Get hot-reload working correctly via proper volume mounts (bind-mount source, keep node_modules in a container-only volume) — this is a known trip-up, get it right from the start rather than patching it in later.
Production deployment on Railway: web, api, and db (Postgres) are all deployed there. Docker for both web and api, not native buildpacks — the api service needs Tesseract, which requires OS-level packages.
Railway deploys trigger from the connected GitHub repo — Docker only changes how Railway builds/runs the code after it arrives, not the git-based trigger flow.
Env vars / secrets handling: delegated to your judgment. Reasonable defaults expected (e.g. .env + .env.example locally, docker-compose env passthrough, Railway's environment variable dashboard for production secrets). Flag anything unusual / non-standard before implementing it, but routine choices don't need sign-off.
Postgres hosting in production: Railway's managed Postgres.
Once infra is scaffolded

Move into building actual pages/features per the existing plan already in this file: solver page, Learn section, auth, etc. The Learn curriculum (tiers/tactics) is now locked — see "Learn curriculum — tactics table" above — after Phase 1 surfaced the real technique landscape beyond the original planning list.
