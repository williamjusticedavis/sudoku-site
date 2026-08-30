/**
 * Seed `tactics` and `tactic_puzzles` for the Learn section.
 *
 * Curriculum (tier / order / name / family) is transcribed from the locked
 * table in the repo-root CLAUDE.md. Puzzle grid strings are the mined +
 * uniqueness-verified set from the Phase 2 `tactic-examples.md` working note.
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
  serializeGrid,
  serializeGridWithCandidates,
  hasUniqueSolution,
  solveAll,
  TECHNIQUES,
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
    name: 'Pointing',
    tier: 'intermediate',
    description:
      'A digit confined to one box also sits in a single row or column; remove it from the rest of that line.',
    technique: pointing,
  },
  {
    slug: 'claiming',
    name: 'Claiming',
    tier: 'intermediate',
    description:
      'A digit confined to one row or column within a box; remove it from the rest of that box.',
    technique: claiming,
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
// Puzzle strings — from tactic-examples.md (81 chars, 0 = blank). First entry
// per tactic becomes the teaching example; the rest are practice puzzles.
// Puzzles flagged there as "fires-only, not proven necessary" are listed last
// so they are never the teaching example.
// ---------------------------------------------------------------------------
const PUZZLES: Record<string, [string, string, string]> = {
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
    '000000000000000001000002030000003020004000050006010000030000006070080009520700000',
    '000000000000000001000002030000004250006000000017000080000070006400060000900800010',
  ],
  'last-possible-number': [
    '000000000000000001000002030002000400003050000004100006050600000070000020080910000',
    '000000000000000001000002030002000400003050000004600007050100000080000020090760000',
    '000000000000000001000002034000004000005000600006030000030050000070060800240000007',
  ],
  pointing: [
    '000000000000000001001002030000040000040560700080000020002000000003001000700080004',
    '000000000000000001002003040000002300050000000410000006000560000004010000007000820',
    '000000000000000001002003040000005000030000600700010008000006250080090000100000030',
  ],
  claiming: [
    '000000000000000001001002030000040000040560700080000020002000000003001000700080004',
    '000000000000000001002003040000005000030000600700010008000006250080090000100000030',
    '000000000000000001002003040000005020060007000810000000000010306000080000009600200',
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
  'hidden-pair': [
    '000000000000000001001002030000040000040560700080000020002000000003001000700080004',
    '000000000000000001002003040000005000030000600700010008000006250080090000100000030',
    '000000000000000001002034000000002000040050000600100007000008030003000540100600000',
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
    '000000000000000001002003040000002300050000000410000006000560000004010000007000820',
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
    '000000000000000001002003040000002300050000000410000006000560000004010000007000820',
    '000000000000000012003045000000000000006000307080200000000004500009000006020180000',
    '000000000000000012003045000000000300004000600010270000000006400070000000520000080',
  ],
  swordfish: [
    '000000000000000012003004000000003400015000000620000007000260000008000500090010000',
    '000000000000000012003004000000003500010000006260000070000016000000720000008000400',
    '000000000000000012003004000000003500010060000270000008000108000000720000009000600',
  ],
  'xy-wing': [
    '000000000000000012000034000000000300005000006078600000000280070340000020900000000',
    '000000000000000012000034000000005300001000000052600000000270060340000800900000000',
    '000000000000000012000034000000005300001000060072100000000260008090000000340000000',
  ],
  'w-wing': [
    '000000000000000001002003040000002300050000000410000006000560000004010000007000820',
    '000000000000000001002034000000000030004050200060100000000003400010700008800000006',
    '000000000000000012000034000000005300001200000036000070000100008090000000750000400',
  ],
  'xyz-wing': [
    '000000000000000001002034000000000000000005260070800000000980007006000030205100000',
    '000000000000000012000034000000000005003160000007800400000009030090005000510000000',
    '000000000000000012000034000000005300001200000036000070000100008090000000750000400',
  ],
  'finned-x-wing': [
    '000000000000000012000034000000000300005000006078600000000280070340000020900000000',
    '000000000000000012000034000000000305002000000006780000000109060030000000450200000',
    '000000000000000012000034000000005300001000000026100700000200005070080000300000400',
  ],
  'finned-swordfish': [
    '000000000000000012000034000000000305002000000006780000000109060030000000450200000',
    '000000000000000012003004000000000000000005600010270080000006003020000400780010000',
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
    '000000000000001023045060000000000007000408000800003010000000500000500006200070000',
    // fires-only, not proven necessary
    '000000000000000001002034000000000350000600200070180000000500002030000400680000000',
    // fires-only, not proven necessary
    '000000000000000012003004000000003005006000400070020001000050000200010000804000300',
  ],
  'finned-jellyfish': [
    '000000000000000001002034050000006007003000000051000000000810030070300000600000200',
    '000000000000000012003045000000000300004000500010620000000200000005007000080100090',
    '000000000000000012003045000000000300004000500010620000000200000005007000800100090',
  ],
  // Re-mined 2026-08-27 (see mine-xy-chain.ts). The originals fired on a
  // degenerate 2-cell "chain" (a single bivalue link). All three below are
  // necessity-verified with a 5-8 cell chain that spans >=3 rows and >=3
  // columns, so it reads as a chain rather than a locked-candidate move.
  'xy-chain': [
    '600800004000076002070000030060009000000023010003000400014300070005060000000080059',
    '070090030010050470003001000800000900006000300000700026400000009790600800030000200',
    '000000900003140000205000040009710000010300000350002007100208000000030800060005010',
  ],
  // Re-mined 2026-08-27 (see mine-simple-coloring.ts). The originals fired via a
  // degenerate 2-cell colour component — visually identical to Pointing/Claiming.
  // These all fire on an 8-12 cell coloured cluster (~7-11 conjugate links).
  // #1 and #2 are necessity-verified; #3 is fires-only (like hidden-quad #3 and
  // jellyfish #2/#3) — an exhaustive symmetry-transform search over 14k puzzles
  // turned up no third necessity-verified case with a chain this long.
  'simple-coloring': [
    '030007000040150200001006008010005080080010000065900032000002401050001000000370005',
    '529601000000500490000000000100000340008000500600002080960000000005000002003057000',
    '007090003000401500200000600609500000080064000000000200805300010010000009030002006',
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
    '000000005070210000090000401007300000800700003600005040060008200050003000300900100',
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

/** The technique to exclude from a lead-up. For the teaching relabels that's
 * `hiddenSingle` (they resolve the same fact); otherwise the target itself. */
function excluded(slug: string, target: Technique): Technique {
  return TEACHING_RELABELS.has(slug) ? hiddenSingle : target;
}

type Fired = { step: Step; gridBefore: string | undefined };

/** Capture `target`'s Step on `puzzle`: apply lead-up moves (the full solver
 * minus the target) until the target fires, and store the exact candidate state
 * it fired on. `gridBefore` is undefined only when the target fired on the raw
 * puzzle (no lead-up needed).
 *
 * Puzzles are chosen (see `tactic-examples.md` and the `mine-*.ts` scripts) so
 * this position is the natural one for the technique — for the advanced tactics
 * that means no strictly-simpler move is left unplayed there. */
function fireTarget(puzzle: string, slug: string, target: Technique): Fired | null {
  const leadUp = TECHNIQUES.filter((t) => t !== excluded(slug, target));
  const grid = parseGrid(puzzle);
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

function buildStepData(slug: string, puzzle: string): HintStep[] {
  const row = CURRICULUM.find((r) => r.slug === slug)!;
  const attempt = fireTarget(puzzle, slug, row.technique);
  if (!attempt) {
    throw new Error(
      `[seed] ${slug}: target technique never fired on ${puzzle} — ` +
        `puzzle/tactic mismatch, needs a replacement grid.`,
    );
  }
  return buildWalkthrough(attempt.step, slug, attempt.gridBefore);
}

function solutionFor(puzzle: string): string {
  const grid = cloneGrid(parseGrid(puzzle));
  const result = solveAll(grid);
  if (result.status !== 'solved') {
    throw new Error(`[seed] could not solve ${puzzle} (status: ${result.status}).`);
  }
  return serializeGrid(grid).replaceAll('.', '0');
}

// ---------------------------------------------------------------------------
// Write
// ---------------------------------------------------------------------------
async function main(): Promise<void> {
  let tacticCount = 0;
  let puzzleCount = 0;

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
      const gridState = grids[p]!;
      if (!hasUniqueSolution(parseGrid(gridState))) {
        throw new Error(
          `[seed] ${row.slug} puzzle ${p} has no unique solution: ${gridState}`,
        );
      }
      const stepData = buildStepData(row.slug, gridState);
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
