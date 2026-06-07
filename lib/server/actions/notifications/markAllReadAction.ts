'use server';

import { requireSession } from '@/lib/auth/session';
import { type NotificationActionResult } from './_shared';
import { getNotificationService } from '@/lib/server/services/notification';

export type MarkAllReadResult = NotificationActionResult;

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
  const svc = await getNotificationService();
  return svc.markAllRead({ userId: session.user.id, workspaceId: session.user.workspaceId });
}
