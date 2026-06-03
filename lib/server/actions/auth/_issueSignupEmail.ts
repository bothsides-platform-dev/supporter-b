import { randomInt, randomUUID } from 'node:crypto';

import {
  getOutboxRepo,
  getVerificationTokenRepo,
} from '@/lib/server/repositories/factory';
import { addMinutes, generateToken, hashToken } from '@/lib/server/token';
import { renderAuthVerify } from '@/lib/server/outbox/templates/authVerify';
import { flushAfterCommit } from '@/lib/server/outbox/post-commit';
import { actionDb, baseUrl, bucket15Min } from './_shared';

/** 6자리 숫자 OTP 코드 생성 (000000~999999). */
function generateEmailCode(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, '0');
}

/**
 * signup_email 토큰 발급 + 인증 메일 enqueue (link + 6자리 코드).
 *
 * 가입 게이트(EMAIL_TAKEN) 검사와 무관한 순수 발급 로직 — 두 호출자가 공유한다:
 *   - signupEmailAction: 가입 전(유저 없음) 발급, EMAIL_TAKEN 가드는 호출자가 수행
 *   - sendMyEmailVerificationAction: 가입 후(유저 존재) /pending-approval 자동 발송·재발송
 *
 * `email` 은 normalizeEmail 을 거친 값이어야 한다. TTL 15분.
 *
 * dedupe·토큰 회전 정책 (passwordForgotAction 과 동일한 enqueue-before-rotate):
 *   1. 메일을 **먼저** enqueue 한다.
 *   2. dedupe 충돌로 새 메일이 큐에 안 들어가면(`entry === null`) 이전 미소비
 *      토큰을 그대로 두고 종료한다 — 그래야 직전 메일의 링크·코드가 계속 유효하다
 *      (burn 후 메일도 못 보내면 작동 인증 수단이 0개가 되는 함정 회피).
 *   3. 새 메일이 실제로 enqueue 됐을 때만 이전 토큰을 만료(expiresAt=now, consumedAt 은
 *      NULL 유지 — "consumedAt IS NOT NULL ⟺ 인증 완료" 불변식 보존)하고 새 토큰 저장.
 *
 * mode:
 *   - 'auto'  (default): /pending-approval 마운트 자동 발송. 15분 버킷 dedupeKey 로
 *      리마운트/중복 마운트에 멱등.
 *   - 'resend': 사용자가 누른 명시적 재발송. tokenHash 기반 유니크 dedupeKey 로 같은
 *      버킷에서도 항상 새 메일을 보낸다 (resendWorkspaceInviteAction 과 동일 패턴).
 *      도배 방지는 클라이언트 쿨다운이 담당한다.
 */
export async function issueSignupEmail(params: {
  email: string;
  inviteToken?: string;
  workspaceType?: 'buyer' | 'pg';
  mode?: 'auto' | 'resend';
}): Promise<void> {
  const { email, mode = 'auto' } = params;

  const rawToken = generateToken();
  const tokenHash = hashToken(rawToken);
  const expiresAt = addMinutes(new Date(), 15);
  const emailCode = generateEmailCode();
  const emailCodeHash = hashToken(emailCode);

  const verifyUrl = `${baseUrl()}/auth/verify?token=${rawToken}`;
  const html = await renderAuthVerify({ verifyUrl, expiresMinutes: 15, emailCode });

  // 명시적 재발송은 tokenHash 유니크 키 → 같은 15분 버킷에서도 dedup 되지 않고 항상
  // 전송. 마운트 자동 발송은 버킷 키 → 리마운트/중복 마운트에 멱등.
  const dedupeKey =
    mode === 'resend'
      ? `signup-verify-resend:${email}:${tokenHash}`
      : `signup-verify:${email}:${bucket15Min()}`;

  const metaFields = {
    ...(params.inviteToken ? { inviteToken: params.inviteToken } : {}),
    ...(params.workspaceType ? { workspaceType: params.workspaceType } : {}),
    emailCode: emailCodeHash,
  };

  const db = actionDb();
  await db.transaction(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    async (tx: any) => {
      const outbox = await getOutboxRepo();
      const entry = await outbox.enqueue(
        {
          event: 'auth.verify',
          to: email,
          subject: '[Supporter B] 이메일 인증을 완료해 주세요',
          html,
          dedupeKey,
        },
        tx,
      );
      // dedupe 충돌 — 새 메일이 안 나갔으므로 이전 토큰을 그대로 두고 종료.
      if (!entry) return;

      const verifications = await getVerificationTokenRepo();
      await verifications.expirePendingByEmail(
        { email, purpose: 'signup_email', now: new Date() },
        tx,
      );
      await verifications.save(
        {
          id: randomUUID(),
          purpose: 'signup_email',
          email,
          tokenHash,
          issuedAt: new Date().toISOString(),
          expiresAt,
          meta: metaFields,
        },
        tx,
      );
    },
  );

  flushAfterCommit();
}
