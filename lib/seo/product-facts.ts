import type { WorkspaceType } from '@/lib/types/workspace';
import { FAQ_ITEMS } from '@/components/landing/faq-data';
import { PG_FAQ_ITEMS } from '@/components/landing/pg-faq-data';

/**
 * Curated, citation-ready product facts for the AI-facing text endpoints
 * (`/llms.txt`, `/llms-full.txt`). Single source so buyer/pg copy never drifts
 * across the two files. FAQ entries are imported from the landing data (DRY);
 * metrics are mirrored from components/landing/LandingHero.tsx METRICS — keep
 * the two in sync when the landing stats change.
 */

export interface ProductMetric {
  value: string;
  caption: string;
}

export interface SeoLink {
  title: string;
  /** Relative path (joined to the host origin) or an in-page anchor. */
  path: string;
  desc?: string;
}

export interface ProcessStep {
  step: string;
  title: string;
  body: string;
}

export interface FactHighlight {
  title: string;
  desc: string;
}

export interface AudienceFacts {
  /** One-line blockquote summary. */
  summary: string;
  /** Lead prose paragraph. */
  intro: string;
  /** Bullet facts (핵심 정보). */
  facts: string[];
  /** Buyer-only headline metrics. */
  metrics?: ProductMetric[];
  process: ProcessStep[];
  highlightsTitle: string;
  highlights: FactHighlight[];
  links: SeoLink[];
  faq: readonly { readonly q: string; readonly a: string }[];
}

export const PRODUCT_NAME = 'Supporter B (서포터비)';

const BUYER_FACTS: AudienceFacts = {
  summary:
    '구매사(가맹점)가 여러 PG사(결제대행사)의 카드 수수료·정산 조건 견적을 한 번에 비교해 최적 조건으로 계약하는 봉인 입찰 견적 플랫폼입니다.',
  intro:
    'Supporter B에서 구매사가 카드 수수료·정산 조건을 담은 견적 요청서(RFP)를 발행하면, 복수의 PG사가 봉인 입찰(sealed bid)로 견적을 제출하고 구매사가 조건을 비교해 최적 파트너를 선정합니다. 단일 PG 견적만 받고 협의 없이 계약하던 기존 방식의 불투명한 수수료·제한된 협상 문제를 해결합니다.',
  facts: [
    '이용 요금: 현재(2026년) 무료로 이용할 수 있으며, 추후 유료 전환 시 2달 전에 사전 공지합니다.',
    '대상 PG: 국내 모든 PG사의 수수료 견적을 비교할 수 있습니다(개별 PG 사정에 따라 최종 견적에 제한이 있을 수 있음).',
    '봉인 입찰: PG사는 서로의 제안이나 경쟁사 수를 볼 수 없습니다. 구매사만 모든 견적을 비교합니다.',
    '참여 통제: 구매사가 참여 PG사를 직접 지정(allowlist)하며, 초대받지 않은 PG사는 공개 게시판에서 참여를 요청할 수 있습니다.',
    '현재 수수료 비공개 옵션: 구매사는 현재 내고 있는 카드 수수료를 초대 PG사에게 공개할지 선택할 수 있습니다.',
    '문의: 홈페이지 우측 하단 채널톡으로 문의·기능 요청을 받습니다.',
  ],
  metrics: [
    { value: '0.89%', caption: 'PoC 고객사 평균 수수료 절감 비율' },
    { value: '4.5주', caption: 'PG사 견적 비교 시 소요 시간 감소' },
    { value: '2,300만원', caption: 'PoC 고객사 연간 평균 수수료 절감액' },
  ],
  process: [
    { step: '01', title: '견적 요청 작성', body: '업종·거래 규모·현재 조건·희망 조건을 담은 견적 요청서(RFP)를 작성합니다.' },
    { step: '02', title: 'PG 초대·공개', body: '원하는 PG사를 초대하고, 공개 게시판 노출 여부를 선택합니다.' },
    { step: '03', title: '견적 수신(봉인)', body: '복수의 PG사가 서로 모르게 봉인 견적을 제출합니다.' },
    { step: '04', title: '비교·협의', body: '수수료·정산주기·보증금·심사·운영지원을 한 화면에서 비교하고, 필요하면 조건 개선을 재요청합니다.' },
    { step: '05', title: '선정·계약', body: '최적 PG사를 선정하고 PG사와 직접 계약을 진행합니다.' },
  ],
  highlightsTitle: '한눈에 비교하는 조건',
  highlights: [
    { title: '수수료율', desc: '투명한 카드 수수료 견적을 다수의 PG사로부터 받습니다.' },
    { title: '정산주기·보증금·가입비', desc: '수수료 외 정산주기, 보증보험(보증금), 가입비(셋업비) 조건을 비교합니다.' },
    { title: '심사·운영지원', desc: 'PG사 리스크팀·카드사 심사 승인 가능 여부, 운영지원, 결제수단을 함께 평가합니다.' },
  ],
  links: [
    { title: 'Supporter B 홈', path: '/', desc: '구매사용 서비스 소개' },
    { title: '무료로 견적 요청 시작하기', path: '/signup/buyer', desc: '구매사 회원가입' },
    { title: '로그인', path: '/login' },
    { title: '서비스 소개', path: '/#service' },
    { title: '이용 절차', path: '/#process' },
    { title: '이용 요금', path: '/#pricing' },
    { title: '자주 묻는 질문', path: '/#faq' },
  ],
  faq: FAQ_ITEMS,
};

const PG_FACTS: AudienceFacts = {
  summary:
    'PG 영업담당자(결제대행사)가 PG 도입·변경을 검토하는 검증된 고객사의 견적 요청(RFP)을 받아 제안하고, 신규 가맹점을 수주하는 인바운드 영업 채널입니다.',
  intro:
    'PG 영업에서 가장 어려운 건 리드 수가 아니라 확실한 니즈입니다. Supporter B는 결제 도입·변경을 실제로 검토하는 고객사를 선별해, 업종·거래 규모·현재 조건·희망 조건이 정리된 RFP 형태로 파트너 PG사에게 전달합니다. 콜드콜이나 광고 리드보다 선명한, 검증된 영업 기회를 받습니다.',
  facts: [
    '검증된 리드: 고객사가 직접 PG 조건 비교 요청(RFP)을 제출합니다. 단순 문의가 아니라 실제 조건 검토 의사가 있는 고객사입니다.',
    '정리된 정보: 월 거래액·업종·현재 PG 조건·희망 정산주기·보증금 등 제안에 필요한 정보가 RFP로 정리되어 제공됩니다.',
    '공정한 기회: 조건에 맞는 파트너 PG사에게 동일한 기준으로 제안 기회를 제공합니다.',
    '비가격 경쟁력: 수수료율뿐 아니라 정산 안정성·심사 속도·보증금 조건·운영지원으로 차별화할 수 있습니다.',
    '비공개 보장: 제안한 수수료율·조건은 해당 RFP 검토 과정에서만 사용되며 외부에 공개되지 않습니다.',
    '참여 선택: 모든 RFP에 참여할 필요는 없으며, 조건에 맞는 RFP만 골라 참여할 수 있습니다.',
    '계약 주체: 최종 계약은 고객사와 PG사가 직접 진행하고, Supporter B는 비교·연결을 지원합니다.',
  ],
  process: [
    { step: '01', title: '파트너 등록', body: '담당자 정보, 취급 업종, 선호 거래 규모, 심사 가능 범위 등을 등록합니다.' },
    { step: '02', title: 'RFP 수신', body: '업종·거래 규모·현재 조건·희망 조건이 정리된 고객사 RFP를 확인합니다.' },
    { step: '03', title: '제안 제출', body: '수수료율·정산주기·보증금·셋업비·운영지원 조건을 표준 포맷에 맞춰 제출합니다.' },
    { step: '04', title: '고객사 검토', body: '고객사가 여러 PG사의 조건을 동일한 기준으로 비교합니다.' },
    { step: '05', title: '계약 논의', body: '고객사가 선택한 PG사와 최종 계약 조건을 직접 논의합니다.' },
  ],
  highlightsTitle: '검증된 리드 / 공정한 기회',
  highlights: [
    { title: '확실한 니즈', desc: '고객사가 직접 조건 비교 요청을 제출한, 실제 검토 의사가 있는 고객사를 대상으로 합니다.' },
    { title: '정리된 정보', desc: '거래액·업종·현재 조건·희망 조건이 RFP로 정리되어 제안 판단 시간을 줄입니다.' },
    { title: '공정한 기회', desc: '조건에 맞는 파트너에게 표준화된 동일 기준으로 제안 기회를 제공합니다.' },
  ],
  links: [
    { title: 'Supporter B 파트너 홈', path: '/', desc: 'PG 파트너용 서비스 소개' },
    { title: '파트너 신청하기', path: '/signup/pg', desc: 'PG 파트너 회원가입' },
    { title: '로그인', path: '/login' },
    { title: 'PG 영업 문제', path: '/#problem' },
    { title: '신규 고객사 인바운드', path: '/#inbound' },
    { title: '참여 절차', path: '/#process' },
    { title: 'PG사 핵심 이점', path: '/#benefits' },
    { title: '자주 묻는 질문', path: '/#faq' },
  ],
  faq: PG_FAQ_ITEMS,
};

export function audienceFacts(type: WorkspaceType): AudienceFacts {
  return type === 'pg' ? PG_FACTS : BUYER_FACTS;
}
