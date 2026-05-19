'use server';

import { z } from 'zod';
import { randomUUID } from 'node:crypto';
import { and, eq, inArray } from 'drizzle-orm';

import { requireBuyerSession } from '@/lib/auth/session';
import { attachments } from '@/lib/db/schema';
import {
  getBidRepo,
  getBidNoteRepo,
  getRfpRepo,
} from '@/lib/server/repositories/factory';
import { actionDb, type BidActionResult } from './_shared';

const MAX_BODY = 2000;

const Input = z
  .object({
    bidId: z.string().uuid(),
    body: z.string().max(MAX_BODY).default(''),
    attachmentIds: z.array(z.string().uuid()).max(20).default([]),
  })
  .strict();

export type AddBidNoteInput = z.infer<typeof Input>;
export type AddBidNoteResult = BidActionResult<{ noteId: string }>;

/**
 * 구매사 측 협상 메모 추가. lib/stores/bid-board.ts 의 `addNote` 를
 * 대체하는 server-side cutover (Stage 3c).
 *
 * 가드:
 *   1) requireBuyerSession.
 *   2) bid → rfp.buyerWsId === session.workspaceId.
 *   3) attachmentIds 각각:
 *       - owner_kind='bid_note'
 *       - owner_id = bidId (draft 단계의 임시 owner)
 *      attachmentIds 가 비어 있고 body 도 trimmed empty 면 NOTE_EMPTY.
 *
 * 처리:
 *   1) note row 생성 (id = uuid).
 *   2) 첨부의 owner_id 를 bidId → noteId 로 patch.
 *      (실패 시 액션 자체가 throw; v0 는 액션 안 트랜잭션 없음 — 다음
 *      milestone 에서 트랜잭션 도입 시 한꺼번에 묶을 자리.)
 */
export async function addBidNoteAction(
  input: AddBidNoteInput,
): Promise<AddBidNoteResult> {
  let session;
  try {
    session = await requireBuyerSession();
  } catch {
    return { ok: false, error: 'FORBIDDEN_BUYER' };
  }

  const parsed = Input.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'INVALID_INPUT' };
  const body = parsed.data.body.trim();
  const attIds = parsed.data.attachmentIds;
  if (body.length === 0 && attIds.length === 0) {
    return { ok: false, error: 'NOTE_EMPTY' };
  }

  const bidRepo = await getBidRepo();
  const bid = await bidRepo.findById(parsed.data.bidId);
  if (!bid) return { ok: false, error: 'BID_NOT_FOUND' };

  const rfpRepo = await getRfpRepo();
  const rfp = await rfpRepo.findById(bid.rfpId);
  if (!rfp) return { ok: false, error: 'RFP_NOT_FOUND' };
  if (rfp.buyerWsId !== session.user.workspaceId) {
    return { ok: false, error: 'FORBIDDEN' };
  }

  const db = actionDb();
  const noteRepo = await getBidNoteRepo();
  const noteId = randomUUID();

  // Save the note row and re-parent its attachments atomically. If the
  // UPDATE fails (concurrent owner_id change, stricter ACL, FK violation)
  // the note insert rolls back too — preventing a half-stored note with
  // orphan attachments that would error on retry (INVALID_ATTACHMENT
  // because the staged rows no longer point at this bid).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const result = await db.transaction(async (tx: any) => {
    if (attIds.length > 0) {
      // Verify inside the transaction so a racing patch can't slip through.
      const rows = await tx
        .select({
          id: attachments.id,
          ownerKind: attachments.ownerKind,
          ownerId: attachments.ownerId,
        })
        .from(attachments)
        .where(inArray(attachments.id, attIds));
      if (rows.length !== attIds.length) return 'INVALID_ATTACHMENT' as const;
      for (const r of rows) {
        if (r.ownerKind !== 'bid_note' || r.ownerId !== parsed.data.bidId) {
          return 'INVALID_ATTACHMENT' as const;
        }
      }
    }

    await noteRepo.save(
      {
        id: noteId,
        bidId: parsed.data.bidId,
        authorId: session.user.id,
        body,
        createdAt: new Date(),
      },
      tx,
    );

    if (attIds.length > 0) {
      await tx
        .update(attachments)
        .set({ ownerId: noteId })
        .where(
          and(
            inArray(attachments.id, attIds),
            eq(attachments.ownerKind, 'bid_note'),
            eq(attachments.ownerId, parsed.data.bidId),
          ),
        );
    }
    return 'ok' as const;
  });

  if (result === 'INVALID_ATTACHMENT') {
    return { ok: false, error: 'INVALID_ATTACHMENT' };
  }

  return { ok: true, noteId };
}
