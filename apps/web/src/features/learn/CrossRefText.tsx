/**
 * Wiki-style cross-references inside Learn prose.
 *
 * Lesson overviews name other tactics constantly ("Like an XY-Wing, but…",
 * "Flip side of a naked pair") and until now those mentions were dead text — a
 * learner who didn't know the referenced tactic had to go back to the tier
 * overview and hunt for it. `[[slug]]` / `[[slug|display text]]` markers in the
 * prose turn them into links.
 *
 * Targets are resolved against the tactic list the loader actually read from
 * the database, not a hardcoded copy of it, so a renamed or removed slug can't
 * quietly rot into a dead link. An unresolvable marker renders in red with a
 * wavy underline and logs to the console — loud, because prose is the one place
 * a typo has nothing else to catch it (no types, no tests, and the sentence
 * still reads fine without the link).
 */
import { Fragment, type ReactNode } from 'react';
import { Link } from '@tanstack/react-router';
import type { TacticLink } from './types.js';

/**
 * Learn pages that lesson prose refers to by name but which aren't `tactics`
 * rows — the two standalone reference pages. Written out one by one rather than
 * held in a lookup table because the router types `to` as a literal route path,
 * and a `Record<string, string>` would erase that.
 */
const CONCEPT_NAMES: Record<string, string> = {
  basics: 'How Sudoku Works',
  'strong-weak-links': 'Strong Links & Weak Links',
};

function conceptLink(key: string, label: ReactNode, className: string): ReactNode {
  if (key === 'basics')
    return (
      <Link to="/learn/basics" className={className}>
        {label}
      </Link>
    );
  return (
    <Link to="/learn/strong-weak-links" className={className}>
      {label}
    </Link>
  );
}

/** `[[slug]]` or `[[slug|display text]]`. The slug half stops at `|` or `]`. */
const MARKER = /\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g;

const linkClass =
  'font-medium text-neutral-800 underline decoration-neutral-400 underline-offset-2 transition-colors hover:decoration-neutral-800 dark:text-neutral-200 dark:decoration-neutral-600 dark:hover:decoration-neutral-300';

const brokenClass = 'text-red-600 underline decoration-wavy dark:text-red-400';

export interface CrossRefTextProps {
  /** Prose, possibly carrying `[[…]]` markers. Plain text passes straight through. */
  text: string;
  /** Every tactic, from the lesson loader. The authority on what a slug means. */
  index: TacticLink[];
  /**
   * Slug of the lesson being viewed. A marker pointing at the current page is
   * rendered as plain text — a link back to where you already are is noise, and
   * looks broken when clicking it does nothing.
   */
  currentSlug?: string;
}

export function CrossRefText({ text, index, currentSlug }: CrossRefTextProps) {
  const parts: ReactNode[] = [];
  let cursor = 0;
  let key = 0;

  // `matchAll` rather than a stateful `exec` loop: MARKER is module-level, so a
  // `lastIndex` left behind by an early return would corrupt the next render.
  for (const match of text.matchAll(MARKER)) {
    const at = match.index;
    if (at > cursor) parts.push(text.slice(cursor, at));
    cursor = at + match[0].length;

    // Group 1 is not optional in MARKER, so it is always present on a match —
    // the `?? ''` only satisfies `noUncheckedIndexedAccess`.
    const slug = (match[1] ?? '').trim();
    const tactic = index.find((t) => t.slug === slug);
    const conceptName = CONCEPT_NAMES[slug];
    const label = match[2]?.trim() ?? tactic?.name ?? conceptName ?? slug;

    if (slug === currentSlug) {
      parts.push(<Fragment key={key++}>{label}</Fragment>);
    } else if (tactic) {
      parts.push(
        <Link key={key++} to="/learn/$slug" params={{ slug }} className={linkClass}>
          {label}
        </Link>,
      );
    } else if (conceptName) {
      parts.push(<Fragment key={key++}>{conceptLink(slug, label, linkClass)}</Fragment>);
    } else {
      console.error(
        `[learn] cross-reference points at "${slug}", which is neither a tactic slug nor a reference page.`,
      );
      parts.push(
        <span key={key++} className={brokenClass} title={`Unknown lesson: ${slug}`}>
          {label}
        </span>,
      );
    }
  }

  if (cursor < text.length) parts.push(text.slice(cursor));
  return <>{parts}</>;
}
