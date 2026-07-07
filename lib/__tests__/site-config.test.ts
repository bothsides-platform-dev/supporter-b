import { describe, it, expect } from 'vitest';
import { siteConfig, BRAND_ALIASES } from '../site-config';

describe('siteConfig', () => {
  it('includes PG도입 in keywords', () => {
    expect(siteConfig.keywords).toContain('PG도입');
  });

  it('includes 서포트 B in keywords', () => {
    expect(siteConfig.keywords).toContain('서포트 B');
  });

  it('description mentions PG도입', () => {
    expect(siteConfig.description).toContain('PG도입');
  });

  it('description mentions 서포트 B', () => {
    expect(siteConfig.description).toContain('서포트 B');
  });

  it('official name stays 서포트 B', () => {
    expect(siteConfig.name).toBe('서포트 B');
  });

  it('includes alias keywords 서포트비 and 서포트B', () => {
    expect(siteConfig.keywords).toContain('서포트비');
    expect(siteConfig.keywords).toContain('서포트B');
  });
});

describe('BRAND_ALIASES', () => {
  it('lists the phonetic and English brand aliases', () => {
    expect(BRAND_ALIASES).toEqual(['서포트비', '서포트B', 'Support B', 'Supporter B']);
  });

  it('does not include the official notation itself', () => {
    expect(BRAND_ALIASES).not.toContain('서포트 B');
  });

  it('drift guard: every Korean alias is mirrored into siteConfig.keywords', () => {
    const koreanAliases = BRAND_ALIASES.filter((a) => /[가-힣]/.test(a));
    for (const alias of koreanAliases) {
      expect(siteConfig.keywords).toContain(alias);
    }
  });
});
