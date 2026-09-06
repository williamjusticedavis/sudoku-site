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
import { isIP } from 'node:net';
import { getRequestHeader, getRequestIP } from '@tanstack/react-start/server';

const WINDOW_MS = 10 * 60 * 1000; // 10 minutes
const MAX_PER_WINDOW = 5;
/** Stop the map growing without bound if a lot of distinct IPs turn up. */
const MAX_TRACKED_IPS = 10_000;

const hits = new Map<string, number[]>();

/** Number of proxies that sit in front of this app and append to
 * `X-Forwarded-For`. Railway's edge is the only one. If another is ever put in
 * front (a CDN, say), this has to go up with it or the limit starts keying on
 * the proxy instead of the client. */
const TRUSTED_PROXY_HOPS = 1;

/** Node reports IPv4 peers on a dual-stack listener as `::ffff:127.0.0.1`, and
 * link-local addresses can carry a `%eth0` zone, so normalize both away before
 * asking `node:net` whether what's left is an address at all. Hand-rolled
 * regexes get this wrong: the mapped form has dots in an IPv6 address. */
function normalizeIp(value: string): string | undefined {
  const withoutZone = value.split('%')[0]!;
  const mapped = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/i.exec(withoutZone);
  const candidate = mapped ? mapped[1]! : withoutZone;
  return isIP(candidate) === 0 ? undefined : candidate;
}

/**
 * The client address, taken from the end of `X-Forwarded-For` rather than the
 * start.
 *
 * A proxy appends to whatever the client sent, so the header arrives as
 * `<whatever the client supplied>, <address the proxy actually saw>`. Only the
 * part our own proxy wrote is evidence of anything; the rest is caller input
 * and must never be treated as an identity. Counting `TRUSTED_PROXY_HOPS` in
 * from the right lands on the observed value. Note this is NOT what
 * `getRequestIP({ xForwardedFor: true })` returns — it reads from the left.
 *
 * Anything that isn't a well-formed address is discarded rather than used as a
 * key, so a header full of junk can't inflate the map.
 */
function clientIp(): string | undefined {
  const header = getRequestHeader('x-forwarded-for');
  if (header) {
    const parts = header
      .split(',')
      .map((p) => p.trim())
      .filter(Boolean);
    const candidate = parts[parts.length - TRUSTED_PROXY_HOPS];
    const normalized = candidate ? normalizeIp(candidate) : undefined;
    if (normalized) return normalized;
  }
  // No usable forwarded header — fall back to the socket address, which is the
  // real peer when nothing is proxying.
  const direct = getRequestIP();
  return direct ? normalizeIp(direct) : undefined;
}

/** Drop every address whose window has fully expired. */
function prune(now: number) {
  for (const [ip, times] of hits) {
    const live = times.filter((t) => now - t < WINDOW_MS);
    if (live.length === 0) hits.delete(ip);
    else hits.set(ip, live);
  }
  // Pruning expired entries can still leave the map at its cap if the traffic
  // is genuinely that widespread. Evicting the oldest-inserted keys bounds it
  // either way — Map iterates in insertion order, so this takes the entries
  // that have been sitting longest.
  if (hits.size > MAX_TRACKED_IPS) {
    const excess = hits.size - MAX_TRACKED_IPS;
    let dropped = 0;
    for (const ip of hits.keys()) {
      hits.delete(ip);
      if (++dropped >= excess) break;
    }
  }
}

/**
 * `true` when this request is over the limit and should be refused.
 *
 * Fails OPEN when the caller's address can't be determined: refusing everyone
 * whose IP is unreadable would take the form down for real people to stop
 * abuse that the honeypot and length caps already blunt. The honeypot still
 * applies either way.
 */
export function isRateLimited(): boolean {
  const ip = clientIp();
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
