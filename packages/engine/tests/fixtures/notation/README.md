# Notation fixtures — provenance

Unlike the puzzle fixtures in the parent directory, these are **hand-authored**
(not sourced from a third-party dataset) — no public dataset ships grids with
user pencil-mark notation. Each file is one grid in the engine's **extended
notation format** (81 whitespace-separated tokens; a placed digit `1`–`9`, an
empty cell `.`, or a candidate set `[159]`), used to exercise
`checkForMistakes` / `reconcileNotation`.

All four derive from the classic puzzle
`53..7....6..195....98....6.8...6...34..8.3..17...2...6.6....28....419..5....8..79`:

| File | Intended state |
|------|----------------|
| `valid.txt` | correct pencil marks (== `computeCandidates`) → **no mistakes** |
| `impossible.txt` | a cell marks a candidate a placed peer already uses → **impossible-candidate** |
| `missing.txt` | a digit erased from every candidate cell of a unit → **missing-digit** |
| `conflict.txt` | the same digit placed twice in a row → **digit-conflict** |

Regenerate by editing `serializeGridWithCandidates(parseGrid(PUZZLE))` output;
`checkForMistakes` is the oracle for what each is supposed to trip.
