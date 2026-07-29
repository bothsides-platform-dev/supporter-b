'use server';

import { z } from 'zod';
import { randomUUID } from 'node:crypto';

import { requireBuyerActor } from '@/lib/server/actions/_session';
import {
  getBizProfileRepo,
  getWorkspaceRepo,
} from '@/lib/server/repositories/factory';
import type { BizProfile } from '@/lib/types/biz-profile';
import { MERCHANT_TIERS } from '@/lib/types/bid';
import { resolveBizProfileForWrite } from '@/lib/server/actions/_resolveBizProfile';
import { actionDb, type RfpActionResult } from './_shared';

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
 * **비교 (advisor pin 1):**
 *   - createRfpAction: 새 biz_profiles row 만 insert. workspace.biz_profile_id
 *     는 절대 건드리지 않음. RFP 시점 스냅샷.
 *   - updateWorkspaceBizProfileAction (이 액션): 새 biz_profiles row insert
 *     **+** workspace.biz_profile_id 를 새 row 로 UPDATE. workspace 시점 갱신.
 *
 * gradeSource는 사용자가 명시 갱신했으므로 'user_overridden' 으로 마킹.
 */
export async function updateWorkspaceBizProfileAction(
  input: UpdateWorkspaceBizProfileInput,
): Promise<UpdateWorkspaceBizProfileResult> {
  const actor = await requireBuyerActor();
  if (!actor.ok) return actor;

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

  const wsId = actor.workspaceId;
  const userId = actor.userId;
  const db = actionDb();

  const workspaceRepo = await getWorkspaceRepo();
  const bizProfileRepo = await getBizProfileRepo();

  return await db.transaction(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    async (tx: any): Promise<UpdateWorkspaceBizProfileResult> => {
      const currentBizProfileId = await workspaceRepo.getBizProfileId(wsId, tx);

      // 현재 row 베이스로 patch 머지 — bizProfile patch 미지정 시 현재 값 그대로.
      let base: (BizProfile & { id: string }) | undefined;
      if (currentBizProfileId) {
        base = await bizProfileRepo.findById(currentBizProfileId, tx);
      }

      const bizPatch = verifiedPatch;
      if (!base && !bizPatch) {
        // 처음 생성. P6 가입 시 입력했어야 하는 케이스 — 명시 입력 강제.
        return { ok: false, error: 'BIZ_PROFILE_REQUIRED' };
      }

      const newId = randomUUID();
      const now = new Date();
      await bizProfileRepo.save(
        {
          id: newId,
          bizNo: bizPatch?.bizNo ?? base!.bizNo,
          taxType: bizPatch?.taxType ?? base!.taxType,
          status: bizPatch?.status ?? base!.status,
          grade: parsed.data.grade ?? base?.grade ?? undefined,
          gradeSource: 'user_overridden',
          gradeConfirmedBy: userId,
          gradeConfirmedAt: now.toISOString(),
        },
        tx,
      );

      // workspace 포인터 갱신 — 이 액션의 핵심 (createRfp와의 차별점).
      await workspaceRepo.setBizProfilePointer(wsId, newId, tx);

      return { ok: true, bizProfileId: newId };
    },
  );
}
