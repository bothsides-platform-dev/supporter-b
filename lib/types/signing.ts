// 전자서명(SnowSign Templates) 도메인 타입 — provider 중립 표현.
// DB 접근은 lib/server/repositories/** 가 소유하고, 앱 계층은 이 타입만 본다.

export type SigningContractStatus =
  | 'awaiting_pg_template' // award 됨 — PG 가 계약서를 고르고 보내기 전까지 대기
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

/**
 * PG가 자사 계약서를 SnowSign 템플릿으로 1회 등록해 워크스페이스에 링크한 것.
 * `roleMapping`: SnowSign 템플릿 역할명(`role_name`) → buyer/pg.
 * `variableMapping`: SnowSign 템플릿 변수명 → 낙찰 bid/RFP 소스 경로.
 *
 * "기본 템플릿" 플래그는 없다 — 어떤 계약서를 쓸지는 견적별로 고르고
 * 발송 직전 딜룸에서 PG가 확정한다.
 */
export type PgSigningTemplate = {
  id: string;
  workspaceId: string; // PG 워크스페이스 — org 스코핑의 소유자
  snowsignTemplateId: string;
  name: string;
  roleMapping: Record<string, SigningParticipantRole>;
  variableMapping: Record<string, string>;
  createdBy: string;
  createdAt: string; // ISO 8601
};

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

/**
 * 계약서 선택기에 내려주는 템플릿 요약 — 이름과 id 뿐(역할·변수 매핑, provider id 비노출).
 * 서버 로더 · 딜룸 뷰모델 · 견적 위저드가 공유하는 단일 출처.
 */
export type SigningTemplateOption = { id: string; name: string };

/** 딜룸 UI 로 내려주는 직렬화 가능한 서명 상태 뷰(계약 + 참여자). */
export type SigningView = {
  contract: SigningContract;
  participants: SigningParticipant[];
};
