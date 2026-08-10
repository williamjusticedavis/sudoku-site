// Production Node server for TanStack Start.
//
// `vite build` emits a web fetch-handler (dist/server/server.js), not a
// listening server, plus static client assets in dist/client. This adapter
// serves the static assets and forwards everything else to the SSR handler,
// then listens on a real port (Render sets PORT; falls back to 3000).

import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import { Hono } from 'hono';
import handler from './dist/server/server.js';

const app = new Hono();

// Hashed, immutable build assets.
app.use(
  '/assets/*',
  serveStatic({
    root: './dist/client',
    onFound: (_path, c) => {
      c.header('Cache-Control', 'public, immutable, max-age=31536000');
    },
  }),
);

// Any other static file that exists in dist/client (favicon, robots, etc.).
app.use('*', serveStatic({ root: './dist/client' }));

// Everything else → server-side rendering.
app.all('*', (c) => handler.fetch(c.req.raw));

const port = Number(process.env.PORT ?? 3000);
serve({ fetch: app.fetch, port, hostname: '0.0.0.0' }, (info) => {
  console.log(`[web] listening on http://0.0.0.0:${info.port}`);
});
