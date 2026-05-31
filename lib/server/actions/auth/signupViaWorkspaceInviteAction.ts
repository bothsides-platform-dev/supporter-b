'use server';

/**
 * signupViaWorkspaceInviteAction — 워크스페이스 초대를 통한 신규 가입 finalize.
 *
 * 일반 signupCompleteAction과의 차이:
 *   - wsName/bizNo/pgProfile 입력 없음 (새 워크스페이스를 만들지 않음)
 *   - createWorkspaceInTx 호출 안 함, adminNotice 안 보냄
 *   - wsInviteToken을 검증하고, 기존(이미 승인된) 워크스페이스에 member로 합류
 *   - redirectTo = '/home' (일반 가입의 /inbox와 다름)
 *
 * 인증 게이트: phone OTP + 이메일 인증(consumedAt IS NOT NULL)은 동일하게 적용.
 *
 * TOCTOU 방지: 초대 토큰 클레임은 트랜잭션 내 조건부 UPDATE로 원자적 수행.
 * 사전 체크(INVITE_INVALID, INVITE_EMAIL_MISMATCH)는 빠른 에러 반환용이고,
 * 진짜 직렬화 지점은 `WHERE status='pending' AND expires_at > now()` UPDATE이다.
 */

import { z } from 'zod';
import { randomUUID } from 'node:crypto';
import { and, eq, isNotNull } from 'drizzle-orm';
import { hashPassword } from '@/lib/auth/password';
import { passwordSchema } from '@/lib/auth/password-validation';
import {
  users,
  phoneOtps,
  verificationTokens,
  workspaceInvitations,
} from '@/lib/db/schema';
import {
  actionDb,
  isUniqueViolation,
  normalizeEmail,
  type AuthActionResult,
} from './_shared';
import { normalizePhone } from './phoneOtpUtils';
import { hashToken } from '@/lib/server/token';
import { claimInviteInTx } from '@/lib/server/actions/workspace/_claimWorkspaceInvite';

const Input = z
  .object({
    email: z.string().email(),
    name: z.string().min(1).max(100),
    password: passwordSchema,
    phone: z.string().min(9).max(15),
    phoneVerificationId: z.string().uuid(),
    wsInviteToken: z.string().min(1),
  })
  .strict();

export type SignupViaWorkspaceInviteInput = z.input<typeof Input>;
export type SignupViaWorkspaceInviteResult = AuthActionResult<{
  redirectTo: string;
  email: string;
  password: string;
}>;

export async function signupViaWorkspaceInviteAction(
  input: SignupViaWorkspaceInviteInput,
): Promise<SignupViaWorkspaceInviteResult> {
  const parsed = Input.safeParse(input);
  if (!parsed.success) {
    const weak = parsed.error.issues.some(
      (i) => i.path[0] === 'password' && i.message === 'WEAK_PASSWORD',
    );
    return { ok: false, error: weak ? 'WEAK_PASSWORD' : 'INVALID_INPUT' };
  }

  const email = normalizeEmail(parsed.data.email);
  const normalizedPhone = normalizePhone(parsed.data.phone);
  if (!normalizedPhone) return { ok: false, error: 'INVALID_INPUT' };

  const db = actionDb();

  // ── 1 + 2. Phone OTP + 이메일 인증 게이트 (병렬) ─────────────────────────
  // 두 조회는 서로 독립적이므로 병렬 실행.
  const [[otpRow], [emailToken]] = await Promise.all([
    db
      .select()
      .from(phoneOtps)
      .where(
        and(
          eq(phoneOtps.id, parsed.data.phoneVerificationId),
          eq(phoneOtps.phone, normalizedPhone),
          isNotNull(phoneOtps.verifiedAt),
        ),
      )
      .limit(1),
    db
      .select({ id: verificationTokens.id })
      .from(verificationTokens)
      .where(
        and(
          eq(verificationTokens.email, email),
          eq(verificationTokens.purpose, 'signup_email'),
          isNotNull(verificationTokens.consumedAt),
        ),
      )
      .limit(1),
  ]);

  if (!otpRow) return { ok: false, error: 'PHONE_NOT_VERIFIED' };
  if (!emailToken) return { ok: false, error: 'EMAIL_NOT_VERIFIED' };

  // ── 3. 초대 토큰 사전 검증 (빠른 에러 반환, 쓰기 없음) ─────────────────────
  // INVITE_INVALID + INVITE_EMAIL_MISMATCH는 tx 밖에서 확인해 불필요한 트랜잭션 시작 방지.
  // INVITE_EXPIRED는 tx 안의 조건부 UPDATE로 원자적으로 처리 (TOCTOU 방지).
  const inviteTokenHash = hashToken(parsed.data.wsInviteToken);

  const [invitation] = await db
    .select()
    .from(workspaceInvitations)
    .where(eq(workspaceInvitations.tokenHash, inviteTokenHash))
    .limit(1);

  if (!invitation) return { ok: false, error: 'INVITE_INVALID' };

  // 만료 사전 체크 — tx 안에서도 재확인하므로 여기선 빠른 경로만.
  if (invitation.status !== 'pending' || invitation.expiresAt < new Date()) {
    return { ok: false, error: 'INVITE_EXPIRED' };
  }

  // 이메일 일치 확인 (대소문자 무시) — tx 전에 확인해 불필요한 write 방지.
  if (normalizeEmail(invitation.invitedEmail) !== email) {
    return { ok: false, error: 'INVITE_EMAIL_MISMATCH' };
  }

  // ── 4. 단일 트랜잭션: user 생성 + 초대 원자적 클레임 + 멤버십 추가 ──────────
  const passwordHash = await hashPassword(parsed.data.password);
  const userId = randomUUID();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const result = await db.transaction(async (tx: any): Promise<SignupViaWorkspaceInviteResult> => {
    // 4a. 유저 생성
    try {
      await tx.insert(users).values({
        id: userId,
        email,
        passwordHash,
        name: parsed.data.name,
        phone: normalizedPhone,
        avatarColor: 'ink',
        status: 'active',
      });
    } catch (err) {
      if (isUniqueViolation(err)) return { ok: false, error: 'EMAIL_TAKEN' };
      throw err;
    }

    // 4b + 4c. 원자적 클레임 (조건부 UPDATE + 멤버십 삽입) — 공통 헬퍼 사용
    const claim = await claimInviteInTx(tx, invitation, userId);
    if (!claim.ok) return claim; // INVITE_EXPIRED (동시 요청 경쟁)

    // 4d. lastActiveWorkspaceId = 초대 워크스페이스
    await tx
      .update(users)
      .set({ lastActiveWorkspaceId: invitation.workspaceId })
      .where(eq(users.id, userId));

    return {
      ok: true,
      redirectTo: '/home',
      email,
      password: parsed.data.password,
    };
  });

  return result;
}
