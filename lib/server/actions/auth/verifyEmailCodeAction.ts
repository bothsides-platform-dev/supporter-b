'use server';

import { z } from 'zod';
import { getUserRepo, getVerificationTokenRepo } from '@/lib/server/repositories/factory';
import { hashToken } from '@/lib/server/token';
import { normalizeEmail, type AuthActionResult } from './_shared';

// 코드 오입력 허용 횟수 (전화 OTP verifyPhoneOtpAction 과 동일).
const MAX_CODE_ATTEMPTS = 5;

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
 * 코드 → sha256 해시 → meta.emailCode 비교 → atomic consumeByEmailCode.
 */
export async function verifyEmailCodeAction(input: {
  email: string;
  code: string;
}): Promise<VerifyEmailCodeResult> {
  const parsed = Input.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'INVALID_INPUT' };

  const email = normalizeEmail(parsed.data.email);
  const codeHash = hashToken(parsed.data.code);
  const now = new Date();

  const repo = await getVerificationTokenRepo();

  // F2 — cap brute-force of the 6-digit code (phone OTP has the same guard).
  const active = await repo.findActiveEmailCodeToken({
    email,
    purpose: 'signup_email',
    now,
  });
  if (!active) return { ok: false, error: 'TOKEN_INVALID_OR_EXPIRED' };
  if (active.attempts >= MAX_CODE_ATTEMPTS) {
    return { ok: false, error: 'MAX_ATTEMPTS' };
  }
  if (active.emailCodeHash !== codeHash) {
    await repo.bumpEmailCodeAttempts(active.id);
    return { ok: false, error: 'TOKEN_INVALID_OR_EXPIRED' };
  }

  const consumed = await repo.consumeByEmailCode({
    email,
    purpose: 'signup_email',
    codeHash,
    now,
  });

  if (!consumed) return { ok: false, error: 'TOKEN_INVALID_OR_EXPIRED' };

  // 코드 소비 = 이메일 인증. 이미 생성된 유저의 플래그 전환(없으면 no-op).
  await (await getUserRepo()).markEmailVerified(consumed.email);

  const meta = consumed.meta && typeof consumed.meta === 'object'
    ? (consumed.meta as Record<string, unknown>)
    : {};

  const inviteToken = meta.inviteToken;
  const rawWorkspaceType = meta.workspaceType;

  return {
    ok: true,
    email: consumed.email,
    inviteToken: typeof inviteToken === 'string' ? inviteToken : undefined,
    workspaceType:
      rawWorkspaceType === 'buyer' || rawWorkspaceType === 'pg'
        ? rawWorkspaceType
        : undefined,
  };
}
