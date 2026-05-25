'use server';

import { requireSession } from '@/lib/auth/session';
import { getNotificationRepo } from '@/lib/server/repositories/factory';
import { type NotificationActionResult } from './_shared';

export type MarkAllReadResult = NotificationActionResult;

/** 현재 워크스페이스의 미읽음 알림 일괄 읽음 처리. */
export async function markAllReadAction(): Promise<MarkAllReadResult> {
  let session;
  try {
    session = await requireSession();
  } catch {
    return { ok: false, error: 'UNAUTHENTICATED' };
  }
  if (!session.user.workspaceId) {
    return { ok: false, error: 'FORBIDDEN' };
  }
  const repo = await getNotificationRepo();
  await repo.markAllRead(session.user.id, session.user.workspaceId);
  return { ok: true };
}
