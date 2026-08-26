'use server';

import { z } from 'zod';
import { passwordSchema } from '@/lib/auth/password-validation';
import { isMasterEmail } from '@/lib/auth/master-allowlist';
import { normalizeEmail, type AuthActionResult } from './_shared';
import { normalizePhone } from './phoneOtpUtils';
import { resolveSecurityMethod } from '@/lib/signing/security-method';
import { getAuthService } from '@/lib/server/services/auth';
import { SignupSourceInput } from './_signupSourceInput';
import { migrateSignupSource } from '@/lib/types/signup-source';

const Input = z
  .object({
    email: z.string().email(),
    name: z.string().min(1).max(100),
    password: passwordSchema,
    phone: z.string().min(9).max(15),
    phoneVerificationId: z.string().uuid(),
    wsInviteToken: z.string().min(1),
    signupSource: SignupSourceInput.optional(),
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
  // 운영자/마스터 이메일은 가입 불가(비밀번호 로그인이 차단된 Google OAuth 전용 계정).
  // 유저/멤버십 생성 전에 차단해 orphan 계정을 막는다.
  if (isMasterEmail(email)) return { ok: false, error: 'MASTER_EMAIL' };
  const normalizedPhone = normalizePhone(parsed.data.phone);
  if (!normalizedPhone) return { ok: false, error: 'INVALID_INPUT' };

  // 여기 저장되는 번호가 그대로 서명 본인인증에 쓰인다 — 간편인증은 010 만 받는다.
  // 011 로 가입시키면 그 계정은 계약 발송에서 막히고, 고치라고 안내받는 화면
  // (설정 > 프로필)에서도 같은 규칙에 또 막혀 데드엔드가 된다. 가입 액션 셋이
  // 모두 users.phone 에 쓰므로 게이트도 셋 다에 선다 — 하나만 막으면 나머지가
  // 클라이언트 게이트와 규칙을 달리 말한다.
  if (!resolveSecurityMethod(normalizedPhone).enforced) {
    return { ok: false, error: 'PHONE_NOT_MOBILE_010' };
  }

  const svc = await getAuthService();
  const result = await svc.signupViaInvite({
    email,
    name: parsed.data.name,
    plainPassword: parsed.data.password,
    phone: normalizedPhone,
    phoneVerificationId: parsed.data.phoneVerificationId,
    wsInviteRawToken: parsed.data.wsInviteToken,
    signupSource: parsed.data.signupSource
      ? migrateSignupSource(parsed.data.signupSource)
      : undefined,
  });

  if (!result.ok) return result;

  return {
    ok: true,
    redirectTo: '/home',
    email: result.email,
    password: parsed.data.password,
  };
}
