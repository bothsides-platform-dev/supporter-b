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
  it('skips the web-vitals relay (/api/axiom) so anonymous beacons are not redirected to /login', () => {
    // Bug (under next-axiom's /_axiom rewrite): the beacon was caught by the proxy
    // → decideRoute redirected it to /login (400 on the OPTIONS preflight) and
    // nothing reached Axiom. The relay now lives under the excluded `api` segment.
    expect(proxyRuns('/api/axiom')).toBe(false);
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

  // The metadata assets are always terminal — Next serves '/apple-icon.png',
  // never '/apple-icon.png/<something>'. Letting the relaxed boundary accept a
  // following '/' would hand every path under that prefix a free auth bypass,
  // which is exactly the prefix-matching bug this whole change removes.
  it('does not exclude subpaths beneath a metadata asset', () => {
    expect(proxyRuns('/apple-icon.png/admin')).toBe(true);
    expect(proxyRuns('/opengraph-image.png/settings/members')).toBe(true);
    expect(proxyRuns('/apple-icon/rfp')).toBe(true);
  });

  it('keeps excluding the exact segments and their subpaths', () => {
    expect(proxyRuns('/monitoring')).toBe(false);
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

describe('auth proxy matcher — retired next-axiom rewrite', () => {
  // `_axiom` exempted next-axiom's `/_axiom/{web-vitals,logs}` beacons, which a
  // next.config rewrite forwarded to api.axiom.co. That package (and its rewrite)
  // is gone — web-vitals now go through `/api/axiom` — so the entry would only keep
  // an unauthenticated hole open at a path nothing serves.
  it.each(['/_axiom', '/_axiom/web-vitals', '/_axiom/logs'])(
    'processes %s (dead exclusion removed)',
    (path) => {
      expect(proxyRuns(path)).toBe(true);
    },
  );
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
