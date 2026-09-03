'use server';

import { z } from 'zod';

import { requireBuyerActor } from '@/lib/server/actions/_session';
import { getMembership, isApprovedAdmin } from '@/lib/auth/active-workspace';
import { isMasterEmail } from '@/lib/auth/master-allowlist';
import { getWorkspaceService } from '@/lib/server/services/workspace';
import { MERCHANT_TIERS } from '@/lib/types/bid';
import { resolveBizProfileForWrite } from '@/lib/server/actions/_resolveBizProfile';
import type { RfpActionResult } from './_shared';

const BizProfilePatch = z
  .object({
    bizNo: z.string().min(8).max(20),
    taxType: z.enum(['general', 'simple', 'exempt']),
    status: z.enum(['active', 'suspended', 'closed']),
  })
  .strict();

const Input = z
  .object({
    grade: z.enum(MERCHANT_TIERS).optional(),
    bizProfile: BizProfilePatch.optional(),
  })
  .strict()
  .refine((v) => v.grade !== undefined || v.bizProfile !== undefined, {
    message: 'EMPTY_PATCH',
  });

export type UpdateWorkspaceBizProfileInput = z.infer<typeof Input>;
export type UpdateWorkspaceBizProfileResult = RfpActionResult<{
  bizProfileId: string;
}>;

/**
 * 워크스페이스 등록정보(=현재 시점 사업자 프로필) 갱신.
 *
 * 이 액션은 신뢰 경계만 맡는다 — 구매사 세션, 승인된 admin 게이트(마스터 면제),
 * 사업자번호 변경 시 국세청 재조회(fail-closed). 검증된 패치는
 * `WorkspaceService.replaceBizProfile` 로 넘기고, 새 row + 워크스페이스 포인터 갱신과
 * createRfp(스냅샷만) 와의 차이는 그 서비스 메서드가 설명한다.
 */
export async function updateWorkspaceBizProfileAction(
  input: UpdateWorkspaceBizProfileInput,
): Promise<UpdateWorkspaceBizProfileResult> {
  const actor = await requireBuyerActor();
  if (!actor.ok) return actor;

  // 등록 사업자번호·가맹점 등급은 워크스페이스 설정이다 — 멤버 관리와 같은 admin
  // 게이트를 지나야 한다. 아래의 NTS 재조회는 "실재하는 정상영업 사업자인가"만
  // 보증하므로, 그것만으로는 일반 멤버가 승인 끝난 워크스페이스를 **타사 사업자번호**로
  // 바꿔치기하는 것을 막지 못한다.
  //
  // JWT role 은 stale 가능 + 미승인 admin 포함 가능 → DB 에서 재확인
  // (renameWorkspaceAction 과 동일 문법).
  //
  // 마스터/운영자는 면제한다 — 워크스페이스에 synthetic admin 으로 진입해
  // `workspace_members` row 자체가 없으므로 getMembership 이 null 이고, 그대로
  // 두면 운영자가 자기 도구에서 잠긴다(isPgMembershipBlocked 가 같은 이유로
  // 같은 면제를 둔다).
  if (!isMasterEmail(actor.email)) {
    const membership = await getMembership(actor.userId, actor.workspaceId);
    if (!isApprovedAdmin(membership)) return { ok: false, error: 'FORBIDDEN_NOT_ADMIN' };
  }

  const parsed = Input.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'INVALID_INPUT' };

  // 사업자번호를 바꾸는 요청은 **서버가 직접 조회해** 판정한다. 클라이언트가 보낸
  // taxType/status 는 쓰지 않는다 — 여기는 이미 승인을 통과한 워크스페이스라
  // 관리자 승인이라는 방어선이 없고, 폼의 검증만 믿으면 액션을 직접 호출해 임의의
  // 사업자번호로 바꿔치기할 수 있다.
  //
  // 가입 흐름과 달리 **저하(미검증 통과)를 허용하지 않는다**(같은 이유). 국세청이
  // 죽어 있으면 변경을 거부하고 나중에 다시 시도하게 한다 — 설정 변경은 가입과
  // 달리 급하지 않으므로 막아도 되는 종류의 실패다.
  let verifiedPatch = parsed.data.bizProfile;
  if (parsed.data.bizProfile) {
    const resolved = await resolveBizProfileForWrite(parsed.data.bizProfile);
    if (!resolved.ok) return { ok: false, error: resolved.error };
    if (!resolved.verified || !resolved.bizProfile.taxType || !resolved.bizProfile.status) {
      return { ok: false, error: 'BIZ_LOOKUP_UNAVAILABLE' };
    }
    verifiedPatch = {
      bizNo: resolved.bizProfile.bizNo,
      taxType: resolved.bizProfile.taxType,
      status: resolved.bizProfile.status,
    };
  }

  // 새 biz_profiles row + workspace 포인터 갱신은 한 트랜잭션 — 서비스가 소유한다.
  const service = await getWorkspaceService();
  return service.replaceBizProfile(
    { userId: actor.userId, workspaceId: actor.workspaceId },
    { grade: parsed.data.grade, bizProfile: verifiedPatch },
  );
}
