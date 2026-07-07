import { describe, it, expect } from 'vitest';
import { siteConfig } from '../site-config';

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
});
