# Sudoku Solving/Learning Website

## Project overview

The site is called **Gridwise** (named 2026-09-04). The name and mark live in
the header — a 3×3 grid with the centre cell solved, as an inline SVG component
(`apps/web/src/features/shell/Logo.tsx`) with a matching `apps/web/public/favicon.svg`.
The two are the same geometry written twice, since a favicon has no page context
to inherit `currentColor` from; keep them in step.

A website with two areas: a **solver** (paste/upload/type a sudoku, get it solved
or hinted step-by-step) and a **Learn** section (tiered lessons teaching sudoku
solving techniques, inspired by — but not copying — the Oakever iPhone app's
dim/highlight/stepper lesson style).

## Current phase: Phase 2 — the website

The engine is done (see "Phase 1 — complete" below). Active work is the site
around it: `apps/web`, `apps/api`, and the Learn content in `packages/db`.

The engine's own goals, kept because they still constrain changes to it:

- Techniques are individual, testable functions, validated against known
  datasets (KyleGough/sudoku's puzzle sets) rather than only hand-written cases
- The technique set goes well beyond the teaching curriculum, because the
  engine has to solve _any_ valid grid a user submits, not just ones that
  happen to use a lesson's technique
- `GillesArcas/sudosol` (Python, MIT) is the reference the logic was adapted
  from; its MIT notice stays at `packages/engine/LICENSE-sudosol`

## Tech stack

- Frontend: TanStack Start
- Backend: Express (Node.js) — scoped to OCR only (auth was dropped, see the
  data model). Learn content
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

Exactly 3 tables. Do not add more without checking in first — in particular,
do NOT persist solves, and do NOT reintroduce accounts (see below).

**tactics** (static reference data — seeded once, not user-generated)

- id, slug (e.g. `xy-wing`), name, tier (beginner/intermediate/advanced/master),
  order_in_tier, description

**tactic_puzzles** (curated example puzzles per tactic, at least 3 each)

- id, tactic_id (FK), grid_state, solution_state, step_data (ordered hint
  steps: highlighted cells/units, explanation text per step),
  is_teaching_example (bool — first one per tactic vs. practice ones)

**feedback** (added 2026-09-04)

- id, name, message, created_at

Backs the footer's `/feedback` page. Deliberately **name + message only**:

- **No email column**, and no contact field of any kind. The site holds no
  address for anybody by design, so feedback is one-way and cannot be replied
  to. That was the accepted trade rather than an oversight — the page says so
  to the sender.
- Read it with `pnpm db:studio`. There is no admin page.
- Abuse handling is a honeypot field plus length caps (name 80, message 4000),
  enforced in `apps/web/src/features/feedback/submitFeedback.ts` on both sides.
  A tripped honeypot is told it succeeded and nothing is written. There is
  **no per-IP rate limit** — a known, accepted gap, not a solved problem.

### Explicitly excluded — do not build these

- **No accounts, no auth, no progress tracking (decided 2026-09-06).**
  `users`, `sessions`, `user_tactic_progress` and `user_favorite_tactics` were
  dropped in migration `0002` — all four were empty; nothing was lost. The
  Learn progress bars and the per-tier `done / total` counter went with them.
  The reasoning, so this doesn't get relitigated:
  - Auth would have been the only thing on the site demanding identity, on a
    site whose solver deliberately persists nothing and whose feedback form
    deliberately takes no email. It contradicted the product.
  - The schema had no email column, so there was **no password-reset path** —
    a forgotten password meant permanent lockout. Fixing that meant taking on
    PII, an email provider and deliverability, all to power a progress bar.
  - Learn is a reference people hit when a specific puzzle has them stuck, not
    a linear course. "Completed" was measuring something nobody was doing —
    you don't finish learning X-Wing, you get better at spotting it.
  - Favorites had no UI and no demonstrated demand; 28 items across four tiers
    all fit on one screen, so there was no findability problem to solve.
    If a per-device convenience is ever wanted, `localStorage` is the answer —
    not a users table. The one plausible login (an admin view for reading
    feedback) is a single-person problem: use `db:studio`, or gate it on one
    env-var secret.
- **No solve/solve-step persistence of any kind.** The solver page is fully
  stateless and ephemeral. Closing the tab loses the puzzle; re-entering the
  grid from scratch is required to resume. This was a deliberate, explicit
  decision — don't add a `solves` or `solve_steps` table even if it seems like
  an obvious/easy addition.
- **No `saved_puzzles` table.** Nothing is puzzle-scoped or user-scoped.

## Core engine design decisions

- **The engine is the source of truth for candidates, never the user's input.**
  On load, always compute candidates from scratch from placed digits. A user's
  manual notation marks are never trusted _on their word_ — but as of
  2026-08-31 they can be **verified and promoted**, which is not the same thing
  as trusting them. See "User notation may be promoted, never trusted" below.
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
- **User notation may be promoted, never trusted (2026-08-31).** The principle
  is unchanged — the engine still decides what is true. What changed is that
  there is now a real verification mechanism where before there was none, so
  "we can't tell if these marks are right, therefore discard them" no longer
  holds. `auditUserCandidates(grid, marks)` (`packages/engine/src/validate.ts`)
  checks every mark against **both** the engine's own candidates (nothing added
  that was already ruled out) **and** the puzzle's actual solution from the
  brute-force `solve` (nothing removed that genuinely belongs). Only on a
  completely clean pass are the user's extra eliminations promoted to trusted
  and folded into the solve; a single bad cell voids the entire set — full
  reset, no partial credit, exactly as `reconcileNotation` has always behaved.
  So the rule is: _verify against ground truth, promote all-or-nothing, reset
  otherwise_ — never "believe the user."
  - A cell whose mark is `0` means "the user wrote nothing here", not "no
    candidates" — those cells are skipped and left to the engine, so partially
    noted grids work.
  - Promotion is carried as a `Step` with technique id `'user-notes'`, appended
    to the solver's history like any other step. That's what makes it work with
    zero changes to the solving loop: `replay`/`applyStep` reproduce the
    reduced candidate state, and scrub/undo/step-list all behave normally.
- **"Check for mistakes" is precise, not lightweight (revised 2026-08-31).**
  It previously ran exactly three structural checks and was explicitly barred
  from catching wrongly-eliminated-but-still-valid candidates. That restriction
  is **lifted**: once Solve could tell a user their notes rule out the right
  digit, a Check button that answered "no mistakes found" on the same grid was
  simply contradicting it. Scope is now four checks:
  1. Digit conflicts (duplicate placed digit in a row/column/box)
  2. Impossible candidates present (a candidate that contradicts a placed digit)
  3. A digit missing entirely from a unit — neither placed nor present as a
     candidate anywhere in that row/column/box (definite contradiction)
  4. A note set that rules out the digit which actually belongs in that cell
     (`wrong-elimination`) — structurally legal, but wrong
     Checks 1–3 stay in `checkForMistakes` (the structural half, no solution
     needed); check 4 comes from `auditUserCandidates`, and the solver page's
     `check()` runs both so the button and Solve always agree. The old "that needs
     full reachability analysis" objection no longer applies — it's answered
     against the brute-force solution, not by reachability.
- Invalid grids (duplicate digits) → reject immediately, no solve attempt.
- Valid grids with multiple solutions → **reject**, don't attempt a solve
  (implemented 2026-08-31; `validate()` counts solutions with cap 2). Some
  techniques (BUG+1, Unique Rectangle) assume a unique solution and would
  misfire, and `auditUserCandidates` compares the user's marks against _the_
  solution — with more than one, a perfectly valid mark could be called wrong
  purely because the search happened to land on a different solution.

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

1. Pointing/Claiming — merged lesson (2026-08-30, supersedes the original
   split below — see note after this list)
2. Naked Pair
3. Naked Triple
4. Naked Quad
5. Hidden Pair
6. Hidden Triple
7. Hidden Quad
8. X-Wing
9. Skyscraper

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
independent lessons (own page, own practice puzzles) but share the
same underlying engine technique, and should get a shared visual
grouping/label in the Learn tier layout. Known families: Hidden Single split
(Cross-Hatching + Last Possible Number — see below). Locked Candidates
(Pointing + Claiming) is no longer one of these — see the merge note below,
it's a single lesson now, not a family of two.

**Pointing/Claiming — merged into one lesson (2026-08-30).** Originally
seeded as two separate tactics rows sharing a "family" grouping (mirror-image
directions of the same locked-candidates idea), same treatment as the Hidden
Single split. Unlike that split, though, the two directions don't need
separate vocabulary to recognize by eye — a learner sees the same box∩line
overlap either way, just eliminating on whichever side is narrower — so
keeping them as two independent lessons
added bookkeeping without adding teaching value. Merged into a single
`tactics` row, slug `pointing`, name "Pointing/Claiming"; its curated
puzzles cover both directions (see `packages/db/src/seed.ts`). The engine
still exposes `pointing` and `claiming` as two fully independent techniques
(untouched, still both in the solver's `TECHNIQUES` list) — only the Learn
curriculum layer merged; a `pointingOrClaiming` combinator in seed.ts is
what the lesson's puzzles actually fire against.

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

### Phase 1 — complete

Phase 1 is complete and committed. The solving engine in packages/engine solves any valid grid via real, explainable technique logic (28 pattern techniques, including Simple Coloring and ALS-XZ, plus a depth-1 forcing-chain backstop), verified against an independent brute-force oracle across 1137+ puzzles, and personally hand-tested via the CLI by the project owner — including notation input/validation (parseGridWithCandidates, checkForMistakes, reconcileNotation). Do not reopen Phase 1 work unless explicitly asked.

**Technique order — FIXED 2026-09-06 (commit `d0ba7cc`).** `PATTERN_TECHNIQUES`
in `solver.ts` used to be in build order, so the solver could apply a harder
technique (XY-Wing) before an easier one (BUG+1). It now tracks the curriculum's
TIER boundaries: Skyscraper moved above Swordfish/Jellyfish (splitting the fish
family, which is intentional — an X-Wing is Intermediate, a Jellyfish is Master),
Simple Coloring moved down out of the Advanced block, and BUG+1 was deliberately
hoisted to just after the Intermediate block. Order _within_ a tier remains a
findability judgement call, NOT derived from `order_in_tier` (which CLAUDE.md
says was never ranked). The full rationale is in the doc comment above
`PATTERN_TECHNIQUES` — read it before reordering again.

**Reordering that list requires a reseed.** `packages/db/src/seed.ts`'s
`fireTarget` builds each lesson's lead-up from `TECHNIQUES` minus the target, so
the order decides the exact position every curated puzzle fires on. The seed
throws if a lesson's technique stops firing, so a break is loud rather than
silent — but local AND production both need `db:seed` after any change here.

Phase 2 (the website) is the current phase — see the top of this file.

Infra decisions for Phase 2 (decide first, before pages/features)
Docker, full docker-compose for local dev: web (TanStack Start), api (Express), db (Postgres) all running together via one docker-compose up. Get hot-reload working correctly via proper volume mounts (bind-mount source, keep node_modules in a container-only volume) — this is a known trip-up, get it right from the start rather than patching it in later.
Production deployment on Railway: web, api, and db (Postgres) are all deployed there. Docker for both web and api, not native buildpacks — the api service needs Tesseract, which requires OS-level packages.
Railway deploys trigger from the connected GitHub repo — Docker only changes how Railway builds/runs the code after it arrives, not the git-based trigger flow.
Env vars / secrets handling: delegated to your judgment. Reasonable defaults expected (e.g. .env + .env.example locally, docker-compose env passthrough, Railway's environment variable dashboard for production secrets). Flag anything unusual / non-standard before implementing it, but routine choices don't need sign-off.
Postgres hosting in production: Railway's managed Postgres.
Once infra is scaffolded

Move into building actual pages/features per the existing plan already in this file: solver page, Learn section, etc. (auth is NOT on that list any more — see "Explicitly excluded" in the data model). The Learn curriculum (tiers/tactics) is now locked — see "Learn curriculum — tactics table" above — after Phase 1 surfaced the real technique landscape beyond the original planning list.
