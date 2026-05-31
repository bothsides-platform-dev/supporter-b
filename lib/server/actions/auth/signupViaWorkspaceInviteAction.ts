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
  workspaceMembers,
} from '@/lib/db/schema';
import {
  actionDb,
  isUniqueViolation,
  normalizeEmail,
  type AuthActionResult,
} from './_shared';
import { normalizePhone } from './phoneOtpUtils';
import { hashToken } from '@/lib/server/token';

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

  // ── 1. Phone OTP 검증 ────────────────────────────────────────────────────
  const [otpRow] = await db
    .select()
    .from(phoneOtps)
    .where(
      and(
        eq(phoneOtps.id, parsed.data.phoneVerificationId),
        eq(phoneOtps.phone, normalizedPhone),
        isNotNull(phoneOtps.verifiedAt),
      ),
    )
    .limit(1);

  if (!otpRow) return { ok: false, error: 'PHONE_NOT_VERIFIED' };

  // ── 2. 이메일 인증 게이트 ─────────────────────────────────────────────────
  // signupEmailAction → verifyEmailAction/verifyEmailCodeAction 경로가
  // consumedAt을 스탬프 찍어야만 통과 (signupCompleteAction과 동일 불변식).
  const [emailToken] = await db
    .select({ id: verificationTokens.id })
    .from(verificationTokens)
    .where(
      and(
        eq(verificationTokens.email, email),
        eq(verificationTokens.purpose, 'signup_email'),
        isNotNull(verificationTokens.consumedAt),
      ),
    )
    .limit(1);

  if (!emailToken) return { ok: false, error: 'EMAIL_NOT_VERIFIED' };

  // ── 3. 초대 토큰 검증 ────────────────────────────────────────────────────
  const tokenHash = hashToken(parsed.data.wsInviteToken);

  const [invitation] = await db
    .select()
    .from(workspaceInvitations)
    .where(eq(workspaceInvitations.tokenHash, tokenHash))
    .limit(1);

  if (!invitation) return { ok: false, error: 'INVITE_INVALID' };

  if (invitation.status !== 'pending' || invitation.expiresAt < new Date()) {
    return { ok: false, error: 'INVITE_EXPIRED' };
  }

  // 이메일 일치 확인 (대소문자 무시)
  if (normalizeEmail(invitation.invitedEmail) !== email) {
    return { ok: false, error: 'INVITE_EMAIL_MISMATCH' };
  }

  // ── 4. 단일 트랜잭션: user 생성 + 초대 수락 + 멤버십 추가 ──────────────────
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
        // lastActiveWorkspaceId는 아래에서 별도 UPDATE (초대 ws id)
      });
    } catch (err) {
      if (isUniqueViolation(err)) return { ok: false, error: 'EMAIL_TAKEN' };
      throw err;
    }

    // 4b. 초대 수락 상태 업데이트
    await tx
      .update(workspaceInvitations)
      .set({ status: 'accepted', acceptedByUserId: userId })
      .where(eq(workspaceInvitations.id, invitation.id));

    // 4c. 워크스페이스 멤버십 추가 (초대 row의 role 사용)
    await tx
      .insert(workspaceMembers)
      .values({
        workspaceId: invitation.workspaceId,
        userId,
        role: invitation.role,
      })
      .onConflictDoNothing();

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
