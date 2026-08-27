/**
 * Static, per-tactic prose shown on the lesson page under the stepper — a
 * fuller "how this technique works" than the one-line `tactic.description`.
 * Only tactics that benefit from more than a sentence have an entry; the rest
 * fall back to `description`.
 */
export const TACTIC_OVERVIEW: Record<string, string> = {
  'cross-hatching':
    'Pick a digit and a box that still needs it. Cross out every cell of that box that shares a row or column with the same digit already placed elsewhere, and every cell already filled. If exactly one cell survives, the digit must go there. The engine calls this a hidden single; cross-hatching is the scanline way of spotting one without reading pencil marks.',
  'last-possible-number':
    'Same underlying fact as cross-hatching — a digit with only one legal cell left in a unit — but found by reading the pencil marks instead of scanning lines. Look through a row, column, or box for a digit that appears as a candidate in just one of its cells. That cell is forced.',
  pointing:
    'When a digit’s only remaining spots inside a box all fall on one row or one column, the digit is going to land somewhere on that line no matter which spot it takes. So it cannot appear anywhere else along that row or column, even outside the box — remove it from those cells.',
  claiming:
    'The mirror image of pointing. When a digit’s only remaining spots inside a row or column all fall within a single box, the digit must end up in that box. Remove it from the box’s other cells.',
  'naked-pair':
    'Two cells in the same unit whose pencil marks are the same two digits — nothing else. Those two digits have to fill those two cells between them, so neither digit can appear anywhere else in the unit. Naked triples and quads are the same idea with three or four cells sharing three or four digits.',
  'naked-triple':
    'Three cells in one unit whose candidates, pooled together, are just three digits. Those three digits are locked into those three cells in some order, so they leave every other cell of the unit. Each individual cell may show only two of the three digits — what matters is the pooled set.',
  'naked-quad':
    'Four cells in one unit whose combined candidates are only four digits. Those four digits must occupy those four cells, so they can be removed from the rest of the unit. Rare, and easy to miss because no single cell has to contain all four.',
  'hidden-pair':
    'Two digits that, within one unit, can only go in the same two cells. Those cells must take those two digits, so every other candidate in them is impossible and gets struck out. The pair is “hidden” because those cells usually show extra candidates that mask it.',
  'hidden-triple':
    'Three digits confined to the same three cells of a unit. Those cells are reserved for those digits, so all other candidates in them can be removed — even though each cell may also list digits that belong elsewhere.',
  'hidden-quad':
    'Four digits that can only be placed in the same four cells of a unit. Those four cells belong to those four digits; clear every other candidate from them.',
  'x-wing':
    'Pick a digit. Find two rows where it has candidates in only the same two columns. Those two columns now each need the digit in one of those two rows, so the digit is used up in both columns — it can be removed from every other cell of those columns. Works with rows and columns swapped.',
  swordfish:
    'X-Wing one size up: a digit confined to the same three columns across three rows (or the same three rows across three columns). The three cross-lines are spoken for, so the digit leaves their other cells. The rows need not each have the digit in all three columns — two is enough.',
  jellyfish:
    'The fish pattern at size four — a digit restricted to four columns across four rows, or vice versa. Much harder to see than an X-Wing despite being the same logic, because the four base lines rarely line up neatly.',
  'finned-x-wing':
    'An X-Wing with one extra candidate — the fin — that spoils the clean rectangle. The eliminations an X-Wing would make still hold, but only for cells that also see the fin. Everywhere else the fin gives the digit an escape route.',
  'finned-swordfish':
    'A Swordfish with one stray extra candidate (the fin). The Swordfish eliminations survive only where the target cell also sees the fin.',
  'finned-jellyfish':
    'A Jellyfish with a fin. As with the smaller finned fish, only eliminations that also see the fin are safe.',
  skyscraper:
    'Take a digit that forms two strong links (a row or column where it has exactly two candidates). If the two links share one end in a line, then the two far ends can’t both be false — one of them is the digit. Any cell that sees both far ends therefore can’t hold the digit.',
  '2-string-kite':
    'One strong link on a digit in a row, one in a column, meeting in a shared box. Whichever way each link resolves, the digit lands at one of the two loose ends. A cell that sees both loose ends can’t be the digit.',
  'turbot-fish':
    'A short single-digit chain: strong link, weak link, strong link. The two ends of the chain can’t both be the wrong colour, so a cell seeing both ends loses the digit. Skyscraper and 2-String Kite are the two shapes this chain can take.',
  'xy-wing':
    'A pivot cell with candidates X and Y, plus two “pincer” cells it can see: one holding X and Z, the other Y and Z. Whatever the pivot turns out to be, one pincer is forced to Z. So any cell that sees both pincers cannot be Z.',
  'xyz-wing':
    'Like an XY-Wing, but the pivot itself also holds Z (candidates X, Y, Z). Now Z is forced into the pivot or one of the two pincers, so a cell that sees all three of them loses Z.',
  'w-wing':
    'Two cells, not seeing each other, with the identical pair {X, Y}. If a strong link on X connects them — a unit where X has only two spots, one seeing each cell — then whenever neither cell is X, both are Y. Either way Y lands in one of the pair, so cells seeing both lose Y.',
  'xy-chain':
    'A chain of two-candidate cells where each link shares a digit with the next. Follow it from either end: assuming one end isn’t the shared digit forces the other end to be it, and vice versa. One end is always the digit, so any cell seeing both ends can’t hold it.',
  'unique-rectangle':
    'Four cells forming a rectangle across exactly two boxes, three of them holding only the same pair {X, Y}. If the fourth also held just {X, Y}, you could swap X and Y around the rectangle for a second solution — which a valid puzzle can’t have. So the fourth cell must be something other than X or Y.',
  'bug+1':
    'A “Bivalue Universal Grave” is a grid state where every unsolved cell has exactly two candidates — a state with multiple solutions. If your grid is one cell away from that (every cell bivalue except one with three candidates), the puzzle’s single solution must be the one that avoids the grave: the odd cell takes the candidate that appears an odd number of times in its row, column and box.',
  'simple-coloring':
    'Pick a digit and colour the two ends of every strong link on it, alternating colours along each connected chain. Exactly one colour is the true set of that digit. Two consequences: if one colour appears twice in a unit it’s entirely false; and any cell that sees both colours must see the true digit, so it can’t be the digit itself.',
  'als-xz':
    'An Almost Locked Set is N cells in a unit with N+1 candidates — one digit short of being locked. Take two of them sharing a digit X such that every X-cell of one sees every X-cell of the other (a “restricted common”). X can then be in at most one set; the other set loses X, becomes locked, and must supply their other shared digit Z. So Z can be removed from any cell outside both sets that sees all of Z’s spots in both.',
};
