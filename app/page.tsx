import { LandingHero } from '@/components/landing/LandingHero';
import { LandingHeaderNav } from '@/components/landing/LandingHeaderNav';
import { siteConfig } from '@/lib/site-config';

const organizationJsonLd = {
  '@context': 'https://schema.org',
  '@type': 'Organization',
  name: siteConfig.name,
  url: siteConfig.url,
  logo: `${siteConfig.url}/icon.svg`,
  description: siteConfig.description,
};

export default function RootPage() {
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
