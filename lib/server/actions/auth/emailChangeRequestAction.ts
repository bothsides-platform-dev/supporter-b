'use server';

import { z } from 'zod';
import { requireSession } from '@/lib/auth/session';
import { normalizeEmail, type AuthActionResult } from './_shared';
import { getAuthService } from '@/lib/server/services/auth';

const Input = z.object({ newEmail: z.string().email() });

export type EmailChangeRequestInput = z.infer<typeof Input>;
export type EmailChangeRequestResult = AuthActionResult;

export async function emailChangeRequestAction(
  input: EmailChangeRequestInput,
): Promise<EmailChangeRequestResult> {
  const session = await requireSession().catch(() => null);
  if (!session) return { ok: false, error: 'UNAUTHENTICATED' };
  // 마스터/운영자 계정의 이메일은 MASTER_ACCOUNT_EMAILS env로만 관리 — 셀프 변경 금지.
  if (session.user.isMaster) return { ok: false, error: 'FORBIDDEN' };

  const parsed = Input.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'INVALID_INPUT' };

  const newEmail = normalizeEmail(parsed.data.newEmail);
  const svc = await getAuthService();
  return svc.requestEmailChange({ userId: session.user.id, newEmail });
}
