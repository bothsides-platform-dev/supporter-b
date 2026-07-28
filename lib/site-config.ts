import { baseUrl } from '@/lib/site-routing';

/** 공식 표기 '서포트비'의 검색·AI 인용용 별칭 (공식 표기 자체는 제외). */
export const BRAND_ALIASES = ['서포트 B', '서포트B', 'Support B', 'Supporter B'] as const;

export const siteConfig = {
  name: '서포트비',
  title: '서포트비 — PG사 비교 견적 플랫폼',
  description:
    'PG도입을 고려 중이신가요? 서포트비에서 여러 PG사의 견적을 한 번에 비교해 최적의 수수료 조건으로 계약하세요.',
  // 오리진 폴백 사슬의 단일 출처는 lib/site-routing.ts 의 baseUrl() 이다 —
  // appOrigins(호스트 라우팅)·baseUrlFor(이메일 링크)와 같은 답을 내야 한다.
  url: baseUrl(),
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
