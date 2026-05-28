'use server';

import { z } from 'zod';
import { randomUUID } from 'node:crypto';
import { and, eq, inArray, isNull } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';

import { requirePgSession } from '@/lib/auth/session';
import { attachments, workspaceMembers, users, workspaces } from '@/lib/db/schema';
import {
  getAttachmentRepo,
  getBidRepo,
  getInvitationRepo,
  getOutboxRepo,
  getRfpRepo,
  getWorkspaceRepo,
} from '@/lib/server/repositories/factory';
import {
  dispatchNotification,
  emitAfterCommit,
} from '@/lib/server/notifications/dispatch';
import { renderBidSubmitted } from '@/lib/server/outbox/templates/bidSubmitted';
import { flushAfterCommit } from '@/lib/server/outbox/post-commit';
import type { Bid } from '@/lib/types/bid';
import { STATUTORY_CARD_FEE } from '@/lib/types/bid';
import type { Notification } from '@/lib/types/notification';
import { actionDb, type BidActionResult } from './_shared';

const feeField = z.number().min(0).max(1).optional();

const PaymentFeesSchema = z
  .object({
    card: feeField,
    overseas_card: feeField,
    virtual_account: feeField,
    bank_transfer: feeField,
    naver_pay: feeField,
    kakao_pay: feeField,
    toss_pay: feeField,
    mobile: feeField,
    gift_card: feeField,
  })
  .strict();

const Input = z
  .object({
    rfpId: z.string().min(1),
    settleCycle: z.string().min(1),
    settleLimit: z.number().nonnegative(),
    guaranteeInsurance: z.number().nonnegative(),
    paymentFees: PaymentFeesSchema,
    proposalAttachmentId: z.string().uuid().optional(),
    memo: z.string().max(2000).optional(),
  })
  .strict();

export type SubmitBidInput = z.input<typeof Input>;
export type SubmitBidResult = BidActionResult<{ bidId: string }>;

/**
 * PG 제안 제출 (v2 — payment_fees JSONB 모델).
 *
 * 트랜잭션 단계:
 *   1) requirePgSession
 *   2) zod 검증
 *   3) canAccess 가드: 초대된 PG 워크스페이스 멤버라면 누구나 통과
 *   4) RFP + 스냅샷 BizProfile 조회 → grade 추출
 *   5) 카드 법정 상한 검증: payment_fees.card > STATUTORY_CARD_FEE[grade] → reject
 *   6) invitation 조회 → invitationId 픽업
 *   7) BidRepo.save — UNIQUE(rfpId, pgWsId) 위반은 'BID_ALREADY_SUBMITTED'
 *   8) buyer ws 멤버 → notifications.in_app + outbox.bid.submitted
 */
export async function submitBidAction(
  input: SubmitBidInput,
): Promise<SubmitBidResult> {
  let session;
  try {
    session = await requirePgSession();
  } catch {
    return { ok: false, error: 'FORBIDDEN_PG' };
  }

  const parsed = Input.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'INVALID_INPUT' };

  const data = parsed.data;
  const userId = session.user.id;
  const pgWsId = session.user.workspaceId;

  const invRepo = await getInvitationRepo();
  const ok = await invRepo.canAccess(data.rfpId, pgWsId);
  if (!ok) return { ok: false, error: 'FORBIDDEN' };

  const rfpRepo = await getRfpRepo();
  const rfp = await rfpRepo.findById(data.rfpId);
  if (!rfp) return { ok: false, error: 'RFP_NOT_FOUND' };
  if (rfp.status !== 'sent') return { ok: false, error: 'RFP_NOT_OPEN' };

  // 카드 법정 상한 검증
  const cardFee = data.paymentFees.card;
  if (cardFee !== undefined) {
    const grade = rfp.bizProfile?.grade ?? null;
    const cap = STATUTORY_CARD_FEE[grade ?? 'general'];
    if (!isNaN(cap) && cardFee > cap) {
      return { ok: false, error: 'CARD_FEE_EXCEEDS_STATUTORY_CAP' };
    }
  }

  const allInvs = await invRepo.findByRfp(data.rfpId);
  const myInv = allInvs.find((i) => i.pgWsId === pgWsId);
  if (!myInv) return { ok: false, error: 'INVITATION_NOT_FOUND' };

  if (data.proposalAttachmentId) {
    const att = await (await getAttachmentRepo()).findById(
      data.proposalAttachmentId,
    );
    if (!att || att.rfpId || att.bidId || att.bidNoteId) {
      return { ok: false, error: 'INVALID_ATTACHMENT' };
    }
    const uploaderIsMember = await (await getWorkspaceRepo()).isMember(
      att.uploadedBy,
      pgWsId,
    );
    if (!uploaderIsMember) {
      return { ok: false, error: 'INVALID_ATTACHMENT' };
    }
  }

  const db = actionDb();
  const bidId = randomUUID();
  const now = new Date();

  const bidRepo = await getBidRepo();
  const existingBids = await bidRepo.findByRfp(data.rfpId);
  if (existingBids.some((b) => b.pgWsId === pgWsId)) {
    return { ok: false, error: 'BID_ALREADY_SUBMITTED' };
  }

  const pendingEmits: Notification[] = [];

  const result: SubmitBidResult = await db.transaction(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    async (tx: any): Promise<SubmitBidResult> => {
      const bid: Bid = {
        id: bidId,
        rfpId: data.rfpId,
        pgWsId,
        invitationId: myInv.id,
        settleCycle: data.settleCycle,
        settleLimit: data.settleLimit,
        guaranteeInsurance: data.guaranteeInsurance,
        paymentFees: data.paymentFees,
        proposalPdfs: [],
        memo: data.memo,
        status: 'submitted',
        submittedBy: userId,
        submittedAt: now.toISOString(),
      };

      await bidRepo.save(bid, tx);

      if (data.proposalAttachmentId) {
        await tx
          .update(attachments)
          .set({ bidId })
          .where(
            and(
              inArray(attachments.id, [data.proposalAttachmentId]),
              isNull(attachments.rfpId),
              isNull(attachments.bidId),
              isNull(attachments.bidNoteId),
            ),
          );
      }

      const buyerMembers = (await tx
        .select({ userId: workspaceMembers.userId, email: users.email })
        .from(workspaceMembers)
        .innerJoin(users, eq(workspaceMembers.userId, users.id))
        .where(eq(workspaceMembers.workspaceId, rfp.buyerWsId))) as {
        userId: string;
        email: string;
      }[];

      const [pgWsRow] = (await tx
        .select({ name: workspaces.name })
        .from(workspaces)
        .where(eq(workspaces.id, pgWsId))
        .limit(1)) as { name: string }[];
      const pgWsLabel = pgWsRow?.name ?? 'PG';

      const outbox = await getOutboxRepo();

      const submittedHtml = await renderBidSubmitted({
        rfpId: rfp.code,
        rfpTitle: rfp.title,
        pgName: pgWsLabel,
        submittedAt: now.toISOString().replace('T', ' ').slice(0, 16),
      });

      for (const m of buyerMembers) {
        const notif: Notification = {
          id: randomUUID(),
          userId: m.userId,
          workspaceId: rfp.buyerWsId,
          type: 'bid.submitted',
          title: `[${rfp.code}] ${pgWsLabel} 제안 도착`,
          body: `${pgWsLabel}가 제안을 제출했습니다.`,
          channel: 'inapp',
          status: 'pending',
          linkUrl: `/rfp/${rfp.code}`,
          createdAt: now.toISOString(),
        };
        await dispatchNotification(tx, notif);
        pendingEmits.push(notif);
        await outbox.enqueue(
          {
            event: 'bid.submitted',
            to: m.email,
            subject: `[Supporter B · ${rfp.code}] ${pgWsLabel} 제안 도착`,
            html: submittedHtml,
            dedupeKey: `bid:${data.rfpId}:${pgWsId}:${m.userId}`,
          },
          tx,
        );
      }

      return { ok: true, bidId };
    },
  );

  if (result.ok) {
    emitAfterCommit(pendingEmits);
    flushAfterCommit();
    revalidatePath(`/inbox/${rfp.code}`);
  }
  return result;
}
