import { z } from 'zod';
import type { BidDraft } from './bid-draft';
import {
  CONDITION_STATES,
  feeConditionKeys,
  type QuoteCondition,
  type QuoteTermsV2,
} from './terms';
import { isFlatFeeMethod, type PaymentMethod } from '@/lib/types/bid';

export const BidDraftSchema = z
  .object({
    __v: z.union([z.literal(3), z.literal(4)]),
    baseBidId: z.string().uuid().optional(),
    expectedRequoteDeadline: z.iso.datetime({ offset: true }).optional(),
    currentStep: z.number().int().min(1).max(4).optional(),
    cycleUnit: z.enum(['D', 'W', 'M']),
    cycleNum: z.string().max(20),
    settleLimit: z.string().max(20),
    guaranteeInsurance: z.string().max(20),
    signupFee: z.string().max(20),
    fees: z
      .record(z.string().max(100), z.string().max(20))
      .refine((v) => Object.keys(v).length <= 100),
    conditionStates: z
      .record(z.string().max(100), z.enum(CONDITION_STATES))
      .refine((v) => Object.keys(v).length <= 102)
      .optional(),
    memo: z.string().max(2000),
    proposalChoice: z.enum(['keep', 'replace', 'remove']).optional(),
    uploadedProposal: z
      .object({
        id: z.string().uuid(),
        name: z.string().max(255),
        size: z.number().nonnegative(),
      })
      .strict()
      .optional(),
    signingTemplateId: z.string().uuid().optional(),
    legacyZeroReviewed: z.boolean().optional(),
  })
  .strict();

export const DraftScopeSchema = z
  .object({
    rfpId: z.string().uuid(),
    userId: z.string().uuid(),
    workspaceId: z.string().uuid(),
    roundKey: z.union([z.literal('initial'), z.string().uuid()]),
  })
  .strict();
export type BidDraftScope = z.infer<typeof DraftScopeSchema>;
export type SavedBidDraft = {
  id: string;
  revision: number;
  updatedAt: string;
  content: BidDraft;
  submittedBidId: string | null;
};

export function draftQuoteTerms(
  draft: BidDraft,
  methods: PaymentMethod[],
  customIds: string[],
): QuoteTermsV2 {
  function condition(key: string, text: string, percent = false): QuoteCondition {
    const state = draft.conditionStates?.[key] ?? (text !== '' ? 'confirmed' : 'unset');
    if (state !== 'confirmed') return { state };
    // Invalid/blank confirmed inputs fail schema validation; never coerce '' to zero.
    const value = text.trim() === '' ? NaN : Number(text);
    return {
      state,
      value: percent ? Number((value / 100).toPrecision(15)) : value,
    };
  }
  return {
    _v: 2,
    signupFee: condition('signupFee', draft.signupFee),
    guaranteeInsurance: condition('guaranteeInsurance', draft.guaranteeInsurance),
    fees: Object.fromEntries(
      feeConditionKeys(methods, customIds).map((key) => [
        key,
        condition(key, draft.fees[key] ?? '', !isFlatFeeMethod(key as PaymentMethod)),
      ]),
    ),
  };
}
