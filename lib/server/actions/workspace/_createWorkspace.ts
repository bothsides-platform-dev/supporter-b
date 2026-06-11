import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';

import {
  bizProfiles,
  columns,
  users,
  workspaceMembers,
  workspaces,
  verificationApplications,
} from '@/lib/db/schema';
import { defaultColumns } from '@/lib/server/columns/seed';
import { seedSampleRfpInTx } from '@/lib/server/onboarding/sample-rfp';

export type CreateWorkspaceBizProfile = {
  bizNo: string;
  taxType: 'general' | 'simple' | 'exempt';
  status: 'active' | 'suspended' | 'closed';
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
  let bizProfileId: string | null = null;
  if (input.type === 'buyer' && input.bizProfile) {
    bizProfileId = randomUUID();
    await tx.insert(bizProfiles).values({
      id: bizProfileId,
      bizNo: input.bizProfile.bizNo,
      taxType: input.bizProfile.taxType,
      status: input.bizProfile.status,
      grade: input.bizProfile.grade ?? null,
      // 가입 시엔 등급이 없음(admin이 승인 시 지정) — gradeSource:'unset',
      // gradeConfirmedBy 없음. grade override 경로는 'user_overridden'으로 별도 처리.
      gradeSource: input.bizProfile.gradeSource ?? 'unset',
      gradeConfirmedBy: null,
      gradeConfirmedAt: null,
    });
  }

  const wsId = randomUUID();
  await tx.insert(workspaces).values({
    id: wsId,
    type: input.type,
    name: input.name,
    bizProfileId,
  });
  await tx.insert(workspaceMembers).values({
    workspaceId: wsId,
    userId: input.userId,
    role: 'admin',
  });
  await tx
    .update(users)
    .set({ lastActiveWorkspaceId: wsId })
    .where(eq(users.id, input.userId));

  // Insert a verification application for admin review. Its id is returned so
  // callers can build the admin review link (/admin/review/{applicationId})
  // for the new-signup notification.
  const applicationId = randomUUID();
  await tx.insert(verificationApplications).values({
    id: applicationId,
    workspaceId: wsId,
    orgType: input.type,
  });

  // Seed the unified kanban columns (single source: defaultColumns). buyer gets
  // both pipeline + rfp_bids boards; pg gets only pipeline.
  await tx.insert(columns).values(defaultColumns(wsId, input.type));

  // 구매사 온보딩: 샘플 견적 요청 1건 + 데모 PG 견적을 같은 tx 에 시드. (pg 는 시드 안 함)
  if (input.type === 'buyer') {
    await seedSampleRfpInTx(tx, { buyerWsId: wsId, buyerUserId: input.userId });
  }

  return { workspaceId: wsId, applicationId };
}
