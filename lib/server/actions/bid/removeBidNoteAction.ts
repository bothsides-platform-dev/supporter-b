'use server';

import { z } from 'zod';
import { and, eq } from 'drizzle-orm';

import { requireBuyerSession } from '@/lib/auth/session';
import { attachments, bidNotes } from '@/lib/db/schema';
import {
  getBidRepo,
  getRfpRepo,
} from '@/lib/server/repositories/factory';
import { getStorage } from '@/lib/server/storage';
import { actionDb, type BidActionResult } from './_shared';

const Input = z.object({ noteId: z.string().uuid() }).strict();

export type RemoveBidNoteInput = z.infer<typeof Input>;
export type RemoveBidNoteResult = BidActionResult;

/**
 * 구매사 측 메모 삭제. lib/stores/bid-board.ts 의 `removeNote` 를 대체.
 *
 * 가드:
 *   1) requireBuyerSession.
 *   2) note → bid → rfp.buyerWsId === session.workspaceId.
 *
 * 처리:
 *   1) 노트 첨부(owner_kind='bid_note', owner_id=noteId) row 들을 모은다.
 *   2) storage.delete 로 디스크 파일 best-effort 삭제. 실패해도 row 삭제는
 *      계속 진행 — orphan 디스크 파일은 v1 sweeper 의 책임 영역.
 *   3) attachments row 삭제.
 *   4) bid_notes row 삭제.
 */
export async function removeBidNoteAction(
  input: RemoveBidNoteInput,
): Promise<RemoveBidNoteResult> {
  let session;
  try {
    session = await requireBuyerSession();
  } catch {
    return { ok: false, error: 'FORBIDDEN_BUYER' };
  }

  const parsed = Input.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'INVALID_INPUT' };

  const db = actionDb();
  const [note] = await db
    .select({ id: bidNotes.id, bidId: bidNotes.bidId })
    .from(bidNotes)
    .where(eq(bidNotes.id, parsed.data.noteId))
    .limit(1);
  if (!note) return { ok: false, error: 'NOTE_NOT_FOUND' };

  const bidRepo = await getBidRepo();
  const bid = await bidRepo.findById(note.bidId);
  if (!bid) return { ok: false, error: 'BID_NOT_FOUND' };

  const rfpRepo = await getRfpRepo();
  const rfp = await rfpRepo.findById(bid.rfpId);
  if (!rfp) return { ok: false, error: 'RFP_NOT_FOUND' };
  if (rfp.buyerWsId !== session.user.workspaceId) {
    return { ok: false, error: 'FORBIDDEN' };
  }

  // Gather attachments before deleting rows so we know which disk files to drop.
  const attRows = await db
    .select({
      id: attachments.id,
      storagePath: attachments.storagePath,
    })
    .from(attachments)
    .where(
      and(
        eq(attachments.ownerKind, 'bid_note'),
        eq(attachments.ownerId, parsed.data.noteId),
      ),
    );

  const storage = getStorage();
  for (const att of attRows) {
    await storage.delete(att.storagePath).catch(() => {
      // orphan disk file — v1 sweeper picks it up. Don't block the action.
    });
  }

  await db
    .delete(attachments)
    .where(
      and(
        eq(attachments.ownerKind, 'bid_note'),
        eq(attachments.ownerId, parsed.data.noteId),
      ),
    );
  await db.delete(bidNotes).where(eq(bidNotes.id, parsed.data.noteId));

  return { ok: true };
}
