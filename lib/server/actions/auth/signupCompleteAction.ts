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
import { MERCHANT_TIERS } from '@/lib/types/bid';
import { getAuthService } from '@/lib/server/services/auth';
import { resolveBizProfileForWrite } from '@/lib/server/actions/_resolveBizProfile';
import { appOrigins, workspaceSwitchTarget } from '@/lib/site-routing';
import { migrateSignupSource } from '@/lib/types/signup-source';
import { SignupSourceInput } from './_signupSourceInput';

const PgProfileInput = z
  .object({
    bizNo: z.string().min(10).max(12).refine(bizNoRefinement, { message: BIZ_NO_ERROR }),
    slaDays: z.number().int().min(1).max(30).optional(),
  })
  .strict();

// taxType/status 는 **읽지 않는다** — `resolveBizProfileForWrite` 가 서버에서 직접
// 조회해 덮어쓴다. optional 로 남긴 이유는 하위 호환(기존 클라이언트가 계속 보냄)과
// `.strict()` 가 unknown key 로 거부하지 않게 하기 위함이다. 상태 검사(`active`)도
// 리졸버가 담당하므로 여기 refine 은 제거했다 — 클라이언트가 status 를 생략하는
// 것만으로 검사를 건너뛸 수 있던 우회 경로를 없앤다.
const BizProfileInput = z
  .object({
    bizNo: z
      .string()
      .min(10)
      .max(12)
      .refine(bizNoRefinement, { message: BIZ_NO_ERROR }),
    taxType: z.enum(['general', 'simple', 'exempt']).optional(),
    status: z.enum(['active', 'suspended', 'closed']).optional(),
    grade: z.enum(MERCHANT_TIERS).optional(),
    gradeSource: z.enum(['user_confirmed', 'user_overridden', 'unset']).default(
      'unset',
    ),
  })
  .strict();

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
    signupSource: SignupSourceInput.optional(),
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

  // 사업자번호는 **서버가 직접 조회해 판정**한다 — 클라이언트가 보낸 taxType/status
  // 는 쓰지 않는다. 상위 장애면 미검증(verified:false) 으로 통과시키고, 그 사실을
  // risk flag·심사 메일로 운영자에게만 알린다.
  let bizVerified = true;
  let resolvedBizProfile = parsed.data.bizProfile;
  if (parsed.data.bizProfile) {
    const resolved = await resolveBizProfileForWrite(parsed.data.bizProfile);
    if (!resolved.ok) return { ok: false, error: resolved.error };
    bizVerified = resolved.verified;
    resolvedBizProfile = resolved.bizProfile;
  } else if (parsed.data.pgProfile) {
    // PG 는 사업자 상태(폐업·미등록)를 가입 게이트로 쓰지 않는다 — 기존 동작을
    // 그대로 둔다. 여기서 보는 것은 "장애로 검증하지 못했는가" 하나뿐이고, 그래야
    // risk flag·심사메일 배지의 의미가 '미검증' 으로 정확하게 유지된다.
    // 이게 없으면 PG 저하 가입은 운영자에게 아무 신호도 남기지 않는다.
    const resolved = await resolveBizProfileForWrite({
      bizNo: parsed.data.pgProfile.bizNo,
    });
    // 레이트리밋도 "확인하지 못했다"이지 "확인했더니 문제없다"가 아니다 — resolver 가
    // 이걸 ok:false 로 돌려주므로, verified 판정에서 빠뜨리면 미검증 PG 가입이
    // 검증된 것으로 기록되고 심사자는 배지도 플래그도 못 본다.
    if (!resolved.ok) {
      if (resolved.error === 'BIZ_LOOKUP_RATE_LIMITED') bizVerified = false;
    } else if (!resolved.verified) {
      bizVerified = false;
    }
  }

  const svc = await getAuthService();
  const result = await svc.completeSignup({
    email,
    name: parsed.data.name,
    plainPassword: parsed.data.password,
    phone: normalizedPhone,
    phoneVerificationId: parsed.data.phoneVerificationId,
    wsKind: parsed.data.wsKind,
    wsName: parsed.data.wsName,
    bizProfile: resolvedBizProfile,
    bizVerified,
    pgProfile: parsed.data.pgProfile,
    signupSource: parsed.data.signupSource
      ? migrateSignupSource(parsed.data.signupSource)
      : undefined,
  });

  if (!result.ok) return result;

  notifyAdminNewSignupAfterCommit({
    workspaceName: parsed.data.wsName,
    orgType: parsed.data.wsKind,
    reviewUrl: `${adminBaseUrl()}/admin/review/${result.applicationId}`,
    bizVerified,
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
