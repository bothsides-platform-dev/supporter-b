import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';

import { bizProfiles, columns, users, workspaceMembers, workspaces } from '@/lib/db/schema';
import { defaultColumns } from '@/lib/server/columns/seed';

export type CreateWorkspaceBizProfile = {
  bizNo: string;
  taxType: 'general' | 'simple' | 'exempt';
  status: 'active' | 'suspended' | 'closed';
  grade?: 'small' | 'sme1' | 'sme2' | 'sme3' | 'general';
  gradeSource: 'user_confirmed' | 'user_overridden';
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
): Promise<{ workspaceId: string }> {
  let bizProfileId: string | null = null;
  if (input.type === 'buyer' && input.bizProfile) {
    bizProfileId = randomUUID();
    await tx.insert(bizProfiles).values({
      id: bizProfileId,
      bizNo: input.bizProfile.bizNo,
      taxType: input.bizProfile.taxType,
      status: input.bizProfile.status,
      grade: input.bizProfile.grade ?? null,
      gradeSource: input.bizProfile.gradeSource,
      gradeConfirmedBy: input.userId,
      gradeConfirmedAt: new Date(),
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

  // Seed the unified kanban columns (single source: defaultColumns). buyer gets
  // both pipeline + rfp_bids boards; pg gets only pipeline.
  await tx.insert(columns).values(defaultColumns(wsId, input.type));

  return { workspaceId: wsId };
}
