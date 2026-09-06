/**
 * Writes `apps/web/public/sitemap.xml` from the curriculum in the database.
 *
 *   pnpm --filter @sudoku/db sitemap
 *
 * Run it whenever the tactics table changes — same cadence as `db:seed`, and
 * for the same reason: the lesson URLs are data, not code. The output is
 * committed, so the deployed site serves it as a static file and needs no
 * database access at request time.
 *
 * `SITE_URL` overrides the origin; it defaults to the Railway domain the site
 * actually runs on.
 */
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

// Same env bootstrap as `seed.ts`: the db client throws when DATABASE_URL is
// unset, so load the repo-root .env and fall back to the docker-compose
// credentials before importing it.
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

const SITE_URL = (
  process.env.SITE_URL ?? 'https://sudoku-site-production.up.railway.app'
).replace(/\/$/, '');

/** Pages that aren't lessons. Ordered roughly by how much they matter. */
const STATIC_PATHS = [
  '/',
  '/learn',
  '/learn/basics',
  '/learn/strong-weak-links',
  '/about',
  '/feedback',
];

async function main() {
  const tactics = await db.query.tactics.findMany({
    orderBy: (t, { asc }) => [asc(t.tier), asc(t.orderInTier)],
  });

  const paths = [...STATIC_PATHS, ...tactics.map((t) => `/learn/${t.slug}`)];
  const body = paths
    .map((p) => `  <url>\n    <loc>${SITE_URL}${p === '/' ? '/' : p}</loc>\n  </url>`)
    .join('\n');
  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${body}\n</urlset>\n`;

  const out = join(
    dirname(fileURLToPath(import.meta.url)),
    '../../../apps/web/public/sitemap.xml',
  );
  writeFileSync(out, xml, 'utf8');
  console.log(`Wrote ${paths.length} URLs to ${out}`);
  await client.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
