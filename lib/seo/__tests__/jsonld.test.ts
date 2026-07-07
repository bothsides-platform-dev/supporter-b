import { describe, it, expect } from 'vitest';
import { buildOrganizationJsonLd, buildSoftwareApplicationJsonLd } from '@/lib/seo/jsonld';
import { siteConfig, BRAND_ALIASES } from '@/lib/site-config';

describe('buildOrganizationJsonLd', () => {
  it('uses the official name and carries all brand aliases as alternateName', () => {
    const org = buildOrganizationJsonLd();
    expect(org['@type']).toBe('Organization');
    expect(org.name).toBe('서포트 B');
    expect(org.alternateName).toEqual([...BRAND_ALIASES]);
  });

  it('defaults url/logo/description from siteConfig', () => {
    const org = buildOrganizationJsonLd();
    expect(org.url).toBe(siteConfig.url);
    expect(org.logo).toBe(`${siteConfig.url}/icon.svg`);
    expect(org.description).toBe(siteConfig.description);
  });

  it('applies a description override without losing aliases', () => {
    const org = buildOrganizationJsonLd({ description: 'PG 전용 설명' });
    expect(org.description).toBe('PG 전용 설명');
    expect(org.alternateName).toEqual([...BRAND_ALIASES]);
  });
});

describe('buildSoftwareApplicationJsonLd', () => {
  it('uses the official name and carries all brand aliases as alternateName', () => {
    const app = buildSoftwareApplicationJsonLd();
    expect(app['@type']).toBe('SoftwareApplication');
    expect(app.name).toBe('서포트 B');
    expect(app.alternateName).toEqual([...BRAND_ALIASES]);
  });

  it('keeps the free-offer and web application facts', () => {
    const app = buildSoftwareApplicationJsonLd();
    expect(app.applicationCategory).toBe('BusinessApplication');
    expect(app.operatingSystem).toBe('Web');
    expect(app.offers).toEqual({ '@type': 'Offer', price: '0', priceCurrency: 'KRW' });
  });
});
