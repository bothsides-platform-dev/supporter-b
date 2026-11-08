import type { WorkspaceType } from '@/lib/types/workspace';
import { DOCS_GUIDES, DOCS_URL, siteConfig } from '@/lib/site-config';
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
  /** Relative path (joined to the host origin), an in-page anchor, or an absolute URL (used as-is). */
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

// 공식 표기의 단일 출처는 siteConfig.name — 메타데이터·OG 와 llms.txt·JSON-LD 가
// 같은 이름을 써야 한다(공식 표기는 site-config 가 소유).
export const PRODUCT_NAME = siteConfig.name;

const BUYER_FACTS: AudienceFacts = {
  summary:
    '구매사(가맹점)가 업종에 맞는 PG사(결제대행사)에 상담을 요청하고, 카드 수수료와 정산 조건을 확인하는 맞춤 PG 견적 플랫폼이에요.',
  intro:
    '서포트비에서 업종과 필요한 결제 조건을 입력하면 상담 가능한 PG사를 추천해요. 구매사는 추천받은 PG사 중 한 곳에 상담을 요청하고, PG사 검토 후 받은 견적을 확인해요. PG 도입과 변경을 지원하며, 최종 견적과 서비스 이용 조건은 PG사 검토와 계약에 따라 정해져요.',
  facts: [
    '이용 요금: 현재(2026년) 무료로 이용할 수 있어요. 현재 유료화 계획은 없으며, 유료화 전환 시 한 분기 전에 알려드려요.',
    '대상 PG: 서포트비에서 추천하는 PG사에 상담과 견적을 요청할 수 있어요. 상담 가능한 PG사는 업종에 따라 달라지며, 견적 제공 여부는 PG사 검토 결과에 따라 정해져요.',
    '상담 방식: 한 번에 한 PG사에 맞춤 상담을 요청해요. 상담을 이어가기 어려우면 이전 상담 PG사를 제외한 다음 후보가 있는지 확인해요.',
    '정보 공개: 요청을 받은 PG사는 구매사가 공개한 상담 정보를 확인해요. 구매사는 현재 내고 있는 카드 수수료를 해당 PG사에게 공개할지 선택할 수 있어요.',
    '계약 구분: PG 서비스 이용계약은 구매사와 선정 PG사가 직접 진행해요. 장기이용 할인 합의서는 주식회사 노온과 구매사가 별도로 체결해요.',
    '제휴 수수료: PG 서비스 이용계약 후 제휴 계약에 따라 PG사가 서포트비에 수수료를 지급해요. PG 서비스의 이용료, 해지와 환불은 해당 PG사의 계약 조건을 따라요.',
    '문의: 홈페이지 우측 하단 채널톡으로 문의와 기능 요청을 받아요.',
  ],
  metrics: [
    { value: '0.89%', caption: 'PoC 고객사 평균 수수료 절감 비율' },
    { value: '4.5주', caption: 'PG사 견적 비교 시 소요 시간 감소' },
    { value: '2,300만원', caption: 'PoC 고객사 연간 평균 수수료 절감액' },
  ],
  process: [
    { step: '01', title: '견적 요청 작성', body: '업종, 상품, 필요한 결제수단과 희망 조건을 입력해요. PG를 변경한다면 현재 이용 조건도 함께 작성해요.' },
    { step: '02', title: '맞춤 PG 상담 요청', body: '업종과 이용 조건에 맞는 추천 후보를 확인하고, 한 PG사에 상담을 요청해요.' },
    { step: '03', title: 'PG 검토와 견적 확인', body: 'PG사가 상담 내용을 검토해요. 견적을 받으면 수수료, 정산주기, 보증금과 가입비 등을 확인해요.' },
    { step: '04', title: '조건 협의와 선정', body: '필요한 조건을 PG사와 협의하고, 이용할 견적을 최종 선택해요.' },
    { step: '05', title: '합의서와 서비스 이용계약', body: '노온이 미리 날인한 장기이용 할인 합의서를 확인하고 구매사 담당자만 본인인증 후 서명해요. PG 서비스 이용계약은 구매사와 선정 PG사가 별도로 진행해요.' },
  ],
  highlightsTitle: '견적에서 확인하는 조건',
  highlights: [
    { title: '수수료율', desc: '상담한 PG사가 제시한 카드 수수료와 적용 조건을 확인해요.' },
    { title: '정산주기, 보증금, 가입비', desc: '수수료 외 정산주기, 보증보험(보증금), 가입비 조건도 확인해요.' },
    { title: '심사, 운영지원', desc: '서비스 도입에 필요한 심사, 지원 결제수단과 운영지원 범위를 PG사와 확인해요.' },
  ],
  links: [
    { title: '서포트비 홈', path: '/', desc: '구매사용 서비스 소개' },
    { title: '맞춤 PG 견적 무료로 받기', path: '/signup/buyer', desc: '구매사 회원가입' },
    { title: '로그인', path: '/login' },
    { title: '서비스 소개', path: '/#service' },
    { title: '이용 절차', path: '/#process' },
    { title: '이용 요금', path: '/#pricing' },
    { title: '자주 묻는 질문', path: '/#faq' },
    { title: '개발 에이전트 가이드', path: '/developers/agents.md', desc: 'Claude Code와 Codex용 PG 상담 준비 정보와 공개 MCP 연결' },
    { title: 'PG 가이드와 용어 사전', path: DOCS_URL, desc: 'PG 도입, 결제 운영 가이드와 결제 용어 해설' },
    ...DOCS_GUIDES.map((guide) => ({ title: guide.label, path: guide.href })),
  ],
  faq: FAQ_ITEMS,
};

const PG_FACTS: AudienceFacts = {
  summary:
    'PG 영업담당자(결제대행사)가 PG 도입이나 변경을 검토하는 고객사의 상담 요청을 받아 검토하고 견적을 보내는 영업 채널이에요.',
  intro:
    '서포트비는 고객사의 업종과 이용 조건에 따라 상담 가능한 PG사를 추천해요. 고객사가 한 PG사를 선택해 상담을 요청하면 해당 PG사는 공개된 상담 정보를 확인하고 검토해요. 기존 PG를 변경하는 고객사는 공개하기로 한 현재 이용 조건도 함께 전달해요.',
  facts: [
    '고객사 요청: PG 도입이나 변경을 검토하는 고객사가 필요한 조건을 작성하고 상담을 요청해요.',
    '정리된 정보: 업종, 상품, 필요한 결제수단과 희망 조건 등 견적 검토에 필요한 정보를 확인해요. 현재 PG 조건은 구매사가 공개한 범위에서 확인해요.',
    '맞춤 상담: 업종별 추천 정책에 따라 고객사가 선택한 한 PG사가 상담을 받아요.',
    '견적 검토: PG사는 받은 요청을 검토하고 상담과 견적 제공 여부를 결정해요.',
    '비공개 보장: PG사는 다른 PG사의 견적이나 경쟁사 수를 볼 수 없어요. 견적 조건은 해당 요청의 검토 과정에서만 사용해요.',
    '계약 주체: PG 서비스 이용계약은 구매사와 선정 PG사가 직접 진행해요. 장기이용 할인 합의서는 주식회사 노온과 구매사가 체결하며 구매사만 서명해요.',
  ],
  process: [
    { step: '01', title: '파트너 등록', body: '담당자 정보와 취급 업종 등을 등록하고 파트너 승인을 받아요.' },
    { step: '02', title: '상담 요청 확인', body: '고객사가 보낸 상담 요청의 업종, 필요한 결제수단과 공개된 이용 조건을 확인해요.' },
    { step: '03', title: '검토와 견적 보내기', body: '상담 가능 여부를 검토하고 수수료율, 정산주기, 보증금, 가입비 등 견적 조건을 보내요.' },
    { step: '04', title: '고객사 검토', body: '고객사가 견적 조건을 확인하고 필요한 내용을 PG사와 협의해요.' },
    { step: '05', title: '서비스 이용계약', body: '고객사가 견적을 선택하면 PG사와 서비스 이용계약을 별도로 진행해요.' },
  ],
  highlightsTitle: '상담을 검토하는 데 필요한 정보',
  highlights: [
    { title: '도입 목적', desc: 'PG 신규 도입이나 변경을 검토하는 고객사의 요청을 확인해요.' },
    { title: '정리된 정보', desc: '업종, 필요한 결제수단과 공개된 이용 조건을 바탕으로 상담을 검토해요.' },
    { title: '견적 조건', desc: '수수료뿐 아니라 정산주기, 보증금, 가입비와 운영지원 조건도 안내해요.' },
  ],
  links: [
    { title: '서포트비 파트너 홈', path: '/', desc: 'PG 파트너용 서비스 소개' },
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
