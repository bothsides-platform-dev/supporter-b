'use server';

import { z } from 'zod';
import { normalizeEmail, type AuthActionResult } from './_shared';
import { allowEmailLookup } from './_emailLookupLimit';
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
  // 공개 이메일 입력 경로 공통 IP 한도. 가입 여부를 숨기려고 한도 초과도 ok:true 로
  // 위장한다(가입 쪽 RATE_LIMITED 와 다름). 이메일별 발송 한도는 서비스가 건다.
  if (!(await allowEmailLookup())) return { ok: true };
  const email = normalizeEmail(parsed.data.email);
  // 마스터/운영자 계정은 비밀번호 재설정 토큰을 발급하지 않는다 (Google OAuth 전용).
  // 존재 위장을 위해 ok:true 그대로 반환 — 이메일/토큰은 만들지 않음.
  if (isMasterEmail(email)) return { ok: true };
  const svc = await getAuthService();
  return svc.requestPasswordReset({ email });
}
