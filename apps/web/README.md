# @sudoku/web

TanStack Start frontend (solver UI + Learn section). Imports the framework-free
`@sudoku/engine` and runs it **client-side** — no server round-trip for solving.

Local dev (via Docker, from repo root): `docker compose up`. Standalone:
`pnpm --filter @sudoku/web dev` (needs a running api + db for later features).

- `vite dev` — dev server on :3000
- `vite build` — production build → `.output/server/index.mjs` (Nitro)
- `src/routeTree.gen.ts` is generated on first run (git-ignored)
