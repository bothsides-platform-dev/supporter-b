import { randomUUID } from 'node:crypto';

import {
  getBizProfileRepo,
  getColumnRepo,
  getRiskFlagRepo,
  getUserRepo,
  getVerificationApplicationRepo,
  getWorkspaceRepo,
} from '@/lib/server/repositories/factory';
import { defaultColumns } from '@/lib/server/columns/seed';
import type { MerchantTier } from '@/lib/types/bid';

export type CreateWorkspaceBizProfile = {
  bizNo: string;
  /**
   * 국세청 장애로 검증을 건너뛴 미검증 프로필에서는 둘 다 비어 있다
   * (`biz_profiles` 의 두 컬럼 모두 nullable). 조회하지 못한 값을 채워 넣는 대신
   * 비워 두어야, 승인 심사에서 "확인된 값"과 구분된다.
   */
  taxType?: 'general' | 'simple' | 'exempt';
  status?: 'active' | 'suspended' | 'closed';
  grade?: MerchantTier;
  gradeSource?: 'user_confirmed' | 'user_overridden' | 'unset';
};

export type CreateWorkspaceInput = {
  userId: string;
  type: 'buyer' | 'pg';
  name: string;
  bizProfile?: CreateWorkspaceBizProfile;
  /**
   * 사업자번호가 국세청 조회로 확인됐는가. `false` 면 운영자용 risk flag 를 남긴다
   * — 워크스페이스는 어차피 `pending` 이라 승인 심사가 최종 방어선인데, 심사자가
   * "이 건은 자동 검증이 안 됐다"는 사실을 알 방법이 있어야 한다.
   */
  bizVerified?: boolean;
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

  // 국세청 장애로 사업자번호를 확인하지 못한 채 통과시킨 건은 심사자가 수동으로
  // 확인해야 한다 — 같은 트랜잭션에 durable 마커를 남긴다. (렌더링은 별도 레포
  // `admin-supporter-b` 의 몫. 그때까지는 심사 요청 메일의 배지가 이 공백을 메운다.)
  if (input.bizVerified === false) {
    const riskFlagRepo = await getRiskFlagRepo();
    await riskFlagRepo.raise(
      {
        entityType: 'workspace',
        entityId: wsId,
        flagType: 'biz_unverified',
        severity: 'warning',
      },
      tx,
    );
  }

  // Seed the unified kanban columns (single source: defaultColumns). Both buyer
  // and pg get a pipeline board; buyer has BUYER_KANBAN_ORDER stages, pg has PG_KANBAN_ORDER.
  await columnRepo.createMany(defaultColumns(wsId, input.type), tx);

  // 온보딩 체험은 DB 시딩이 아니다 — /tutorial 튜토리얼 화면이 유저 단위 상태
  // (users.onboarding jsonb, lib/types/onboarding.ts)로 진행을 추적한다. 실
  // rfps/bids/invitations row 없음.

  return { workspaceId: wsId, applicationId };
}
