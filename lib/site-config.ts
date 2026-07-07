/** 공식 표기 '서포트비'의 검색·AI 인용용 별칭 (공식 표기 자체는 제외). */
export const BRAND_ALIASES = ['서포트 B', '서포트B', 'Support B', 'Supporter B'] as const;

export const siteConfig = {
  name: '서포트비',
  title: '서포트비 — PG사 비교 견적 플랫폼',
  description:
    'PG도입을 고려 중이신가요? 서포트비에서 여러 PG사의 견적을 한 번에 비교해 최적의 수수료 조건으로 계약하세요.',
  url:
    process.env.NEXT_PUBLIC_BASE_URL ??
    process.env.AUTH_URL ??
    'http://localhost:3000',
  locale: 'ko_KR',
  ogImageAlt: '서포트비 — PG사 비교 견적 플랫폼',
  keywords: [
    'PG도입',
    'PG 견적',
    'PG 수수료 비교',
    '결제대행사 도입',
    '결제대행사 견적',
    '결제대행사 비교',
    'PG사 비교',
    '서포트비',
    '서포트 B',
    '서포트B',
  ],
} as const;
