'use server';

import { z } from 'zod';
import { getAuthService } from '@/lib/server/services/auth';
import { normalizeEmail, type AuthActionResult } from './_shared';

const Input = z.object({
  email: z.string().email(),
  code: z.string().regex(/^\d{6}$/, 'INVALID_INPUT'),
});

export type VerifyEmailCodeResult = AuthActionResult<{
  email: string;
  inviteToken?: string;
  workspaceType?: 'buyer' | 'pg';
}>;

/**
 * 이메일로 발송된 6자리 OTP 코드로 signup_email 토큰을 인증.
 * 링크 클릭이 어려운 환경(다른 기기, 웹메일)의 폴백 경로.
 * 형식 가드 + normalizeEmail 후 AuthService.verifyEmailCode 에 위임.
 */
export async function verifyEmailCodeAction(input: {
  email: string;
  code: string;
}): Promise<VerifyEmailCodeResult> {
  const parsed = Input.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'INVALID_INPUT' };

  const email = normalizeEmail(parsed.data.email);

  return (await getAuthService()).verifyEmailCode({ email, code: parsed.data.code });
}
