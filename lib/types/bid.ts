import type { Attachment } from './common';
import type { MerchantGrade } from './biz-profile';

export type SettlementCycle = 'D+0' | 'D+1' | 'D+2' | 'weekly' | 'monthly';
export type CardIssuer =
  | 'BC' | 'SHINHAN' | 'SAMSUNG' | 'HYUNDAI' | 'KB'
  | 'LOTTE' | 'NH' | 'HANA' | 'WOORI';

export const STATUTORY_CARD_FEE: Record<MerchantGrade, number> = {
  small: 0.005,
  sme1: 0.011,
  sme2: 0.0125,
  sme3: 0.015,
  general: Number.NaN,
};

// Buyer-side kanban classification. Independent of `Bid.status` (PG lifecycle).
// DB-backed from Stage 3 onward — bids.buyer_stage (default 'pending').
export type BuyerStage = 'pending' | 'negotiating' | 'decided';

export const BUYER_STAGE_ORDER: readonly BuyerStage[] = [
  'pending',
  'negotiating',
  'decided',
] as const;

export const BUYER_STAGE_LABEL: Record<BuyerStage, string> = {
  pending: '진행전',
  negotiating: '협상중',
  decided: '결정',
};

export type Bid = {
  id: string;
  rfpId: string;
  pgWsId: string;
  invitationId: string;
  settleCycle: SettlementCycle;
  deposit: number;
  setupFee: number;
  monthlyMin: number;
  bankTransferFeePct: number;
  easyPayFeePct: number;
  cardFeesByIssuer?: Record<CardIssuer, number>;
  overseasCardFeePct?: number;
  // 제안서 첨부 — bid당 여러 개 가능(attachments.bid_id 1..N). 없으면 빈 배열.
  proposalPdfs: Attachment[];
  memo?: string;
  status: 'draft' | 'submitted' | 'withdrawn';
  submittedBy: string;
  submittedAt?: string;
  buyerStage: BuyerStage;
};
