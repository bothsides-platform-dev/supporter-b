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
