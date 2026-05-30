'use server';

import { z } from 'zod';
import { randomInt, randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';

import {
  getOutboxRepo,
  getVerificationTokenRepo,
} from '@/lib/server/repositories/factory';
import { addMinutes, generateToken, hashToken } from '@/lib/server/token';
import { renderAuthVerify } from '@/lib/server/outbox/templates/authVerify';
import { flushAfterCommit } from '@/lib/server/outbox/post-commit';
import { users } from '@/lib/db/schema';
import {
  actionDb,
  baseUrl,
  bucket15Min,
  normalizeEmail,
  type AuthActionResult,
} from './_shared';

/** 6자리 숫자 OTP 코드 생성 (000000~999999). */
function generateEmailCode(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, '0');
}

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
 * - Token TTL: 15 minutes.
 * - meta.inviteToken (if present) is the only carrier of the RFP invite
 *   across the verify hop — the client puts it back into sessionStorage
 *   from `verifyEmailAction`'s response.
 * - Outbox dedupe key bucketed per 15-minute window so resend taps in the
 *   same window collapse to one outbox row.
 */
export async function signupEmailAction(
  input: SignupEmailInput,
): Promise<SignupEmailResult> {
  const parsed = Input.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'INVALID_INPUT' };

  const email = normalizeEmail(parsed.data.email);

  const [existing] = await actionDb()
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, email))
    .limit(1);
  if (existing) return { ok: false, error: 'EMAIL_TAKEN' };

  const rawToken = generateToken();
  const tokenHash = hashToken(rawToken);
  const expiresAt = addMinutes(new Date(), 15);

  // 6자리 코드 — 링크 클릭이 불가한 환경(다른 기기, 웹메일 등)의 인라인 인증 폴백.
  const emailCode = generateEmailCode();
  const emailCodeHash = hashToken(emailCode);

  const verifications = await getVerificationTokenRepo();

  // 재발송 시 이전 미소비 토큰을 expire(consumedAt NULL 유지).
  // 불변식: consumedAt IS NOT NULL ⟺ 사용자가 직접 인증 완료.
  // expirePendingByEmail 은 `signupCompleteAction`의 EMAIL_NOT_VERIFIED 게이트가
  // 미인증 토큰으로 통과하는 것을 방지하는 단일-라이브-코드 보장 메커니즘.
  await verifications.expirePendingByEmail({
    email,
    purpose: 'signup_email',
    now: new Date(),
  });

  const metaFields = {
    ...(parsed.data.inviteToken ? { inviteToken: parsed.data.inviteToken } : {}),
    ...(parsed.data.workspaceType ? { workspaceType: parsed.data.workspaceType } : {}),
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

  // Post-commit flush — fire-and-forget. The action runs without an
  // explicit `db.transaction()` wrapper, so "post-commit" here means
  // "after the enqueue UPDATE is durable" which is the same instant.
  flushAfterCommit();

  return { ok: true, email };
}
