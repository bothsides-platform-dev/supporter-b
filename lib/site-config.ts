import { baseUrl } from '@/lib/site-routing';

export const siteConfig = {
  name: '서포트비',
  // 사업자등록증 기준 공개 운영사 정보.
  operator: {
    name: '주식회사 노온 (NO-ON Corp.)',
    representative: '이성연',
    businessRegistrationNumber: '652-87-03871',
    address: '서울특별시 강남구 강남대로112길 47, 2층 867에이호(논현동)',
    email: 'contact@support-b.com',
    // 전자상거래법 시행령 제11조의4 — 앱 서버(AWS Lightsail) 운영사.
    hostingProvider: 'Amazon Web Services, Inc.',
  },
  title: '서포트비 — 맞춤 PG 견적 플랫폼',
  description:
    'PG도입을 고려 중이신가요? 서포트비에서 여러 PG사의 견적을 한 번에 비교해 최적의 수수료 조건으로 계약하세요.',
  // 오리진 폴백 사슬의 단일 출처는 lib/site-routing.ts 의 baseUrl() 이다 —
  // appOrigins(호스트 라우팅)·baseUrlFor(이메일 링크)와 같은 답을 내야 한다.
  url: baseUrl(),
  locale: 'ko_KR',
  ogImageAlt: '서포트비 — 맞춤 PG 견적 플랫폼',
  keywords: [
    'PG도입',
    'PG 견적',
    'PG 수수료 비교',
    '결제대행사 도입',
    '결제대행사 견적',
    '결제대행사 비교',
    'PG사 비교',
    '서포트비',
  ],
} as const;
