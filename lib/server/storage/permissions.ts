/**
 * `canAccessAttachment` — single source of truth for file route ACLs.
 *
 * Ownership is exclusive-arc (C4): an attachment carries at most one of
 * rfpId / bidId / bidNoteId / chatMessageId / rfpTeamMessageId. Rules per
 * owner column:
 *
 *   `rfpId` set (RFP PDFs attached to a buyer-side RFP)
 *     - Buyer ws members of the RFP owner: ALLOW
 *     - PG ws members where `invitationRepo.canAccess(rfpId, pgWsId)` is true: ALLOW
 *     - Uploader themselves: ALLOW
 *     - Otherwise: DENY
 *
 *   `bidId` set (proposal PDF attached to a PG-side bid)
 *     - Same-PG-workspace as the bid: ALLOW (PG ws peers view submissions) —
 *       NOTE this grants on `bid.pgWsId === session ws` alone, WITHOUT an
 *       isMember check and BEFORE the RFP is resolved.
 *     - Buyer ws members of the underlying RFP: ALLOW
 *     - Uploader themselves: ALLOW
 *     - Otherwise: DENY
 *
 *   `bidNoteId` set (buyer-private memo attachment on a bid)
 *     - Buyer ws members of the RFP behind the bid: ALLOW
 *     - Uploader themselves: ALLOW
 *     - **All PG users: DENY** — notes are internal to the buyer.
 *
 *   `chatMessageId` set (attachment sent in a chat conversation)
 *     - Buyer ws members of the conversation: ALLOW
 *     - PG ws members of the conversation: ALLOW
 *     - Uploader themselves: ALLOW (via top-level fast-path)
 *     - Otherwise: DENY
 *
 *   `rfpTeamMessageId` set (attachment on an internal team-thread message)
 *     - Members of the message's OWN workspace: ALLOW
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
  WorkspaceRepo,
  Tx,
} from '@/lib/server/repositories/types';

// Re-export under the legacy name so call sites that import { AttachmentRow }
// from this module keep compiling (test files mirror this name).
export type AttachmentRow = AttachmentRecord;

export type AttachmentSession = {
  user: { id: string; workspaceId?: string; workspaceType?: 'buyer' | 'pg'; isMaster?: boolean };
};

export type RepoBundleForAttachment = {
  invitation: InvitationRepo;
  workspace: WorkspaceRepo;
  rfp: RfpRepo;
  bid: BidRepo;
  bidNote: BidNoteRepo;
  chatMessage: ChatMessageRepo;
  chatConversation: ChatConversationRepo;
  rfpTeamMessage: RfpTeamMessageRepo;
};

export async function canAccessAttachment(
  // The owner chain is resolved exclusively through `repos` (no raw schema
  // access). Owner lookups forward `tx` so they share the caller's transaction
  // when one is supplied.
  att: AttachmentRow,
  session: AttachmentSession,
  repos: RepoBundleForAttachment,
  tx?: Tx,
): Promise<boolean> {
  const userId = session.user.id;
  const wsId = session.user.workspaceId;
  const isMasterUser = session.user.isMaster === true;

  // Uploader themselves can always read their own upload — covers the
  // narrow window between upload and the form action that links the
  // row to a real RFP/bid (draft: all owner FKs null).
  if (att.uploadedBy === userId) return true;

  // Membership boolean — single source of truth in WorkspaceRepo.isMember.
  // Master/operator accounts are not in workspaceMembers (listAllWorkspacesForMaster
  // synthesises membership without DB rows), so bypass the DB check for them.
  const isMember = (workspaceId: string): Promise<boolean> =>
    isMasterUser ? Promise.resolve(true) : repos.workspace.isMember(userId, workspaceId, tx);

  if (att.rfpId) {
    const rfp = await repos.rfp.findOwnerById(att.rfpId, tx);
    if (!rfp) return false;

    // Buyer ws membership — any member (admin/member) of the owning ws.
    if (wsId && rfp.buyerWsId === wsId && (await isMember(wsId))) return true;

    // PG side — invitation gates by workspace membership.
    if (wsId && (await repos.invitation.canAccess(att.rfpId, wsId, tx))) {
      return true;
    }
    return false;
  }

  if (att.bidNoteId) {
    // bid_note → bid_notes.bid_id → bids.rfp_id → rfps.buyer_ws_id; require
    // membership of that buyer ws. PG users denied (notes are buyer-internal).
    const note = await repos.bidNote.findById(att.bidNoteId, tx);
    if (!note) return false;

    const owner = await repos.bid.findRfpOwner(note.bidId, tx);
    if (!owner) return false;
    if (!wsId || owner.buyerWsId !== wsId) return false;
    return isMember(wsId);
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
    if (wsId && rfp.buyerWsId === wsId && (await isMember(wsId))) return true;
    return false;
  }

  if (att.rfpTeamMessageId) {
    // team-message attachment — scoped to one (rfp, workspace) internal thread.
    // Sealed-bid: only members of THAT workspace may read it; the opposite side
    // (buyer vs each PG) sees a disjoint thread. Same gate as listByScope, which
    // filters team messages by (rfpId, workspaceId).
    const msg = await repos.rfpTeamMessage.findOwner(att.rfpTeamMessageId, tx);
    if (!msg) return false;
    if (!wsId || msg.workspaceId !== wsId) return false;
    return isMember(wsId);
  }

  if (att.chatMessageId) {
    // chat attachment — both workspace sides of the conversation can read it.
    const msg = await repos.chatMessage.findConversationId(att.chatMessageId, tx);
    if (!msg) return false;

    const conv = await repos.chatConversation.findById(msg.conversationId, tx);
    if (!conv) return false;

    if (!wsId) return false;
    if (conv.buyerWsId !== wsId && conv.pgWsId !== wsId) return false;
    return isMember(wsId);
  }

  // Draft with no owner linked — only the uploader (handled above) may read.
  return false;
}
