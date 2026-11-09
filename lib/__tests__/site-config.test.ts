// @vitest-environment node

import { describe, it, expect } from 'vitest';
import { siteConfig } from '../site-config';

describe('siteConfig', () => {
  it('includes PG도입 in keywords', () => {
    expect(siteConfig.keywords).toContain('PG도입');
  });

  it('includes 서포트비 in keywords', () => {
    expect(siteConfig.keywords).toContain('서포트비');
  });

  it('describes the current industry-matched PG consultation flow', () => {
    expect(siteConfig.description).toContain('PG 도입');
    expect(siteConfig.description).toContain('업종에 맞는 PG사');
    expect(siteConfig.description).not.toMatch(/봉인입찰|여러 PG사의 견적을 한 번에 비교/);
  });

  it('description mentions 서포트비', () => {
    expect(siteConfig.description).toContain('서포트비');
  });

  it('official name stays 서포트비', () => {
    expect(siteConfig.name).toBe('서포트비');
  });

  it('does not advertise alternative brand spellings', () => {
    expect(siteConfig.keywords).not.toContain('서포트 B');
    expect(siteConfig.keywords).not.toContain('서포트B');
  });
});
