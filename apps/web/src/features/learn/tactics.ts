/**
 * Server functions for the Learn section. `createServerFn` is safe to import
 * from client code — the TanStack Start plugin replaces each `.handler()` body
 * with an RPC call in the client bundle. The `@sudoku/db` import is kept inside
 * the handler so it only ever loads on the server.
 *
 * NB: do NOT rename this to `*.server.ts` — that filename triggers the plugin's
 * import-protection, which denies the (isomorphic) route files from importing it
 * and hangs client-side navigation into `/learn`.
 */
import { createServerFn } from '@tanstack/react-start';
import type { TacticDetail, TacticSummary } from './types.js';

export const getTactics = createServerFn({ method: 'GET' }).handler(
  async (): Promise<TacticSummary[]> => {
    const { db } = await import('@sudoku/db');
    const rows = await db.query.tactics.findMany({
      orderBy: (t, { asc }) => [asc(t.tier), asc(t.orderInTier)],
    });
    return rows.map((t) => ({
      slug: t.slug,
      name: t.name,
      tier: t.tier,
      orderInTier: t.orderInTier,
      description: t.description,
    }));
  },
);

export const getTactic = createServerFn({ method: 'GET' })
  .validator((slug: string) => slug)
  .handler(async ({ data: slug }): Promise<TacticDetail | null> => {
    const { db } = await import('@sudoku/db');
    const tactic = await db.query.tactics.findFirst({
      where: (t, { eq }) => eq(t.slug, slug),
    });
    if (!tactic) return null;

    const puzzles = await db.query.tacticPuzzles.findMany({
      where: (p, { eq }) => eq(p.tacticId, tactic.id),
      orderBy: (p, { asc, desc }) => [desc(p.isTeachingExample), asc(p.id)],
    });

    return {
      slug: tactic.slug,
      name: tactic.name,
      tier: tactic.tier,
      orderInTier: tactic.orderInTier,
      description: tactic.description,
      puzzles: puzzles.map((p) => ({
        id: p.id,
        gridState: p.gridState,
        solutionState: p.solutionState,
        stepData: p.stepData,
        isTeachingExample: p.isTeachingExample,
      })),
    };
  });
