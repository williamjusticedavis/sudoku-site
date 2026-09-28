/**
 * How often does the solver fall back to the forcing-chain backstop?
 *
 *   pnpm -C packages/engine backstop            # every fixture
 *   pnpm -C packages/engine backstop hard17.csv # just the named fixture(s)
 *
 * The backstop is a guided guess ("assume r1c2=2, it contradicts"), not a
 * pattern a human spots. Every technique added past the curriculum exists to
 * make it fire less, so this prints, per fixture, how many puzzles still need
 * it and how many backstop steps they take, then how often each technique
 * fired across the run. Run it before and after adding a technique.
 *
 * It also re-checks the oracle's consistency invariant (no wrong placement, no
 * elimination of a solution digit) plus completeness (the backstop guarantees
 * every fixture solves), and exits non-zero on a violation, so a number from an
 * unsound technique is never mistaken for progress.
 */

import { checkAgainstOracle, listFixtureFiles, loadPairs } from './__tests__/oracle.js';

function main(argv: string[]): number {
  const files = argv.length > 0 ? argv : listFixtureFiles();
  const fired = new Map<string, number>();
  let violations = 0;
  let totalPuzzles = 0;
  let totalHits = 0;
  let totalBackstop = 0;
  const started = Date.now();

  console.log(
    'fixture                          puzzles  backstop-puzzles  backstop-steps',
  );
  for (const file of files) {
    const outcomes = loadPairs(file).map(checkAgainstOracle);
    let hits = 0;
    let backstop = 0;
    for (const o of outcomes) {
      const n = o.techniques.filter((t) => t === 'forcing-chain').length;
      if (n > 0) hits++;
      backstop += n;
      for (const t of o.techniques) fired.set(t, (fired.get(t) ?? 0) + 1);
      if (o.wrongCell !== null || o.wrongElimination !== null || !o.solved) {
        violations++;
        const why =
          o.wrongElimination !== null
            ? `wrong elimination ${JSON.stringify(o.wrongElimination)}`
            : o.wrongCell !== null
              ? `wrong placement at cell ${o.wrongCell}`
              : `not solved (${o.status})`;
        console.error(`  ✗ ${file}: ${o.puzzle} — ${why}`);
      }
    }
    totalPuzzles += outcomes.length;
    totalHits += hits;
    totalBackstop += backstop;
    console.log(
      `${file.padEnd(32)} ${String(outcomes.length).padStart(7)}  ${String(hits).padStart(
        16,
      )}  ${String(backstop).padStart(14)}`,
    );
  }
  console.log(
    `${'TOTAL'.padEnd(32)} ${String(totalPuzzles).padStart(7)}  ${String(
      totalHits,
    ).padStart(16)}  ${String(totalBackstop).padStart(14)}`,
  );

  console.log('\nsteps per technique:');
  for (const [t, n] of [...fired].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${t.padEnd(22)} ${n}`);
  }
  console.log(
    `\n${((Date.now() - started) / 1000).toFixed(1)}s, ${violations} violation(s)`,
  );
  return violations === 0 ? 0 : 1;
}

process.exit(main(process.argv.slice(2)));
