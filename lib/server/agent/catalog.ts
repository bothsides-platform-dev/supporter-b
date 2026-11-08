import { sendReadinessIssues } from '@/lib/rfp/send-readiness';
import { appOrigins } from '@/lib/site-routing';
import { DOCS_GUIDES, DOCS_URL, siteConfig } from '@/lib/site-config';
import { agentChannelEnabled, agentAccountUrls } from './account-contract';

// Only curated public product facts live here. Never load a workspace, PG policy,
// quote, or recommendation from the database to build this anonymous response.
export const AGENT_CATALOG_VERSION = '2026-11-08.2';
export const PG_CONSULTATION_ID = 'pg-consultation';
export const AGENT_MCP_PATH = '/api/agent/mcp';
export const AGENT_GUIDE_PATH = '/developers/agents.md';
export const AGENT_CATALOG_PATH = '/api/agent/v1/services';

export function agentPublicLinks() {
  const origin = new URL(appOrigins().buyer).origin;
  return {
    catalog: `${origin}${AGENT_CATALOG_PATH}`,
    guide: `${origin}${AGENT_GUIDE_PATH}`,
    mcp: `${origin}${AGENT_MCP_PATH}`,
    start: `${origin}/quote-start`,
    signup: `${origin}/signup/buyer`,
    docs: DOCS_URL,
  };
}

export function getPublicServiceCatalog() {
  const links = agentPublicLinks();
  return {
    schemaVersion: 1,
    catalogVersion: AGENT_CATALOG_VERSION,
    name: siteConfig.name,
    channel: {
      status: 'public_discovery',
      authenticationRequired: false,
      capabilities: ['list_services', 'get_requirements', 'get_integration_guide'],
      applicationChannel: 'web',
      description: '지원 서비스와 신청 준비 정보를 조회해요. 실제 상담 신청은 웹에서 진행해요.',
    },
    accountChannel: agentChannelEnabled() ? {
      mcp: agentAccountUrls().resource, authentication: 'oauth_authorization_code_pkce',
      capabilities: ['get_connection', 'recommend_pg', 'prepare_request', 'get_request_status'],
      scopes: ['requests:read', 'requests:write'], finalSubmission: 'human_browser_confirmation',
      description: '구매사 계정을 연결해 상담 초안을 준비하고, 웹에서 직접 확인해 보내요.',
    } : null,
    services: [{
      id: PG_CONSULTATION_ID,
      name: '국내 PG 도입·변경 상담',
      category: 'payments',
      region: 'KR',
      status: 'available',
      summary: '업종에 맞는 PG사 한 곳에 상담을 요청하고 수수료와 정산 조건을 확인해요.',
      useWhen: [
        '국내 사업자가 새로 결제를 도입하고 PG사와의 상담·견적이 필요해요.',
        '현재 이용 중인 PG사를 변경하기 위해 도입 조건을 확인하고 싶어요.',
      ],
      notFor: [
        '이미 계약한 PG사의 연동 코드만 수정하는 작업',
        'PG 도입과 관련 없는 화면 디자인이나 결제 오류 수정',
        '클라우드 서비스 구매나 여러 분야의 SDK 패키지 신청',
      ],
      contracts: {
        serviceParties: '고객과 선정 PG사',
        platformAgreement: '노온–구매사 장기이용 할인 합의서는 PG 서비스 이용계약과 별개예요. 실제 PG 이용 시작일부터 2년 약정이며, 독점 이용과 조건부 할인액 반환 등 합의서 조건도 따로 확인해요.',
        policies: '서비스 이용료·사용량·해지·환불은 해당 PG사의 조건을 확인해요.',
        revenue: '서포트비는 제휴 계약에 따라 제휴사에서 수수료를 받아요.',
      },
      availability: {
        consultation: 'subject_to_partner_review',
        quote: 'subject_to_partner_review',
        agentSubmission: false,
        unifiedSdk: false,
      },
      requirementsUrl: `${links.catalog}/${PG_CONSULTATION_ID}/requirements`,
      startUrl: links.start,
    }],
    links,
  };
}

export function getPublicRequirements(contractType: 'new' | 'renewal' = 'new') {
  // Derive preparation questions from the same rules used by the real form and
  // server. This lists requirements; it does not certify a buyer's eligibility.
  const missing = sendReadinessIssues({
    contractType,
    requiredPaymentMethods: [],
    customPaymentMethods: [],
    allowedPgWorkspaceIds: [],
    deadline: '',
  });
  return {
    schemaVersion: 1,
    catalogVersion: AGENT_CATALOG_VERSION,
    serviceId: PG_CONSULTATION_ID,
    contractType,
    accountRequirements: [
      '신청할 사업자 정보와 구매사 계정을 준비해요.',
      '기존 이메일 인증과 워크스페이스 승인 절차를 진행해요.',
    ],
    questions: missing.map(({ rule, path, message }) => ({
      key: rule,
      field: path,
      prompt: rule === 'pg'
        ? '추천 가능한 PG사 한 곳을 선택해요.'
        : message.replace('해주세요', '해요'),
    })),
    notes: [
      '실제 발송 때 업종별 PG 추천과 신청 가능 여부를 다시 확인해요.',
      '마감일은 한국 영업일 기준으로 선택해요. 기본은 5영업일이에요.',
      '사업자나 홈페이지를 준비 중이면 필요한 정보를 먼저 정리하고 준비 후 신청을 이어가요.',
      '견적 조건과 서비스 이용 가능 여부는 PG사 검토 후 확인해요.',
    ],
    nextAction: { type: 'open_web_application', url: agentPublicLinks().start },
  };
}

export function getPublicIntegrationGuide() {
  return {
    schemaVersion: 1,
    catalogVersion: AGENT_CATALOG_VERSION,
    serviceId: PG_CONSULTATION_ID,
    status: 'preparation_only',
    steps: [
      '이미 계약한 PG사와 사용할 결제수단이 있는지 확인해요.',
      '새 PG 도입이나 변경 상담이 필요하면 요구사항을 정리하고 웹에서 상담을 요청해요.',
      '선정 PG사의 서비스 이용계약과 필요한 심사를 진행해요.',
      '해당 PG사의 공식 개발 문서와 테스트 정보를 받아 연결해요.',
      '해당 PG사의 테스트 환경에서 결제와 제공하는 후속 기능을 확인해요.',
    ],
    guidance: [
      '이 채널은 PG별 인증키나 고객 견적을 조회하지 않아요.',
      'PG별 실행 예제와 서포트비 공통 SDK는 아직 제공하지 않아요.',
      '비밀키와 결제정보를 공개 도구의 입력에 넣지 않아요.',
    ],
    references: DOCS_GUIDES.map(({ label, href }) => ({ title: label, url: href })),
    links: agentPublicLinks(),
  };
}
