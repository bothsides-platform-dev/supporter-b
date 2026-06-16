// computeBackoff — exponential backoff with equal jitter for outbox retries.
//
// A failed *retryable* outbox row (Resend 429 / 5xx / network) is rescheduled at
// now() + computeBackoff(attempts). Exponential growth (base * 2^(attempts-1))
// spreads retries apart so a transient rate-limit burst isn't re-hammered every
// cron tick; "equal jitter" (half fixed + half random) de-synchronises rows that
// failed together. A Resend `Retry-After` (retryAfterMs) is honoured as a floor.
//
// Defaults come from env so ops can tune without a deploy:
//   EMAIL_RETRY_BASE_MS (default 30_000  = 30s)
//   EMAIL_RETRY_CAP_MS  (default 1_800_000 = 30min)
// Tests inject baseMs/capMs/jitter directly for determinism.

const DEFAULT_BASE_MS = 30_000;
const DEFAULT_CAP_MS = 1_800_000;

function envBaseMs(): number {
  const n = Number(process.env.EMAIL_RETRY_BASE_MS);
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_BASE_MS;
}

function envCapMs(): number {
  const n = Number(process.env.EMAIL_RETRY_CAP_MS);
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_CAP_MS;
}

export type BackoffOpts = {
  /** Resend `Retry-After` in ms — used as a lower bound on the delay. */
  retryAfterMs?: number;
  /** Override base window (ms). Defaults to EMAIL_RETRY_BASE_MS. */
  baseMs?: number;
  /** Override cap window (ms). Defaults to EMAIL_RETRY_CAP_MS. */
  capMs?: number;
  /** Injectable [0,1) source for deterministic tests. Defaults to Math.random. */
  jitter?: () => number;
};

/**
 * Delay (ms) before the next retry, given how many attempts have already been
 * made (`attempts`, 1-based; values < 1 are treated as 1). Equal jitter:
 * `half = exp/2`, result `= half + random()*half`, clamped by cap, floored by
 * retryAfterMs.
 */
export function computeBackoff(attempts: number, opts: BackoffOpts = {}): number {
  const base = opts.baseMs ?? envBaseMs();
  const cap = opts.capMs ?? envCapMs();
  const jitter = opts.jitter ?? Math.random;

  const exponent = Math.max(0, attempts - 1);
  const exp = Math.min(cap, base * 2 ** exponent);
  const half = exp / 2;
  const delay = Math.round(half + jitter() * half);

  return Math.max(delay, opts.retryAfterMs ?? 0);
}
