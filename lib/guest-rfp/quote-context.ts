import { z } from 'zod';
import { assistResultSchema } from './suggestions';
import { quoteSavingsSchema } from './quote-savings';

export const quoteContextSchema = z.object({
  version: z.literal(1),
  stage: z.enum(['business', 'website', 'review', 'questions', 'complete']),
  bizNo: z.string().max(10).regex(/^\d*$/),
  companyName: z.string().max(100),
  confirmed: z.array(z.string().max(40)).max(30),
  userFields: z.array(z.string().max(40)).max(30),
  analysisState: z.enum(['idle', 'pending', 'complete', 'partial', 'manual']),
  businessResult: assistResultSchema.optional(),
  websiteResult: assistResultSchema.optional(),
  analyzedWebsite: z.string().max(500).optional(),
  rejectedFields: z.array(z.string().max(40)).max(10).optional(),
  generatedTitle: z.string().max(200).optional(),
  savings: quoteSavingsSchema.optional(),
}).strict();
export type QuoteContext = z.infer<typeof quoteContextSchema>;
export const newQuoteContext = (): QuoteContext => ({
  version: 1, stage: 'business', bizNo: '', companyName: '', confirmed: [], userFields: [], analysisState: 'idle',
});
