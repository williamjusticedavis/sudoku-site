# @sudoku/api

Express backend: image preprocessing + Tesseract OCR for photo-uploaded grids,
and Postgres access via `@sudoku/db` (Drizzle). Runs in Docker (needs OS-level
Tesseract), on :4000.

Local dev (via Docker, from repo root): `docker compose up`. Standalone:
`pnpm --filter @sudoku/api dev`.

- `tsx watch src/index.ts` — dev with reload
- `tsc` → `dist/`, `node dist/index.js` — production
- `GET /health` — liveness (later: DB `select 1`)
