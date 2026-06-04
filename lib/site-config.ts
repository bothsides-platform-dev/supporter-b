export const siteConfig = {
  name: 'Supporter B',
  title: 'Supporter B — PG 비공개 1:N 견적 플랫폼',
  description:
    '구매사가 사업자번호로 PG 견적을 비교하고 선정하는 비공개 1:N 견적 플랫폼.',
  url:
    process.env.NEXT_PUBLIC_BASE_URL ??
    process.env.AUTH_URL ??
    'http://localhost:3000',
  locale: 'ko_KR',
  ogImageAlt: 'Supporter B — 결제대행사 비공개 1:N 견적 플랫폼',
  keywords: ['PG', '결제대행사', '견적', '견적 요청', '입찰', 'Supporter B'],
} as const;
