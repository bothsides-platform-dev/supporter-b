import type { Metadata } from 'next';
import { PgLanding } from '@/components/landing/pg/PgLanding';
import { LandingHeaderNav } from '@/components/landing/LandingHeaderNav';
import { siteConfig } from '@/lib/site-config';

export const metadata: Metadata = {
  title: 'PG 영업담당 — Supporter B',
  description:
    '구매 의향이 검증된 사업자 RFP를 인박스로 받아, 표준 포맷의 5분짜리 제안으로 공정하게 경쟁하세요.',
  alternates: { canonical: `${siteConfig.url}/pg` },
  openGraph: {
    title: 'PG 영업담당 — Supporter B',
    description:
      '인박스로 도착하는 RFP. 표준 포맷의 제안. 결과 통보까지 한 자리에서.',
    url: `${siteConfig.url}/pg`,
    locale: siteConfig.locale,
    type: 'website',
  },
};

export default async function PgLandingPage() {
  return <PgLanding nav={<LandingHeaderNav variant="pg" />} />;
}
