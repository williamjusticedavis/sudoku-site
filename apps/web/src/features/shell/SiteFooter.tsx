import { Link } from '@tanstack/react-router';

/** The site footer: About and Feedback, and nothing else.
 *
 * Kept to a single short row on purpose. The solver at `lg` is a locked-height,
 * non-scrolling layout — its `<main>` is `lg:flex-1 lg:overflow-hidden` inside a
 * `flex min-h-full flex-col` body — so the grid is sized from whatever height is
 * left over, and every row added down here comes straight off the board. Two
 * links fit on one line at every width, which is what keeps the cost to a
 * single ~36px bar. Adding a column layout would not.
 */
const link = [
  'rounded-md px-2 py-1 transition-colors',
  'text-neutral-500 hover:text-neutral-900',
  'dark:text-neutral-400 dark:hover:text-neutral-100',
].join(' ');

export function SiteFooter() {
  return (
    // Painted rather than transparent, and given a stacking context. The
    // footer sits at the end of the document with page content directly above
    // it, so a transparent strip shows whatever it happens to overlap the
    // moment anything is mispositioned — which is exactly how the overflow bug
    // above presented. Colours match the body ground, so it reads as page
    // rather than as a panel; the top border does the separating.
    <footer className="relative z-10 shrink-0 border-t border-neutral-200 bg-neutral-50 dark:border-neutral-800 dark:bg-neutral-950">
      <nav className="mx-auto flex max-w-[1800px] items-center gap-1 px-4 py-2 text-sm">
        <span className="text-neutral-400 dark:text-neutral-500">© Gridwise</span>
        <span className="ml-auto flex items-center gap-1">
          <Link to="/about" className={link}>
            About
          </Link>
          <Link to="/feedback" className={link}>
            Feedback
          </Link>
        </span>
      </nav>
    </footer>
  );
}
