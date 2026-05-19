'use server';

import { z } from 'zod';
import { randomUUID } from 'node:crypto';

import {
  getOutboxRepo,
  getUserRepo,
  getVerificationTokenRepo,
} from '@/lib/server/repositories/factory';
import { addMinutes, generateToken, hashToken } from '@/lib/server/token';
import { renderAuthReset } from '@/lib/server/outbox/templates/authReset';
import { flushAfterCommit } from '@/lib/server/outbox/post-commit';
import {
  actionDb,
  baseUrl,
  bucket15Min,
  normalizeEmail,
  type AuthActionResult,
} from './_shared';

const Input = z.object({ email: z.string().email() });

export type PasswordForgotInput = z.infer<typeof Input>;
export type PasswordForgotResult = AuthActionResult;

/**
 * P7 — issue a password_reset token. **Always** returns `{ ok: true }` so an
 * attacker can't probe which addresses have accounts. Token + outbox row are
 * only created if the email matches a real user.
 *
 * Reissue 정책 (OWASP Forgot Password): 새 outbox row 가 실제로 enqueue 된
 * 경우에만 같은 (email, password_reset) 의 이전 미사용 토큰을 일괄 burn.
 * outbox dedupe 충돌(같은 15분 버킷) 시에는 이전 토큰을 그대로 두어 첫
 * 이메일의 링크가 계속 유효하도록 한다 — burn 후 새 이메일도 보내지 못하면
 * 사용자에게 작동하는 링크가 0개가 되는 UX 함정을 회피.
 *
 * Token TTL: 30 minutes.
 */
export async function passwordForgotAction(
  input: PasswordForgotInput,
): Promise<PasswordForgotResult> {
  const parsed = Input.safeParse(input);
  if (!parsed.success) {
    // Even on input error keep the response shape uniform — never leak.
    return { ok: true };
  }
  const email = normalizeEmail(parsed.data.email);

  const userRepo = await getUserRepo();
  const user = await userRepo.findByEmail(email);
  if (!user) return { ok: true };

  const rawToken = generateToken();
  const resetUrl = `${baseUrl()}/password/reset?token=${rawToken}`;
  const html = await renderAuthReset({ resetUrl, expiresMinutes: 30 });
  const dedupeKey = `password-reset:${email}:${bucket15Min()}`;
  const now = new Date();

  const db = actionDb();
  await db.transaction(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    async (tx: any) => {
      const outbox = await getOutboxRepo();
      const entry = await outbox.enqueue(
        {
          event: 'auth.reset',
          to: email,
          subject: '[Supporter B] 비밀번호 재설정 안내',
          html,
          dedupeKey,
        },
        tx,
      );
      // dedupe 충돌 — 이전 토큰 + 이전 이메일을 그대로 유지하고 종료.
      if (!entry) return;

      const verifications = await getVerificationTokenRepo();
      await verifications.invalidatePending(
        { email, purpose: 'password_reset', now },
        tx,
      );
      await verifications.save(
        {
          id: randomUUID(),
          purpose: 'password_reset',
          email,
          tokenHash: hashToken(rawToken),
          issuedAt: now.toISOString(),
          expiresAt: addMinutes(now, 30),
        },
        tx,
      );
    },
  );

  flushAfterCommit();

  return { ok: true };
}
