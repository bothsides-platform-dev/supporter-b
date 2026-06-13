'use server';

import { z } from 'zod';
import { normalizeEmail, type AuthActionResult } from './_shared';
import { getAuthService } from '@/lib/server/services/auth';
import { isMasterEmail } from '@/lib/auth/master-allowlist';

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
  // 마스터/운영자 계정은 비밀번호 재설정 토큰을 발급하지 않는다 (Google OAuth 전용).
  // 존재 위장을 위해 ok:true 그대로 반환 — 이메일/토큰은 만들지 않음.
  if (isMasterEmail(email)) return { ok: true };
  const svc = await getAuthService();
  return svc.requestPasswordReset({ email });
}
