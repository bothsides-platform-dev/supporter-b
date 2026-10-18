import { describe, it, expect } from 'vitest';
import {
  buildOrganizationJsonLd,
  buildSoftwareApplicationJsonLd,
  serializeJsonLd,
} from '@/lib/seo/jsonld';
import { siteConfig } from '@/lib/site-config';

describe('buildOrganizationJsonLd', () => {
  // docs.support-b.com 이 같은 @id 로 같은 별칭을 내보낸다. 두 호스트의 신호가 엇갈리지 않게
  // 별칭은 siteConfig 한 곳에서 가져온다(2026-10-18 사용자 결정).
  it('uses the official brand name and declares the shared alternate names', () => {
    const org = buildOrganizationJsonLd();
    expect(org['@type']).toBe('Organization');
    expect(org.name).toBe('서포트비');
    expect(org.alternateName).toEqual(['Supporter B', '서포트 B', '서포트B', 'Support B']);
  });

  it('links the verified LinkedIn company page as sameAs', () => {
    expect(buildOrganizationJsonLd().sameAs).toEqual(['https://www.linkedin.com/company/109884859/']);
  });

  it('defaults url/logo/description from siteConfig', () => {
    const org = buildOrganizationJsonLd();
    expect(org.url).toBe(siteConfig.url);
    expect(org.logo).toBe(`${siteConfig.url}/icon.svg`);
    expect(org.description).toBe(siteConfig.description);
  });

  it('applies a description override while keeping the official name', () => {
    const org = buildOrganizationJsonLd({ description: 'PG 전용 설명' });
    expect(org.description).toBe('PG 전용 설명');
    expect(org.name).toBe('서포트비');
  });

  // docs.support-b.com(용어 사전)의 JSON-LD 가 `publisher: { '@id': ... }` 로 이 엔티티를
  // 참조한다. buyer/PG 랜딩이 같은 @id 를 내야 검색엔진이 한 조직으로 묶는다.
  it('carries a stable @id that other hosts can reference, with or without overrides', () => {
    const id = `${siteConfig.url}/#organization`;
    expect(buildOrganizationJsonLd()['@id']).toBe(id);
    expect(buildOrganizationJsonLd({ description: 'PG 전용 설명' })['@id']).toBe(id);
  });
});

describe('buildSoftwareApplicationJsonLd', () => {
  it('uses only the official brand name', () => {
    const app = buildSoftwareApplicationJsonLd();
    expect(app['@type']).toBe('SoftwareApplication');
    expect(app.name).toBe('서포트비');
    expect(app).not.toHaveProperty('alternateName');
  });

  it('keeps the free-offer and web application facts', () => {
    const app = buildSoftwareApplicationJsonLd();
    expect(app.applicationCategory).toBe('BusinessApplication');
    expect(app.operatingSystem).toBe('Web');
    expect(app.offers).toEqual({ '@type': 'Offer', price: '0', priceCurrency: 'KRW' });
  });

  it('describes the product with the 맞춤 PG 견적 framing', () => {
    expect(buildSoftwareApplicationJsonLd().description).toBe('PG 도입을 위한 맞춤 PG 견적 플랫폼');
  });
});

describe('serializeJsonLd', () => {
  it('escapes < so </script> in content cannot break out of the script tag', () => {
    const out = serializeJsonLd({ name: 'x</script><img src=x onerror=alert(1)>' });
    expect(out).not.toContain('</script>');
    expect(out).toContain('\\u003c/script\\u003e');
    expect(JSON.parse(out)).toEqual({ name: 'x</script><img src=x onerror=alert(1)>' });
  });

  it('escapes U+2028/U+2029 line separators', () => {
    const out = serializeJsonLd({ name: 'a b c' });
    expect(out).toContain('\\u2028');
    expect(out).toContain('\\u2029');
    expect(JSON.parse(out)).toEqual({ name: 'a b c' });
  });

  it('round-trips plain Korean content unchanged', () => {
    const org = buildOrganizationJsonLd();
    expect(JSON.parse(serializeJsonLd(org))).toEqual(org);
  });
});
