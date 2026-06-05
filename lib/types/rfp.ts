import type { Attachment } from './common';
import type { BizProfile } from './biz-profile';
import type { CustomPaymentMethod, PaymentMethod } from './bid';

export type RfpStatus = 'draft' | 'sent' | 'closed' | 'cancelled' | 'awarded';

export type RFP = {
  // Surrogate uuid (PK). FKs reference this. Use `code` for URLs/display.
  id: string;
  // Human-facing RFP number P-YYMM-NNNN (unique).
  code: string;
  buyerWsId: string;
  bizProfile?: BizProfile;
  title: string;
  memo: string;
  websiteUrl?: string;
  mainProducts?: string;
  annualPgVolume?: string;
  currentFeeRate?: string;
  currentSettlementLimit?: string;
  currentGuaranteeInsurance?: string;
  currentSettlementCycle?: string;
  deliveryServicePeriod?: string;
  currentSolution?: string;
  currentSolutionDetail?: string;
  rfpFiles: Attachment[];
  allowedPgWorkspaceIds: string[];
  deadline: string;
  status: RfpStatus;
  awardedBidId?: string;
  createdBy: string;
  createdAt: string;
  sentAt?: string;
  // Unified kanban (buyer pipeline board): explicit custom-column placement;
  // null/undefined ⇒ classifier-derived lifecycle column.
  boardColumnId?: string | null;
  // 구매사가 요청한 결제수단 목록. PG사는 이 수단만 견적. 빈 배열 = 제한 없음.
  requiredPaymentMethods: PaymentMethod[];
  // 구매사 직접입력 커스텀 결제수단 (id + 라벨). PG는 id로 customFees 제출.
  customPaymentMethods: CustomPaymentMethod[];
  // RFP-scoped permanent share token (raw). Populated by the repo layer; only
  // surfaced server-side for the buyer's detail page → never serialised to PG
  // clients. Optional on type so PG-side renders that omit it stay sound.
  shareToken?: string;
  // 오픈 RFP 게시판 노출 여부(opt-out). 기본 true. 구매사가 끄면 게시판에서 제외.
  boardVisible?: boolean;
};
