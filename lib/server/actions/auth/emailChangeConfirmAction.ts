'use server';

import { z } from 'zod';
import { type AuthActionResult } from './_shared';
import { getAuthService } from '@/lib/server/services/auth';

const Input = z.object({ rawToken: z.string().min(1).max(256) });

export type EmailChangeConfirmInput = z.infer<typeof Input>;
export type EmailChangeConfirmResult = AuthActionResult;

export async function emailChangeConfirmAction(
  input: EmailChangeConfirmInput,
): Promise<EmailChangeConfirmResult> {
  const parsed = Input.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'INVALID_INPUT' };

  const svc = await getAuthService();
  return svc.confirmEmailChange({ rawToken: parsed.data.rawToken });
}
