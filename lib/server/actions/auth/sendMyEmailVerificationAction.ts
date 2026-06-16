'use server';

import { auth } from '@/auth';
import { getAuthService } from '@/lib/server/services/auth';
import { normalizeEmail, type AuthActionResult } from './_shared';

/**
 * 현재 로그인한 (아직 미인증) 유저에게 인증 메일을 발송한다.
 * 가입 후 /pending-approval 에서 호출 — 유저가 이미 존재하므로 signupEmailAction 의
 * EMAIL_TAKEN 가드를 거치지 않고 직접 AuthService.issueSignupEmail 을 호출한다.
 *
 * `resend: true` 는 사용자가 누른 명시적 재발송 — 같은 15분 버킷에서도 항상 새 메일을
 * 보낸다(유니크 dedupeKey). 인자 없는 호출은 마운트 자동 발송(버킷 dedup, 멱등).
 */
export async function sendMyEmailVerificationAction(opts?: {
  resend?: boolean;
}): Promise<AuthActionResult> {
  const session = await auth();
  const email = session?.user?.email;
  if (!email) return { ok: false, error: 'UNAUTHENTICATED' };

  await (await getAuthService()).issueSignupEmail({
    email: normalizeEmail(email),
    mode: opts?.resend ? 'resend' : 'auto',
  });
  return { ok: true };
}
