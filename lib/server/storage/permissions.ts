/**
 * `canAccessAttachment` — single source of truth for file route ACLs.
 *
 * Rules per ownerKind:
 *
 *   `rfp` (RFP PDFs attached to a buyer-side RFP)
 *     - Buyer ws members of the RFP owner: ALLOW
 *     - PG ws members where `invitationRepo.canAccess(rfpId, pgWsId)` is true: ALLOW
 *     - Uploader themselves (covers pre-RFP-create draft window where
 *       `ownerId` may not yet resolve to an `rfps` row): ALLOW
 *     - Otherwise: DENY
 *
 *   `bid_proposal` (proposal PDF attached to a PG-side bid)
 *     - Buyer ws members of the underlying RFP: ALLOW
 *     - Same-PG-workspace as the bid that references this attachment:
 *       ALLOW (so PG ws peers can view what was submitted)
 *     - Uploader themselves: ALLOW (pre-bid-create draft window)
 *     - Otherwise: DENY
 *
 * Cross-PG isolation is preserved — a PG user from a different ws
 * cannot read another PG's bid_proposal even if they were also invited
 * to the same RFP.
 *
 * Lookups are direct DB reads (not through repos) for the join-heavy
 * queries that don't have repo methods today; the repo-shaped check
 * (`invitationRepo.canAccess`) is delegated for parity with the bid
 * action's gate.
 */
import { and, eq } from 'drizzle-orm';
import { rfps, bids, workspaceMembers } from '@/lib/db/schema';
import type { AttachmentRecord } from '@/lib/server/repositories/attachment-record';
import type { InvitationRepo, Tx } from '@/lib/server/repositories/types';

// Re-export under the legacy name so call sites that import { AttachmentRow }
// from this module keep compiling (test files mirror this name).
export type AttachmentRow = AttachmentRecord;

export type AttachmentSession = {
  user: { id: string; workspaceId?: string; workspaceType?: 'buyer' | 'pg' };
};

export type RepoBundleForAttachment = {
  invitation: InvitationRepo;
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
  // row to a real RFP/bid.
  if (att.uploadedBy === userId) return true;

  if (att.ownerKind === 'rfp') {
    // Look up the RFP owner. ownerId may not resolve if upload landed
    // before the RFP row was created (uploader path above already
    // covered that case); a missing row from here means we can't ACL
    // and must deny.
    const [rfp] = await h
      .select({ buyerWsId: rfps.buyerWsId })
      .from(rfps)
      .where(eq(rfps.id, att.ownerId))
      .limit(1);
    if (!rfp) return false;

    // Buyer ws membership — any member (admin/member) of the owning ws.
    if (wsId && rfp.buyerWsId === wsId) {
      const [member] = await h
        .select({ userId: workspaceMembers.userId })
        .from(workspaceMembers)
        .where(
          and(
            eq(workspaceMembers.workspaceId, wsId),
            eq(workspaceMembers.userId, userId),
          ),
        )
        .limit(1);
      if (member) return true;
    }

    // PG side — invitation gates by workspace membership (any member of an
    // invited PG ws may read the RFP PDF).
    if (
      wsId &&
      (await repos.invitation.canAccess(att.ownerId, wsId, tx))
    ) {
      return true;
    }

    return false;
  }

  // bid_proposal — find the bid that points at this attachment id.
  // If no bid yet (pre-submit draft window), only the uploader can read,
  // which was already handled above.
  const [bid] = await h
    .select({
      pgWsId: bids.pgWsId,
      rfpId: bids.rfpId,
    })
    .from(bids)
    .where(eq(bids.proposalAttachmentId, att.id))
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
  if (wsId && rfpRow.buyerWsId === wsId) {
    const [member] = await h
      .select({ userId: workspaceMembers.userId })
      .from(workspaceMembers)
      .where(
        and(
          eq(workspaceMembers.workspaceId, wsId),
          eq(workspaceMembers.userId, userId),
        ),
      )
      .limit(1);
    if (member) return true;
  }

  return false;
}
