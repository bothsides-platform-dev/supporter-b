import { describe, it, expect, beforeEach, afterAll, vi } from 'vitest';

// The route shells (header → builder → Response) are TDD-exempt thin glue, but
// their response envelope (Content-Type / Cache-Control) is logic the pure
// builders don't cover. This locks the envelope + host wiring against silent
// regressions (e.g. a cache-header typo).
vi.mock('next/headers', () => ({ headers: vi.fn() }));

import { headers } from 'next/headers';
import { GET as llmsTxtGet } from '@/app/llms.txt/route';
import { GET as llmsFullGet } from '@/app/llms-full.txt/route';
import { FAQ_ITEMS } from '@/components/landing/faq-data';

const mockedHeaders = vi.mocked(headers);

function withHost(host: string | null) {
  mockedHeaders.mockResolvedValue({
    get: (k: string) => (k.toLowerCase() === 'host' ? host : null),
  } as unknown as Awaited<ReturnType<typeof headers>>);
}

beforeEach(() => {
  vi.stubEnv('NEXT_PUBLIC_BUYER_ORIGIN', 'https://supporter-b.com');
  vi.stubEnv('NEXT_PUBLIC_PARTNER_ORIGIN', 'https://partner.supporter-b.com');
});
afterAll(() => {
  vi.unstubAllEnvs();
});

describe('GET /llms.txt', () => {
  it('returns text/plain with cache headers and buyer content on the buyer host', async () => {
    withHost('supporter-b.com');
    const res = await llmsTxtGet();
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('text/plain; charset=utf-8');
    expect(res.headers.get('cache-control')).toBe('public, max-age=3600, s-maxage=3600');
    expect(res.headers.get('vary')).toBe('Host');
    const body = await res.text();
    expect(body.startsWith('# Supporter B')).toBe(true);
    expect(body).toContain('https://supporter-b.com/signup/buyer');
  });

  it('serves PG content + pg origin on the partner host', async () => {
    withHost('partner.supporter-b.com');
    const body = await (await llmsTxtGet()).text();
    expect(body).toContain('https://partner.supporter-b.com/signup/pg');
    expect(body).not.toContain('0.89'); // buyer-only stat must not leak to pg host
  });

  it('falls back to buyer content when the host header is missing', async () => {
    withHost(null);
    const body = await (await llmsTxtGet()).text();
    expect(body).toContain('https://supporter-b.com/');
  });
});

describe('GET /llms-full.txt', () => {
  it('returns the full markdown export with the canonical FAQ verbatim', async () => {
    withHost('supporter-b.com');
    const res = await llmsFullGet();
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('text/plain; charset=utf-8');
    const body = await res.text();
    expect(body).toContain(FAQ_ITEMS[0].q);
    expect(body).toContain(FAQ_ITEMS[0].a);
  });
});
