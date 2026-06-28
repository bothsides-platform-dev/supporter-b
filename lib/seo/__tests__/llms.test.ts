import { describe, it, expect } from 'vitest';
import { buildLlmsTxt, buildLlmsFullTxt } from '@/lib/seo/llms';
import type { SeoHostContext } from '@/lib/seo/host';
import { FAQ_ITEMS } from '@/components/landing/faq-data';
import { PG_FAQ_ITEMS } from '@/components/landing/pg-faq-data';

const BUYER: SeoHostContext = { type: 'buyer', origin: 'https://supporter-b.com' };
const PG: SeoHostContext = { type: 'pg', origin: 'https://partner.supporter-b.com' };

describe('buildLlmsTxt', () => {
  it('starts with the product H1 and a blockquote summary (spec shape)', () => {
    const out = buildLlmsTxt(BUYER);
    expect(out.startsWith('# Supporter B')).toBe(true);
    // exactly one H1
    expect(out.match(/^# /gm)?.length).toBe(1);
    expect(out).toMatch(/^> /m); // blockquote summary line
    expect(out).toContain('## Optional'); // spec's de-prioritizable section
  });

  it('buyer file carries buyer facts (free policy, savings stat, sealed bid)', () => {
    const out = buildLlmsTxt(BUYER);
    expect(out).toContain('무료'); // 2026 무료 정책
    expect(out).toContain('0.89'); // PoC 평균 수수료 절감 통계
    expect(out).toContain('봉인'); // 봉인 입찰 차별점
  });

  it('buyer file uses buyer absolute URLs and links the full + signup pages', () => {
    const out = buildLlmsTxt(BUYER);
    expect(out).toContain('https://supporter-b.com/signup/buyer');
    expect(out).toContain('https://supporter-b.com/llms-full.txt');
    // no foreign origin leaks
    expect(out).not.toContain('partner.supporter-b.com');
  });

  it('pg file carries PG facts and pg absolute URLs', () => {
    const out = buildLlmsTxt(PG);
    expect(out.startsWith('# Supporter B')).toBe(true);
    expect(out).toMatch(/인바운드|검증된 리드|영업/);
    expect(out).toContain('https://partner.supporter-b.com/signup/pg');
    expect(out).toContain('https://partner.supporter-b.com/llms-full.txt');
  });

  it('keeps the two audiences separated (no cross-audience copy)', () => {
    const buyer = buildLlmsTxt(BUYER);
    const pg = buildLlmsTxt(PG);
    expect(pg).not.toContain('0.89'); // buyer-only stat
    expect(buyer).not.toContain('콜드콜'); // pg-only framing
  });
});

describe('buildLlmsFullTxt', () => {
  it('buyer full file embeds the canonical FAQ verbatim (DRY, no drift)', () => {
    const out = buildLlmsFullTxt(BUYER);
    expect(out).toContain(FAQ_ITEMS[0].q);
    expect(out).toContain(FAQ_ITEMS[0].a);
    expect(out).toMatch(/^## /m); // markdown section headings
    expect(out.startsWith('# Supporter B')).toBe(true);
  });

  it('pg full file embeds the canonical PG FAQ verbatim', () => {
    const out = buildLlmsFullTxt(PG);
    expect(out).toContain(PG_FAQ_ITEMS[0].q);
    expect(out).toContain(PG_FAQ_ITEMS[0].a);
    expect(out).toContain('https://partner.supporter-b.com');
  });
});
