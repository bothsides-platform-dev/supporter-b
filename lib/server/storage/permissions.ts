/**
 * `canAccessAttachment` — single source of truth for file route ACLs.
 *
 * Ownership is exclusive-arc (C4): an attachment carries at most one of
 * rfpId / bidId / bidNoteId / chatMessageId / rfpTeamMessageId. Rules per
 * owner column:
 *
 *   `rfpId` set (RFP PDFs attached to a buyer-side RFP)
 *     - Buyer ws of the RFP owner (session.workspaceId === rfp.buyerWsId): ALLOW
 *     - PG ws where `invitationRepo.canAccess(rfpId, pgWsId)` is true: ALLOW
 *     - Uploader themselves: ALLOW
 *     - Otherwise: DENY
 *
 *   `bidId` set (proposal PDF attached to a PG-side bid)
 *     - Same-PG-workspace as the bid: ALLOW (PG ws peers view submissions) —
 *       NOTE this grants on `bid.pgWsId === session ws` alone, WITHOUT an
 *       isMember check and BEFORE the RFP is resolved.
 *     - Buyer ws of the underlying RFP: ALLOW
 *     - Uploader themselves: ALLOW
 *     - Otherwise: DENY
 *
 *   `bidNoteId` set (buyer-private memo attachment on a bid)
 *     - Buyer ws of the RFP behind the bid: ALLOW
 *     - Uploader themselves: ALLOW
 *     - **All PG users: DENY** — notes are internal to the buyer.
 *
 *   `chatMessageId` set (attachment sent in a chat conversation)
 *     - Buyer ws of the conversation: ALLOW
 *     - PG ws of the conversation: ALLOW
 *     - Uploader themselves: ALLOW (via top-level fast-path)
 *     - Otherwise: DENY
 *
 *   `rfpTeamMessageId` set (attachment on an internal team-thread message)
 *     - The message's OWN workspace: ALLOW
 *     - Uploader themselves: ALLOW (via top-level fast-path)
 *     - **Other workspaces (buyer↔PG, PG↔PG): DENY** — sealed-bid: each side's
 *       team thread is disjoint.
 *
 *   None set (draft, uploaded before its owner row exists)
 *     - Only the uploader: ALLOW
 *
 * Cross-PG isolation is preserved — a PG user from a different ws cannot
 * read another PG's proposal even if invited to the same RFP.
 *
 * Membership is NOT re-checked via workspaceMembers here. The session's
 * workspaceId is a signed JWT claim (tamper-proof). Stale sessions (e.g.
 * after member removal) are invalidated by bumping sessionVersion in
 * WorkspaceService.removeMember — isSessionRevoked() catches them at the
 * route level before this function is called.
 *
 * The owner chain is resolved through repository methods (no raw schema/Drizzle
 * access) — the ACL stays a thin, db-agnostic policy over the repo bundle. The
 * exact branch order/membership semantics above are characterized in
 * `__tests__/permissions.test.ts`.
 */
import type { AttachmentRecord } from '@/lib/server/repositories/attachment-record';
import type {
  BidNoteRepo,
  BidRepo,
  ChatConversationRepo,
  ChatMessageRepo,
  InvitationRepo,
  RfpRepo,
  RfpTeamMessageRepo,
  Tx,
} from '@/lib/server/repositories/types';

// Re-export under the legacy name so call sites that import { AttachmentRow }
// from this module keep compiling (test files mirror this name).
export type AttachmentRow = AttachmentRecord;

export type AttachmentSession = {
  user: { id: string; workspaceId?: string; workspaceType?: 'buyer' | 'pg' };
};

export type RepoBundleForAttachment = {
  invitation: InvitationRepo;
  rfp: RfpRepo;
  bid: BidRepo;
  bidNote: BidNoteRepo;
  chatMessage: ChatMessageRepo;
  chatConversation: ChatConversationRepo;
  rfpTeamMessage: RfpTeamMessageRepo;
};

/**
 * ACL gate for file downloads. Returns true iff `session` may read `att`.
 *
 * PRE-CONDITION (security-critical): the caller MUST verify the session is not
 * revoked (e.g. `isSessionRevoked`) BEFORE calling this function. Membership
 * in `workspace_members` is NOT re-checked here — the signed JWT `workspaceId`
 * claim is treated as proof. Stale sessions after member removal are handled by
 * `WorkspaceService.removeMember` bumping `sessionVersion`, which `isSessionRevoked`
 * catches on every subsequent request. Skipping that pre-condition silently grants
 * file access to ex-members for the remaining JWT lifetime.
 */
export async function canAccessAttachment(
  att: AttachmentRow,
  session: AttachmentSession,
  repos: RepoBundleForAttachment,
  tx?: Tx,
): Promise<boolean> {
  const userId = session.user.id;
  const wsId = session.user.workspaceId;

  // Uploader themselves can always read their own upload — covers the
  // narrow window between upload and the form action that links the
  // row to a real RFP/bid (draft: all owner FKs null).
  if (att.uploadedBy === userId) return true;

  if (att.rfpId) {
    const rfp = await repos.rfp.findOwnerById(att.rfpId, tx);
    if (!rfp) return false;

    // Buyer ws — session workspace must match the RFP's owning buyer workspace.
    if (wsId && rfp.buyerWsId === wsId) return true;

    // PG side — invitation gates access.
    if (wsId && (await repos.invitation.canAccess(att.rfpId, wsId, tx))) {
      return true;
    }
    return false;
  }

  if (att.bidNoteId) {
    // bid_note → bid_notes.bid_id → bids.rfp_id → rfps.buyer_ws_id; require
    // the buyer ws. PG users denied (notes are buyer-internal).
    const note = await repos.bidNote.findById(att.bidNoteId, tx);
    if (!note) return false;

    const owner = await repos.bid.findRfpOwner(note.bidId, tx);
    if (!owner) return false;
    if (!wsId || owner.buyerWsId !== wsId) return false;
    return true;
  }

  if (att.bidId) {
    // bid_proposal — the attachment carries bid_id directly (exclusive-arc).
    // Bid-only lookup so the PG fast-path resolves WITHOUT requiring the RFP
    // row (matches the raw branch order: pgWsId check precedes the rfp lookup).
    const bid = await repos.bid.findOwner(att.bidId, tx);
    if (!bid) return false;

    // PG workspace peers — same workspace as the bid submitter.
    if (wsId && bid.pgWsId === wsId) return true;

    // Buyer ws — RFP's owning workspace.
    const rfp = await repos.rfp.findOwnerById(bid.rfpId, tx);
    if (!rfp) return false;
    if (wsId && rfp.buyerWsId === wsId) return true;
    return false;
  }

  if (att.rfpTeamMessageId) {
    // team-message attachment — scoped to one (rfp, workspace) internal thread.
    // Sealed-bid: only the owning workspace may read it; the opposite side
    // (buyer vs each PG) sees a disjoint thread.
    const msg = await repos.rfpTeamMessage.findOwner(att.rfpTeamMessageId, tx);
    if (!msg) return false;
    if (!wsId || msg.workspaceId !== wsId) return false;
    return true;
  }

  if (att.chatMessageId) {
    // chat attachment — both workspace sides of the conversation can read it.
    const msg = await repos.chatMessage.findConversationId(att.chatMessageId, tx);
    if (!msg) return false;

    const conv = await repos.chatConversation.findById(msg.conversationId, tx);
    if (!conv) return false;

    if (!wsId) return false;
    if (conv.buyerWsId !== wsId && conv.pgWsId !== wsId) return false;
    return true;
  }

  // Draft with no owner linked — only the uploader (handled above) may read.
  return false;
}
