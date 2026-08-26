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
import { resolveSecurityMethod } from '@/lib/signing/security-method';
import { MERCHANT_TIERS } from '@/lib/types/bid';
import { getAuthService } from '@/lib/server/services/auth';
import { resolveBizProfileForWrite } from '@/lib/server/actions/_resolveBizProfile';
import { getPhoneOtpRepo } from '@/lib/server/repositories/factory';
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
  )
  // PG 가입에 bizProfile 을 실을 이유가 없다. 허용하면 **미끼 우회**가 성립한다:
  // 깨끗한 번호를 bizProfile 로 보내 검증을 통과시키고, 정작 저장되는
  // pgProfile.bizNo 는 조회조차 되지 않는다(createWorkspaceInTx 는 buyer 일 때만
  // bizProfile 을 저장하므로 미끼는 흔적 없이 버려진다) — 미검증 플래그와 심사메일
  // 배지가 통째로 사라진다.
  .refine(
    (d) => d.wsKind !== 'pg' || !d.bizProfile,
    { message: 'UNEXPECTED_BIZ_PROFILE', path: ['bizProfile'] },
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

  // 여기 저장되는 번호가 그대로 서명 본인인증에 쓰인다 — 간편인증은 010 만 받는다
  // (`resolveSecurityMethod`). 011 로 가입시키면 그 계정은 계약 발송에서 막히고,
  // 고치라고 안내받는 화면(설정 > 프로필)에서도 같은 규칙에 또 막혀 데드엔드가 된다.
  // 화면이 먼저 막지만 이 액션은 비인증·직접 호출 가능이라 경계는 서버다.
  // `updateMyPhoneAction` 과 같은 순서·같은 술어를 쓴다(정규화 → 010 → 소유증명).
  if (!resolveSecurityMethod(normalizedPhone).enforced) {
    return { ok: false, error: 'PHONE_NOT_MOBILE_010' };
  }

  // 사업자번호는 **서버가 직접 조회해 판정**한다 — 클라이언트가 보낸 taxType/status
  // 는 쓰지 않는다. 상위 장애면 미검증(verified:false) 으로 통과시키고, 그 사실을
  // risk flag·심사 메일로 운영자에게만 알린다.
  // 외부 조회는 **휴대폰 인증을 통과한 뒤에만** 한다. 이 액션은 비인증이라, 조회를
  // 앞에 두면 아무나 임의의 페이로드로 외부 HTTP 를 유발하고 공용 버킷을 마르게 할
  // 수 있다(요청당 최대 8초 홀드까지). completeSignup 이 같은 검사를 다시 하므로
  // 여기서는 순수한 게이트다 — 중복이 아니라 방어 심층.
  const phoneOtpRepo = await getPhoneOtpRepo();
  if (!(await phoneOtpRepo.isVerified(parsed.data.phoneVerificationId, normalizedPhone))) {
    return { ok: false, error: 'PHONE_NOT_VERIFIED' };
  }

  // 분기 기준은 **wsKind** 다. "어떤 객체가 실려 왔는가"로 고르면 두 객체가 함께
  // 오는 순간 저장되지 않는 쪽을 검증하게 된다(위 refine 이 그 페이로드를 이미
  // 막지만, 판정 기준 자체를 저장 대상과 일치시켜 둔다).
  let bizVerified = true;
  let resolvedBizProfile = parsed.data.bizProfile;
  if (parsed.data.wsKind === 'buyer' && parsed.data.bizProfile) {
    const resolved = await resolveBizProfileForWrite(parsed.data.bizProfile);
    if (!resolved.ok) return { ok: false, error: resolved.error };
    bizVerified = resolved.verified;
    resolvedBizProfile = resolved.bizProfile;
  } else if (parsed.data.wsKind === 'pg' && parsed.data.pgProfile) {
    // PG 는 사업자 상태(폐업·미등록)를 가입 게이트로 쓰지 않는다 — 기존 동작을
    // 그대로 둔다. 여기서 보는 것은 "장애로 검증하지 못했는가" 하나뿐이고, 그래야
    // risk flag·심사메일 배지의 의미가 '미검증' 으로 정확하게 유지된다.
    // 이게 없으면 PG 저하 가입은 운영자에게 아무 신호도 남기지 않는다.
    const resolved = await resolveBizProfileForWrite({
      bizNo: parsed.data.pgProfile.bizNo,
    });
    // **막는 것과 라벨링은 별개다.** PG 가입은 사업자 상태로 게이트하지 않지만(위),
    // 확인되지 않은 번호를 '검증됨' 으로 기록하면 그건 그냥 거짓이다 — 심사자가
    // 배지도 플래그도 못 보고 넘어간다. 장애든 미등록이든 폐업이든 레이트리밋이든,
    // "확인했고 문제없다"가 아닌 모든 결과는 미검증으로 남긴다.
    if (!resolved.ok || !resolved.verified) bizVerified = false;
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
