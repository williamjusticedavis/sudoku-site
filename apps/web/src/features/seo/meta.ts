/**
 * Per-page metadata.
 *
 * `seo()` returns the `meta` array a route's `head` should spread. Every route
 * needs its own: a route without one falls back to the root `head`, and pages
 * sharing a title and description look like near-duplicates to search engines
 * and preview identically whichever one a shared link points at.
 *
 * It emits title, description and the Open Graph/Twitter pair together as a
 * set — a page carrying only some of those is the state this exists to avoid.
 */

/** Absolute site origin, needed for canonical and `og:url` — relative URLs are
 * not valid in either. Configured per environment; the fallback is the Railway
 * domain the site actually runs on, so a missing env var degrades to correct
 * rather than to `localhost` leaking into production metadata. */
const SITE_URL = (
  import.meta.env.VITE_SITE_URL ?? 'https://sudoku-site-production.up.railway.app'
).replace(/\/$/, '');

export const SITE_NAME = 'Gridwise';

/** Link-preview image. One static card for the whole site rather than a
 * per-page one: the lessons would each deserve their own, but that means 28
 * generated images plus a build step to keep them in step with the curriculum,
 * which is a lot of machinery for the gain.
 *
 * Must be a raster format and an absolute URL — most platforms will not render
 * an SVG here, and none of them resolve a relative path. Source and
 * regeneration command live in `og-card.svg` next to this file. */
const OG_IMAGE = '/og.png';
const OG_IMAGE_ALT =
  'Gridwise — the sudoku solver that shows its working. 28 techniques, each taught as its own lesson.';

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
    { property: 'og:image', content: canonicalUrl(OG_IMAGE) },
    // Declared so a preview can reserve the right space before the image
    // finishes loading, and so a platform that refuses to guess dimensions
    // still renders the large card.
    { property: 'og:image:width', content: '1200' },
    { property: 'og:image:height', content: '630' },
    { property: 'og:image:alt', content: OG_IMAGE_ALT },
    { name: 'twitter:card', content: 'summary_large_image' },
    { name: 'twitter:title', content: fullTitle },
    { name: 'twitter:description', content: description },
    { name: 'twitter:image', content: canonicalUrl(OG_IMAGE) },
    { name: 'twitter:image:alt', content: OG_IMAGE_ALT },
  ];
}

/** Canonical `<link>`, kept separate because `head` takes it in `links`. */
export function canonicalLink(path: string) {
  return { rel: 'canonical', href: canonicalUrl(path) };
}
