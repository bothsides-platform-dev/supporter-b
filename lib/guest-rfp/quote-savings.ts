import { z } from 'zod';
import { MERCHANT_TIERS } from '@/lib/types/bid';
export const savingsResultSchema = z.union([
  z.object({ status: z.literal('unavailable'), reason: z.enum(['inputs', 'rates']) }).strict(),
  z.object({
    status: z.enum(['calculated', 'no_saving']), annual: z.number().finite(), monthly: z.number().finite(),
    provisionalTier: z.enum(MERCHANT_TIERS), revenueIsEstimate: z.boolean(),
    annualCardVolume: z.number().nonnegative(), baselinePercent: z.number().min(0).max(100),
    proposedPercent: z.number().min(0).max(100), vat: z.literal('excluded'),
    pgId: z.string().max(100), pgName: z.string().max(200), feeNote: z.string().max(2000),
  }).strict(),
]);
export const quoteSavingsResponseSchema = z.object({
  result: savingsResultSchema, candidates: z.array(z.object({ id: z.string().max(100), name: z.string().max(200) })).max(100),
});
export const quoteSavingsSchema = z.object({
  annualRevenue: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER).optional(),
  annualCardVolume: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER).optional(),
  currentFeeVat: z.enum(['included', 'excluded']).optional(),
  pgId: z.string().max(100).optional(),
  response: quoteSavingsResponseSchema.optional(), inputKey: z.string().max(4000).optional(),
}).strict();
export type QuoteSavings = z.infer<typeof quoteSavingsSchema>;
export type QuoteSavingsResponse = z.infer<typeof quoteSavingsResponseSchema>;
