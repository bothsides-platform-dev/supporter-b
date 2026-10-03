import { describe, it, expect } from 'vitest';
import { siteConfig } from '../site-config';

describe('siteConfig', () => {
  it('includes PG도입 in keywords', () => {
    expect(siteConfig.keywords).toContain('PG도입');
  });

  it('includes 서포트비 in keywords', () => {
    expect(siteConfig.keywords).toContain('서포트비');
  });

  it('description mentions PG도입', () => {
    expect(siteConfig.description).toContain('PG도입');
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
