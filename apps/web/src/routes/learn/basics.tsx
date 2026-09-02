import { createFileRoute, Link } from '@tanstack/react-router';
import { BackButton } from '../../features/learn/BackButton.js';

export const Route = createFileRoute('/learn/basics')({
  component: BasicsPage,
});

/** A bare 9×9 grid with one row, one column, and one box tinted — the three
 * units every cell belongs to. Deliberately digit-free: the point is the
 * shape of the constraint, not a specific puzzle. */
function UnitsDiagram() {
  const S = 24; // cell size
  const P = 2; // padding so outer stroke isn't clipped
  const cells: React.ReactNode[] = [];

  // Tinted bands: row 1 (0-indexed), column 7, bottom-left box (rows 6-8,
  // cols 0-2). Chosen so none of the three overlap.
  for (let r = 0; r < 9; r += 1) {
    for (let c = 0; c < 9; c += 1) {
      const inRow = r === 1;
      const inCol = c === 7;
      const inBox = r >= 6 && c <= 2;
      const fill = inRow
        ? 'fill-emerald-500/20'
        : inCol
          ? 'fill-sky-500/20'
          : inBox
            ? 'fill-amber-500/20'
            : 'fill-transparent';
      cells.push(
        <rect
          key={`${r}-${c}`}
          x={P + c * S}
          y={P + r * S}
          width={S}
          height={S}
          className={fill}
        />,
      );
    }
  }

  const lines: React.ReactNode[] = [];
  for (let i = 0; i <= 9; i += 1) {
    const thick = i % 3 === 0;
    lines.push(
      <line
        key={`h-${i}`}
        x1={P}
        y1={P + i * S}
        x2={P + 9 * S}
        y2={P + i * S}
        strokeWidth={thick ? 2 : 1}
        className="stroke-neutral-400 dark:stroke-neutral-600"
      />,
      <line
        key={`v-${i}`}
        x1={P + i * S}
        y1={P}
        x2={P + i * S}
        y2={P + 9 * S}
        strokeWidth={thick ? 2 : 1}
        className="stroke-neutral-400 dark:stroke-neutral-600"
      />,
    );
  }

  return (
    <svg viewBox={`0 0 ${9 * S + 2 * P} ${9 * S + 2 * P}`} className="w-full max-w-xs">
      {cells}
      {lines}
    </svg>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-lg font-semibold text-neutral-900 dark:text-neutral-100">
        {title}
      </h2>
      <div className="flex flex-col gap-3 text-base leading-relaxed text-neutral-700 dark:text-neutral-300">
        {children}
      </div>
    </section>
  );
}

function BasicsPage() {
  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-8">
      <BackButton fallbackTo="/learn" />
      <div className="mb-1 flex items-center gap-2 text-xs font-medium tracking-wide text-neutral-500 uppercase dark:text-neutral-400">
        <Link to="/learn" className="hover:text-neutral-800 dark:hover:text-neutral-200">
          Learn
        </Link>
        <span aria-hidden>·</span>
        <span>Start here</span>
      </div>
      <h1 className="mb-2 text-3xl font-bold text-neutral-900 dark:text-neutral-100">
        How Sudoku Works
      </h1>
      <p className="mb-8 text-base text-neutral-600 dark:text-neutral-400">
        The whole game in one page — the single rule, what "solved" means, and the two
        words (<em>candidate</em>, <em>unit</em>) the lessons below assume you already
        have. No techniques here yet; those start with the Beginner tier.
      </p>

      <div className="flex flex-col gap-10">
        <Section title="The grid">
          <p>
            A sudoku is a 9×9 grid, split into nine 3×3 <strong>boxes</strong> by the
            heavier lines. Some cells come pre-filled — the <strong>givens</strong>, or
            clues. Every other cell is yours to fill with a digit from 1 to 9.
          </p>
          <p>
            A proper sudoku has exactly <strong>one</strong> solution: one arrangement of
            digits that finishes the grid without breaking the rule below. That uniqueness
            isn't just a nicety — a few techniques (Unique Rectangle, BUG+1) lean on it
            directly.
          </p>
        </Section>

        <Section title="The one rule">
          <p>
            Each digit 1–9 appears <strong>exactly once</strong> in every row, once in
            every column, and once in every 3×3 box. That's it. Everything else in solving
            is a consequence of that one constraint applied over and over.
          </p>
          <p>
            Put the other way round: a digit can't repeat in a row, a column, or a box.
            When you're deciding whether a digit fits a cell, those are the three
            directions you check.
          </p>
        </Section>

        <Section title="Row, column, box — a &ldquo;unit&rdquo;">
          <p>
            Those three groupings each have a name the lessons use constantly: a{' '}
            <strong>unit</strong> is any one row, any one column, or any one box — nine
            cells that must hold the digits 1–9 between them with no repeats.
          </p>
          <UnitsDiagram />
          <p className="text-sm text-neutral-500 dark:text-neutral-400">
            One row (green), one column (blue), one box (amber). Every single cell sits in
            exactly one of each — three overlapping units constraining it at once.
          </p>
        </Section>

        <Section title="Candidates (pencil marks)">
          <p>
            A <strong>candidate</strong> is a digit that could still legally go in a given
            empty cell — it doesn't yet repeat in that cell's row, column, or box. On
            paper people pencil these in small; on this site they're shown for you.
          </p>
          <p>
            Solving is mostly the hunt for a cell where only one candidate is left, or a
            unit where a digit has only one cell left to go. Every technique in the
            lessons is a named pattern that lets you rule out candidates you couldn't
            eliminate just by looking one row at a time.
          </p>
          <p className="text-sm text-neutral-500 dark:text-neutral-400">
            The solver never takes a pencil mark on your word — it works out the
            candidates itself from the placed digits. If you do mark up a grid, it checks
            every mark you made against both its own candidates and the puzzle's real
            solution: pass cleanly and the eliminations you already found are folded into
            the solve, so you don't get walked back through your own work. One bad mark
            voids the set, your notes reset, and it solves from the digits instead — so
            you can't strand yourself with a wrong mark either way.
          </p>
        </Section>

        <Section title="Where to go next">
          <p>
            The{' '}
            <Link
              to="/learn"
              className="text-blue-600 hover:underline dark:text-blue-400"
            >
              Beginner tier
            </Link>{' '}
            starts with the two simplest moves — filling a unit's last empty cell, and a
            cell with one candidate left — and each tier builds from there. You can also
            just paste a puzzle into the{' '}
            <Link to="/" className="text-blue-600 hover:underline dark:text-blue-400">
              Solver
            </Link>{' '}
            and ask for one hint at a time.
          </p>
        </Section>
      </div>
    </main>
  );
}
