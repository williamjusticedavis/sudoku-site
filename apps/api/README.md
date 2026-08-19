# @sudoku/api

Express backend: image preprocessing + Tesseract OCR for photo-uploaded grids,
and Postgres access via `@sudoku/db` (Drizzle). Runs in Docker (needs OS-level
Tesseract), on :4000.

Local dev (via Docker, from repo root): `docker compose up`. Standalone:
`pnpm --filter @sudoku/api dev`.

- `tsx watch src/index.ts` — dev with reload
- `tsc` → `dist/`, `node dist/index.js` — production
- `GET /health` — liveness (later: DB `select 1`)
- `POST /ocr/grid` — multipart form, field `image` (pre-cropped photo of a 9x9
  grid). Returns `{ ok: true, grid, confidentCount, blankCount }` (81-char
  grid string, `.` for unread/blank cells) or `{ ok: false, error }`.
  Set `OCR_DEBUG=true` to log each cell's ink density and raw tesseract
  result (see `src/ocr/pipeline.ts`).

## Known limitations

- **Manual crop, line-snapped but not fully auto-aligned.** The client crops
  to a square before upload; the server no longer trusts that crop to map
  exactly onto the grid — `extractCells`/`detectGridLines` in
  `src/ocr/pipeline.ts` search a small window around each of the 10 expected
  grid-line positions for the puzzle's own darkest row/column and snaps to
  it, correcting a mild (~3-4%) loose/tight crop back to near-perfect
  accuracy. This is refinement, not full computer vision — no perspective
  correction, no rotation handling (fine, since usage is screenshots of
  digital puzzles, not photos of paper — no lens distortion/skew to begin
  with). A crop that's off by a lot (order of ~8%+ combined scale and
  position error) still degrades: each line that can't be confidently
  re-found falls back to the uniform assumption, which can turn a confident
  correct read into a confident _wrong_ one on the affected cells — the OCR
  itself isn't uncertain, the input pixels are just off. See the comment on
  `ocrCell` in `src/ocr/tesseract.ts` for why the confidence threshold
  structurally can't catch this (the CLI doesn't expose alternate
  candidates). Mitigated by the grid loading as editable cells plus an
  automatic mistake-check, not solved. Not chasing further without real
  usage data showing large mis-crops are still a frequent problem.
