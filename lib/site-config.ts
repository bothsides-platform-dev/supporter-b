export const siteConfig = {
  name: 'Supporter B',
  title: 'Supporter B — PG사 비교 견적 플랫폼',
  description: '다수의 PG사의 견적을 비교하여 최적의 견적을 받아보세요',
  url:
    process.env.NEXT_PUBLIC_BASE_URL ??
    process.env.AUTH_URL ??
    'http://localhost:3000',
  locale: 'ko_KR',
  ogImageAlt: 'Supporter B — PG사 비교 견적 플랫폼',
  keywords: ['PG', '결제대행사', '견적', '견적 요청', '입찰', 'Supporter B'],
} as const;
