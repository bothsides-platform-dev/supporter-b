import { z } from 'zod';
import { defineAsyncSingleton } from '@/lib/server/_singleton';
import { getGuestDraftService } from './guest-drafts';
import { getPgMatchingRepo, getAgreementRepo } from '@/lib/server/repositories/factory';
import { calculateQuoteSavings, provisionalTier, type SavingsResult } from '@/lib/server/quote-assist/savings';
import { industrySelectionSchema } from '@/lib/rfp/industry-selection';
import { logger } from '@/lib/observability/logger';
export const savingsRequestSchema = z.object({
  id: z.string().uuid(), revision: z.number().int().min(1),
  annualRevenue: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER).optional(),
  annualCardVolume: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER).optional(),
  currentFeeVat: z.enum(['included', 'excluded']).optional(),
  pgId: z.string().uuid().optional(),
}).strict();
export type QuoteSavingsRequest = z.infer<typeof savingsRequestSchema>;
export type QuoteSavingsResponse = { result: SavingsResult; candidates: { id: string; name: string }[] };
async function dependencies() {
  const [drafts, matching, agreement] = await Promise.all([getGuestDraftService(), getPgMatchingRepo(), getAgreementRepo()]);
  return { drafts, matching, agreement };
}
export class QuoteSavingsService {
  constructor(private readonly deps: Awaited<ReturnType<typeof dependencies>>) {}
  async calculate(raw: QuoteSavingsRequest, secret: string): Promise<QuoteSavingsResponse> {
    const output = await this.calculateChecked(raw, secret);
    const result = output.result;
    logger.info('guest_quote_savings', { draftId: raw.id, revision: raw.revision, status: result.status,
      ...(result.status === 'unavailable' ? { reason: result.reason } : { pgId: result.pgId, tier: result.provisionalTier, proposedPercent: result.proposedPercent }) });
    return output;
  }
  private async calculateChecked(raw: QuoteSavingsRequest, secret: string): Promise<QuoteSavingsResponse> {
    const input = savingsRequestSchema.parse(raw);
    const draft = await this.deps.drafts.readPublic(input.id, secret);
    if (draft.revision !== input.revision) throw new Error('GUEST_DRAFT_CHANGED');
    const unavailable = (reason: 'inputs' | 'rates' = 'rates'): QuoteSavingsResponse => ({ candidates: [], result: { status: 'unavailable', reason } });
    const answers = draft.answers;
    const selection = industrySelectionSchema.safeParse(answers.industryMode === 'custom'
      ? { customIndustryName: answers.customIndustryName } : { industryGroupId: answers.industryGroupId });
    if (!selection.success || !answers.contractType) return unavailable('inputs');
    const resolved = await this.deps.matching.resolveIndustry(selection.data);
    const tier = input.annualRevenue === undefined ? undefined : provisionalTier(input.annualRevenue);
    const recommendation = await this.deps.matching.recommendation(resolved.groupId, [], undefined, false,
      resolved.customName, undefined, answers.contractType === 'renewal' ? answers.currentPgs ?? [] : [], tier);
    const candidates = recommendation.candidates.map(c => ({ id: c.pgWorkspaceId, name: c.name }));
    const candidate = input.pgId ? recommendation.candidates.find(c => c.pgWorkspaceId === input.pgId) : recommendation.candidates[0];
    if (!candidate || !tier) return { ...unavailable(tier ? 'rates' : 'inputs'), candidates };
    const rates = answers.contractType === 'new' ? await this.deps.agreement.findRates(candidate.pgWorkspaceId) : undefined;
    // Contract standard rates are fractions, excluding VAT. Matching policy rates
    // are percentages; a note must explicitly establish their VAT basis.
    const excludes = /부가세\s*별도|VAT\s*(?:별도|excluded)/i.test(candidate.feeNote);
    const includes = /부가세\s*포함|VAT\s*(?:포함|included)/i.test(candidate.feeNote);
    const proposedPercent = candidate.feeRate === null || excludes === includes ? null
      : Number((candidate.feeRate / (includes ? 1.1 : 1)).toFixed(12));
    const result = calculateQuoteSavings({
      contractType: answers.contractType, annualRevenue: input.annualRevenue, annualCardVolume: input.annualCardVolume,
      currentFeePercent: answers.currentFeeRate?.trim() ? Number(answers.currentFeeRate) : undefined,
      currentFeeVat: input.currentFeeVat,
    }, { pgId: candidate.pgWorkspaceId, pgName: candidate.name, proposedPercent,
      standardFraction: rates?.rates.find(r => r.key === 'card:' + tier)?.rate, feeNote: candidate.feeNote });
    return { candidates, result };
  }
}
export const { get: getQuoteSavingsService } = defineAsyncSingleton('quote_savings', 'service', async () => new QuoteSavingsService(await dependencies()));

