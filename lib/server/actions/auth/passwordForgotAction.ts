'use server';

import { z } from 'zod';
import { normalizeEmail, type AuthActionResult } from './_shared';
import { getAuthService } from '@/lib/server/services/auth';

const Input = z.object({ email: z.string().email() });

export type PasswordForgotInput = z.infer<typeof Input>;
export type PasswordForgotResult = AuthActionResult;

export async function passwordForgotAction(
  input: PasswordForgotInput,
): Promise<PasswordForgotResult> {
  const parsed = Input.safeParse(input);
  if (!parsed.success) {
    return { ok: true };
  }
  const email = normalizeEmail(parsed.data.email);
  const svc = await getAuthService();
  return svc.requestPasswordReset({ email });
}
