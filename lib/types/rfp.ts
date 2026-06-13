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
  // 오픈 RFP 게시판 노출 여부(opt-out). 기본 true. 구매사가 끄면 게시판에서 제외.
  boardVisible?: boolean;
  // 초대 PG에게 현재 카드 수수료(currentFeeRate)를 노출할지(opt-out). 기본 true.
  // false면 PG 견적 화면(RfpBriefPanel)에서만 숨김 — 구매사 비교 baseline은 유지.
  // undefined는 노출(true)로 취급한다.
  currentFeeVisibleToPg?: boolean;
  // 온보딩 샘플 RFP 여부. 목록·상세에서 '샘플' 칩 + 읽기전용 샌드박스를 구동.
  isSample?: boolean;
  // 계약 유형(선택사항). null이면 미표시.
  contractType?: 'new' | 'renewal' | null;
};
