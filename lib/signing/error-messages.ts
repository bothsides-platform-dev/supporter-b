// 서명(SnowSign) 관련 에러 코드 → 사용자용 친절한 한글 메시지(단일 출처, SSOT).
//
// 서버 액션은 { ok:false, error:'CODE' } 를 돌려주지만 사용자에게 raw 코드(SNOWSIGN_NETWORK
// 등)를 보이면 안 된다 — UX_WRITING §에러 원칙("무엇이 문제인지 + 어떻게 해결하는지").
// 서명 UI 토스트(SigningTab)와 다운로드 프록시가 함께 소비하므로 순수 함수로 둔다
// (클라·서버 공용 — server-only import 금지).
//
// 테스트가 이 객체의 키를 그대로 훑는다 — 코드를 추가하면 자동으로 검증 대상이 된다
// (예전엔 테스트가 코드 목록을 손으로 복사해 두 곳이 드리프트했다).
import { REMIND_COOLDOWN_HOURS } from '@/lib/signing/remind-cooldown';
export const SIGNING_ERROR_MESSAGES: Record<string, string> = {
  // ── SnowSign 제공자 오류 ──
  SNOWSIGN_NETWORK: '전자서명 서비스에 연결하지 못했어요. 잠시 후 다시 시도해 주세요.',
  SNOWSIGN_RATE_LIMIT: '요청이 많아요. 잠시 후 다시 시도해 주세요.',
  SNOWSIGN_MALFORMED: '전자서명 서비스 응답을 처리하지 못했어요. 잠시 후 다시 시도해 주세요.',
  SNOWSIGN_NO_KEY: '전자서명 서비스 설정에 문제가 있어요. 잠시 후 다시 시도하거나 문의해 주세요.',
  SNOWSIGN_INVALID_KEY: '전자서명 서비스 설정에 문제가 있어요. 잠시 후 다시 시도하거나 문의해 주세요.',
  SNOWSIGN_VALIDATION: '요청 정보를 다시 확인해 주세요.',
  SNOWSIGN_NOT_FOUND: '해당 전자서명 정보를 찾을 수 없어요. 화면을 새로고침해 주세요.',
  SNOWSIGN_QUOTA_EXCEEDED: '전자서명 사용량 한도에 도달했어요. 잠시 후 다시 시도해 주세요.',
  SNOWSIGN_INVALID_STATUS: '지금 상태에서는 처리할 수 없어요. 화면을 새로고침해 주세요.',
  SNOWSIGN_UPLOAD_EXPIRED: '등록 시간이 만료됐어요. 처음부터 다시 시도해 주세요.',
  SNOWSIGN_PDF_REJECTED: '문서를 처리하지 못했어요. 파일을 확인하고 다시 시도해 주세요.',
  SNOWSIGN_EMBED_SESSION_ACTIVE: '이전 작성 화면이 아직 열려 있어요. 잠시 후 다시 시도해 주세요.',
  SNOWSIGN_ERROR: '전자서명 처리 중 문제가 생겼어요. 잠시 후 다시 시도해 주세요.',
  // ── 서비스/액션 오류 ──
  CONTRACT_BUSY: '다른 작업이 처리 중이에요. 잠시 후 다시 시도해 주세요.',
  // 뺏으려는 쪽이 본다 — 화면은 어디서 이어받는지 안내한다(이어받기 자체는 임베드 진입점 소유).
  SEND_HELD_BY_TEAMMATE: '다른 담당자가 계약서를 작성하고 있어요.',
  // 뺏긴 쪽이 본다. 뒷문장이 핵심이다 — 스노우싸인에 세션 취소 API 가 없어서
  // 그 사람 화면이 살아 있을 수 있고, 거기서 보내면 계약이 두 건 나간다.
  SEND_TAKEN_OVER: '다른 담당자가 이 계약서 작성을 이어받았어요. 이 화면에서는 발송하지 마세요.',
  CONTRACT_NOT_SENT: '계약서가 아직 발송되지 않았어요. 작성 화면에서 발송까지 마쳐주세요.',
  PROVIDER_CONTRACT_TAKEN: '이 계약서는 이미 다른 건에 연결돼 있어요. 화면을 새로고침해 주세요.',
  NOT_SENT: '아직 서명이 발송되기 전이에요.',
  REMIND_COOLDOWN: `리마인더는 ${REMIND_COOLDOWN_HOURS}시간에 한 번만 보낼 수 있어요. 잠시 기다렸다가 보내 주세요.`,
  ALREADY_SENT: '이미 계약서를 보냈어요. 화면을 새로고침해 주세요.',
  CONTRACT_CHANGED: '그 사이 계약 상태가 바뀌었어요. 화면을 새로고침해 주세요.',
  PERSIST_FAILED: '저장 중 문제가 생겼어요. 잠시 후 다시 시도해 주세요.',
  SIGNER_NOT_FOUND: '서명자 정보를 찾을 수 없어요.',
  CONTRACT_NOT_FOUND: '전자서명 정보를 찾을 수 없어요. 화면을 새로고침해 주세요.',
  FORBIDDEN: '권한이 없어요.',
  NOT_AWARDED: '아직 선정되지 않았어요.',
  BID_NOT_FOUND: '견적 정보를 찾을 수 없어요.',
  RFP_NOT_FOUND: '견적 요청 정보를 찾을 수 없어요.',
  // ── 템플릿 발송 경로 ──
  NO_LINKED_TEMPLATE: '연결된 계약서 템플릿이 없어요. 화면을 새로고침하고 계약서를 직접 올려 주세요.',
  TEMPLATE_NOT_FOUND: '계약서 템플릿을 찾을 수 없어요. 삭제됐다면 계약서를 직접 올려 주세요.',
  CONTACT_NOT_FOUND: '서명 담당자 연락처를 찾을 수 없어요. 담당자가 변경됐다면 계약서를 직접 올려 보내 주세요.',
  SEND_FAILED: '계약서를 보내지 못했어요. 잠시 후 다시 시도해 주세요.',
  // 에디터 저장 검증(`validateTemplateFields`)이 돌려주는 코드 — 서명칸 없는 템플릿은
  // 발송돼도 아무도 서명할 수 없어 서버가 거절한다. 등록 전에는 일반 폴백으로 떨어져
  // 사용자가 "무엇을 고쳐야 하는지"를 알 수 없었다.
  MISSING_SIGNABLE_FIELD: '구매사와 PG사 서명칸을 각각 1개 이상 배치해 주세요.',
  // 업로드 세션은 조직(API 키) 공유 자원이라 다른 회사 담당자가 올리는 중이어도
  // 여기 걸린다 — "당신이 뭘 잘못했다"로 읽히지 않게 원인을 밝히고 재시도를 안내한다.
  UPLOAD_SLOTS_BUSY: '지금은 계약서 업로드가 몰려 있어요. 잠시 후 다시 시도해 주세요.',
};

const GENERIC = '잠시 후 다시 시도해 주세요.';

/**
 * 서명 에러 코드를 친절한 한글 메시지로 옮긴다. 알려지지 않은 코드/undefined 는
 * fallback(호출 문맥 문구, 예: "리마인더를 보내지 못했어요")을 쓰고, 그것도 없으면 일반
 * 안내를 반환한다. **raw 코드는 절대 노출하지 않는다.**
 */
export function signingErrorMessage(code?: string, fallback?: string): string {
  // Object.hasOwn: 평범한 객체 인덱싱은 프로토타입 체인을 타서 'constructor'
  // 같은 코드가 함수를 반환한다 — React child 로 렌더되면 그대로 터진다.
  if (code && Object.hasOwn(SIGNING_ERROR_MESSAGES, code)) return SIGNING_ERROR_MESSAGES[code];
  return fallback ?? GENERIC;
}
