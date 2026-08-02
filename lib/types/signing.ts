// 전자서명(SnowSign Templates) 도메인 타입 — provider 중립 표현.
// DB 접근은 lib/server/repositories/** 가 소유하고, 앱 계층은 이 타입만 본다.

export type SigningContractStatus =
  | 'awaiting_pg_template' // award 됨 — PG 가 계약서를 올려 보내기 전까지 대기
  | 'sent' // SnowSign 계약 생성·발송 완료, 서명 대기
  | 'in_progress' // 일부 참여자 서명
  | 'completed' // 전원 서명
  | 'declined' // 참여자 거절
  | 'expired' // 마감 초과
  | 'canceled' // 취소
  // 레거시 전용 — 이 상태를 **쓰는 코드는 더 이상 없다**. 예전엔 award 시 자동 발송이
  // 실패하면 여기 기록했지만, 이제 발송 실패는 계약을 awaiting 에 남기고 클레임만 푼다
  // (`releaseSendClaim`). 프로덕션에 남아 있는 옛 행을 딜룸이 그리기 위해 유지한다.
  | 'send_failed';

export type SigningParticipantRole = 'buyer' | 'pg';

export type SigningSecurityMethod = 'easy_cert' | 'email';

export type SigningParticipantStatus = 'pending' | 'viewed' | 'signed' | 'rejected';

/** 선정 후 전자서명 계약 1건. 레거시 award 기록(`contracts`)과 별개. */
export type SigningContract = {
  id: string;
  rfpId: string;
  providerRef?: string; // SnowSign contract_id
  snowsignTemplateId?: string;
  status: SigningContractStatus;
  round: number;
  deadlineDays?: number;
  expiresAt?: string; // ISO 8601
  lastPolledAt?: string; // ISO 8601
  createdBy: string;
  createdAt: string; // ISO 8601
  sentAt?: string;
  completedAt?: string;
  canceledAt?: string;
  cancelReason?: string;
};

export type SigningParticipant = {
  id: string;
  contractId: string;
  userId?: string;
  name: string;
  email: string;
  phone?: string;
  role: SigningParticipantRole;
  securityMethod: SigningSecurityMethod;
  status: SigningParticipantStatus;
  signedAt?: string; // ISO 8601
  providerParticipantRef?: string;
};

/** signing_contracts 의 가변 필드 부분 갱신(폴링/전이). */
export type SigningContractPatch = Partial<
  Pick<
    SigningContract,
    | 'providerRef'
    | 'snowsignTemplateId'
    | 'status'
    | 'deadlineDays'
    | 'expiresAt'
    | 'lastPolledAt'
    | 'sentAt'
    | 'completedAt'
    | 'canceledAt'
    | 'cancelReason'
  >
>;

export type SigningParticipantPatch = Partial<
  Pick<
    SigningParticipant,
    'status' | 'signedAt' | 'providerParticipantRef' | 'phone' | 'securityMethod'
  >
>;

/** 딜룸 UI 로 내려주는 직렬화 가능한 서명 상태 뷰(계약 + 참여자). */
export type SigningView = {
  contract: SigningContract;
  participants: SigningParticipant[];
};

/**
 * 고아 복구 후보 — 발송은 됐는데 완료 postMessage 유실로 우리가 못 받아 적은 계약.
 *
 * **PG 에게만 간다.** 필터를 통과한 계약은 정의상 이 PG 가 이미 당사자인 계약이라
 * 아래 필드는 새 정보를 주지 않는다. 참여자 이메일과 provider status 는 **의도적으로
 * 빼놨다** — 매칭된 두 주소는 PG 가 이미 알고, 그 밖의 수신자(구매사 법무 등)는
 * 확인하는 담당자가 볼 권한이 없을 수 있다. 키 목록은 드리프트 가드 테스트가 고정한다.
 */
export type SigningRecoveryCandidate = {
  /** 확인 시 서버로 보내는 값. 화면에 텍스트로 렌더하지 않는다. */
  providerContractId: string;
  title: string;
  sentAt?: string;
  createdAt?: string;
  participantCount: number;
};
