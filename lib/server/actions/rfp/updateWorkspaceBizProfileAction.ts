'use server';

import { z } from 'zod';
import { randomUUID } from 'node:crypto';

import { requireBuyerSession } from '@/lib/auth/session';
import {
  getBizProfileRepo,
  getWorkspaceRepo,
} from '@/lib/server/repositories/factory';
import type { BizProfile } from '@/lib/types/biz-profile';
import { MERCHANT_TIERS } from '@/lib/types/bid';
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
  let session;
  try {
    session = await requireBuyerSession();
  } catch {
    return { ok: false, error: 'FORBIDDEN_BUYER' };
  }

  const parsed = Input.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'INVALID_INPUT' };

  const wsId = session.user.workspaceId;
  const userId = session.user.id;
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

      const bizPatch = parsed.data.bizProfile;
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
