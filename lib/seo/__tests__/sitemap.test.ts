import { describe, it, expect } from 'vitest';
import { buildSitemap } from '@/lib/seo/sitemap';
import type { SeoHostContext } from '@/lib/seo/host';

const BUYER: SeoHostContext = { type: 'buyer', origin: 'https://support-b.com' };
const PG: SeoHostContext = { type: 'pg', origin: 'https://partner.support-b.com' };

describe('buildSitemap', () => {
  it('lists public canonical pages and llms endpoints, excluding noindex signup', () => {
    const urls = buildSitemap(BUYER).map((e) => e.url);
    expect(urls).toContain('https://support-b.com/');
    expect(urls).toContain('https://support-b.com/login');
    expect(urls).not.toContain('https://support-b.com/signup/buyer');
    for (const path of ['/legal', '/legal/terms', '/legal/privacy', '/legal/marketing']) {
      expect(urls).toContain(`https://support-b.com${path}`);
    }
    expect(urls).toContain('https://support-b.com/llms.txt');
    expect(urls).toContain('https://support-b.com/llms-full.txt');
    expect(urls).not.toContain('https://support-b.com/signup/pg');
  });

  it('is empty on the partner (pg) host — noindexed, nothing to submit', () => {
    expect(buildSitemap(PG)).toEqual([]);
  });

  it('gives the landing root top priority', () => {
    const root = buildSitemap(BUYER).find((e) => e.url === 'https://support-b.com/');
    expect(root?.priority).toBe(1);
  });

  it('uses the serving origin and does not invent last-modified timestamps', () => {
    const entries = buildSitemap({ type: 'buyer', origin: 'http://localhost:3000' });
    for (const entry of entries) {
      expect(new URL(entry.url).origin).toBe('http://localhost:3000');
      expect(entry.lastModified).toBeUndefined();
    }
  });
});
