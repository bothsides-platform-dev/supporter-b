/**
 * `canAccessAttachment` — single source of truth for file route ACLs.
 *
 * Ownership is exclusive-arc (C3): an attachment carries at most one of
 * rfpId / bidId / bidNoteId. Rules per owner column:
 *
 *   `rfpId` set (RFP PDFs attached to a buyer-side RFP)
 *     - Buyer ws members of the RFP owner: ALLOW
 *     - PG ws members where `invitationRepo.canAccess(rfpId, pgWsId)` is true: ALLOW
 *     - Uploader themselves: ALLOW
 *     - Otherwise: DENY
 *
 *   `bidId` set (proposal PDF attached to a PG-side bid)
 *     - Buyer ws members of the underlying RFP: ALLOW
 *     - Same-PG-workspace as the bid: ALLOW (PG ws peers view submissions)
 *     - Uploader themselves: ALLOW
 *     - Otherwise: DENY
 *
 *   `bidNoteId` set (buyer-private memo attachment on a bid)
 *     - Buyer ws members of the RFP behind the bid: ALLOW
 *     - Uploader themselves: ALLOW
 *     - **All PG users: DENY** — notes are internal to the buyer.
 *
 *   None set (draft, uploaded before its owner row exists)
 *     - Only the uploader: ALLOW
 *
 * Cross-PG isolation is preserved — a PG user from a different ws cannot
 * read another PG's proposal even if invited to the same RFP.
 */
import { eq } from 'drizzle-orm';
import { bidNotes, bids, chatConversations, chatMessages, rfps } from '@/lib/db/schema';
import type { AttachmentRecord } from '@/lib/server/repositories/attachment-record';
import type { InvitationRepo, WorkspaceRepo, Tx } from '@/lib/server/repositories/types';

// Re-export under the legacy name so call sites that import { AttachmentRow }
// from this module keep compiling (test files mirror this name).
export type AttachmentRow = AttachmentRecord;

export type AttachmentSession = {
  user: { id: string; workspaceId?: string; workspaceType?: 'buyer' | 'pg' };
};

export type RepoBundleForAttachment = {
  invitation: InvitationRepo;
  workspace: WorkspaceRepo;
};

export async function canAccessAttachment(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: any,
  att: AttachmentRow,
  session: AttachmentSession,
  repos: RepoBundleForAttachment,
  tx?: Tx,
): Promise<boolean> {
  const userId = session.user.id;
  const wsId = session.user.workspaceId;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const h: any = tx ?? db;

  // Uploader themselves can always read their own upload — covers the
  // narrow window between upload and the form action that links the
  // row to a real RFP/bid (draft: all owner FKs null).
  if (att.uploadedBy === userId) return true;

  // Membership boolean — single source of truth in WorkspaceRepo.isMember.
  const isMember = (workspaceId: string): Promise<boolean> =>
    repos.workspace.isMember(userId, workspaceId, tx);

  if (att.rfpId) {
    const [rfp] = await h
      .select({ buyerWsId: rfps.buyerWsId })
      .from(rfps)
      .where(eq(rfps.id, att.rfpId))
      .limit(1);
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
    const [note] = await h
      .select({ bidId: bidNotes.bidId })
      .from(bidNotes)
      .where(eq(bidNotes.id, att.bidNoteId))
      .limit(1);
    if (!note) return false;

    const [bidRow] = await h
      .select({ rfpId: bids.rfpId })
      .from(bids)
      .where(eq(bids.id, note.bidId))
      .limit(1);
    if (!bidRow) return false;

    const [rfpRow] = await h
      .select({ buyerWsId: rfps.buyerWsId })
      .from(rfps)
      .where(eq(rfps.id, bidRow.rfpId))
      .limit(1);
    if (!rfpRow) return false;
    if (!wsId || rfpRow.buyerWsId !== wsId) return false;
    return isMember(wsId);
  }

  if (att.bidId) {
    // bid_proposal — the attachment carries bid_id directly (exclusive-arc).
    const [bid] = await h
      .select({ pgWsId: bids.pgWsId, rfpId: bids.rfpId })
      .from(bids)
      .where(eq(bids.id, att.bidId))
      .limit(1);
    if (!bid) return false;

    // PG workspace peers — same workspace as the bid submitter.
    if (wsId && bid.pgWsId === wsId) return true;

    // Buyer ws — RFP's owning workspace.
    const [rfpRow] = await h
      .select({ buyerWsId: rfps.buyerWsId })
      .from(rfps)
      .where(eq(rfps.id, bid.rfpId))
      .limit(1);
    if (!rfpRow) return false;
    if (wsId && rfpRow.buyerWsId === wsId && (await isMember(wsId))) return true;
    return false;
  }

  if (att.chatMessageId) {
    // chat attachment — both workspace sides of the conversation can read it.
    const [msgRow] = await h
      .select({ conversationId: chatMessages.conversationId })
      .from(chatMessages)
      .where(eq(chatMessages.id, att.chatMessageId))
      .limit(1);
    if (!msgRow) return false;

    const [conv] = await h
      .select({ buyerWsId: chatConversations.buyerWsId, pgWsId: chatConversations.pgWsId })
      .from(chatConversations)
      .where(eq(chatConversations.id, msgRow.conversationId))
      .limit(1);
    if (!conv) return false;

    if (!wsId) return false;
    if (conv.buyerWsId !== wsId && conv.pgWsId !== wsId) return false;
    return isMember(wsId);
  }

  // Draft with no owner linked — only the uploader (handled above) may read.
  return false;
}
