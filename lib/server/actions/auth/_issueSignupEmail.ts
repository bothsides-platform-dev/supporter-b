import { randomInt, randomUUID } from 'node:crypto';

import {
  getOutboxRepo,
  getVerificationTokenRepo,
} from '@/lib/server/repositories/factory';
import { addMinutes, generateToken, hashToken } from '@/lib/server/token';
import { renderAuthVerify } from '@/lib/server/outbox/templates/authVerify';
import { flushAfterCommit } from '@/lib/server/outbox/post-commit';
import { baseUrl, bucket15Min } from './_shared';

/** 6자리 숫자 OTP 코드 생성 (000000~999999). */
function generateEmailCode(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, '0');
}

/**
 * signup_email 토큰 발급 + 인증 메일 enqueue (link + 6자리 코드).
 *
 * 가입 게이트(EMAIL_TAKEN) 검사와 무관한 순수 발급 로직 — 두 호출자가 공유한다:
 *   - signupEmailAction: 가입 전(유저 없음) 발급, EMAIL_TAKEN 가드는 호출자가 수행
 *   - sendMyEmailVerificationAction: 가입 후(유저 존재) /pending-approval 재발송
 *
 * `email` 은 normalizeEmail 을 거친 값이어야 한다. TTL 15분, 재발송 시 이전 미소비
 * 토큰은 expirePendingByEmail 로 만료(consumedAt 은 NULL 유지 — 인증 불변식 보존).
 */
export async function issueSignupEmail(params: {
  email: string;
  inviteToken?: string;
  workspaceType?: 'buyer' | 'pg';
}): Promise<void> {
  const { email } = params;

  const rawToken = generateToken();
  const tokenHash = hashToken(rawToken);
  const expiresAt = addMinutes(new Date(), 15);
  const emailCode = generateEmailCode();
  const emailCodeHash = hashToken(emailCode);

  const verifications = await getVerificationTokenRepo();
  await verifications.expirePendingByEmail({
    email,
    purpose: 'signup_email',
    now: new Date(),
  });

  const metaFields = {
    ...(params.inviteToken ? { inviteToken: params.inviteToken } : {}),
    ...(params.workspaceType ? { workspaceType: params.workspaceType } : {}),
    emailCode: emailCodeHash,
  };
  await verifications.save({
    id: randomUUID(),
    purpose: 'signup_email',
    email,
    tokenHash,
    issuedAt: new Date().toISOString(),
    expiresAt,
    meta: metaFields,
  });

  const verifyUrl = `${baseUrl()}/auth/verify?token=${rawToken}`;
  const outbox = await getOutboxRepo();
  const html = await renderAuthVerify({ verifyUrl, expiresMinutes: 15, emailCode });
  await outbox.enqueue({
    event: 'auth.verify',
    to: email,
    subject: '[Supporter B] 이메일 인증을 완료해 주세요',
    html,
    dedupeKey: `signup-verify:${email}:${bucket15Min()}`,
  });

  flushAfterCommit();
}
