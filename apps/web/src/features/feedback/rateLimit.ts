/**
 * Per-IP rate limiting for the public feedback write.
 *
 * SERVER ONLY. This module imports `@tanstack/react-start/server`, so it must
 * be reached by dynamic `import()` from inside a server function handler —
 * never at the top level of anything a route file imports, or it lands in the
 * client bundle.
 *
 * Deliberately in-memory rather than a table or Redis:
 *   - The window is short and the consequence of losing it is one extra
 *     message getting through, so durability buys nothing.
 *   - Writing rate-limit rows to Postgres would mean the abuse case creates
 *     exactly the write load it is meant to prevent.
 * The trade is that the counter resets on redeploy and is per-instance, so it
 * would not hold across multiple replicas. The web service runs as one
 * instance today; if that changes this becomes a real gap, not a small one.
 */
import { getRequestIP } from '@tanstack/react-start/server';

const WINDOW_MS = 10 * 60 * 1000; // 10 minutes
const MAX_PER_WINDOW = 5;
/** Stop the map growing without bound if a lot of distinct IPs turn up. */
const MAX_TRACKED_IPS = 10_000;

const hits = new Map<string, number[]>();

function prune(now: number) {
  for (const [ip, times] of hits) {
    const live = times.filter((t) => now - t < WINDOW_MS);
    if (live.length === 0) hits.delete(ip);
    else hits.set(ip, live);
  }
}

/**
 * `true` when this request is over the limit and should be refused.
 *
 * Fails OPEN when the caller's IP can't be determined: refusing everyone
 * whose IP is unreadable would take the form down for real people to stop
 * abuse that the honeypot and length caps already blunt. The honeypot still
 * applies either way.
 *
 * `xForwardedFor` is trusted because the app only ever serves through
 * Railway's proxy, which sets that header itself. Running this anywhere the
 * header can be set by the client would make the limit trivially bypassable.
 */
export function isRateLimited(): boolean {
  const ip = getRequestIP({ xForwardedFor: true });
  if (!ip) return false;

  const now = Date.now();
  if (hits.size > MAX_TRACKED_IPS) prune(now);

  const times = (hits.get(ip) ?? []).filter((t) => now - t < WINDOW_MS);
  if (times.length >= MAX_PER_WINDOW) {
    // Not recorded: a refused attempt must not extend its own window, or a
    // bot hammering the endpoint would lock the address out indefinitely.
    hits.set(ip, times);
    return true;
  }

  times.push(now);
  hits.set(ip, times);
  return false;
}
