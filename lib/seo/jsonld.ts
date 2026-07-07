import { BRAND_ALIASES, siteConfig } from '@/lib/site-config';

/**
 * schema.org Organization JSON-LD. buyer/PG 랜딩이 공유하며, PG는 description만
 * 오버라이드한다. alternateName이 '서포트비' 등 별칭을 검색·AI 엔진에 알린다.
 */
export function buildOrganizationJsonLd(overrides?: { description?: string }) {
  return {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: siteConfig.name,
    alternateName: [...BRAND_ALIASES],
    url: siteConfig.url,
    logo: `${siteConfig.url}/icon.svg`,
    description: overrides?.description ?? siteConfig.description,
  } as const;
}

/**
 * JSON-LD를 <script> 태그에 안전하게 인라인하기 위한 직렬화.
 * JSON.stringify는 `<`를 이스케이프하지 않아 콘텐츠에 `</script>`가 들어오면
 * 태그 탈출(XSS)이 가능하다 — `<`와 U+2028/U+2029를 유니코드 이스케이프한다.
 */
export function serializeJsonLd(value: unknown): string {
  return JSON.stringify(value)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
}

/** schema.org SoftwareApplication JSON-LD (buyer 랜딩 전용). */
export function buildSoftwareApplicationJsonLd() {
  return {
    '@context': 'https://schema.org',
    '@type': 'SoftwareApplication',
    name: siteConfig.name,
    alternateName: [...BRAND_ALIASES],
    applicationCategory: 'BusinessApplication',
    operatingSystem: 'Web',
    offers: { '@type': 'Offer', price: '0', priceCurrency: 'KRW' },
    description: 'PG도입을 위한 PG사 비교 견적 플랫폼',
  } as const;
}
