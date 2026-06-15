// computeBackoff — pure exponential-backoff-with-jitter for outbox retries.
//
// The generic flush and the digest flushers schedule a failed *retryable* row's
// next attempt at now() + computeBackoff(attempts). Exponential growth spreads
// retries out so a transient Resend 429/5xx burst doesn't hammer the API every
// tick; jitter avoids a thundering herd of rows all retrying at the same instant.
// `retryAfterMs` (from a Resend rate-limit response) is honoured as a floor.
import { describe, expect, it } from 'vitest';

import { computeBackoff } from '../backoff';

const zeroJitter = () => 0;
const halfJitter = () => 0.5;

describe('computeBackoff', () => {
  it('returns half the exponential window with zero jitter on the first attempt', () => {
    // exp = base * 2^(attempts-1) = 1000; equal-jitter → half = 500, +0 jitter.
    expect(computeBackoff(1, { baseMs: 1000, capMs: 100_000, jitter: zeroJitter })).toBe(500);
  });

  it('adds jitter on top of the half window', () => {
    // half = 500, + 0.5 * 500 = 750.
    expect(computeBackoff(1, { baseMs: 1000, capMs: 100_000, jitter: halfJitter })).toBe(750);
  });

  it('grows exponentially with the attempt count', () => {
    // attempts=3 → exp = 1000 * 2^2 = 4000; half = 2000.
    expect(computeBackoff(3, { baseMs: 1000, capMs: 100_000, jitter: zeroJitter })).toBe(2000);
  });

  it('clamps the exponential window to capMs', () => {
    // attempts=20 → exp would be huge; capped at 5000; half = 2500.
    expect(computeBackoff(20, { baseMs: 1000, capMs: 5000, jitter: zeroJitter })).toBe(2500);
  });

  it('honours retryAfterMs as a floor when it exceeds the computed backoff', () => {
    // computed = 500, but Resend asked us to wait 10s → 10000 wins.
    expect(
      computeBackoff(1, { baseMs: 1000, capMs: 100_000, jitter: zeroJitter, retryAfterMs: 10_000 }),
    ).toBe(10_000);
  });

  it('ignores retryAfterMs when the computed backoff is larger', () => {
    // attempts=5 → exp = 1000*16 = 16000; half = 8000 > retryAfter 1000.
    expect(
      computeBackoff(5, { baseMs: 1000, capMs: 100_000, jitter: zeroJitter, retryAfterMs: 1000 }),
    ).toBe(8000);
  });

  it('treats attempts < 1 as the first attempt (no negative exponent)', () => {
    expect(computeBackoff(0, { baseMs: 1000, capMs: 100_000, jitter: zeroJitter })).toBe(500);
  });
});
