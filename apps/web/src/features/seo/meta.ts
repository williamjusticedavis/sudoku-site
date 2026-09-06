/**
 * Per-page metadata.
 *
 * Every route used to inherit the one `head` in `__root.tsx`, so all ~33 pages
 * — the 28 lesson pages included — served an identical title and description.
 * Search engines saw near-duplicates of the site's most valuable content, and
 * every shared link previewed the same way whichever lesson it pointed at.
 *
 * `seo()` returns the `meta` array a route's `head` should spread. It always
 * emits title, description, canonical and the Open Graph/Twitter pair together,
 * because a page that sets only some of those is the state this was fixing.
 */

/** Absolute site origin, needed for canonical and `og:url` — relative URLs are
 * not valid in either. Configured per environment; the fallback is the Railway
 * domain the site actually runs on, so a missing env var degrades to correct
 * rather than to `localhost` leaking into production metadata. */
const SITE_URL = (
  import.meta.env.VITE_SITE_URL ?? 'https://sudoku-site-production.up.railway.app'
).replace(/\/$/, '');

export const SITE_NAME = 'Gridwise';

export interface SeoInput {
  /** Page title WITHOUT the site name — `seo` appends it. */
  title: string;
  description: string;
  /** Root-relative path, e.g. `/learn/x-wing`. */
  path: string;
}

/** Trailing slash on the root is deliberate: it has to match what
 * `sitemap.xml` lists, or the canonical tag and the sitemap disagree about
 * which URL the home page actually is. */
export function canonicalUrl(path: string): string {
  return `${SITE_URL}${path}`;
}

export function seo({ title, description, path }: SeoInput) {
  // The site name is appended rather than prefixed so the distinctive part
  // survives truncation in a search result or a browser tab. A pipe rather
  // than a dash because several page titles contain a dash of their own
  // ("X-Wing — Sudoku Technique"), and two dashes read as one run-on phrase.
  const fullTitle = `${title} | ${SITE_NAME}`;
  const url = canonicalUrl(path);
  return [
    { title: fullTitle },
    { name: 'description', content: description },
    { property: 'og:title', content: fullTitle },
    { property: 'og:description', content: description },
    { property: 'og:type', content: 'website' },
    { property: 'og:url', content: url },
    { property: 'og:site_name', content: SITE_NAME },
    // `summary`, not `summary_large_image`: there is no share image yet, and
    // the large-image card renders as an empty slab without one.
    { name: 'twitter:card', content: 'summary' },
    { name: 'twitter:title', content: fullTitle },
    { name: 'twitter:description', content: description },
  ];
}

/** Canonical `<link>`, kept separate because `head` takes it in `links`. */
export function canonicalLink(path: string) {
  return { rel: 'canonical', href: canonicalUrl(path) };
}
