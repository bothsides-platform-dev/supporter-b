import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

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

describe('auth proxy config (proxy.ts)', () => {
  // Next.js statically analyzes the `config` export at build time WITHOUT
  // executing the module, so `config.matcher` entries must be string/object
  // *literals*. An imported/computed value (e.g. `matcher: [PROXY_MATCHER]`)
  // fails `next build` with "matcher[0] need to be static strings or static
  // objects". proxy.ts therefore inlines the literal; these tests pin that
  // inline literal to the canonical PROXY_MATCHER so the two can never drift.
  const proxySource = readFileSync(
    fileURLToPath(new URL('../../../proxy.ts', import.meta.url)),
    'utf8',
  );
  const inlined = proxySource.match(/matcher:\s*\[\s*'([^']+)'\s*,?\s*\]/);

  it('inlines config.matcher as a static string literal (Next.js build constraint)', () => {
    expect(
      inlined,
      'proxy.ts must inline config.matcher as a single-quoted string literal — ' +
        'a bare identifier/import breaks `next build` static analysis',
    ).not.toBeNull();
  });

  it('keeps the inlined matcher equal to the canonical PROXY_MATCHER', () => {
    expect(inlined?.[1]).toBe(PROXY_MATCHER);
  });
});
