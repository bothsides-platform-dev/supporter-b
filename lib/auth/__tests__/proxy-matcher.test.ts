import { describe, expect, it } from 'vitest';
import { PROXY_MATCHER } from '../proxy-matcher';

// Faithful mirror of how Next.js compiles the `config.matcher` string into a
// path regex: true → the auth proxy middleware runs for this path; false → it
// is skipped (so the path is served / rewritten without an auth redirect).
function proxyRuns(pathname: string): boolean {
  return new RegExp(`^${PROXY_MATCHER}$`).test(pathname);
}

describe('auth proxy matcher', () => {
  it('skips the Axiom web-vitals beacon so it is not redirected to /login', () => {
    // Bug: /_axiom/web-vitals was caught by the proxy → decideRoute redirected
    // it to /login?next=/_axiom/web-vitals (400 on the OPTIONS preflight) and
    // the next-axiom rewrite to api.axiom.co never ran.
    expect(proxyRuns('/_axiom/web-vitals')).toBe(false);
  });

  it('skips the Axiom logs beacon (/_axiom/logs)', () => {
    expect(proxyRuns('/_axiom/logs')).toBe(false);
  });

  it('still processes normal app routes', () => {
    expect(proxyRuns('/home')).toBe(true);
    expect(proxyRuns('/rfp/q-2605-0042')).toBe(true);
  });

  it('still skips the Sentry monitoring tunnel and api routes', () => {
    expect(proxyRuns('/monitoring')).toBe(false);
    expect(proxyRuns('/api/auth/session')).toBe(false);
  });
});
