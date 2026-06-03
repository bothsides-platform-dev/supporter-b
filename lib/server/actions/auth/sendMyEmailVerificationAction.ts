'use server';

import { auth } from '@/auth';
import { normalizeEmail, type AuthActionResult } from './_shared';
import { issueSignupEmail } from './_issueSignupEmail';

/**
 * 현재 로그인한 (아직 미인증) 유저에게 인증 메일을 발송한다.
 * 가입 후 /pending-approval 에서 호출 — 유저가 이미 존재하므로 signupEmailAction 의
 * EMAIL_TAKEN 가드를 거치지 않고 직접 issueSignupEmail 을 호출한다.
 */
export async function sendMyEmailVerificationAction(): Promise<AuthActionResult> {
  const session = await auth();
  const email = session?.user?.email;
  if (!email) return { ok: false, error: 'UNAUTHENTICATED' };

  await issueSignupEmail({ email: normalizeEmail(email) });
  return { ok: true };
}
