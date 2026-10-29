import { createHash } from 'node:crypto';
import { defineAsyncSingleton } from '@/lib/server/_singleton';
import { getDb, getGuestDraftRepo, getQuoteAssistRepo, getGuestRfpRepo } from '@/lib/server/repositories/factory';
import { lookupQuoteBusiness, supplementQuoteWithAi } from '@/lib/server/quote-assist/providers';
import { collectPublicWebsite } from '@/lib/server/quote-assist/website';
import { extractWebsiteSuggestions } from '@/lib/server/quote-assist/extraction';
import { manualResult } from '@/lib/guest-rfp/suggestions';
import { logger } from '@/lib/observability/logger';
import type { Tx } from '@/lib/server/repositories/types';
import { assertPublicDraft } from './guest-drafts';
import { assistResultSchema, type AssistResult } from '@/lib/guest-rfp/suggestions';
export type QuoteAssistInput = { id: string; revision: number; kind: 'business' | 'website'; input: string; retry?: string };
const hash = (value: string) => createHash('sha256').update(value).digest('hex');
const key = (input: QuoteAssistInput) => ({ draftId: input.id, kind: input.kind, inputHash: hash(JSON.stringify([input.input, input.retry ?? ''])) });
async function dependencies() {
  const [db, drafts, calls] = await Promise.all([getDb(), getGuestDraftRepo(), getQuoteAssistRepo()]);
  return { db, drafts, calls };
}
export class QuoteAssistService {
  constructor(private readonly deps: Awaited<ReturnType<typeof dependencies>>) {}
  async analyze(input: QuoteAssistInput, secret: string, ip: string): Promise<AssistResult> {
    const claim = await this.claim(input, secret, ip);
    if (claim.status === 'cached') return claim.result;
    if (claim.status !== 'claimed') return manualResult();
    let result = manualResult(), cost: number | undefined;
    let aiStatus = 'skipped';
    try {
      const groups = await (await getGuestRfpRepo()).industries();
      if (input.kind === 'business') {
        const lookup = await lookupQuoteBusiness(input.input, groups);
        cost = lookup.cost;
        const { cost: _cost, ...projection } = lookup;
        result = projection;
      }
      else {
        const pages = await collectPublicWebsite(input.input);
        const rules = extractWebsiteSuggestions(pages, groups);
        const ai = await supplementQuoteWithAi(pages, groups);
        aiStatus = ai.status; cost = ai.cost;
        const suggestions = [...rules, ...ai.suggestions.filter(s => !rules.some(r => r.field === s.field))];
        result = { status: !suggestions.length ? 'manual' : ai.status === 'complete' ? 'complete' : 'partial',
          suggestions, needsConfirmation: suggestions.map(s => s.field) };
      }
    } catch { /* Optional enrichment never invalidates the draft or earlier results. */ }
    await this.finish(input, secret, result, cost);
    logger.info('guest_quote_analysis', { draftId: input.id, kind: input.kind, status: result.status, aiStatus, cost, suggestionCount: result.suggestions.length });
    return result;
  }
  async claim(input: QuoteAssistInput, secret: string, ip: string, now = new Date()) {
    return this.deps.db.transaction(async (tx: Tx) => {
      const row = await this.deps.drafts.lock(input.id, tx);
      assertPublicDraft(row, secret, now);
      await this.deps.drafts.assertEditable(input.id, tx);
      if (row.revision !== input.revision) throw new Error('GUEST_DRAFT_CHANGED');
      if ((input.kind === 'business' ? row.answers.quoteContext?.bizNo : row.answers.data.websiteUrl) !== input.input)
        throw new Error('GUEST_INPUT_CHANGED');
      return this.deps.calls.claim(key(input), hash(ip + ':' + Math.floor(now.getTime() / 3600000)), now, tx);
    });
  }
  async finish(input: QuoteAssistInput, secret: string, result: AssistResult, cost?: number) {
    await this.deps.db.transaction(async (tx: Tx) => {
      assertPublicDraft(await this.deps.drafts.lock(input.id, tx), secret);
      await this.deps.calls.finish(key(input), assistResultSchema.parse(result), cost, tx);
    });
  }
}
export const { get: getQuoteAssistService } = defineAsyncSingleton('quote_assist', 'service', async () => new QuoteAssistService(await dependencies()));

