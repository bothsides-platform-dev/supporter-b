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
// In mock/v0 the canonical value lives in lib/stores/bid-board.ts; the field
// here is the eventual DB-backed source after M8 (BACKEND_MIGRATION.md).
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
  proposalPdf: Attachment;
  memo?: string;
  status: 'draft' | 'submitted' | 'withdrawn';
  submittedBy: string;
  submittedAt?: string;
  // optional until M8 schema migration adds bids.buyer_stage
  buyerStage?: BuyerStage;
};
