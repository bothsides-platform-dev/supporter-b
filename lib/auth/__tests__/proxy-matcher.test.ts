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

  it('skips the AI text endpoints (llms.txt / llms-full.txt) so crawlers reach them', () => {
    // Same rationale as robots.txt / sitemap.xml — must serve to unauth crawlers,
    // not redirect to /login.
    expect(proxyRuns('/llms.txt')).toBe(false);
    expect(proxyRuns('/llms-full.txt')).toBe(false);
  });

  it('skips public/landing/** marketing images so anonymous visitors and next/image are not redirected to /login', () => {
    // Bug: /landing/pg/need.webp was caught by the proxy → decideRoute redirected
    // anonymous requests to /login?next=... (empty body). Real anonymous visitors
    // to the landing page saw broken images, and Next's own /_next/image
    // optimizer (which re-fetches local sources unauthenticated) failed with
    // "isn't a valid image ... received null" for the same reason.
    expect(proxyRuns('/landing/pg/need.webp')).toBe(false);
    expect(proxyRuns('/landing/buyer/hero.webp')).toBe(false);
  });

  it('still skips the Sentry monitoring tunnel and api routes', () => {
    expect(proxyRuns('/monitoring')).toBe(false);
    expect(proxyRuns('/api/auth/session')).toBe(false);
  });

  it('does NOT exclude paths that merely resemble static filenames (dot-escape guard)', () => {
    // Unescaped '.' in the lookahead matches any character, so 'llms.txt' would
    // exclude paths like '/llmsXtxt'. Verify literal-dot-only matching.
    expect(proxyRuns('/llmsXtxt')).toBe(true);
    expect(proxyRuns('/robotsXtxt')).toBe(true);
    expect(proxyRuns('/faviconXico')).toBe(true);
    expect(proxyRuns('/sitemapXxml')).toBe(true);
  });
});

describe('auth proxy matcher — segment boundary', () => {
  // Without a trailing `(?:/|$)` the lookahead matched a bare *prefix*, so any
  // future real route whose first segment merely starts with an excluded word
  // would silently skip the auth proxy entirely. These are the plausible
  // collisions for the current list.
  it.each([
    '/landing-editor',
    '/api-docs',
    '/monitoring-dashboard',
    '/fonts-preview',
    '/iconography',
  ])('processes %s (an excluded word is a prefix, not a whole segment)', (path) => {
    expect(proxyRuns(path)).toBe(true);
  });

  // Next.js serves the static metadata files in `app/` with their extension
  // (`app/opengraph-image.png` → `/opengraph-image.png`), so these entries must
  // keep matching an extension suffix even once segment boundaries are enforced.
  // Getting this wrong sends social-card crawlers and iOS touch-icon requests to
  // /login instead of the asset.
  it.each([
    '/opengraph-image.png',
    '/opengraph-image.alt.txt',
    '/apple-icon.png',
    '/icon.svg',
    '/favicon.ico',
  ])('still skips the Next.js metadata asset %s', (path) => {
    expect(proxyRuns(path)).toBe(false);
  });

  // The relaxed boundary is `[-.]` + rest-of-segment — it must not decay back
  // into a bare prefix match.
  it('does not let the metadata prefixes match an arbitrary suffix', () => {
    expect(proxyRuns('/apple-iconXpng')).toBe(true);
    expect(proxyRuns('/opengraph-images')).toBe(true);
  });

  it('keeps excluding the exact segments and their subpaths', () => {
    expect(proxyRuns('/monitoring')).toBe(false);
    expect(proxyRuns('/_axiom/logs')).toBe(false);
    expect(proxyRuns('/api/auth/session')).toBe(false);
    expect(proxyRuns('/_next/static/chunk.js')).toBe(false);
    expect(proxyRuns('/fonts/PretendardVariable.woff2')).toBe(false);
  });
});

describe('auth proxy matcher — dead create-next-app segments', () => {
  // `file`/`globe`/`next`/`vercel`/`window` were added for create-next-app's
  // default SVGs (`public/next.svg` etc). Those files are long gone — `public/`
  // now holds only `fonts/` and the Naver site-verification file — so the
  // entries excluded nothing while reserving five common English words that a
  // real route could collide with.
  it.each(['/file', '/globe', '/next', '/vercel', '/window'])(
    'processes %s (dead exclusion removed)',
    (path) => {
      expect(proxyRuns(path)).toBe(true);
    },
  );

  it('still processes routes that merely start with those words', () => {
    expect(proxyRuns('/next-steps')).toBe(true);
    expect(proxyRuns('/files/report.pdf')).toBe(true);
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
    // readFileSync returns raw source bytes. `\\.` in the single-quoted literal
    // (a backslash escape for the regex dot) appears as two chars in the file.
    // Decode JS string escape sequences so the raw source matches the runtime value.
    const raw = inlined?.[1] ?? '';
    const decoded = raw.replace(/\\([\s\S])/g, (_, c: string) => (c === '\\' ? '\\' : c));
    expect(decoded).toBe(PROXY_MATCHER);
  });
});
