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
} from '@/lib/server/repositories/factory';
import {
  dispatchNotification,
  emitAfterCommit,
} from '@/lib/server/notifications/dispatch';
import { renderBidSubmitted } from '@/lib/server/outbox/templates/bidSubmitted';
import { flushAfterCommit } from '@/lib/server/outbox/post-commit';
import type { Bid, CardIssuer } from '@/lib/types/bid';
import type { Notification } from '@/lib/types/notification';
import { actionDb, type BidActionResult } from './_shared';

const CardIssuerEnum = z.enum([
  'BC',
  'SHINHAN',
  'SAMSUNG',
  'HYUNDAI',
  'KB',
  'LOTTE',
  'NH',
  'HANA',
  'WOORI',
]);

const Input = z
  .object({
    rfpId: z.string().min(1),
    settleCycle: z.enum(['D+0', 'D+1', 'D+2', 'weekly', 'monthly']),
    deposit: z.number().nonnegative(),
    setupFee: z.number().nonnegative(),
    monthlyMin: z.number().nonnegative(),
    bankTransferFeePct: z.number().min(0).max(1),
    easyPayFeePct: z.number().min(0).max(1),
    cardFeesByIssuer: z.record(CardIssuerEnum, z.number().min(0).max(1)).optional(),
    overseasCardFeePct: z.number().min(0).max(1).optional(),
    proposalAttachmentId: z.string().uuid().optional(),
    memo: z.string().max(2000).optional(),
  })
  .strict();

export type SubmitBidInput = z.input<typeof Input>;
export type SubmitBidResult = BidActionResult<{ bidId: string }>;

/**
 * PG 제안 제출.
 *
 * 트랜잭션 단계:
 *   1) requirePgSession — workspace_type='pg' 게이트.
 *   2) zod 검증.
 *   3) **canAccess 가드**: 초대된 PG 워크스페이스 멤버라면 누구나 통과.
 *      acceptedByUserId 는 첫 클레임자 감사용으로만 유지.
 *   4) RFP + 스냅샷 BizProfile 조회 → grade 추출.
 *   5) **STATUTORY_CARD_FEE 서버 강제 (advisor pin 1)**:
 *      grade !== 'general' 이면 cardFeesByIssuer = null. 영세/중소 1~3은 법정 고정.
 *   6) invitation 조회 → 본인 워크스페이스 row 픽업(invitationId).
 *   7) BidRepo.save (id 호출자 발급) — UNIQUE(rfpId, pgWsId) 위반은 'BID_ALREADY_SUBMITTED'.
 *   8) buyer ws 멤버 each → notifications.in_app + outbox.bid.submitted.
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

  // canAccess 가드 — 워크스페이스 멤버십 단위. 초대된 PG ws 멤버는 모두 통과.
  const invRepo = await getInvitationRepo();
  const ok = await invRepo.canAccess(data.rfpId, pgWsId);
  if (!ok) return { ok: false, error: 'FORBIDDEN' };

  const rfpRepo = await getRfpRepo();
  const rfp = await rfpRepo.findById(data.rfpId);
  if (!rfp) return { ok: false, error: 'RFP_NOT_FOUND' };
  if (rfp.status !== 'sent') return { ok: false, error: 'RFP_NOT_OPEN' };

  // STATUTORY_CARD_FEE 서버 강제 (advisor pin 1):
  // grade 가 영세/중소1~3 인 경우 cardFeesByIssuer 입력은 무시되고 null 로 강제.
  // 일반(general) 또는 등급 미입력(NULL) 일 때만 클라이언트 입력 채택 — 등급 미입력
  // RFP 는 PG 가 일반 등급 가정으로 9개 카드사 직접 제안.
  const grade = rfp.bizProfile?.grade ?? null;
  const allowCardFees = grade === null || grade === 'general';
  const cardFees = allowCardFees ? (data.cardFeesByIssuer ?? null) : null;
  const overseasCardFeePct = allowCardFees
    ? (data.overseasCardFeePct ?? undefined)
    : undefined;

  // 본인 워크스페이스의 invitation row 픽업 — bid.invitationId FK.
  const allInvs = await invRepo.findByRfp(data.rfpId);
  const myInv = allInvs.find((i) => i.pgWsId === pgWsId);
  if (!myInv) return { ok: false, error: 'INVITATION_NOT_FOUND' };

  // proposalAttachmentId가 있다면 같은 워크스페이스 멤버가 업로드한 첨부인지 검증
  // (다른 PG ws의 attachment id로 자기 제안을 만드는 spoofing 방지). canAccess는
  // 같은 RFP에 초대된 다른 PG ws 도 통과시키지만, 첨부는 본인 ws 단위로 격리.
  // 같은 ws 의 동료가 업로드한 PDF는 허용.
  if (data.proposalAttachmentId) {
    const att = await (await getAttachmentRepo()).findById(
      data.proposalAttachmentId,
    );
    // Draft proposal (exclusive-arc): must be still-unlinked and uploaded by a
    // member of this PG ws (본인 또는 동료). Linked to the bid after save.
    if (!att || att.rfpId || att.bidId || att.bidNoteId) {
      return { ok: false, error: 'INVALID_ATTACHMENT' };
    }
    const [uploaderMember] = (await actionDb()
      .select({ workspaceId: workspaceMembers.workspaceId })
      .from(workspaceMembers)
      .where(
        and(
          eq(workspaceMembers.userId, att.uploadedBy),
          eq(workspaceMembers.workspaceId, pgWsId),
        ),
      )
      .limit(1)) as { workspaceId: string }[];
    if (!uploaderMember) {
      return { ok: false, error: 'INVALID_ATTACHMENT' };
    }
  }

  const db = actionDb();
  const bidId = randomUUID();
  const now = new Date();

  // UNIQUE(rfpId, pgWsId) 사전 검사 — pglite는 23505가 트랜잭션을 abort 시키므로
  // try/catch 후 commit이 불가능. 트랜잭션 진입 전 1회 read-check로 막고,
  // 동시성 race로 들어온 두 번째 요청은 트랜잭션 안에서 try/catch + 재throw.
  // (advisor pin 4: withdrawn 행이 있어도 재시도 차단 — 같은 단순화 흐름.)
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
        deposit: data.deposit,
        setupFee: data.setupFee,
        monthlyMin: data.monthlyMin,
        bankTransferFeePct: data.bankTransferFeePct,
        easyPayFeePct: data.easyPayFeePct,
        cardFeesByIssuer: (cardFees ?? undefined) as
          | Record<CardIssuer, number>
          | undefined,
        overseasCardFeePct,
        // 제안서 첨부는 attachments.bid_id 로 링크(아래) — bid row에는 저장 안 함.
        proposalPdfs: [],
        memo: data.memo,
        status: 'submitted',
        buyerStage: 'pending',
        submittedBy: userId,
        submittedAt: now.toISOString(),
      };

      // race-window 동시성 시 23505 — tx abort 되어 catch 후 commit 불가능.
      // 트랜잭션 외부 사전 check로 99% 케이스를 흡수했고, race 시에는 throw로
      // 자연 rollback. 호출자가 재시도 시 사전 check가 다시 걸려 BID_ALREADY_SUBMITTED.
      await bidRepo.save(bid, tx);

      // 제안서 드래프트 첨부를 이 bid에 링크(set bid_id). 미링크 가드로 재시도/스푸핑 차단.
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

      // 알림 (advisor pin 6): buyer ws 전 멤버에게 인앱 + 메일 모두.
      const buyerMembers = (await tx
        .select({ userId: workspaceMembers.userId, email: users.email })
        .from(workspaceMembers)
        .innerJoin(users, eq(workspaceMembers.userId, users.id))
        .where(eq(workspaceMembers.workspaceId, rfp.buyerWsId))) as {
        userId: string;
        email: string;
      }[];

      // PG ws name (이메일 본문에 표시).
      const [pgWsRow] = (await tx
        .select({ name: workspaces.name })
        .from(workspaces)
        .where(eq(workspaces.id, pgWsId))
        .limit(1)) as { name: string }[];
      const pgWsLabel = pgWsRow?.name ?? 'PG';

      const outbox = await getOutboxRepo();

      // 같은 RFP × pgWs 조합의 메일 본문은 모든 buyer 멤버에게 동일 — 한 번만
      // 렌더해 재사용.
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
            // 멤버별 dedupe — uuid rfpId 기준(안정 키).
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
    // /inbox/<rfpId> RSC cache 무효화 — 사용자가 redirect 후 뒤로가기 또는
    // 다른 경로로 다시 진입하면 BidForm 대신 "제출 완료" 분기가 나오도록.
    // client에서 router.push + router.refresh를 동시 호출하면 useTransition
    // pending이 영구히 잡히는 Next 16 버그(vercel/next.js#86055)를 피하기
    // 위해 server-side revalidation + client-side router.push만 사용한다.
    revalidatePath(`/inbox/${rfp.code}`);
  }
  return result;
}
