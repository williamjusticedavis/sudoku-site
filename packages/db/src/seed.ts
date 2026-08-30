/**
 * Seed `tactics` and `tactic_puzzles` for the Learn section.
 *
 * Curriculum (tier / order / name / family) is transcribed from the locked
 * table in the repo-root CLAUDE.md. Puzzle grid strings started from the
 * Phase 2 `tactic-examples.md` working note (no longer in the repo), but
 * most have since been replaced — see the per-tactic comments below and the
 * `mine-*.ts` scripts, each a reusable, uniqueness/cleanliness-checked miner
 * for one tactic's example puzzles.
 *
 * `step_data` is NOT hand-written: for every puzzle the target technique is run
 * by the real engine on that exact grid and its `Step` (description, role-
 * tagged highlights, placements, eliminations) is captured verbatim. When the
 * tactic only becomes visible after some easier moves, those moves are applied
 * silently here and the firing position is stored as `HintStep.gridBefore`
 * (the lesson shows a single step — see the plan / CLAUDE.md decision).
 *
 * Idempotent: tactics upsert on `slug`; a tactic's puzzles are deleted and
 * reinserted. Safe to re-run.
 *
 *   pnpm db:seed            (from repo root)
 *   pnpm --filter @sudoku/db db:seed
 */
import { join } from 'node:path';
import { eq } from 'drizzle-orm';
import {
  cloneGrid,
  hint,
  parseGrid,
  parseGridWithCandidates,
  serializeGrid,
  serializeGridWithCandidates,
  hasUniqueSolution,
  solve,
  solveAll,
  TECHNIQUES,
  type Grid,
  type Step,
  type Technique,
  bug1,
  claiming,
  crossHatching,
  finnedJellyfish,
  finnedSwordfish,
  finnedXWing,
  hiddenPair,
  hiddenQuad,
  hiddenSingle,
  hiddenTriple,
  jellyfish,
  lastFreeCell,
  lastPossibleNumber,
  nakedPair,
  nakedQuad,
  nakedSingle,
  nakedTriple,
  pointing,
  simpleColoring,
  skyscraper,
  swordfish,
  turbotFish,
  twoStringKite,
  uniqueRectangle,
  wWing,
  xWing,
  xyChain,
  xyWing,
  xyzWing,
  alsXz,
} from '@sudoku/engine';
import type { HintStep, NewTactic } from './index.js';
import { tacticPuzzles, tactics } from './schema/index.js';
import { buildWalkthrough } from './walkthrough.js';

// The db client throws when DATABASE_URL is unset. Load the repo-root .env
// (best effort) and fall back to the local docker-compose credentials before
// importing it.
for (const candidate of ['../../.env', '../../../.env', '.env']) {
  try {
    process.loadEnvFile(join(process.cwd(), candidate));
    break;
  } catch {
    // try the next candidate path
  }
}
process.env.DATABASE_URL ??= 'postgres://sudoku:sudoku@localhost:5432/sudoku';

const { db, client } = await import('./client.js');

type Tier = NewTactic['tier'];

// Pointing and Claiming are one merged lesson (mirror-image directions of
// the same locked-candidates idea), but stay two fully separate engine
// techniques — each still runs on its own in the solver's TECHNIQUES list,
// untouched. This combinator is Learn-only: it's what locates where the
// *lesson* next has something to show, trying pointing first (arbitrary;
// a given box+digit can only ever match one direction, never both).
const pointingOrClaiming: Technique = (grid) => pointing(grid) ?? claiming(grid);

interface CurriculumRow {
  slug: string;
  name: string;
  tier: Tier;
  description: string;
  technique: Technique;
}

// ---------------------------------------------------------------------------
// Curriculum — order within each array IS `order_in_tier`.
// ---------------------------------------------------------------------------
const CURRICULUM: CurriculumRow[] = [
  // -- Beginner --------------------------------------------------------------
  {
    slug: 'last-free-cell',
    name: 'Last Free Cell',
    tier: 'beginner',
    description:
      'A unit (row, column, or box) has only one empty cell left, so the one missing digit goes straight in.',
    technique: lastFreeCell,
  },
  {
    slug: 'naked-single',
    name: 'Naked Single',
    tier: 'beginner',
    description:
      'A cell has just one candidate left once every digit its peers already use is ruled out.',
    technique: nakedSingle,
  },
  {
    slug: 'cross-hatching',
    name: 'Cross-Hatching',
    tier: 'beginner',
    description:
      'Scan the rows and columns that already contain a digit to squeeze it into its one remaining cell in a box. (The engine formally calls this a hidden single.)',
    technique: crossHatching,
  },
  {
    slug: 'last-possible-number',
    name: 'Last Possible Number',
    tier: 'beginner',
    description:
      'The pencil marks show a digit can go in only one cell of a unit that still has several blanks. (The engine formally calls this a hidden single.)',
    technique: lastPossibleNumber,
  },
  // -- Intermediate -------------------------------------------------------
  {
    slug: 'pointing',
    name: 'Pointing/Claiming',
    tier: 'intermediate',
    description:
      "A box and a line cross at a few cells. When a digit's remaining spots in the box all fall in that overlap, remove it from the rest of the line — or, the other way round, when its spots on the line all fall there, remove it from the rest of the box.",
    technique: pointingOrClaiming,
  },
  {
    slug: 'naked-pair',
    name: 'Naked Pair',
    tier: 'intermediate',
    description:
      'Two cells in a unit hold exactly the same two candidates, so those digits leave every other cell in the unit.',
    technique: nakedPair,
  },
  {
    slug: 'naked-triple',
    name: 'Naked Triple',
    tier: 'intermediate',
    description:
      'Three cells in a unit share three candidates between them; clear those digits from the rest of the unit.',
    technique: nakedTriple,
  },
  {
    slug: 'naked-quad',
    name: 'Naked Quad',
    tier: 'intermediate',
    description:
      'Four cells in a unit share four candidates between them; clear those digits from the rest of the unit.',
    technique: nakedQuad,
  },
  {
    slug: 'hidden-pair',
    name: 'Hidden Pair',
    tier: 'intermediate',
    description:
      'Two digits can go in only the same two cells of a unit; drop every other candidate from those two cells.',
    technique: hiddenPair,
  },
  {
    slug: 'hidden-triple',
    name: 'Hidden Triple',
    tier: 'intermediate',
    description:
      'Three digits are restricted to the same three cells of a unit; drop every other candidate from them.',
    technique: hiddenTriple,
  },
  {
    slug: 'hidden-quad',
    name: 'Hidden Quad',
    tier: 'intermediate',
    description:
      'Four digits are restricted to the same four cells of a unit; drop every other candidate from them.',
    technique: hiddenQuad,
  },
  {
    slug: 'x-wing',
    name: 'X-Wing',
    tier: 'intermediate',
    description:
      'A digit forms a rectangle across two rows and two columns; remove it from the rest of those columns (or rows).',
    technique: xWing,
  },
  {
    slug: 'skyscraper',
    name: 'Skyscraper',
    tier: 'intermediate',
    description:
      'Two strong links on a digit share one end in a row or column; any cell seeing both far ends loses that digit.',
    technique: skyscraper,
  },
  // -- Advanced ---------------------------------------------------------------
  {
    slug: '2-string-kite',
    name: '2-String Kite',
    tier: 'advanced',
    description:
      'A row strong link and a column strong link on one digit meet in a box; the cell seeing both loose ends is eliminated.',
    technique: twoStringKite,
  },
  {
    slug: 'turbot-fish',
    name: 'Turbot Fish',
    tier: 'advanced',
    description:
      'A short chain of alternating strong and weak links on one digit forces an elimination where its two ends see a common cell.',
    technique: turbotFish,
  },
  {
    slug: 'swordfish',
    name: 'Swordfish',
    tier: 'advanced',
    description:
      'The X-Wing pattern one size up: a digit confined to three rows across the same three columns.',
    technique: swordfish,
  },
  {
    slug: 'xy-wing',
    name: 'XY-Wing',
    tier: 'advanced',
    description:
      'A pivot cell with candidates XY plus two pincers XZ and YZ; any cell seeing both pincers loses Z.',
    technique: xyWing,
  },
  {
    slug: 'w-wing',
    name: 'W-Wing',
    tier: 'advanced',
    description:
      'Two cells with the same two candidates, joined by a strong link on one of them; the other digit is eliminated from cells seeing both.',
    technique: wWing,
  },
  {
    slug: 'xyz-wing',
    name: 'XYZ-Wing',
    tier: 'advanced',
    description:
      'Like an XY-Wing, but the pivot also holds Z; a cell seeing the pivot and both pincers loses Z.',
    technique: xyzWing,
  },
  {
    slug: 'finned-x-wing',
    name: 'Finned X-Wing',
    tier: 'advanced',
    description:
      'An almost X-Wing with one extra candidate (the fin); the eliminations survive only where they also see the fin.',
    technique: finnedXWing,
  },
  {
    slug: 'finned-swordfish',
    name: 'Finned Swordfish',
    tier: 'advanced',
    description:
      'A Swordfish with a fin; eliminations are restricted to cells that also see the fin.',
    technique: finnedSwordfish,
  },
  {
    slug: 'unique-rectangle',
    name: 'Unique Rectangle',
    tier: 'advanced',
    description:
      'Four cells forming a rectangle across two boxes with the same two candidates would allow two solutions; break the deadly pattern.',
    technique: uniqueRectangle,
  },
  {
    slug: 'bug+1',
    name: 'BUG+1',
    tier: 'advanced',
    description:
      'Every unsolved cell has exactly two candidates except one cell with three; the puzzle having a unique solution fixes that third digit.',
    technique: bug1,
  },
  // -- Master ---------------------------------------------------------------
  {
    slug: 'jellyfish',
    name: 'Jellyfish',
    tier: 'master',
    description:
      'The fish pattern at size four: a digit confined to four rows across the same four columns.',
    technique: jellyfish,
  },
  {
    slug: 'finned-jellyfish',
    name: 'Finned Jellyfish',
    tier: 'master',
    description:
      'A Jellyfish with a fin; eliminations are limited to cells that also see the fin.',
    technique: finnedJellyfish,
  },
  {
    slug: 'xy-chain',
    name: 'XY-Chain',
    tier: 'master',
    description:
      'A chain of two-candidate cells linked on shared digits; the digit at both ends is removed from any cell seeing both ends.',
    technique: xyChain,
  },
  {
    slug: 'simple-coloring',
    name: 'Simple Coloring',
    tier: 'master',
    description:
      'Colour the two ends of every strong link on a digit; a colour repeating in a unit is false, and cells seeing both colours are cleared.',
    technique: simpleColoring,
  },
  {
    slug: 'als-xz',
    name: 'ALS-XZ',
    tier: 'master',
    description:
      'Two almost-locked sets sharing a restricted common digit X force eliminations on their other shared digit Z.',
    technique: alsXz,
  },
];

// ---------------------------------------------------------------------------
// Puzzle strings — plain 81-char grids (0 = blank), originally sourced from
// tactic-examples.md (no longer in the repo) but mostly replaced since via
// the mine-*.ts scripts (see each tactic's own comment below for its
// history). First entry per tactic becomes the teaching example; the rest
// are practice puzzles. A puzzle flagged "fires-only, not proven necessary"
// is listed last so it's never the teaching example.
//
// An entry is normally just that plain string. It can instead be a
// `{ gridState, firedAt }` object for a puzzle authored directly from an
// already-reduced position (e.g. captured mid-solve from the real solver)
// rather than a raw clue set: `gridState` is a short, schema-legal (<=81
// char) *placed-digit-only* stand-in stored in the DB and used only for
// `hasUniqueSolution`/`solutionState` (the walkthrough always displays
// `gridBefore`, never `gridState`, once it's set — see `boardGrid` in
// `$slug.tsx` — so this stand-in is otherwise inert); `firedAt` is the exact
// bracket-candidate state (arbitrary length, lives in the JSONB step data,
// no schema limit) the target technique fires on, used as-is instead of
// re-deriving a position via the lead-up search — which would very likely
// walk a different, unrelated path from a placed-digit-only stand-in and
// fire on a different instance of the technique entirely.
type PuzzleEntry = string | { gridState: string; firedAt: string };
const PUZZLES: Record<string, [PuzzleEntry, PuzzleEntry, PuzzleEntry]> = {
  'last-free-cell': [
    '000000000000000001000002030000003020001040000005000060030000004070080009620007000',
    '000000000000000001000002030000003020004000050006010000030000006070080009520700000',
    '000000000000000001000002030000004250006000000017000080000070006400060000900800010',
  ],
  'naked-single': [
    '000000000000000001000002030000003020001040000005000060030000004070080009620007000',
    '000000000000000001000002030000003020004000050006010000030000006070080009520700000',
    '000000000000000001000002030000004250006000000017000080000070006400060000900800010',
  ],
  'cross-hatching': [
    '000000000000000001000002030000003020001040000005000060030000004070080009620007000',
    // Box-based example (puzzle 0 and 2 are both column/row) — real variety
    // instead of two near-identical column scans. Mined via mine-cross-hatching.ts.
    '003000000000837060090005000000700000207043050000019200000000806306000004050004000',
    // Row-based example. Original had 7 simultaneous pure-scan opportunities
    // at the fired position (row 4's 6 AND an equally-findable box-4 4,
    // among others) — genuinely ambiguous, a learner could land on a
    // different valid one. Mined with the uniqueness check enforced.
    '002008000000600017500000400000053040000800001609702800000030050000000000037000906',
  ],
  'last-possible-number': [
    '000000000000000001000002030002000400003050000004100006050600000070000020080910000',
    // Puzzles 1 and 2 replaced (mine-last-possible-number.ts): the originals
    // each had 6 simultaneous hidden-single opportunities at the fired
    // position — genuinely ambiguous on a "try it yourself" puzzle. These
    // have exactly one. Kept the original column/row split.
    '096008100100000480000000307903205000000040000200000900009310800050080040000007000',
    // Puzzle 2's first replacement (row 4, digit 6) had a naked single
    // sitting unapplied on the board — an even more obvious find than the
    // intended pattern. The uniqueness check now catches that too; this one
    // has neither a second hidden single nor a naked single.
    '100580007007000000082000000300400500490000010705069800000000623000810000000900000',
  ],
  // Pointing and Claiming merged into one lesson (packages/db/src/seed.ts's
  // `pointingOrClaiming`): puzzle 0 (teaching) and puzzle 1 (practice) are
  // pointing-shaped — a box's candidates confined to one line, cleared from
  // the rest of the line; puzzle 2 (practice) is claiming-shaped — a line's
  // candidates confined to one box, cleared from the rest of the box. So the
  // set demonstrates both directions. All three mined with mine-pointing.ts:
  // zero beginner-tier moves present, exactly one locked-candidates
  // opportunity at the fired position.
  pointing: [
    '000000000000000001001002030000040000040560700080000020002000000003001000700080004',
    // Pointing-shaped: box 1's only spots for 4 all sit in col 2 → clear 4
    // from the rest of col 2.
    '000010200003000400102800007000090020020070001600400709030000600060103000400700000',
    // Claiming-shaped: row 5's only spots for 4 all sit in box 6 → clear 4
    // from the rest of box 6.
    '000105000310042090047000000700000003002908700080500009000000100400080060000406030',
  ],
  'naked-pair': [
    '000000000000000012000034000000000005003160000007800400000009030090005000510000000',
    '000000000000000012000034005000002006007050400008100000000040800060000000120000000',
    '000000000000000012003004000000000003004050600070010000000806400020000000510000800',
  ],
  'naked-triple': [
    '000000000000000012003004000000005400000060000120000007000008950000700300060200000',
    '000000000000000012003004000000005400010000060070003000000010700005800300800060000',
    '000000000000000012003045000000000000000006307010800000000200006006000500304010000',
  ],
  'naked-quad': [
    '000000000000000012003045000000100006004000000035000700000200300000600000089000500',
    '000000001000000023004005000000000060000007500120030000000120008000400000076000000',
    // fires-only, not proven necessary
    '000000000000000001002034000000000020050000034600100000000620700000800050074000000',
  ],
  // All three replaced (mine-hidden-subset.ts): the originals each had a
  // hidden single sitting on the board — puzzle 0 also had a naked single,
  // puzzles 1/2 explicitly flagged. These have zero beginner-tier moves.
  'hidden-pair': [
    '087025000020001000300700000070080003100004005054007006000009050040000002000000690',
    '004109600700000105008000040000200090020900500000040008000000003056000000800470000',
    '000030051500007009030000800000120000004000000060089003090608020300000040016000080',
  ],
  'hidden-triple': [
    '000000000000000012003004005000006300010000070200000000000070000000800006570120000',
    '000000000000000012003045000000000406000600000020107000000200000080030000904000500',
    '000000000000001002034000050000000060000027000005000430000300000006400000700008009',
  ],
  'hidden-quad': [
    '008010403000008010003040060032004795080020000900000040000000000000096000045007600',
    '860000302040600000152780006000000000420050007080210600500000000000190030010065000',
    '000010003400007201002030650900060000010000009003720800000000000680540002000000146',
  ],
  'x-wing': [
    // Rows 1,7 / cols 5,9 — spread far apart (different box bands and
    // stacks), not the original's adjacent rows 4-5 / cols 3-4, which read
    // as "a box" to a new learner instead of the pattern's real row/column
    // shape. Mined via mine-x-wing.ts.
    '437006000060950004000030000090000000000700020000210703049000080001000009806000051',
    '000000000000000012000034000000000300005000006078600000000280070340000020900000000',
    '000000000000000012003004000000000003004050600070010000000806400020000000510000800',
  ],
  skyscraper: [
    '000000000000000001001002030000040000040560700080000020002000000003001000700080004',
    '000000000000000001002003040000002300050000000410000006000560000004010000007000820',
    '000000000000000001002003040000005020060007000810000000000010306000080000009600200',
  ],
  '2-string-kite': [
    '000000000000000001002003040000005000030000600700010008000006250080090000100000030',
    '000000000000000001002003040000005200010000060700000000003080500005200000400100007',
    '000000000000000012000034000000005300001000060072100000000260008090000000340000000',
  ],
  'turbot-fish': [
    // Original teaching example had a blatant hidden pair sitting at the
    // firing position; replaced with clean examples (no naked/hidden
    // single, subset, locked-candidates, or simpler-fish/chain opportunity)
    // via mine-turbot-fish.ts. Middle grid kept — it was already clean.
    '004072000002040100050800006000008010905000003260030090000000000301000040070500000',
    '000000000000000012003045000000000000006000307080200000000004500009000006020180000',
    '000704000509000040700300000002100089007200600683007050000000002806003000300000090',
  ],
  swordfish: [
    '000000000000000012003004000000003400015000000620000007000260000008000500090010000',
    '000000000000000012003004000000003500010000006260000070000016000000720000008000400',
    '000000000000000012003004000000003500010060000270000008000108000000720000009000600',
  ],
  'xy-wing': [
    // Puzzles 1 and 3 originally fired with the pivot and both pincers all
    // sitting in one row — technically a valid wing, but reads like a line
    // scan instead of a wing tracing across boxes. Replaced via
    // mine-xy-wing.ts with examples spread across rows/columns/boxes.
    '100070000007000380030502100400007020021060000300000005000300000590010006000058000',
    '000000000000000012000034000000005300001000000052600000000270060340000800900000000',
    '900006000807050000000000549000200100759034000030090700608000900000007600000000072',
  ],
  'w-wing': [
    '000000000000000001002003040000002300050000000410000006000560000004010000007000820',
    '000000000000000001002034000000000030004050200060100000000003400010700008800000006',
    '000000000000000012000034000000005300001200000036000070000100008090000000750000400',
  ],
  'xyz-wing': [
    // Puzzles 2 and 3 originally fired with a naked triple sitting right at
    // the position — a learner who spots that solves it without ever
    // needing XYZ-Wing. Replaced via mine-xyz-wing.ts with examples closer
    // to puzzle 1's cleanliness (no naked/hidden single/pair/triple/quad,
    // locked candidates, or simpler-fish/chain opportunity).
    '000000000000000001002034000000000000000005260070800000000980007006000030205100000',
    '004200070010540900000007004030000060800350000000000502700490000000001090400063000',
    '900005000013070800000016007001080500000600001290000006800020670020000000004050009',
  ],
  'finned-x-wing': [
    // Puzzles 2 and 3 originally fired on a degenerate 3-cell base (one
    // base row missing a corner, covered only by the fin) — technically
    // valid but doesn't read as "an X-Wing with one extra candidate" like
    // the lesson describes. Replaced via mine-finned-x-wing.ts with the
    // full 4-corner shape (puzzle 1 already had it, kept as-is).
    '000000000000000012000034000000000300005000006078600000000280070340000020900000000',
    '153000009090300600200004100000040060000851000000000800000000003300000408410000090',
    '030000200000750000000020004006079000084000900900000350091040000040083509000200000',
  ],
  'finned-swordfish': [
    // Puzzle 1 went through two rounds: first fired on a hidden single at
    // r5c4, then (once that was fixed) a 2-fin base — messier than the
    // classic single-fin shape and inconsistent with puzzles 2/3. Both
    // fixed via mine-finned-swordfish.ts, which now requires exactly one
    // fin. Puzzles 2 and 3 were already clean, kept as-is. (Order of 1/2
    // swapped per the owner's preference.)
    '000000000000000012003004000000000000000005600010270080000006003020000400780010000',
    '008500193610000700700300800040000009000070310000801070000050200300000040800006000',
    '000000000000000012003004000000000005000006307010000000000087000004010020020500080',
  ],
  'unique-rectangle': [
    '000000000000000001002034000000000000000005260070800000000980007006000030205100000',
    '000000000000000012003004000000000005000006307010000000000087000004010020020500080',
    '000000000000000012003004000000000300010050006720008400000200000000610000008000900',
  ],
  'bug+1': [
    '000000000000000012003045000000000300000106007450002000000050000008090700200000000',
    '000000000000000012003045000000003400006000000070100000010200007058000000400000020',
    '000000001000002003002040000000000450060000000310007000000600000005080200100300000',
  ],
  jellyfish: [
    // Original fired while a hidden single sat unplayed at r2c5 — replaced
    // via mine-jellyfish.ts (no naked/hidden single, fuller 13-cell base).
    '601090000400000600080000040004050370020000400095204000000061780000000003000705009',
    // fires-only, not proven necessary
    '000000000000000001002034000000000350000600200070180000000500002030000400680000000',
    // fires-only, not proven necessary
    '000000000000000012003004000000003005006000400070020001000050000200010000804000300',
  ],
  'finned-jellyfish': [
    // All three originals had a hidden single sitting unplayed at the fired
    // position, and puzzles 2/3 were near-duplicates (same rows/cols/fin
    // shape, one clue moved a cell). Replaced via mine-finned-jellyfish.ts;
    // puzzles 1 and 3 also required every base line to carry >=2 cells —
    // the first pass had a base line with just 1, reading as "only 3 real
    // sides", unlike puzzle 2's even 3-per-row shape (kept as-is).
    '000060730056400008080000000061007004020000070000900600000080000000720901305000000',
    '028400301400000000000690000012009800000003009007040500050008100100200030000000700',
    '830020000009100000002050360000408600040092000000000200003009500080030097600000800',
  ],
  // Re-mined 2026-08-27 (see mine-xy-chain.ts). The originals fired on a
  // degenerate 2-cell "chain" (a single bivalue link). All three below are
  // necessity-verified with a 5-8 cell chain that spans >=3 rows and >=3
  // columns, so it reads as a chain rather than a locked-candidate move.
  'xy-chain': [
    // Puzzles 1 and 3 originally fired with a naked single AND a hidden
    // single sitting unplayed at the fired position — replaced via
    // mine-xy-chain.ts's added cleanliness check. Puzzle 2 was already
    // clean, kept as-is.
    '007049120000008003090001000004000601025000400000003000006070000040025009700000000',
    '070090030010050470003001000800000900006000300000700026400000009790600800030000200',
    '010302506504000030000000000900087050000060000000900071060000902090000010800005000',
  ],
  // Re-mined again 2026-08-30: all 3 of the previous set had a hidden single
  // (puzzle 3 also a naked single) sitting unplayed at the fired position —
  // added that cleanliness check to mine-simple-coloring.ts. Clean +
  // necessity-verified + chain>=6 turned out very rare (one hit in ~65k
  // random puzzles); puzzle 2 relaxes to chain 5, still clean and
  // necessity-verified, just a shorter chain. Puzzle 3's first replacement
  // fired on a degenerate 4-cell chain confined to 2 rows/2 cols — literally
  // an X-Wing shape wearing coloring's clothes — so a second mining pass
  // added a rows<=2-and-cols<=2 rejection to the script.
  //
  // Puzzle 1 replaced again: even necessity-verified + spread + no-single
  // wasn't a strong enough bar — the owner found (via the live solver, real
  // step order) that both remaining picks had a technique reproducing the
  // EXACT SAME elimination (Claiming/2-String-Kite on the same cell+digit)
  // — genuinely redundant, not just "some other unrelated move exists
  // elsewhere on the board" (which turns out to be completely normal at any
  // real mid-solve position and isn't itself a problem). Fixed the miner's
  // check to reject only on that same-elimination overlap, and replaced
  // puzzle 1 with the owner's own found example (captured mid-solve from
  // the real solver's natural step order, hence the bracket-candidate
  // notation instead of a raw clue string — see `parseBoard` above).
  'simple-coloring': [
    {
      // Placed-digit-only stand-in (this mid-solve position's clues as if
      // it were its own puzzle) — schema-legal length, only used for
      // hasUniqueSolution/solutionState. The walkthrough itself uses
      // `firedAt` below, unchanged.
      gridState:
        '806012930071005006203060014765100309180000060309006100600070001510200673037651000',
      firedAt:
        '8 [45] 6 [47] 1 2 9 3 [57] [49] 7 1 [349] [3489] 5 [28] [28] 6 2 [59] 3 [89] 6 [789] [57] 1 4 7 6 5 1 [248] [48] 3 [248] 9 1 8 [24] [359] [39] [379] [457] 6 [25] 3 [24] 9 [57] [248] 6 1 [24578] [2578] 6 [29] [248] [348] 7 [348] [459] [459] 1 5 1 [48] 2 [489] [489] 6 7 3 [49] 3 7 6 5 1 [48] [248] [28]',
    },
    '840900000009600000000004070005209610000100040100080005700002300003060007500000020',
    // Puzzle 3 was, it turns out, never actually replaced despite the
    // comment above claiming otherwise — still the original degenerate
    // example, where Claiming reproduces the exact same elimination
    // (r8c5/r9c5 confining 7 to box 8 → remove from the rest, same cell the
    // coloring chain targets). Replaced via the corrected overlap check.
    '030060020090005070087092000008010000009503600000000407053026040002000010000050300',
  ],
  // Re-mined 2026-08-27 (see mine-als-xz.ts). Earlier batches read as a naked
  // quint (a 4-cell ALS one cell short of a locked subset in its unit). All
  // three below are necessity-verified AND: no single or naked/hidden subset
  // playable where ALS-XZ fires, AND neither ALS is "almost a naked subset"
  // (no other cell in its unit has candidates ⊆ its digits). So the highlighted
  // cells genuinely only connect via the ALS-XZ chain. #1 is the shape the
  // owner liked: a spread 3-cell row ALS + a 4-cell box ALS.
  'als-xz': [
    '070840000900007300000060000020108060006004080007000500010090024000006007200000000',
    // Puzzle 2 originally fired with a technique reproducing the EXACT SAME
    // elimination (r5c3=1, also independently justified by an X-Wing and a
    // Finned Swordfish) — the same "genuinely redundant" bug found on
    // Simple Coloring's puzzles. mine-als-xz.ts's SIMPLER-only check never
    // covered fish/wings/locked-candidates, so it slipped through; added
    // the same same-elimination overlap check used for Simple Coloring.
    '004050000000030021290000007060000000700300090058090070003080005000000002006021080',
    '020001800460000003050600007000002400000000082200947000800000050005308010000070000',
  ],
};

// ---------------------------------------------------------------------------
// step_data generation
// ---------------------------------------------------------------------------

// step_data is a progressive walkthrough (multiple beats), generated from the
// engine's firing Step by templates in ./walkthrough.ts.

// The two teaching relabels are not in the solver's technique list, and they
// resolve the *same* fact a plain hidden single does — so their lead-up must
// NOT include `hiddenSingle` (which would dissolve the target fact) but SHOULD
// include the candidate-eliminating techniques (locked candidates, subsets,
// fish, …) the relabel needs in order to become visible. Everything else uses
// the real solver minus the target technique, which is exactly the "necessity"
// criterion the puzzle set was verified against.
const TEACHING_RELABELS = new Set(['cross-hatching', 'last-possible-number']);

/** The technique(s) to exclude from a lead-up. Usually just the target
 * itself, but a slug whose `technique` is a combinator over several real
 * engine techniques (not itself a member of `TECHNIQUES`) needs each of
 * those excluded individually — filtering `TECHNIQUES` against the
 * combinator function is a no-op, since the combinator was never IN that
 * array, and the underlying techniques would then wrongly stay available as
 * ordinary lead-up moves and consume/reshape the puzzle before the
 * combinator's own check ever runs. (Caught via `pointing`'s merged
 * `pointingOrClaiming`: without this, a mined pointing-shaped puzzle could
 * get its pointing move silently eaten by lead-up, leaving only a claiming
 * move by the time the target check ran — the two curated puzzles quietly
 * swapped which direction they demonstrated.) */
function excluded(slug: string, target: Technique): Technique[] {
  if (TEACHING_RELABELS.has(slug)) return [hiddenSingle];
  if (slug === 'pointing') return [pointing, claiming];
  return [target];
}

/** A PUZZLES entry is normally a plain 81-char digit string, but can also be
 * the bracket-candidate notation from `serializeGridWithCandidates` — for a
 * puzzle authored directly from an already-reduced position (e.g. captured
 * from a real solve) rather than a raw clue set the lead-up has to reduce
 * itself. Mirrors the web app's `parseLessonGrid` / `walkthrough.ts`'s own
 * `parseBoard`. */
function parseBoard(board: string): Grid {
  return /[[\s]/.test(board) ? parseGridWithCandidates(board) : parseGrid(board);
}

type Fired = { step: Step; gridBefore: string | undefined };

/** Capture `target`'s Step on `puzzle`: apply lead-up moves (the full solver
 * minus the target) until the target fires, and store the exact candidate state
 * it fired on. `gridBefore` is undefined only when the target fired on the raw
 * puzzle (no lead-up needed).
 *
 * Puzzles are chosen (see the `mine-*.ts` scripts) so this position is the
 * natural one for the technique — no strictly-simpler move left unplayed
 * there, and (for several tactics) no easier technique independently
 * justifying the exact same elimination either. */
function fireTarget(puzzle: string, slug: string, target: Technique): Fired | null {
  const excl = excluded(slug, target);
  const leadUp = TECHNIQUES.filter((t) => !excl.includes(t));
  const grid = parseBoard(puzzle);
  for (let i = 0; i < 400; i++) {
    const step = target(grid);
    if (step) {
      return {
        step,
        gridBefore: i === 0 ? undefined : serializeGridWithCandidates(grid),
      };
    }
    if (!hint(grid, leadUp)) return null;
  }
  return null;
}

function buildStepData(slug: string, entry: PuzzleEntry): HintStep[] {
  const row = CURRICULUM.find((r) => r.slug === slug)!;
  // A `{ gridState, firedAt }` entry already knows its exact fired
  // position — evaluate the target directly there instead of running the
  // lead-up search from `gridState` (a placed-digit-only stand-in that
  // would very likely walk a different, unrelated path to a different
  // instance of the technique entirely).
  if (typeof entry !== 'string') {
    const grid = parseBoard(entry.firedAt);
    const step = row.technique(grid);
    if (!step) {
      throw new Error(
        `[seed] ${slug}: target technique never fired on the given firedAt state — ` +
          `puzzle/tactic mismatch, needs a replacement grid.`,
      );
    }
    return buildWalkthrough(step, slug, entry.firedAt, entry.firedAt);
  }
  const attempt = fireTarget(entry, slug, row.technique);
  if (!attempt) {
    throw new Error(
      `[seed] ${slug}: target technique never fired on ${entry} — ` +
        `puzzle/tactic mismatch, needs a replacement grid.`,
    );
  }
  return buildWalkthrough(
    attempt.step,
    slug,
    attempt.gridBefore,
    attempt.gridBefore ?? entry,
  );
}

function solutionFor(puzzle: string): string {
  const grid = cloneGrid(parseBoard(puzzle));
  const result = solveAll(grid);
  if (result.status === 'solved') {
    return serializeGrid(grid).replaceAll('.', '0');
  }
  // The technique solver (even with its forcing-chain backstop) can get
  // stuck on a position mid-solve that the ORIGINAL raw puzzle would have
  // reached and resolved via a longer chain earlier in the solve — this
  // happens for a puzzle authored directly from an already-reduced position
  // (bracket notation; see `parseBoard`) rather than a raw clue set the
  // lead-up derives itself. Fall back to the brute-force oracle `solve`
  // (same one `hasUniqueSolution` trusts) rather than failing outright.
  const brute = solve(cloneGrid(parseBoard(puzzle)));
  if (!brute) {
    throw new Error(`[seed] could not solve ${puzzle} (status: ${result.status}).`);
  }
  return serializeGrid(brute).replaceAll('.', '0');
}

// ---------------------------------------------------------------------------
// Write
// ---------------------------------------------------------------------------
async function main(): Promise<void> {
  let tacticCount = 0;
  let puzzleCount = 0;

  // Self-cleaning: a slug dropped from CURRICULUM (e.g. Claiming folding
  // into the merged Pointing/Claiming row) would otherwise linger forever —
  // upserts only ever add/update, never remove. Cascades to that tactic's
  // puzzles/progress/favorites.
  const currentSlugs = CURRICULUM.map((r) => r.slug);
  const stale = await db.query.tactics.findMany({
    where: (t, { notInArray }) => notInArray(t.slug, currentSlugs),
  });
  for (const t of stale) {
    await db.delete(tactics).where(eq(tactics.id, t.id));
    console.log(`  removed stale tactic: ${t.slug}`);
  }

  for (let i = 0; i < CURRICULUM.length; i++) {
    const row = CURRICULUM[i]!;
    const prevOrder = CURRICULUM.slice(0, i).filter((r) => r.tier === row.tier).length;
    const orderInTier = prevOrder; // 0-based position within the tier

    const [tactic] = await db
      .insert(tactics)
      .values({
        slug: row.slug,
        name: row.name,
        tier: row.tier,
        orderInTier,
        description: row.description,
      })
      .onConflictDoUpdate({
        target: tactics.slug,
        set: {
          name: row.name,
          tier: row.tier,
          orderInTier,
          description: row.description,
        },
      })
      .returning();
    tacticCount++;

    const grids = PUZZLES[row.slug];
    if (!grids) throw new Error(`[seed] no puzzles for ${row.slug}`);

    await db.delete(tacticPuzzles).where(eq(tacticPuzzles.tacticId, tactic!.id));

    for (let p = 0; p < grids.length; p++) {
      const entry = grids[p]!;
      const gridState = typeof entry === 'string' ? entry : entry.gridState;
      if (!hasUniqueSolution(parseBoard(gridState))) {
        throw new Error(
          `[seed] ${row.slug} puzzle ${p} has no unique solution: ${gridState}`,
        );
      }
      const stepData = buildStepData(row.slug, entry);
      await db.insert(tacticPuzzles).values({
        tacticId: tactic!.id,
        gridState,
        solutionState: solutionFor(gridState),
        stepData,
        isTeachingExample: p === 0,
      });
      puzzleCount++;
      process.stdout.write(
        `  ${row.slug} ${p === 0 ? '(teaching)' : '(practice)'} — ${stepData[0]!.technique}\n`,
      );
    }
  }

  console.log(`\nSeeded ${tacticCount} tactics, ${puzzleCount} tactic_puzzles.`);
  await client.end();
}

await main();
