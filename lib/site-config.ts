import { baseUrl } from '@/lib/site-routing';

/**
 * 문서 사이트(PG 도입 가이드·용어 사전). 별도 레포(docs-supporter-b)가 docs.support-b.com 에서
 * 서빙하는 외부 사이트라 호스트 라우팅(baseUrl)을 따르지 않는 고정 URL 이다. 공용 푸터와
 * buyer llms 링크가 이 값을 쓴다.
 */
export const DOCS_URL = 'https://docs.support-b.com';

/**
 * docs의 결제 운영 가이드. 푸터와 buyer llms에서 발행된 글로 바로 이동할 수 있게 한다.
 * 이름과 주소는 docs 레포의 글 제목·slug와 맞춘다.
 */
export const DOCS_GUIDES = [
  { label: '부분 환불은 어떻게 하나요? 주문 취소부터 환불 확인까지', href: `${DOCS_URL}/articles/partial-refund-guide` },
  { label: '가상계좌 만들기: 구매자와 쇼핑몰 운영자의 발급 방법', href: `${DOCS_URL}/articles/virtual-account-issuance-guide` },
  { label: 'PG 수수료 계산법: 수수료율과 실제 정산액이 다른 이유', href: `${DOCS_URL}/articles/pg-fee-calculation` },
] as const;

export const siteConfig = {
  name: '서포트비',
  // Organization JSON-LD 별칭. docs.support-b.com 이 같은 @id 로 같은 목록을 내보낸다.
  alternateNames: ['Supporter B', '서포트 B', '서포트B', 'Support B'],
  // 개설을 확인한 공식 프로필만 둔다. docs 레포의 SITE.sameAs 와 맞춘다.
  sameAs: ['https://www.linkedin.com/company/109884859/'],
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
