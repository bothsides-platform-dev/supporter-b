'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { requirePgActor } from './_session';
import { getBidDraftService } from '@/lib/server/services/bid-draft';
import { getBidService } from '@/lib/server/services/bid';
import { getRfpRepo } from '@/lib/server/repositories/factory';
import {
  BidDraftSchema,
  DraftScopeSchema,
  draftQuoteTerms,
  type BidDraftScope,
} from '@/lib/quote/draft-schema';
import type { BidDraft } from '@/lib/quote/bid-draft';
import { QuoteTermsSchema, projectQuoteTerms, validateSubmissionTerms } from '@/lib/quote/terms';
import { PAYMENT_METHODS } from '@/lib/types/bid';
import { SETTLE_CYCLE_RE, SETTLE_LIMIT_MIN } from '@/lib/utils/settle-cycle';

async function authorize(scope: BidDraftScope) {
  const actor = await requirePgActor();
  if (!actor.ok) return actor;
  if (
    !DraftScopeSchema.safeParse(scope).success ||
    actor.userId !== scope.userId ||
    actor.workspaceId !== scope.workspaceId
  )
    return { ok: false as const, error: 'SESSION_CHANGED' };
  return actor;
}
const Revision = z.number().int().nonnegative().max(2_000_000_000);

export async function loadBidDraftAction(scope: BidDraftScope) {
  const actor = await authorize(scope);
  if (!actor.ok) return actor;
  const result = await (await getBidDraftService()).load(scope);
  return {
    ...result,
    quoteV2WriteEnabled: process.env.PG_QUOTE_V2_WRITE_ENABLED === 'true',
  };
}
export async function listBidDraftsAction(scope: BidDraftScope) {
  const actor = await authorize(scope);
  if (!actor.ok) return actor;
  return (await getBidDraftService()).list(scope);
}
export async function saveBidDraftAction(
  scope: BidDraftScope,
  content: BidDraft,
  expectedRevision: number,
) {
  const actor = await authorize(scope);
  if (!actor.ok) return actor;
  if (!Revision.safeParse(expectedRevision).success || !BidDraftSchema.safeParse(content).success)
    return { ok: false as const, error: 'INVALID_INPUT' };
  try {
    const result = await (await getBidDraftService()).save(scope, content, expectedRevision);
    if (result.ok && expectedRevision === 0) revalidatePath('/inbox', 'page');
    if (!result.ok && result.error === 'DRAFT_CONFLICT')
      console.warn('bid_draft.revision_conflict');
    return result;
  } catch {
    console.warn('bid_draft.save_failed');
    return { ok: false as const, error: 'DRAFT_SAVE_FAILED' };
  }
}
export async function deleteBidDraftAction(scope: BidDraftScope, expectedRevision: number) {
  const actor = await authorize(scope);
  if (!actor.ok) return actor;
  if (!Revision.safeParse(expectedRevision).success)
    return { ok: false as const, error: 'INVALID_INPUT' };
  const result = await (await getBidDraftService()).remove(scope, expectedRevision);
  if (result.ok) revalidatePath('/inbox');
  return result;
}

/** Submit the saved snapshot. An untrusted client never supplies another snapshot for the same revision. */
export async function submitBidDraftAction(scope: BidDraftScope, expectedRevision: number) {
  const actor = await authorize(scope);
  if (!actor.ok) return actor;
  if (!Revision.safeParse(expectedRevision).success)
    return { ok: false as const, error: 'INVALID_INPUT' };
  const loaded = await (await getBidDraftService()).load(scope);
  if (!loaded.ok) return loaded;
  const draft = loaded.draft;
  if (!draft || draft.revision !== expectedRevision)
    return { ok: false as const, error: 'DRAFT_CONFLICT' };
  if (draft.submittedBidId) return { ok: true as const, bidId: draft.submittedBidId };
  if (process.env.PG_QUOTE_V2_WRITE_ENABLED !== 'true')
    return { ok: false as const, error: 'QUOTE_V2_DISABLED' };
  const content = draft.content;
  if (content.__v === 3 && !content.legacyZeroReviewed)
    return { ok: false as const, error: 'LEGACY_REVIEW_REQUIRED' };
  const rfp = await (await getRfpRepo()).findById(scope.rfpId);
  if (!rfp) return { ok: false as const, error: 'NOT_AVAILABLE' };
  const terms = QuoteTermsSchema.safeParse(
    draftQuoteTerms(
      content,
      rfp.requiredPaymentMethods.length ? rfp.requiredPaymentMethods : [...PAYMENT_METHODS],
      rfp.customPaymentMethods.map((c) => c.id),
    ),
  );
  const cycle = `${content.cycleUnit}+${content.cycleNum}`;
  if (
    !terms.success ||
    !validateSubmissionTerms(
      terms.data,
      rfp.requiredPaymentMethods,
      rfp.customPaymentMethods.map((c) => c.id),
    ) ||
    !SETTLE_CYCLE_RE.test(cycle) ||
    !Number.isFinite(Number(content.settleLimit)) ||
    Number(content.settleLimit) <= SETTLE_LIMIT_MIN ||
    Number(content.settleLimit) > 999_999_999_999
  )
    return { ok: false as const, error: 'INVALID_INPUT' };
  const result = await (
    await getBidService()
  ).submit(
    {
      rfpId: scope.rfpId,
      settleCycle: cycle,
      settleLimit: Number(content.settleLimit),
      ...projectQuoteTerms(terms.data),
      quoteTerms: terms.data,
      expectedRequoteId: scope.roundKey === 'initial' ? undefined : scope.roundKey,
      expectedRequoteDeadline: content.expectedRequoteDeadline,
      baseBidId: content.baseBidId,
      memo: content.memo,
      proposalAttachmentId:
        content.proposalChoice === 'replace' ? content.uploadedProposal?.id : undefined,
      reuseProposal: content.proposalChoice === 'keep',
      signingTemplateId: content.signingTemplateId,
      draft: { scope, revision: expectedRevision },
    },
    actor,
  );
  if (result.ok) {
    revalidatePath('/inbox');
    revalidatePath(`/inbox/${result.rfpCode}`);
  } else console.warn('bid_draft.submit_failed', result.error);
  return result;
}
