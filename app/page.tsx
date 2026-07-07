import { LandingHero } from '@/components/landing/LandingHero';
import { LandingHeaderNav } from '@/components/landing/LandingHeaderNav';
import { FAQ_ITEMS } from '@/components/landing/faq-data';
import { buildOrganizationJsonLd, buildSoftwareApplicationJsonLd, serializeJsonLd } from '@/lib/seo/jsonld';

// buyer 호스트/단일 호스트(local·dev)의 "/" 는 정적으로 프리렌더된다. partner(PG) 호스트의
// "/" 는 proxy.ts 의 decideRoute rewrite 가 /pg-landing 으로 내부 전달하므로 이 페이지는
// 만나지 않는다(URL은 "/" 그대로 유지).
export const dynamic = 'force-static';

const organizationJsonLd = buildOrganizationJsonLd();

const faqPageJsonLd = {
  '@context': 'https://schema.org',
  '@type': 'FAQPage',
  mainEntity: FAQ_ITEMS.map((item) => ({
    '@type': 'Question',
    name: item.q,
    acceptedAnswer: { '@type': 'Answer', text: item.a },
  })),
};

const softwareApplicationJsonLd = buildSoftwareApplicationJsonLd();

export default function RootPage() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: serializeJsonLd(organizationJsonLd) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: serializeJsonLd(faqPageJsonLd) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: serializeJsonLd(softwareApplicationJsonLd) }}
      />
      <LandingHero nav={<LandingHeaderNav />} />
    </>
  );
}
