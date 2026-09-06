// Production Node server for TanStack Start.
//
// `vite build` emits a web fetch-handler (dist/server/server.js), not a
// listening server, plus static client assets in dist/client. This adapter
// serves the static assets and forwards everything else to the SSR handler,
// then listens on a real port (Railway sets PORT; falls back to 3000).

import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import { Hono } from 'hono';
import handler from './dist/server/server.js';

const app = new Hono();

/**
 * Content-Security-Policy.
 *
 * Every subresource is pinned to this origin, framing is refused, `<base>` is
 * locked, plugins are refused, and forms can only post back here.
 *
 * `script-src` carries `'unsafe-inline'` because it has to: Start emits inline
 * scripts as part of streaming SSR, and one of them differs on every response,
 * so no fixed hash can cover it. A hash-only policy blocks hydration and
 * renders a blank page — do not "tighten" this without checking the site still
 * boots. The upgrade path is a per-request nonce, which Start supports through
 * `router.options.ssr.nonce`; the versions pinned here do not carry one from
 * the request context to the rendered tags, so revisit on a framework bump and
 * verify the tags actually come out with the attribute before relying on it.
 *
 * `style-src` needs the same allowance for hydration-time style attributes.
 * Inline styles cannot execute, so that one costs little.
 */
/**
 * Origin of the OCR API, for `connect-src`.
 *
 * `VITE_API_URL` is not guaranteed to carry a scheme — Railway supplies a bare
 * hostname (`api-production-xxxx.up.railway.app`), while locally it is a full
 * `http://localhost:4000`. A bare hostname makes `new URL()` throw, and this
 * runs at module scope, so an unparseable value takes the whole server down
 * before it can listen rather than degrading a single header.
 *
 * A scheme-less value is assumed to be https, which is what Railway serves.
 * Anything still unparseable is dropped: a slightly loose `connect-src` beats a
 * site that will not boot.
 */
function resolveApiOrigin(raw) {
  if (!raw) return undefined;
  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(raw) ? raw : `https://${raw}`;
  try {
    return new URL(withScheme).origin;
  } catch {
    console.warn(
      `[web] VITE_API_URL is not a usable URL (${raw}); omitting it from connect-src`,
    );
    return undefined;
  }
}
const apiOrigin = resolveApiOrigin(process.env.VITE_API_URL);

const csp = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'",
  // Inline styles cannot execute; the framework sets style attributes during
  // hydration and no hash covers those.
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self'",
  // The OCR API, which the browser calls directly.
  `connect-src 'self'${apiOrigin ? ` ${apiOrigin}` : ''}`,
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  'upgrade-insecure-requests',
].join('; ');

app.use('*', async (c, next) => {
  await next();
  c.header('Content-Security-Policy', csp);
  c.header('X-Content-Type-Options', 'nosniff');
  // Redundant with frame-ancestors for modern browsers, kept for older ones.
  c.header('X-Frame-Options', 'DENY');
  c.header('Referrer-Policy', 'strict-origin-when-cross-origin');
  c.header('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=()');
  c.header('Cross-Origin-Opener-Policy', 'same-origin');
  // Only meaningful over TLS, and asserting it on a plain-HTTP local run would
  // pin localhost to https in the browser for a year.
  if (process.env.NODE_ENV === 'production') {
    c.header('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  }
});

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
