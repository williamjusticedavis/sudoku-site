import { createRouter } from '@tanstack/react-router';
import { routeTree } from './routeTree.gen';
import { RouteError } from './features/shell/RouteError.js';
import { NotFound } from './features/shell/NotFound.js';

export function getRouter() {
  const router = createRouter({
    routeTree,
    scrollRestoration: true,
    defaultPreload: 'intent',
    // Without this, a thrown loader error renders the framework default, which
    // prints the raw message — for a failed Drizzle query that is the full SQL
    // text and column list. Applies to every route that doesn't define its own,
    // and renders inside the root Outlet so the header and nav survive.
    defaultErrorComponent: RouteError,
    // The framework default for an unmatched URL is a bare, unstyled
    // "Not Found" string with no way back.
    defaultNotFoundComponent: () => <NotFound />,
  });
  return router;
}

declare module '@tanstack/react-router' {
  interface Register {
    router: ReturnType<typeof getRouter>;
  }
}
