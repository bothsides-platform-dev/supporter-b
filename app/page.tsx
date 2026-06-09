import { headers } from 'next/headers';
import { LandingHero } from '@/components/landing/LandingHero';
import { LandingHeaderNav } from '@/components/landing/LandingHeaderNav';
import { PgLanding } from '@/components/landing/PgLanding';
import { siteConfig } from '@/lib/site-config';
import { appOrigins, hostServes } from '@/lib/site-routing';

const organizationJsonLd = {
  '@context': 'https://schema.org',
  '@type': 'Organization',
  name: siteConfig.name,
  url: siteConfig.url,
  logo: `${siteConfig.url}/icon.svg`,
  description: siteConfig.description,
};

export default async function RootPage() {
  // partner.supporter-b.com(PG 호스트)는 PG 전용 랜딩으로 분기.
  // 그 외 호스트와 단일 호스트(local/dev)는 기존 buyer 랜딩.
  const host = (await headers()).get('host');
  if (hostServes(host, appOrigins()) === 'pg') {
    return <PgLanding />;
  }

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(organizationJsonLd) }}
      />
      <LandingHero nav={<LandingHeaderNav />} />
    </>
  );
}
