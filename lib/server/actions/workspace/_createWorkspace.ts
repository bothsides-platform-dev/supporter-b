import { randomUUID } from 'node:crypto';

import {
  getBizProfileRepo,
  getColumnRepo,
  getUserRepo,
  getVerificationApplicationRepo,
  getWorkspaceRepo,
} from '@/lib/server/repositories/factory';
import { defaultColumns } from '@/lib/server/columns/seed';
import { seedSampleRfpInTx } from '@/lib/server/onboarding/sample-rfp';
import { seedSamplePgRfpInTx } from '@/lib/server/onboarding/sample-pg-rfp';

export type CreateWorkspaceBizProfile = {
  bizNo: string;
  taxType?: 'general' | 'simple' | 'exempt';
  status?: 'active' | 'suspended' | 'closed';
  grade?: 'small' | 'sme1' | 'sme2' | 'sme3' | 'general';
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

  // 온보딩 샘플을 같은 tx 에 시드:
  //  - buyer: 샘플 견적 요청 1건 + 데모 PG 3사의 견적(읽기전용 비교 체험)
  //  - pg: 데모 구매사가 보낸 샘플 견적 요청 초대 1건(직접 견적을 제출해보는 인터랙티브 체험)
  if (input.type === 'buyer') {
    await seedSampleRfpInTx(tx, { buyerWsId: wsId, buyerUserId: input.userId });
  } else if (input.type === 'pg') {
    await seedSamplePgRfpInTx(tx, { pgWsId: wsId, pgUserId: input.userId });
  }

  return { workspaceId: wsId, applicationId };
}
