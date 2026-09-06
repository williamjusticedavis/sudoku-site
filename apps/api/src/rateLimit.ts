/**
 * Fixed-window per-client rate limiting for the API's public routes.
 *
 * In-memory and per-instance, the same trade the web app's feedback limiter
 * makes: the window is short, losing it on redeploy costs a handful of extra
 * requests, and persisting counters would mean the abuse case generates the
 * write load it is meant to prevent. It would not hold across replicas.
 */
import { isIP } from 'node:net';
import type { NextFunction, Request, Response } from 'express';

/** Proxies in front of this service that append to `X-Forwarded-For`.
 * Railway's edge is the only one. Raise this if a CDN is ever put in front,
 * or the limiter starts keying on the proxy and buckets every visitor
 * together. */
const TRUSTED_PROXY_HOPS = 1;

/** Node reports IPv4 peers on a dual-stack listener as `::ffff:127.0.0.1`, and
 * link-local addresses can carry a `%eth0` zone. Strip both before asking
 * `node:net` whether what remains is an address. */
export function normalizeIp(value: string): string | undefined {
  const withoutZone = value.split('%')[0]!;
  const mapped = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/i.exec(withoutZone);
  const candidate = mapped ? mapped[1]! : withoutZone;
  return isIP(candidate) === 0 ? undefined : candidate;
}

/**
 * The client address, read from the END of `X-Forwarded-For`.
 *
 * A proxy appends to whatever the client sent, so the header arrives as
 * `<whatever the client invented>, <address the proxy saw>`. Trusting the
 * leftmost entry hands the rate-limit key to the caller and rotating it
 * defeats the limit entirely; counting in from the right lands on the value
 * our own proxy wrote.
 */
export function clientKey(req: Pick<Request, 'headers' | 'socket'>): string | undefined {
  const header = req.headers['x-forwarded-for'];
  const raw = Array.isArray(header) ? header.join(',') : header;
  if (raw) {
    const parts = raw
      .split(',')
      .map((p) => p.trim())
      .filter(Boolean);
    const candidate = parts[parts.length - TRUSTED_PROXY_HOPS];
    const normalized = candidate ? normalizeIp(candidate) : undefined;
    if (normalized) return normalized;
  }
  return req.socket.remoteAddress ? normalizeIp(req.socket.remoteAddress) : undefined;
}

export interface RateLimitOptions {
  windowMs: number;
  max: number;
  /** Bound on distinct clients tracked at once, so the map can't grow without
   * limit when a lot of addresses turn up (or are forged upstream). */
  maxTracked?: number;
}

/**
 * Express middleware refusing a client that exceeds `max` requests per window
 * with 429.
 *
 * Fails OPEN when the address can't be read: refusing everyone whose IP is
 * unreadable would take the endpoint down for real people to stop abuse.
 */
export function rateLimit({ windowMs, max, maxTracked = 10_000 }: RateLimitOptions) {
  const hits = new Map<string, number[]>();

  function prune(now: number) {
    for (const [key, times] of hits) {
      const live = times.filter((t) => now - t < windowMs);
      if (live.length === 0) hits.delete(key);
      else hits.set(key, live);
    }
    // Map iterates in insertion order, so this evicts the longest-resident
    // keys when pruning expired entries alone didn't get under the cap.
    if (hits.size > maxTracked) {
      let excess = hits.size - maxTracked;
      for (const key of hits.keys()) {
        hits.delete(key);
        if (--excess <= 0) break;
      }
    }
  }

  return (req: Request, res: Response, next: NextFunction) => {
    const key = clientKey(req);
    if (!key) {
      next();
      return;
    }

    const now = Date.now();
    if (hits.size > maxTracked) prune(now);

    const times = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
    if (times.length >= max) {
      // The refused attempt is not recorded: letting it extend its own window
      // would lock a hammering client out indefinitely rather than for the
      // window it actually earned.
      hits.set(key, times);
      const retryAfter = Math.ceil((windowMs - (now - times[0]!)) / 1000);
      res.setHeader('Retry-After', String(Math.max(retryAfter, 1)));
      res.status(429).json({ ok: false, error: 'rate-limited' });
      return;
    }

    times.push(now);
    hits.set(key, times);
    next();
  };
}
