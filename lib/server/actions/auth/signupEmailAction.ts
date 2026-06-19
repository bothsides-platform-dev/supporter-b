'use server';

import { z } from 'zod';

import { getUserRepo } from '@/lib/server/repositories/factory';
import { getAuthService } from '@/lib/server/services/auth';
import { isMasterEmail } from '@/lib/auth/master-allowlist';
import {
  normalizeEmail,
  type AuthActionResult,
} from './_shared';

const Input = z.object({
  email: z.string().email(),
  workspaceType: z.enum(['buyer', 'pg']).optional(),
  inviteToken: z.string().min(1).max(256).optional(),
});

export type SignupEmailInput = z.infer<typeof Input>;
export type SignupEmailResult = AuthActionResult<{ email: string }>;

/**
 * P2 — issue a signup_email verification token and enqueue the outbox mail.
 *
 * Pre-signup variant: rejects an email that already belongs to a user
 * (EMAIL_TAKEN). The token issuance itself lives in AuthService.issueSignupEmail,
 * shared with `sendMyEmailVerificationAction` (post-signup resend, no EMAIL_TAKEN).
 */
export async function signupEmailAction(
  input: SignupEmailInput,
): Promise<SignupEmailResult> {
  const parsed = Input.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'INVALID_INPUT' };

  const email = normalizeEmail(parsed.data.email);

  // 운영자/마스터 이메일은 일반 가입 불가(비밀번호 로그인 차단 — Google OAuth 전용).
  // 가입을 끝까지 진행하면 자동 로그인 단계에서만 죽어 orphan 계정이 생기므로
  // 진입점에서 막는다(보안 경계는 finalize 액션에도 동일 가드).
  if (isMasterEmail(email)) return { ok: false, error: 'MASTER_EMAIL' };

  const exists = await (await getUserRepo()).existsByEmail(email);
  if (exists) return { ok: false, error: 'EMAIL_TAKEN' };

  await (await getAuthService()).issueSignupEmail({
    email,
    inviteToken: parsed.data.inviteToken,
    workspaceType: parsed.data.workspaceType,
  });

  return { ok: true, email };
}
