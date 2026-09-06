import { describe, expect, it } from 'vitest';
import { clientKey, normalizeIp } from './rateLimit.js';

/** Minimal stand-in for the parts of an Express request the key derivation reads. */
function req(xff: string | string[] | undefined, remote = '198.51.100.5') {
  return {
    headers: xff === undefined ? {} : { 'x-forwarded-for': xff },
    socket: { remoteAddress: remote },
  } as unknown as Parameters<typeof clientKey>[0];
}

describe('normalizeIp', () => {
  it('accepts plain v4 and v6', () => {
    expect(normalizeIp('203.0.113.9')).toBe('203.0.113.9');
    expect(normalizeIp('2001:db8::1')).toBe('2001:db8::1');
  });

  it('unwraps the IPv4-mapped form Node reports on a dual-stack listener', () => {
    // Getting this wrong makes every local request unidentifiable, which fails
    // open and silently disables the limiter.
    expect(normalizeIp('::ffff:127.0.0.1')).toBe('127.0.0.1');
  });

  it('strips a link-local zone id', () => {
    expect(normalizeIp('fe80::1%eth0')).toBe('fe80::1');
  });

  it('rejects anything that is not an address', () => {
    for (const junk of ['', 'not-an-ip', '999.1.1.1', 'DROP TABLE', '1.2.3']) {
      expect(normalizeIp(junk), junk).toBeUndefined();
    }
  });
});

describe('clientKey — the rate-limit bucket', () => {
  it('uses the socket address when nothing is forwarded', () => {
    expect(clientKey(req(undefined))).toBe('198.51.100.5');
  });

  it('takes the address the proxy appended, NOT the one the client sent', () => {
    // This is the whole point. A proxy appends the address it saw to whatever
    // the client supplied, so the leftmost entry is caller-controlled. Reading
    // it would let anyone rotate the value and bypass the limit entirely.
    expect(clientKey(req('203.0.113.1, 198.51.100.7'))).toBe('198.51.100.7');
  });

  it('is not moved by extra spoofed entries in front', () => {
    const a = clientKey(req('1.1.1.1, 2.2.2.2, 3.3.3.3, 198.51.100.7'));
    const b = clientKey(req('9.9.9.9, 198.51.100.7'));
    expect(a).toBe('198.51.100.7');
    expect(b).toBe('198.51.100.7');
    expect(a).toBe(b); // same real client => same bucket, however much noise is prepended
  });

  it('keeps distinct real clients in distinct buckets', () => {
    expect(clientKey(req('1.2.3.4, 198.51.100.7'))).not.toBe(
      clientKey(req('1.2.3.4, 198.51.100.8')),
    );
  });

  it('falls back to the socket when the forwarded value is junk', () => {
    expect(clientKey(req('not-an-ip'))).toBe('198.51.100.5');
  });

  it('handles a repeated header arriving as an array', () => {
    expect(clientKey(req(['203.0.113.1', '198.51.100.7']))).toBe('198.51.100.7');
  });
});
