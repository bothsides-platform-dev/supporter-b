'use server';

import { z } from 'zod';
import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';

import { requireBuyerSession } from '@/lib/auth/session';
import { bizProfiles, workspaces } from '@/lib/db/schema';
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
    grade: z.enum(['small', 'sme1', 'sme2', 'sme3', 'general']).optional(),
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

  return await db.transaction(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    async (tx: any): Promise<UpdateWorkspaceBizProfileResult> => {
      const [wsRow] = await tx
        .select({ bizProfileId: workspaces.bizProfileId })
        .from(workspaces)
        .where(eq(workspaces.id, wsId))
        .limit(1);
      if (!wsRow) return { ok: false, error: 'WORKSPACE_NOT_FOUND' };

      // 현재 row 베이스로 patch 머지 — bizProfile patch 미지정 시 현재 값 그대로.
      let base: typeof bizProfiles.$inferSelect | undefined;
      if (wsRow.bizProfileId) {
        const [b] = await tx
          .select()
          .from(bizProfiles)
          .where(eq(bizProfiles.id, wsRow.bizProfileId))
          .limit(1);
        base = b;
      }

      const bizPatch = parsed.data.bizProfile;
      if (!base && !bizPatch) {
        // 처음 생성. P6 가입 시 입력했어야 하는 케이스 — 명시 입력 강제.
        return { ok: false, error: 'BIZ_PROFILE_REQUIRED' };
      }

      const newId = randomUUID();
      const now = new Date();
      await tx.insert(bizProfiles).values({
        id: newId,
        bizNo: bizPatch?.bizNo ?? base!.bizNo,
        taxType: bizPatch?.taxType ?? base!.taxType,
        status: bizPatch?.status ?? base!.status,
        grade: parsed.data.grade ?? base?.grade ?? null,
        gradeSource: 'user_overridden',
        gradeConfirmedBy: userId,
        gradeConfirmedAt: now,
      });

      // workspace 포인터 갱신 — 이 액션의 핵심 (createRfp와의 차별점).
      await tx
        .update(workspaces)
        .set({ bizProfileId: newId })
        .where(eq(workspaces.id, wsId));

      return { ok: true, bizProfileId: newId };
    },
  );
}
