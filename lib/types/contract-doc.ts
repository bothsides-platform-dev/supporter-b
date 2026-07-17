// 전자계약(e-contract) 도메인 타입 SSOT.
// 레거시 `lib/types/contract.ts`(선정 기록)와 별개 — 전자계약 문서 계열 전용.
// 스키마(contract_docs 등)·PDF 파이프라인(lib/server/contracts)·UI 가 공유한다.
import type { CustomPaymentMethod, MerchantTier, PaymentMethod, TierRates } from './bid';

export const CONTRACT_DOC_STATUSES = [
  'sent',
  'completed',
  'declined',
  'canceled',
  'expired',
] as const;
export type ContractDocStatus = (typeof CONTRACT_DOC_STATUSES)[number];

export const CONTRACT_PARTIES = ['buyer', 'pg'] as const;
export type ContractParty = (typeof CONTRACT_PARTIES)[number];

export type ContractSignatureMethod = 'draw' | 'type';

export const CONTRACT_DOC_EVENT_TYPES = [
  'sent',
  'viewed',
  'signed',
  'signer_reassigned',
  'completed',
  'declined',
  'canceled',
  'expired',
] as const;
export type ContractDocEventType = (typeof CONTRACT_DOC_EVENT_TYPES)[number];

// 이벤트 타임라인 한국어 라벨 — 감사추적 확인서(별지2)와 화면 타임라인이 공유.
export const CONTRACT_EVENT_LABELS: Record<ContractDocEventType, string> = {
  sent: '계약서 발송',
  viewed: '계약서 열람',
  signed: '서명 완료',
  signer_reassigned: '서명자 변경',
  completed: '계약 체결 완료',
  declined: '반려',
  canceled: '회수',
  expired: '기한 만료',
};

// 계약 당사자 정보 스냅샷 (발송 시점 고정). bizNo 는 미등록 워크스페이스면 null.
export type ContractPartyInfoV1 = {
  name: string;
  repName: string;
  bizNo: string | null;
};

export type ContractPartiesV1 = {
  _v: 1;
  buyer: ContractPartyInfoV1;
  pg: ContractPartyInfoV1;
};

// 선정 견적 조건 스냅샷 (발송 시점 고정) — [별지1] 계약 개요의 데이터 소스.
// paymentFees 값 단위는 lib/types/bid.ts 의 Bid.paymentFees 계약과 동일.
export type ContractTermsSnapshotV1 = {
  _v: 1;
  rfpCode: string;
  rfpTitle: string;
  settleCycle: string;
  settleLimit: number;
  guaranteeInsurance: number;
  paymentFees: Partial<Record<PaymentMethod, number | TierRates>>;
  customFees: Record<string, number>;
  customPaymentMethods: CustomPaymentMethod[];
  buyerTier: MerchantTier | null;
};

export type ContractDoc = {
  id: string;
  code: string;
  rfpId: string;
  bidId: string;
  buyerWsId: string;
  pgWsId: string;
  templateId: string | null;
  status: ContractDocStatus;
  title: string;
  parties: ContractPartiesV1;
  termsSnapshot: ContractTermsSnapshotV1;
  basePdfKey: string;
  basePdfSha256: string;
  basePdfSize: number;
  finalPdfKey: string | null;
  finalPdfSha256: string | null;
  finalPdfSize: number | null;
  declineReason: string | null;
  createdBy: string;
  sentAt: string;
  expiresAt: string;
  completedAt: string | null;
  declinedAt: string | null;
  canceledAt: string | null;
  updatedAt: string;
};

// 서명 이미지 bytea 는 도메인 타입에 싣지 않는다 — 리포의 전용 조회로만 접근
// (목록/상세 페이로드에 수십 KB 바이너리가 실리는 것을 차단).
export type ContractDocSigner = {
  id: string;
  docId: string;
  party: ContractParty;
  userId: string;
  name: string;
  email: string;
  consentAt: string | null;
  consentTextVersion: string | null;
  signedAt: string | null;
  signatureMethod: ContractSignatureMethod | null;
  signIp: string | null;
  signUserAgent: string | null;
  reassignedBy: string | null;
  reassignedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type ContractDocEvent = {
  id: string;
  docId: string;
  type: ContractDocEventType;
  actorUserId: string | null;
  actorParty: ContractParty | null;
  ip: string | null;
  userAgent: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
};

export type ContractTemplate = {
  id: string;
  pgWsId: string;
  name: string;
  description: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  // attachments arc 조인 결과 (ready 첨부가 없으면 null — 발송 불가 상태).
  attachment: { id: string; name: string; size: number } | null;
};

// ── 상수 (서비스·UI·PDF 공유) ────────────────────────────────────────────────

export const MAX_CONTRACT_TEMPLATES = 20;

export const CONTRACT_DEFAULT_EXPIRES_DAYS = 14;
export const CONTRACT_MIN_EXPIRES_DAYS = 1;
export const CONTRACT_MAX_EXPIRES_DAYS = 90;

// 템플릿 PDF 상한 — compose 비용 폭주 방지 (플랜 §4).
export const CONTRACT_TEMPLATE_MAX_PAGES = 60;

// 서명 PNG dataURL 디코드 후 서버 상한 (서버액션 바디 1MB 이내 방어).
export const CONTRACT_SIGNATURE_IMAGE_MAX_BYTES = 512 * 1024;

// 전자서명 동의 문구 — 서명 시 체크 필수. 버전 문자열을 signer 행에 함께 저장해
// "무엇에 동의했는지"의 불변 증거를 남긴다(전자서명법 §3② 당사자 약정 + 체결 권한 확인).
// 문구 개정 시 버전을 올리고 이전 문구를 보존한다.
export const CONTRACT_CONSENT_TEXT_VERSION = 'v1' as const;
export const CONTRACT_CONSENT_TEXTS: Record<string, string> = {
  v1: '본인은 계약서 내용을 모두 확인했으며, 전자서명법 제3조에 따라 이 전자서명이 서명·기명날인으로서의 효력을 가진다는 데 동의합니다. 또한 본인은 소속 회사를 대표하거나 적법하게 위임받아 본 계약을 체결할 정당한 권한이 있음을 확인합니다.',
};

// 문서 각 페이지 하단 각인 문구 (간인 대체 — 문서 연속성 표시).
export const CONTRACT_FOOTER_BRAND = '서포트비 전자계약';
