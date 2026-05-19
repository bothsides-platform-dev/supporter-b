'use server';

import { z } from 'zod';
import { randomUUID } from 'node:crypto';
import { and, eq, inArray } from 'drizzle-orm';

import { requireBuyerSession } from '@/lib/auth/session';
import {
  attachments,
  bizProfiles,
  rfpInvitations,
  rfps,
  users,
  workspaceMembers,
  workspaces,
} from '@/lib/db/schema';
import {
  getOutboxRepo,
  getInvitationRepo,
} from '@/lib/server/repositories/factory';
import { nextRfpId } from '@/lib/server/rfp-id';
import { addMinutes, generateToken } from '@/lib/server/token';
import { renderRfpInvited } from '@/lib/server/outbox/templates/rfpInvited';
import { renderRfpSent } from '@/lib/server/outbox/templates/rfpSent';
import { flushAfterCommit } from '@/lib/server/outbox/post-commit';
import {
  dispatchNotification,
  emitAfterCommit,
} from '@/lib/server/notifications/dispatch';
import type { Notification } from '@/lib/types/notification';
import { DRAFT_OWNER_ID } from '@/lib/server/storage/path';
import {
  actionDb,
  baseUrl,
  type RfpActionResult,
} from './_shared';

const MERCHANT_GRADES = ['small', 'sme1', 'sme2', 'sme3', 'general'] as const;

const Input = z
  .object({
    title: z.string().min(1).max(200),
    memo: z.string().max(2000).optional(),
    deadline: z.string().min(1), // ISO timestamp
    allowedPgWorkspaceIds: z.array(z.string().uuid()).max(50),
    rfpAttachmentIds: z.array(z.string().uuid()).optional(),
    send: z.boolean().optional().default(false),
    // bizProfile 분기 — default 'inherit' 은 워크스페이스 bizProfile 을 스냅샷.
    // 워크스페이스에 bizProfile 이 없으면 자동으로 'none' 으로 폴백.
    bizProfileMode: z
      .enum(['inherit', 'override', 'none'])
      .optional()
      .default('inherit'),
    bizNoOverride: z.string().min(1).max(50).optional(),
    gradeOverride: z.enum(MERCHANT_GRADES).optional(),
  })
  .strict();

// Public input (callers): `send` 는 zod default 덕에 생략 가능.
// `z.input` 으로 노출해서 caller가 `send`를 안 적어도 컴파일되게 한다.
export type CreateRfpInput = z.input<typeof Input>;
export type CreateRfpResult = RfpActionResult<{ rfpId: string }>;

const INVITE_TTL_DAYS = 7;

// RFP 생성. send=false면 draft 저장, send=true면 sent + invitation/outbox 일괄.
//
// bizProfileMode 분기:
//   'inherit' (기본): 워크스페이스 bizProfile 을 스냅샷. 워크스페이스가 미등록이면
//                     자동으로 'none' 으로 폴백 (사전 제안 모드).
//   'override'      : bizNoOverride / gradeOverride 로 새 row insert. 둘 다
//                     비어있으면 INVALID_BIZ_PROFILE 에러 (DB CHECK 와 정합).
//   'none'          : biz_profiles row 생성 없이 rfps.biz_profile_id=NULL.
//
// workspace.biz_profile_id 는 절대 변경하지 않음 — RFP 시점 스냅샷일 뿐.
// workspace 갱신은 updateWorkspaceBizProfileAction 전용.
export async function createRfpAction(
  input: CreateRfpInput,
): Promise<CreateRfpResult> {
  let session;
  try {
    session = await requireBuyerSession();
  } catch {
    return { ok: false, error: 'FORBIDDEN_BUYER' };
  }

  const parsed = Input.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'INVALID_INPUT' };

  const wsId = session.user.workspaceId;
  const userId = session.user.id;
  const send = parsed.data.send;
  const db = actionDb();

  const pendingEmits: Notification[] = [];

  const result = await db.transaction(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    async (tx: any): Promise<CreateRfpResult> => {
      // 1. RFP id 발급 (atomic counter)
      const rfpId = await nextRfpId(tx);

      // 2. workspace name 조회 (rfp.invited 메일 본문의 buyerName) + 현재 biz_profile_id.
      const [wsRow] = await tx
        .select({
          bizProfileId: workspaces.bizProfileId,
          name: workspaces.name,
        })
        .from(workspaces)
        .where(eq(workspaces.id, wsId))
        .limit(1);
      if (!wsRow) return { ok: false, error: 'FORBIDDEN_BUYER' };

      // 3. bizProfile 분기 — 스냅샷 row id 또는 null 결정
      const now = new Date();
      let snapshotId: string | null = null;

      const mode = parsed.data.bizProfileMode;
      const bizNoOverride = parsed.data.bizNoOverride?.trim();
      const gradeOverride = parsed.data.gradeOverride;

      if (mode === 'override') {
        if (!bizNoOverride && !gradeOverride) {
          return { ok: false, error: 'INVALID_BIZ_PROFILE' };
        }
        snapshotId = randomUUID();
        await tx.insert(bizProfiles).values({
          id: snapshotId,
          bizNo: bizNoOverride ?? null,
          taxType: null,
          status: null,
          grade: gradeOverride ?? null,
          gradeSource: gradeOverride ? 'user_overridden' : 'unset',
          gradeConfirmedBy: gradeOverride ? userId : null,
          gradeConfirmedAt: gradeOverride ? now : null,
        });
      } else if (mode === 'inherit' && wsRow.bizProfileId) {
        // workspace bizProfile 을 RFP 스냅샷으로 복제. workspace.bizProfileId 는
        // 그대로 둔다 (workspace 갱신은 updateWorkspaceBizProfileAction 전용).
        const [currentBiz] = await tx
          .select()
          .from(bizProfiles)
          .where(eq(bizProfiles.id, wsRow.bizProfileId))
          .limit(1);
        if (!currentBiz) {
          throw new Error(
            `workspace.biz_profile_id=${wsRow.bizProfileId} points to missing biz_profiles row`,
          );
        }
        snapshotId = randomUUID();
        await tx.insert(bizProfiles).values({
          id: snapshotId,
          bizNo: currentBiz.bizNo,
          taxType: currentBiz.taxType,
          status: currentBiz.status,
          grade: currentBiz.grade ?? null,
          gradeSource: currentBiz.gradeSource,
          gradeConfirmedBy: currentBiz.gradeConfirmedBy ?? null,
          gradeConfirmedAt: currentBiz.gradeConfirmedAt ?? null,
        });
      }
      // mode==='none' 또는 mode==='inherit' && workspace bizProfile 미등록
      // → snapshotId 가 null 인 채로 rfps insert. 사전 제안 RFP.

      // 4. rfps insert (share_token: RFP-scoped 영구 공유 URL 토큰. 평문 저장 —
      //    buyer가 상세 페이지 재방문 시 동일 URL을 다시 보여주기 위해. deadline
      //    경과 시 claim 단계에서 만료 분기로 차단되므로 별도 회수 정책 없음.)
      await tx.insert(rfps).values({
        id: rfpId,
        buyerWsId: wsId,
        bizProfileId: snapshotId,
        title: parsed.data.title.trim(),
        memo: parsed.data.memo?.trim() ?? '',
        allowedPgWorkspaceIds: parsed.data.allowedPgWorkspaceIds,
        deadline: new Date(parsed.data.deadline),
        shareToken: generateToken(),
        status: send ? 'sent' : 'draft',
        createdBy: userId,
        sentAt: send ? now : null,
      });

      // 5-bis. RFP 첨부 link-up (Step 11). 업로드 시점에는 RFP가 없어
      // ownerId='__draft__' 로 들어가 있던 attachments rows를 새 rfpId로
      // 갱신한다. uploadedBy + ownerKind 가드로 다른 사용자/유형의 row가
      // 함께 끌려오지 않도록 좁힌다 — 클라이언트가 보낸 id 배열만 바꾸지
      // 않는 이유는 합치된 가드(소유자+종류)가 한 곳에 모이는 편이 안전.
      const rfpIds = parsed.data.rfpAttachmentIds ?? [];
      if (rfpIds.length > 0) {
        await tx
          .update(attachments)
          .set({ ownerId: rfpId })
          .where(
            and(
              inArray(attachments.id, rfpIds),
              eq(attachments.ownerKind, 'rfp'),
              eq(attachments.uploadedBy, userId),
              eq(attachments.ownerId, DRAFT_OWNER_ID),
            ),
          );
      }

      // 6. send 분기 — invitation N rows + outbox per-admin + 1 sent outbox
      if (send) {
        const invitationsRepo = await getInvitationRepo();
        const outbox = await getOutboxRepo();
        const expiresAt = addMinutes(now, INVITE_TTL_DAYS * 24 * 60);

        const buyerName = wsRow.name ?? '구매사';
        const deadlineDisplay = new Date(parsed.data.deadline)
          .toISOString()
          .replace('T', ' ')
          .slice(0, 16);

        for (const pgWsId of parsed.data.allowedPgWorkspaceIds) {
          const rawToken = generateToken();
          const invId = randomUUID();
          await invitationsRepo.save(
            {
              id: invId,
              rfpId,
              pgWsId,
              uniqueToken: '',
              sentAt: now.toISOString(),
              expiresAt,
              status: 'sent',
            },
            rawToken,
            tx,
          );

          // Admin members receive the invite email.
          const adminRows = (await tx
            .select({ userId: workspaceMembers.userId, email: users.email })
            .from(workspaceMembers)
            .innerJoin(users, eq(workspaceMembers.userId, users.id))
            .where(
              and(
                eq(workspaceMembers.workspaceId, pgWsId),
                eq(workspaceMembers.role, 'admin'),
              ),
            )) as { userId: string; email: string }[];

          for (const admin of adminRows) {
            const inviteUrl = `${baseUrl()}/invite/rfp/${rawToken}`;
            const html = await renderRfpInvited({
              rfpId,
              rfpTitle: parsed.data.title.trim(),
              buyerName,
              deadline: deadlineDisplay,
              inviteUrl,
            });
            await outbox.enqueue(
              {
                event: 'rfp.invited',
                to: admin.email,
                subject: `[Supporter B · ${rfpId}] 제안 요청 도착`,
                html,
                dedupeKey: `rfp:${rfpId}:invite:ws:${pgWsId}:user:${admin.userId}`,
              },
              tx,
            );
          }

          // All members receive in-app notification.
          const allMemberRows = (await tx
            .select({ userId: workspaceMembers.userId })
            .from(workspaceMembers)
            .where(eq(workspaceMembers.workspaceId, pgWsId))) as {
            userId: string;
          }[];
          for (const m of allMemberRows) {
            const notif: Notification = {
              id: randomUUID(),
              userId: m.userId,
              workspaceId: pgWsId,
              type: 'rfp.invited',
              title: `[${rfpId}] 제안 요청 도착`,
              body: `${buyerName}가 제안을 요청했습니다.`,
              channel: 'inapp',
              status: 'pending',
              linkUrl: `/inbox/${rfpId}`,
              createdAt: now.toISOString(),
            };
            await dispatchNotification(tx, notif);
            pendingEmits.push(notif);
          }
        }

        // buyer 본인 발송 알림 (메일 outbox).
        const sentHtml = await renderRfpSent({
          rfpId,
          rfpTitle: parsed.data.title.trim(),
          inviteCount: parsed.data.allowedPgWorkspaceIds.length,
        });
        await outbox.enqueue(
          {
            event: 'rfp.sent',
            to: session.user.email ?? '',
            subject: `[Supporter B · ${rfpId}] 발송 완료`,
            html: sentHtml,
            dedupeKey: `rfp:${rfpId}:sent`,
          },
          tx,
        );
      }

      // 빠른 확인: 같은 tx에서 invitation row 추가가 hashToken UNIQUE
      // (`token_hash`) 충돌 시 throw — 여기까지 도달했다면 모두 성공.
      void rfpInvitations; // tree-shaken 방지 (schema reference)

      return { ok: true, rfpId };
    },
  );

  // Post-commit fire-and-forget flush — drains the rfp.invited / rfp.sent
  // entries we just enqueued. cron is the safety net if this drops on the
  // floor (process killed mid-flight). Never blocks the action response.
  if (result.ok && send) {
    emitAfterCommit(pendingEmits);
    flushAfterCommit();
  }
  return result;
}
