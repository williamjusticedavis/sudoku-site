# Test fixtures — provenance

These `.csv` files are puzzle datasets used as an **independent oracle** for the
solving engine: puzzles are authored by a third party (not by us), so they can't
be wrong in the same way our own code is wrong. Each file is one 81-character
puzzle per line (`.`/`0` = empty).

## Source

Puzzles are sourced from **[KyleGough/sudoku](https://github.com/KyleGough/sudoku)**
(`tests/*.csv`). Only the puzzle **grids** are used here — no code from that
project is copied. A sudoku grid is factual data (a layout of clues), not
copyrightable creative expression, so it is vendored here as test data with this
attribution note. The technique-tagged files (e.g. `xwing.csv`) contain puzzles
that require at least that technique to solve, which lets us assert the matching
technique actually fires.

The broad set (`17clue_100subset.csv`) is a 100-puzzle subset of KyleGough's
17-clue collection (minimal puzzles, each with a unique solution — the classic
17-clue enumeration originating from Gordon Royle / distributed research data).

## How solutions are obtained

The source CSVs contain **puzzles only, no solutions**. Each `<name>.csv` therefore
has a generated, line-aligned companion **`<name>.solutions.csv`**. These were
produced once by a standalone backtracking solver (independent of the technique
engine) and every puzzle was verified to have exactly one solution at generation
time. Tests read the vendored solutions directly (fast string comparison) rather
than re-solving on every run.

Trust in the vendored solutions is guarded cheaply in `oracle.test.ts`: each
solution must be a conflict-free complete grid containing all the puzzle's clues,
and on a sample the engine's own `solve`/`hasUniqueSolution` must agree with the
vendored value — tying the two independent solvers together.

## Files

| File | Puzzles | Purpose |
|------|--------:|---------|
| `17clue_100subset.csv` | 100 | broad correctness / solve-rate tracking |
| `pointing-pairs.csv`, `boxline-reduction.csv` | 3, 2 | locked candidates |
| `xwing.csv`, `swordfish.csv`, `jellyfish.csv`, `finnedswordfish.csv` | 4, 8, 2, 1 | fish family |
| `ywing.csv`, `xyzwing.csv`, `wxyzwing.csv` | 4, 6, 1 | wings |
| `bug.csv` | 7 | BUG+1 |
| `diabolical1.csv`, `diabolical2.csv` | 1, 2 | hard, mixed techniques |
