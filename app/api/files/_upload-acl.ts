/**
 * authorizeAttachmentUpload — per-`ownerKind` ACL for a new attachment,
 * used by the presigned-PUT route (`presign/route.ts`). The legacy
 * server-buffered multipart upload route (`upload/route.ts`) shared this
 * same ACL before it was removed once every client moved to the 2-phase
 * presigned flow — kept as its own module since a future upload entry
 * point (if any) would gate on the identical rules.
 *
 * Also resolves `rfpLink` — the immediate owner link at row-creation time.
 * Only the 'rfp' non-draft path links immediately; bid_proposal/bid_note/
 * chat/team_message (and the rfp draft window) start ownerless and are
 * linked later by their action (createRfp / submitBid / addBidNote / ...).
 */
import { DRAFT_OWNER_ID } from '@/lib/server/storage/path';
import {
  getBidRepo,
  getInvitationRepo,
  getRfpRepo,
} from '@/lib/server/repositories/factory';

export const OWNER_KINDS = [
  'rfp',
  'bid_proposal',
  'bid_note',
  'chat',
  'team_message',
] as const;
export type OwnerKind = (typeof OWNER_KINDS)[number];

export type UploadActor = {
  userId: string;
  workspaceId?: string;
  workspaceType?: 'buyer' | 'pg';
};

export type UploadAuthzInput = {
  ownerKind: OwnerKind;
  ownerId: string;
};

export type UploadAuthzResult =
  | { ok: true; rfpLink: { rfpId?: string } }
  | { ok: false; status: number; error: string };

export async function authorizeAttachmentUpload(
  actor: UploadActor,
  input: UploadAuthzInput,
): Promise<UploadAuthzResult> {
  const { wsId, wsType } = { wsId: actor.workspaceId, wsType: actor.workspaceType };

  if (input.ownerKind === 'rfp') {
    // Buyer-only upload path. Draft window: ownerId may be a placeholder
    // (literal '__draft__') because the RFP is still being authored.
    if (wsType !== 'buyer' || !wsId) {
      return { ok: false, status: 403, error: 'FORBIDDEN' };
    }
    if (input.ownerId !== DRAFT_OWNER_ID) {
      const rfp = await (await getRfpRepo()).findById(input.ownerId);
      if (!rfp) return { ok: false, status: 404, error: 'RFP_NOT_FOUND' };
      if (rfp.buyerWsId !== wsId) {
        return { ok: false, status: 403, error: 'FORBIDDEN' };
      }
    }
  } else if (input.ownerKind === 'chat') {
    // Chat attachment — buyer<->PG IM. Any authenticated workspace member may
    // upload an ownerless draft; sendChatMessageAction links it to the
    // chat_messages row and re-checks the uploader is a session-ws member.
    // ownerId is the literal '__draft__' placeholder (no parent yet).
    // Membership guaranteed by isSessionRevoked() at the route (removeMember
    // bumps sessionVersion — stale sessions are rejected before reaching here).
    if (!wsId) return { ok: false, status: 403, error: 'FORBIDDEN' };
  } else if (input.ownerKind === 'bid_note') {
    // Buyer-only memo attachment. ownerId here is the *bid id* (the parent
    // bid_notes row may not exist yet — the action layer creates it and
    // re-points owner_id to the new bid_notes.id after this row lands).
    // Gate: buyer ws that owns the RFP behind this bid.
    // Membership guaranteed by isSessionRevoked() at the route (same policy
    // as storage/permissions.ts — no live isMember re-check needed).
    if (wsType !== 'buyer' || !wsId) {
      return { ok: false, status: 403, error: 'FORBIDDEN' };
    }
    const row = await (await getBidRepo()).findRfpOwner(input.ownerId);
    if (!row) return { ok: false, status: 404, error: 'BID_NOT_FOUND' };
    if (row.buyerWsId !== wsId) {
      return { ok: false, status: 403, error: 'FORBIDDEN' };
    }
  } else if (input.ownerKind === 'team_message') {
    // Team-thread attachment — buyer (owns the RFP) or invited PG. ownerId is
    // the *RFP id* (the parent rfp_team_messages row may not exist yet —
    // sendTeamMessageAction creates it and re-points owner_id after this row
    // lands). Gate mirrors TeamChatService.authorize.
    // Membership guaranteed by isSessionRevoked() at the route (same policy
    // as storage/permissions.ts — no live isMember re-check needed).
    if (!wsId) return { ok: false, status: 403, error: 'FORBIDDEN' };
    if (wsType === 'buyer') {
      const rfp = await (await getRfpRepo()).findById(input.ownerId);
      if (!rfp) return { ok: false, status: 404, error: 'RFP_NOT_FOUND' };
      if (rfp.buyerWsId !== wsId) {
        return { ok: false, status: 403, error: 'FORBIDDEN' };
      }
    } else {
      // PG — invitation gate (same as loadPgRfpDetail / bid_proposal).
      const invRepo = await getInvitationRepo();
      if (!(await invRepo.canAccess(input.ownerId, wsId))) {
        return { ok: false, status: 403, error: 'FORBIDDEN' };
      }
    }
  } else {
    // bid_proposal — PG-only, must be a member of an invited PG ws for ownerId.
    if (wsType !== 'pg' || !wsId) {
      return { ok: false, status: 403, error: 'FORBIDDEN' };
    }
    const invRepo = await getInvitationRepo();
    const ok = await invRepo.canAccess(input.ownerId, wsId);
    if (!ok) return { ok: false, status: 403, error: 'FORBIDDEN' };
  }

  // Owner link at creation time: only the 'rfp' non-draft path links
  // immediately. bid_proposal/bid_note (and the rfp draft window) start
  // ownerless and are linked by their action (createRfp / submitBid /
  // addBidNote).
  const rfpLink =
    input.ownerKind === 'rfp' && input.ownerId !== DRAFT_OWNER_ID
      ? { rfpId: input.ownerId }
      : {};

  return { ok: true, rfpLink };
}
