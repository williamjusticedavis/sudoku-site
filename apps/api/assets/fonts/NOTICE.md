# Font attribution

All fonts in this directory are sourced from [Google Fonts](https://fonts.google.com/)
and distributed under the SIL Open Font License 1.1 (full text in
`LICENSE-OFL.txt`, alongside this file). Each font file also carries its own
embedded copyright/license metadata in its `name` table — untouched here.

Used to generate a synthetic multi-font training/reference corpus for
`apps/api/src/ocr`'s digit classifier (see `packages/engine/LICENSE-sudosol`
for this repo's other third-party attribution, following the same pattern).

| File(s)                                                   | Font             | Google Fonts page                                  |
| --------------------------------------------------------- | ---------------- | -------------------------------------------------- |
| `Inter-Regular.otf`, `Inter-Bold.otf`                     | Inter            | https://fonts.google.com/specimen/Inter            |
| `Roboto-Variable.ttf`                                     | Roboto           | https://fonts.google.com/specimen/Roboto           |
| `OpenSans-Variable.ttf`                                   | Open Sans        | https://fonts.google.com/specimen/Open+Sans        |
| `Comfortaa-Variable.ttf`                                  | Comfortaa        | https://fonts.google.com/specimen/Comfortaa        |
| `Quicksand-Variable.ttf`                                  | Quicksand        | https://fonts.google.com/specimen/Quicksand        |
| `Baloo2-Variable.ttf`                                     | Baloo 2          | https://fonts.google.com/specimen/Baloo+2          |
| `JetBrainsMono-Regular.ttf`, `JetBrainsMono-Bold.ttf`     | JetBrains Mono   | https://fonts.google.com/specimen/JetBrains+Mono   |
| `SpaceMono-Regular.ttf`                                   | Space Mono       | https://fonts.google.com/specimen/Space+Mono       |
| `FiraCode-Regular.ttf`                                    | Fira Code        | https://fonts.google.com/specimen/Fira+Code        |
| `Oswald-Variable.ttf`                                     | Oswald           | https://fonts.google.com/specimen/Oswald           |
| `BarlowCondensed-Regular.ttf`, `BarlowCondensed-Bold.ttf` | Barlow Condensed | https://fonts.google.com/specimen/Barlow+Condensed |
| `RobotoSlab-Variable.ttf`                                 | Roboto Slab      | https://fonts.google.com/specimen/Roboto+Slab      |

Chosen for shape diversity (not just name diversity) across the styles a
digital sudoku app's UI font might plausibly use: standard sans (Inter,
Roboto, Open Sans), rounded (Comfortaa, Quicksand, Baloo 2),
monospace/geometric (JetBrains Mono, Space Mono, Fira Code), condensed
(Oswald, Barlow Condensed), and slab-serif (Roboto Slab).
