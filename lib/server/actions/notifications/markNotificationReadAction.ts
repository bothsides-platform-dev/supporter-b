'use server';

import { z } from 'zod';

import { requireSession } from '@/lib/auth/session';
import { type NotificationActionResult } from './_shared';
import { getNotificationService } from '@/lib/server/services/notification';

const Input = z.object({ notificationId: z.string().uuid() }).strict();

export type MarkNotificationReadInput = z.infer<typeof Input>;
export type MarkNotificationReadResult = NotificationActionResult;

export async function markNotificationReadAction(
  input: MarkNotificationReadInput,
): Promise<MarkNotificationReadResult> {
  let session;
  try {
    session = await requireSession();
  } catch {
    return { ok: false, error: 'UNAUTHENTICATED' };
  }
  const parsed = Input.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'INVALID_INPUT' };

  const svc = await getNotificationService();
  return svc.markRead(parsed.data.notificationId, { userId: session.user.id });
}
