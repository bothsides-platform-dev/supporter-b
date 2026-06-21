'use server';

import { headers } from 'next/headers';
import { z } from 'zod';
import { bizNoRefinement, BIZ_NO_ERROR } from '@/lib/validation/biz-no';
import { passwordSchema } from '@/lib/auth/password-validation';
import { isMasterEmail } from '@/lib/auth/master-allowlist';
import {
  notifyAdminNewSignupAfterCommit,
} from '@/lib/server/notifications/admin-signup';
import {
  adminBaseUrl,
  normalizeEmail,
  type AuthActionResult,
} from './_shared';
import { normalizePhone } from './phoneOtpUtils';
import { getAuthService } from '@/lib/server/services/auth';
import { appOrigins, workspaceSwitchTarget } from '@/lib/site-routing';

const PgProfileInput = z
  .object({
    bizNo: z.string().min(10).max(12).refine(bizNoRefinement, { message: BIZ_NO_ERROR }),
    slaDays: z.number().int().min(1).max(30).optional(),
  })
  .strict();

const BizProfileInput = z
  .object({
    bizNo: z
      .string()
      .min(10)
      .max(12)
      .refine(bizNoRefinement, { message: BIZ_NO_ERROR }),
    taxType: z.enum(['general', 'simple', 'exempt']),
    status: z.enum(['active', 'suspended', 'closed']),
    grade: z.enum(['sole', 'sme1', 'sme2', 'sme3', 'general']).optional(),
    gradeSource: z.enum(['user_confirmed', 'user_overridden', 'unset']).default(
      'unset',
    ),
  })
  .strict()
  .refine((p) => p.status === 'active', { message: 'BIZ_STATUS_NOT_ACTIVE' });

const Input = z
  .object({
    email: z.string().email(),
    name: z.string().min(1).max(100),
    password: passwordSchema,
    phone: z.string().min(9).max(15),
    phoneVerificationId: z.string().uuid(),
    wsKind: z.enum(['buyer', 'pg']).optional(),
    wsName: z.string().min(1).max(200).optional(),
    bizProfile: BizProfileInput.optional(),
    pgProfile: PgProfileInput.optional(),
  })
  .strict()
  .refine(
    (d) => d.wsKind !== 'buyer' || !!d.bizProfile,
    { message: 'MISSING_BIZ_PROFILE', path: ['bizProfile'] },
  )
  .refine(
    (d) => d.wsKind !== 'pg' || !!d.pgProfile,
    { message: 'MISSING_PG_PROFILE', path: ['pgProfile'] },
  );

export type SignupCompleteInput = z.input<typeof Input>;
export type SignupCompleteResult = AuthActionResult<{
  redirectTo: string;
  email: string;
  password: string;
}>;

export async function signupCompleteAction(
  input: SignupCompleteInput,
): Promise<SignupCompleteResult> {
  const parsed = Input.safeParse(input);
  if (!parsed.success) {
    const weak = parsed.error.issues.some(
      (i) => i.path[0] === 'password' && i.message === 'WEAK_PASSWORD',
    );
    return { ok: false, error: weak ? 'WEAK_PASSWORD' : 'INVALID_INPUT' };
  }

  if (!parsed.data.wsKind) return { ok: false, error: 'MISSING_WS_KIND' };
  if (!parsed.data.wsName) return { ok: false, error: 'MISSING_WS_NAME' };

  const email = normalizeEmail(parsed.data.email);
  // 운영자/마스터 이메일은 가입 불가(비밀번호 로그인이 차단된 Google OAuth 전용 계정).
  // 유저/워크스페이스 생성·admin 심사 알림 전에 차단해 orphan 계정을 막는다.
  if (isMasterEmail(email)) return { ok: false, error: 'MASTER_EMAIL' };
  const normalizedPhone = normalizePhone(parsed.data.phone);
  if (!normalizedPhone) return { ok: false, error: 'INVALID_INPUT' };

  const svc = await getAuthService();
  const result = await svc.completeSignup({
    email,
    name: parsed.data.name,
    plainPassword: parsed.data.password,
    phone: normalizedPhone,
    phoneVerificationId: parsed.data.phoneVerificationId,
    wsKind: parsed.data.wsKind,
    wsName: parsed.data.wsName,
    bizProfile: parsed.data.bizProfile,
    pgProfile: parsed.data.pgProfile,
  });

  if (!result.ok) return result;

  notifyAdminNewSignupAfterCommit({
    workspaceName: parsed.data.wsName,
    orgType: parsed.data.wsKind,
    reviewUrl: `${adminBaseUrl()}/admin/review/${result.applicationId}`,
  });

  const host = (await headers()).get('host');
  const redirectTo = workspaceSwitchTarget(
    parsed.data.wsKind === 'buyer' ? 'buyer' : 'pg',
    host,
    appOrigins(),
    parsed.data.wsKind === 'buyer' ? '/rfp' : '/inbox',
  );

  return {
    ok: true,
    redirectTo,
    email: result.email,
    password: parsed.data.password,
  };
}
