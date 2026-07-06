// PG 랜딩 콘텐츠 단일 출처 — 카피 수정은 이 파일에서. (렌더 구조는 PgLanding.tsx)
import { siteConfig } from '@/lib/site-config';
import { PG_FAQ_ITEMS } from '@/components/landing/pg-faq-data';

// ── 화면2: PG 영업 문제 제기 (4 카드) ──
export const PROBLEM_ITEMS = [
  {
    num: '01',
    title: '관심은 있지만 움직이지 않는 고객사',
    desc: '견적은 요청하지만 당장 변경 의사가 없는 고객사에 반복적으로 시간을 씁니다.',
  },
  {
    num: '02',
    title: '조건 확인부터 다시 시작하는 영업',
    desc: '월 거래액, 업종, 현재 수수료율, 정산주기, 보증금 정보를 매번 새로 확인해야 합니다.',
  },
  {
    num: '03',
    title: '수수료율만 남는 협상',
    desc: 'PG사의 정산 안정성, 심사 역량, 운영지원 강점이 충분히 전달되지 못합니다.',
  },
  {
    num: '04',
    title: '낮은 전환율의 반복 미팅',
    desc: '실제 니즈가 불명확한 리드에 제안서와 미팅 리소스가 소모됩니다.',
  },
];

// ── 화면3: 신규 성장 고객사 인바운드 (4 캐러셀 카드) ──
export const CUSTOMER_TYPES = [
  {
    title: 'PG 변경을 검토하는 기존 가맹점',
    desc: '현재 조건에 아쉬움이 있거나 거래 규모 증가로 더 나은 조건을 찾는 고객사를 만납니다.',
  },
  {
    title: '신규 PG 도입을 준비하는 성장 기업',
    desc: '결제 시스템을 처음 도입하거나 확장하려는 고객사의 초기 검토 단계에 참여합니다.',
  },
  {
    title: '조건 개선 니즈가 명확한 고객사',
    desc: '수수료율뿐 아니라 정산주기, 보증금, 셋업비, 운영지원까지 비교하려는 고객사를 만납니다.',
  },
  {
    title: '복수 PG 조건을 비교하는 구매 의사 보유 고객사',
    desc: '이미 비교 의사가 있는 고객사의 요청에 맞춰 제안할 수 있습니다.',
  },
];

// ── 화면4: 검증된 리드 / 동일한 기회 (3 메시지) ──
export const VERIFIED_POINTS = [
  {
    index: '01',
    title: '확실한 니즈',
    desc: '고객사가 직접 PG 조건 비교 요청을 제출합니다. 단순 문의가 아니라, 실제 조건 검토 의사가 있는 고객사를 대상으로 합니다.',
  },
  {
    index: '02',
    title: '정리된 정보',
    desc: '월 거래액, 업종, 현재 PG 조건, 희망 정산주기, 보증금 조건 등 제안에 필요한 정보를 RFP로 확인합니다.',
  },
  {
    index: '03',
    title: '동일한 기회',
    desc: '조건에 맞는 파트너 PG사에게 동일한 기준의 제안 기회를 제공합니다. 고객사는 제출된 조건을 표준화된 방식으로 비교합니다.',
  },
];

// ── 화면5: 참여 프로세스 (5단계) ──
export const PROCESS_STEPS = [
  {
    n: '01',
    title: '파트너 등록',
    body: '담당자 정보, 취급 업종, 선호 거래 규모, 심사 가능 범위 등을 등록합니다.',
    note: '초기 등록 이후 조건에 맞는 RFP를 선별해 받을 수 있습니다.',
  },
  {
    n: '02',
    title: 'RFP 수신',
    body: 'PG 조건 비교 니즈가 있는 고객사의 RFP를 확인합니다.',
    note: '업종, 거래 규모, 현재 조건, 희망 조건이 정리된 상태로 제공됩니다.',
  },
  {
    n: '03',
    title: '제안 제출',
    body: '수수료율, 정산주기, 보증금, 셋업비, 운영지원 조건을 표준 포맷에 맞춰 제출합니다.',
    note: '반복적인 제안서 작성 부담을 줄일 수 있습니다.',
  },
  {
    n: '04',
    title: '고객사 검토',
    body: '고객사는 여러 PG사의 조건을 동일한 기준으로 비교합니다.',
    note: '수수료뿐 아니라 정산 안정성, 심사 속도, 운영지원도 함께 평가됩니다.',
  },
  {
    n: '05',
    title: '계약 논의',
    body: '고객사가 선택한 PG사와 최종 계약 조건을 직접 논의합니다.',
    note: '서포트 B는 비교와 연결 과정을 지원합니다.',
  },
];

// ── 화면6: 파트너사 영업 성과 사례 (3 카드) ──
export const CASES: { metric: string; metricCaption: string; quote: string; role: string }[] = [
  {
    metric: '300%',
    metricCaption: '리드 검증·획득 단가 절감',
    quote:
      '신규 PG 도입을 검토하는 고객사 리드를 거래액·업종·조건까지 검증해 제공받아, 좋은 리드를 확보할 수 있었습니다. 덕분에 신규 영업 리드에 대한 고민을 덜었습니다.',
    role: 'K사 영업 팀장',
  },
  {
    metric: '150%',
    metricCaption: '제안 효율 개선·제안 리소스 절감',
    quote:
      '표준화된 요청 정보에 맞춰 고객사가 필요한 조건을 빠르게 제안할 수 있었습니다. 실제 도입 의사가 확실한 고객사에 집중하니 영업 리소스를 효율적으로 쓸 수 있었습니다.',
    role: 'K사 영업 대리',
  },
  {
    metric: '200%',
    metricCaption: '중소형 PG사 신규 영업 기회 확대',
    quote:
      '메이저 PG사만 얻던 영업 기회를 중소형 PG사인 저희도 얻을 수 있었어요. 덕분에 상반기에 부족했던 영업 리커버리 보충 계획을 채울 수 있었습니다.',
    role: 'S사 영업 본부장',
  },
];

export const organizationJsonLd = {
  '@context': 'https://schema.org',
  '@type': 'Organization',
  name: siteConfig.name,
  url: siteConfig.url,
  logo: `${siteConfig.url}/icon.svg`,
  description: 'PG 영업담당자를 위한 신규 가맹점 인바운드 채널',
};

export const faqPageJsonLd = {
  '@context': 'https://schema.org',
  '@type': 'FAQPage',
  mainEntity: PG_FAQ_ITEMS.map((item) => ({
    '@type': 'Question',
    name: item.q,
    acceptedAnswer: { '@type': 'Answer', text: item.a },
  })),
};
