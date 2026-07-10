import { describe, it, expect } from 'vitest';
import { buildSitemap } from '@/lib/seo/sitemap';
import type { SeoHostContext } from '@/lib/seo/host';

const BUYER: SeoHostContext = { type: 'buyer', origin: 'https://support-b.com' };
const PG: SeoHostContext = { type: 'pg', origin: 'https://partner.support-b.com' };
const NOW = new Date('2026-06-28T00:00:00.000Z');

describe('buildSitemap', () => {
  it('lists the buyer signup path + llms endpoints on the buyer host', () => {
    const urls = buildSitemap(BUYER, NOW).map((e) => e.url);
    expect(urls).toContain('https://support-b.com/');
    expect(urls).toContain('https://support-b.com/login');
    expect(urls).toContain('https://support-b.com/signup/buyer');
    expect(urls).toContain('https://support-b.com/llms.txt');
    expect(urls).toContain('https://support-b.com/llms-full.txt');
    expect(urls).not.toContain('https://support-b.com/signup/pg');
  });

  it('is empty on the partner (pg) host — noindexed, nothing to submit', () => {
    expect(buildSitemap(PG, NOW)).toEqual([]);
  });

  it('gives the landing root top priority', () => {
    const root = buildSitemap(BUYER, NOW).find((e) => e.url === 'https://support-b.com/');
    expect(root?.priority).toBe(1);
  });
});
