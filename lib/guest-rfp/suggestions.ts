import { z } from 'zod';
import { SOLUTION_VALUES } from '@/lib/types/rfp-terms';
import { productInfoSchema } from '@/lib/rfp/product-info';
const evidence = {
  source: z.enum(['business', 'rules', 'ai']),
  sourceUrl: z.string().url().max(500).refine(value => /^https?:\/\//i.test(value)).optional(),
  evidence: z.string().trim().min(1).max(500),
};
export const suggestionSchema = z.discriminatedUnion('field', [
  z.object({ ...evidence, field: z.literal('companyName'), value: z.string().trim().min(1).max(100) }).strict(),
  z.object({ ...evidence, field: z.literal('mainProducts'), value: z.string().trim().min(1).max(200) }).strict(),
  z.object({ ...evidence, field: z.literal('industryGroupId'), value: z.string().uuid() }).strict(),
  z.object({ ...evidence, field: z.literal('currentSolution'), value: z.enum(SOLUTION_VALUES) }).strict(),
  z.object({ ...evidence, field: z.literal('deliveryServicePeriod'), value: z.string().trim().min(1).max(100) }).strict(),
  z.object({ ...evidence, field: z.literal('hasMarketplaceSellers'), value: z.boolean() }).strict(),
  z.object({ ...evidence, field: z.literal('cashConvertible'), value: z.boolean() }).strict(),
  z.object({ ...evidence, field: z.literal('salesMethods'), value: productInfoSchema.shape.salesMethods }).strict(),
]);
export type Suggestion = z.infer<typeof suggestionSchema>;
export const assistResultSchema = z.object({
  status: z.enum(['complete', 'partial', 'manual']),
  suggestions: z.array(suggestionSchema).max(10),
  needsConfirmation: z.array(z.string().max(40)).max(15),
  business: z.object({
    bizNo: z.string().regex(/^\d{10}$/),
    status: z.enum(['active', 'suspended', 'closed']).optional(),
    taxType: z.enum(['general', 'simple', 'exempt']).optional(),
  }).strict().optional(),
}).strict();
export type AssistResult = z.infer<typeof assistResultSchema>;
export const manualResult = (): AssistResult => ({ status: 'manual', suggestions: [], needsConfirmation: [] });

