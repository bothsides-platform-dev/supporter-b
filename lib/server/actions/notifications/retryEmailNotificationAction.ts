'use server';

import { z } from 'zod';
import { and, desc, eq } from 'drizzle-orm';

import { requireSession } from '@/lib/auth/session';
import {
  notifications as notifTable,
  outboxEntries,
  users,
} from '@/lib/db/schema';
import {
  actionDb,
  type NotificationActionResult,
} from './_shared';
import type { OutboxEvent } from '@/lib/server/outbox/types';

const Input = z.object({ notificationId: z.string().uuid() }).strict();

export type RetryEmailNotificationInput = z.infer<typeof Input>;
export type RetryEmailNotificationResult = NotificationActionResult<{
  outboxId: string;
}>;

/**
 * 알림 단건의 이메일 재발송 enqueue.
 *
 * **Heuristic** (advisor 합의): 현재 `notifications` 테이블은 channel='inapp'
 * row만 들어가고, 이메일 발송 상태는 `outbox_entries`에 별도로 산다(FK 없음).
 * 따라서 여기서는 `notification.userId.email` + `notification.type`을 키로
 * 가장 최근 'failed' outbox row를 찾아 status='pending'으로 reset.
 * - **attempts 보존**(스펙 명시) — 재시도 횟수 누적이 outbox dispatcher 로직
 *   `attempts >= maxAttempts` 가드와 정합.
 * - notification.type이 outbox_event_enum에 없는 값(예: rfp.rejected,
 *   rfp.cancelled, rfp.closed)이면 이메일이 원래 발송되지 않으니 NO_EMAIL.
 *
 * Step 10 시점에 이메일 발송 결과를 직접 notification row에 반영하면 이
 * 휴리스틱은 더 단순한 (notification → outbox FK) 조회로 swap.
 */
const ALLOWED_OUTBOX_EVENTS = new Set<string>([
  'auth.verify',
  'auth.reset',
  'auth.email-change',
  'rfp.invited',
  'rfp.sent',
  'bid.submitted',
  'rfp.awarded',
]);

export async function retryEmailNotificationAction(
  input: RetryEmailNotificationInput,
): Promise<RetryEmailNotificationResult> {
  let session;
  try {
    session = await requireSession();
  } catch {
    return { ok: false, error: 'UNAUTHENTICATED' };
  }
  const parsed = Input.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'INVALID_INPUT' };

  const userId = session.user.id;
  const db = actionDb();

  // notification ownership + type 동시에 확보.
  const [notif] = await db
    .select({ type: notifTable.type, userId: notifTable.userId })
    .from(notifTable)
    .where(
      and(
        eq(notifTable.id, parsed.data.notificationId),
        eq(notifTable.userId, userId),
      ),
    )
    .limit(1);
  if (!notif) return { ok: false, error: 'NOT_FOUND' };

  if (!ALLOWED_OUTBOX_EVENTS.has(notif.type)) {
    return { ok: false, error: 'NO_EMAIL' };
  }

  // 사용자 이메일 (outbox.toAddr 매칭).
  const [user] = await db
    .select({ email: users.email })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  if (!user) return { ok: false, error: 'USER_NOT_FOUND' };

  // 가장 최근 'failed' outbox row 한 건.
  const [row] = await db
    .select({ id: outboxEntries.id, attempts: outboxEntries.attempts })
    .from(outboxEntries)
    .where(
      and(
        eq(outboxEntries.toAddr, user.email),
        eq(outboxEntries.event, notif.type as OutboxEvent),
        eq(outboxEntries.status, 'failed'),
      ),
    )
    .orderBy(desc(outboxEntries.scheduledAt))
    .limit(1);
  if (!row) return { ok: false, error: 'NO_FAILED_OUTBOX' };

  // attempts 보존 — status만 pending으로. lastError 그대로 둔다(다음 시도 후
  // 갱신). dispatcher가 다음 flush tick에 다시 send 시도.
  await db
    .update(outboxEntries)
    .set({ status: 'pending' })
    .where(eq(outboxEntries.id, row.id));

  return { ok: true, outboxId: row.id };
}
