import { randomUUID } from 'node:crypto';

import {
  getBizProfileRepo,
  getColumnRepo,
  getUserRepo,
  getVerificationApplicationRepo,
  getWorkspaceRepo,
} from '@/lib/server/repositories/factory';
import { defaultColumns } from '@/lib/server/columns/seed';
import type { MerchantTier } from '@/lib/types/bid';

export type CreateWorkspaceBizProfile = {
  bizNo: string;
  taxType: 'general' | 'simple' | 'exempt';
  status: 'active' | 'suspended' | 'closed';
  grade?: MerchantTier;
  gradeSource?: 'user_confirmed' | 'user_overridden' | 'unset';
};

export type CreateWorkspaceInput = {
  userId: string;
  type: 'buyer' | 'pg';
  name: string;
  bizProfile?: CreateWorkspaceBizProfile;
};

/**
 * Create a workspace + admin membership for `userId`, and point the user's
 * `lastActiveWorkspaceId` at it (so it becomes the active ws and every
 * member-having user keeps a non-null lastActive). Shared by signup
 * (signupCompleteAction) and the in-app createWorkspaceAction.
 *
 * `tx` is a drizzle transaction handle (or a plain db in tests). bizProfile is
 * only consumed for buyer workspaces.
 */
export async function createWorkspaceInTx(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  tx: any,
  input: CreateWorkspaceInput,
): Promise<{ workspaceId: string; applicationId: string }> {
  const bizProfileRepo = await getBizProfileRepo();
  const workspaceRepo = await getWorkspaceRepo();
  const userRepo = await getUserRepo();
  const verificationApplicationRepo = await getVerificationApplicationRepo();
  const columnRepo = await getColumnRepo();

  let bizProfileId: string | null = null;
  if (input.type === 'buyer' && input.bizProfile) {
    bizProfileId = randomUUID();
    await bizProfileRepo.save(
      {
        id: bizProfileId,
        bizNo: input.bizProfile.bizNo,
        taxType: input.bizProfile.taxType,
        status: input.bizProfile.status,
        grade: input.bizProfile.grade,
        // 가입 시엔 등급이 없음(admin이 승인 시 지정) — gradeSource:'unset',
        // gradeConfirmedBy 없음. grade override 경로는 'user_overridden'으로 별도 처리.
        gradeSource: input.bizProfile.gradeSource ?? 'unset',
      },
      tx,
    );
  }

  const wsId = randomUUID();
  await workspaceRepo.createBare(
    { id: wsId, type: input.type, name: input.name, bizProfileId },
    tx,
  );
  await workspaceRepo.addMember({ workspaceId: wsId, userId: input.userId, role: 'admin' }, tx);
  await userRepo.setLastActiveWorkspace(input.userId, wsId, tx);

  // Insert a verification application for admin review. Its id is returned so
  // callers can build the admin review link (/admin/review/{applicationId})
  // for the new-signup notification.
  const applicationId = randomUUID();
  await verificationApplicationRepo.create(
    { id: applicationId, workspaceId: wsId, orgType: input.type },
    tx,
  );

  // Seed the unified kanban columns (single source: defaultColumns). Both buyer
  // and pg get a pipeline board; buyer has BUYER_KANBAN_ORDER stages, pg has PG_KANBAN_ORDER.
  await columnRepo.createMany(defaultColumns(wsId, input.type), tx);

  // 온보딩 체험은 DB 시딩이 아니다 — 코치마크 온보딩(예: FirstRfpCoachmark)이 유저
  // 단위 상태(users.onboarding jsonb, lib/types/onboarding.ts)로 진행을 추적한다. 실
  // rfps/bids/invitations row 없음.

  return { workspaceId: wsId, applicationId };
}
