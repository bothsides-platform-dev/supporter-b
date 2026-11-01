import { defineAsyncSingleton } from '@/lib/server/_singleton';
import type { DrizzleBidDraftRepository } from '@/lib/server/repositories/drizzle/bid-draft';
import type {
  AttachmentRepo,
  BidRepo,
  InvitationRepo,
  RfpRepo,
  RfpRequoteRequestRepo,
  Tx,
} from '@/lib/server/repositories/types';
import type { BidDraftScope } from '@/lib/quote/draft-schema';
import { BidDraftSchema } from '@/lib/quote/draft-schema';
import type { BidDraft } from '@/lib/quote/bid-draft';
import { resolveBidSubmissionRound } from '@/lib/rfp/bid-window';
import { matchingBidReview, type MatchingBidRepo } from './pg-matching';

export class BidDraftService {
  constructor(
    private readonly db: Tx,
    private readonly drafts: DrizzleBidDraftRepository,
    private readonly invitations: InvitationRepo,
    private readonly rfps: RfpRepo,
    private readonly bids: BidRepo,
    private readonly requotes: RfpRequoteRequestRepo,
    private readonly attachments: AttachmentRepo,
    private readonly matching: MatchingBidRepo,
  ) {}

  private async context(scope: BidDraftScope, tx: Tx = this.db, lock = false) {
    const rfp = lock
      ? await this.rfps.findByIdForUpdate(scope.rfpId, tx)
      : await this.rfps.findById(scope.rfpId, tx);
    if (!rfp || !(await this.invitations.canAccess(scope.rfpId, scope.workspaceId, tx)))
      return null;
    const maxRound = await this.bids.findMaxRoundByRfpAndPg(scope.rfpId, scope.workspaceId, tx);
    const pending = await this.requotes.findPendingByPair(scope.rfpId, scope.workspaceId, tx);
    const review = await matchingBidReview(scope.rfpId, scope.workspaceId, tx, this.matching);
    const window = resolveBidSubmissionRound({
      rfp,
      maxRound,
      pendingRequoteDeadline: pending?.deadline,
    });
    return {
      readOnly:
        !window.ok || !review.ok || scope.roundKey !== (maxRound > 0 ? pending?.id : 'initial'),
    };
  }

  async validAttachment(content: BidDraft, scope: BidDraftScope, tx: Tx = this.db) {
    if (!content.uploadedProposal) return true;
    const a = await this.attachments.findById(content.uploadedProposal.id, tx);
    return (
      !!a &&
      a.uploadedBy === scope.userId &&
      a.uploadWorkspaceId === scope.workspaceId &&
      a.status === 'ready' &&
      a.mimeType === 'application/pdf' &&
      !a.rfpId &&
      !a.bidId &&
      !a.bidNoteId &&
      !a.chatMessageId &&
      !a.rfpTeamMessageId
    );
  }

  async load(scope: BidDraftScope) {
    const context = await this.context(scope);
    if (!context) return { ok: false as const, error: 'NOT_AVAILABLE' };
    const draft = await this.drafts.find(scope);
    const attachmentInvalid =
      !!draft && !draft.submittedBidId && !(await this.validAttachment(draft.content, scope));
    return {
      ok: true as const,
      draft: draft ?? null,
      readOnly: context.readOnly,
      attachmentInvalid,
    };
  }

  async list(scope: BidDraftScope) {
    if (!(await this.context(scope))) return { ok: false as const, error: 'NOT_AVAILABLE' };
    return { ok: true as const, drafts: await this.drafts.list(scope) };
  }

  async save(scope: BidDraftScope, content: BidDraft, expectedRevision: number) {
    const parsed = BidDraftSchema.safeParse(content);
    if (!parsed.success) return { ok: false as const, error: 'INVALID_INPUT' };
    return this.db.transaction(async (tx) => {
      const context = await this.context(scope, tx, true);
      if (!context) return { ok: false as const, error: 'NOT_AVAILABLE' };
      if (context.readOnly) return { ok: false as const, error: 'DRAFT_READ_ONLY' };
      if (!(await this.validAttachment(parsed.data, scope, tx)))
        return { ok: false as const, error: 'INVALID_ATTACHMENT' };
      const draft = await this.drafts.save(scope, parsed.data, expectedRevision, tx);
      return draft ? { ok: true as const, draft } : { ok: false as const, error: 'DRAFT_CONFLICT' };
    });
  }

  async remove(scope: BidDraftScope, revision: number) {
    return this.db.transaction(async (tx) => {
      if (!(await this.context(scope, tx, true)))
        return { ok: false as const, error: 'NOT_AVAILABLE' };
      return (await this.drafts.remove(scope, revision, tx))
        ? { ok: true as const }
        : { ok: false as const, error: 'DRAFT_CONFLICT' };
    });
  }
}

export const { get: getBidDraftService } = defineAsyncSingleton(
  'bid_draft_service',
  'service',
  async () => {
    const r = await import('@/lib/server/repositories/factory');
    return new BidDraftService(
      await r.getDb(),
      await r.getBidDraftRepo(),
      await r.getInvitationRepo(),
      await r.getRfpRepo(),
      await r.getBidRepo(),
      await r.getRfpRequoteRequestRepo(),
      await r.getAttachmentRepo(),
      await r.getPgMatchingRepo(),
    );
  },
);
