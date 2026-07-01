import { describe, it, expect } from 'vitest';
import { buildSitemap } from '@/lib/seo/sitemap';
import type { SeoHostContext } from '@/lib/seo/host';

const BUYER: SeoHostContext = { type: 'buyer', origin: 'https://supporter-b.com' };
const PG: SeoHostContext = { type: 'pg', origin: 'https://partner.supporter-b.com' };
const NOW = new Date('2026-06-28T00:00:00.000Z');

describe('buildSitemap', () => {
  it('lists the buyer signup path + llms endpoints on the buyer host', () => {
    const urls = buildSitemap(BUYER, NOW).map((e) => e.url);
    expect(urls).toContain('https://supporter-b.com/');
    expect(urls).toContain('https://supporter-b.com/login');
    expect(urls).toContain('https://supporter-b.com/signup/buyer');
    expect(urls).toContain('https://supporter-b.com/llms.txt');
    expect(urls).toContain('https://supporter-b.com/llms-full.txt');
    expect(urls).not.toContain('https://supporter-b.com/signup/pg');
  });

  it('lists the pg signup path on the partner host', () => {
    const urls = buildSitemap(PG, NOW).map((e) => e.url);
    expect(urls).toContain('https://partner.supporter-b.com/signup/pg');
    expect(urls).not.toContain('https://partner.supporter-b.com/signup/buyer');
  });

  it('uses the host origin for every url and stamps the given lastModified', () => {
    const entries = buildSitemap(PG, NOW);
    for (const e of entries) {
      expect(e.url.startsWith('https://partner.supporter-b.com')).toBe(true);
      expect(e.lastModified).toBe(NOW);
    }
  });

  it('gives the landing root top priority', () => {
    const root = buildSitemap(BUYER, NOW).find((e) => e.url === 'https://supporter-b.com/');
    expect(root?.priority).toBe(1);
  });
});
