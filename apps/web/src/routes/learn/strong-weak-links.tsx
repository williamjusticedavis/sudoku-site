import { createFileRoute, Link } from '@tanstack/react-router';
import { BackButton } from '../../features/learn/BackButton.js';

export const Route = createFileRoute('/learn/strong-weak-links')({
  component: StrongWeakLinksPage,
});

/** Two dots and a connecting line — solid for a strong link, dashed for a
 * weak one. Deliberately abstract (not a sudoku grid): the point here is the
 * relationship, not a specific puzzle position. */
function LinkDiagram({
  style,
  leftLabel,
  rightLabel,
}: {
  style: 'solid' | 'dashed';
  leftLabel: string;
  rightLabel: string;
}) {
  return (
    <svg viewBox="0 0 220 60" className="w-full max-w-xs">
      <line
        x1="30"
        y1="30"
        x2="190"
        y2="30"
        strokeWidth="2.5"
        strokeDasharray={style === 'dashed' ? '8 6' : undefined}
        className="stroke-emerald-600 dark:stroke-emerald-400"
      />
      <circle cx="30" cy="30" r="12" className="fill-blue-600 dark:fill-blue-400" />
      <circle cx="190" cy="30" r="12" className="fill-blue-600 dark:fill-blue-400" />
      <text
        x="30"
        y="54"
        textAnchor="middle"
        className="fill-neutral-700 text-[11px] dark:fill-neutral-300"
      >
        {leftLabel}
      </text>
      <text
        x="190"
        y="54"
        textAnchor="middle"
        className="fill-neutral-700 text-[11px] dark:fill-neutral-300"
      >
        {rightLabel}
      </text>
    </svg>
  );
}

/** The 4-node chain diagram: strong / weak / strong, matching the solid-
 * dashed-solid convention the lessons themselves use for their xLines. */
function ChainDiagram() {
  const nodes: { x: number; label: string }[] = [
    { x: 30, label: 'a₁' },
    { x: 150, label: 'b₁' },
    { x: 270, label: 'a₂' },
    { x: 390, label: 'b₂' },
  ];
  return (
    <svg viewBox="0 0 420 70" className="w-full max-w-md">
      <line
        x1={30}
        y1={30}
        x2={150}
        y2={30}
        strokeWidth="2.5"
        className="stroke-emerald-600 dark:stroke-emerald-400"
      />
      <line
        x1={150}
        y1={30}
        x2={270}
        y2={30}
        strokeWidth="2.5"
        strokeDasharray="8 6"
        className="stroke-emerald-600 dark:stroke-emerald-400"
      />
      <line
        x1={270}
        y1={30}
        x2={390}
        y2={30}
        strokeWidth="2.5"
        className="stroke-emerald-600 dark:stroke-emerald-400"
      />
      {nodes.map((n) => (
        <g key={n.x}>
          <circle cx={n.x} cy={30} r="12" className="fill-blue-600 dark:fill-blue-400" />
          <text
            x={n.x}
            y={58}
            textAnchor="middle"
            className="fill-neutral-700 text-[12px] dark:fill-neutral-300"
          >
            {n.label}
          </text>
        </g>
      ))}
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

function StrongWeakLinksPage() {
  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-8">
      <BackButton fallbackTo="/learn" />
      <div className="mb-1 flex items-center gap-2 text-xs font-medium tracking-wide text-neutral-500 uppercase dark:text-neutral-400">
        <Link to="/learn" className="hover:text-neutral-800 dark:hover:text-neutral-200">
          Advanced
        </Link>
        <span aria-hidden>·</span>
        <span>Concept</span>
      </div>
      <h1 className="mb-2 text-3xl font-bold text-neutral-900 dark:text-neutral-100">
        Strong Links &amp; Weak Links
      </h1>
      <p className="mb-8 text-base text-neutral-600 dark:text-neutral-400">
        Not a tactic with its own puzzles to solve — a piece of vocabulary. Every lesson
        from here on leans on it, so it's worth the slightly longer read now rather than
        re-explaining it every time it comes up.
      </p>

      <div className="flex flex-col gap-10">
        <Section title="Why this page exists">
          <p>
            Skyscraper, 2-String Kite, and Turbot Fish are, underneath, the exact same
            three-step argument wearing different geometry. So are Simple Coloring and
            XY-Chain later on, just with more steps strung together. Once you can name the
            pieces — a <em>strong link</em> and a <em>weak link</em> — every one of those
            lessons stops being "a new shape to memorize" and becomes "the same two ideas,
            one more time, in a new spot on the grid."
          </p>
        </Section>

        <Section title="Strong link: a real either/or">
          <p>
            Look at one row, column, or box. If a digit's candidates in that unit are down
            to exactly two cells, you have a <strong>strong link</strong> (sudoku solvers
            also call this a <em>conjugate pair</em>). Call the two cells A and B.
          </p>
          <p>
            The unit needs that digit somewhere, and these are the only two cells left
            that can take it — so the logic runs both directions at once:{' '}
            <strong>if A isn't the digit, B must be</strong>, and just as surely,{' '}
            <strong>if B isn't the digit, A must be</strong>. Not "probably" — certainly,
            because there's nowhere else in the unit for it to go. That two-way guarantee
            is what makes it "strong."
          </p>
          <LinkDiagram style="solid" leftLabel="A" rightLabel="B" />
          <p className="text-sm text-neutral-500 dark:text-neutral-400">
            Drawn as a solid line in these lessons — the same solid green line X-Wing
            draws between its four corners, since X-Wing is built from two strong links
            too.
          </p>
        </Section>

        <Section title="Weak link: only a can't-both">
          <p>
            Now take two cells that simply <em>see</em> each other — same row, column, or
            box — and both still carry a digit as a candidate. That's a{' '}
            <strong>weak link</strong>. All it guarantees is that{' '}
            <strong>they can't both be the digit</strong> (the unit would end up with it
            twice). It says nothing about whether either one actually is the digit — maybe
            neither is, if the digit ends up placed somewhere else in that unit entirely.
          </p>
          <p>
            That's the whole difference: a strong link forces something (at least one of
            the pair must be true). A weak link only forbids something (not both). One
            direction of certainty instead of two — which is exactly why it's the "weak"
            half of the chain.
          </p>
          <LinkDiagram style="dashed" leftLabel="A" rightLabel="B" />
          <p className="text-sm text-neutral-500 dark:text-neutral-400">
            Drawn as a dashed line here — you'll see this exact dashed segment connecting
            the two inner cells in Skyscraper, 2-String Kite, and Turbot Fish.
          </p>
        </Section>

        <Section title="Chaining them together">
          <p>
            The three lessons in this tier all build the same short chain: strong link,
            weak link, strong link — four cells, three connections, written a₁ = b₁ − a₂ =
            b₂ (an "=" for each strong link, a "−" for the weak one in the middle).
          </p>
          <ChainDiagram />
          <p>
            Read it left to right, both ways: if a₁ isn't the digit, the first strong link
            forces b₁ to be it. If b₁ is the digit, the weak link forbids a₂ from also
            being it. And if a₂ isn't the digit, the second strong link forces b₂ to be
            it. Chase either starting assumption through and you land on the same
            conclusion: <strong>a₁ or b₂ is the digit</strong> — maybe not both, but never
            neither.
          </p>
          <p>
            That's the whole payoff: any cell that can see <em>both</em> a₁ and b₂ can't
            be the digit either, no matter which end turns out to be right. Removing the
            digit from those cells is the elimination every lesson in this tier ends on.
          </p>
        </Section>

        <Section title="What decides the shape">
          <p>
            The three lessons differ only in <em>where</em> the two strong links sit and{' '}
            <em>which unit</em> their inner ends (b₁ and a₂) share:
          </p>
          <ul className="list-disc pl-5">
            <li>
              <strong>Skyscraper</strong> — both strong links are the same kind of line
              (two rows, or two columns), and the inner ends line up in the cross
              direction.
            </li>
            <li>
              <strong>2-String Kite</strong> — one strong link is a row, the other a
              column, and the inner ends happen to share a box.
            </li>
            <li>
              <strong>Turbot Fish</strong> — the general case: either strong link, and the
              weak link between them, can be a row, a column, or a box, in any
              combination.
            </li>
          </ul>
          <p>
            Further along, in the Master tier, Simple Coloring and XY-Chain reuse this
            same solid/dashed vocabulary — just with longer chains of more than two strong
            links strung together instead of exactly one weak link in the middle.
          </p>
        </Section>
      </div>
    </main>
  );
}
