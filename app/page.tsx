import { LandingHero } from '@/components/landing/LandingHero';
import { LandingHeaderNav } from '@/components/landing/LandingHeaderNav';
import { FAQ_ITEMS } from '@/components/landing/faq-data';
import { siteConfig } from '@/lib/site-config';

// buyer 호스트/단일 호스트(local·dev)의 "/" 는 정적으로 프리렌더된다. partner(PG) 호스트의
// "/" 는 proxy.ts 의 decideRoute rewrite 가 /pg-landing 으로 내부 전달하므로 이 페이지는
// 만나지 않는다(URL은 "/" 그대로 유지).
export const dynamic = 'force-static';

const organizationJsonLd = {
  '@context': 'https://schema.org',
  '@type': 'Organization',
  name: siteConfig.name,
  url: siteConfig.url,
  logo: `${siteConfig.url}/icon.svg`,
  description: siteConfig.description,
};

const faqPageJsonLd = {
  '@context': 'https://schema.org',
  '@type': 'FAQPage',
  mainEntity: FAQ_ITEMS.map((item) => ({
    '@type': 'Question',
    name: item.q,
    acceptedAnswer: { '@type': 'Answer', text: item.a },
  })),
};

const softwareApplicationJsonLd = {
  '@context': 'https://schema.org',
  '@type': 'SoftwareApplication',
  name: '서포트 B',
  alternateName: ['서포트 B'],
  applicationCategory: 'BusinessApplication',
  operatingSystem: 'Web',
  offers: { '@type': 'Offer', price: '0', priceCurrency: 'KRW' },
  description: 'PG도입을 위한 PG사 비교 견적 플랫폼',
};

export default function RootPage() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(organizationJsonLd) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqPageJsonLd) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(softwareApplicationJsonLd) }}
      />
      <LandingHero nav={<LandingHeaderNav />} />
    </>
  );
}
