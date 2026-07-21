// Schema-level guard for `workspace_members.approval_status`.
//
// `role` is a real pg enum (`memberRoleEnum`), but `approval_status` is plain
// `text` with `default 'approved'` — and the admin console that writes this
// column lives in a SEPARATE repo (`admin-supporter-b`), so TypeScript does not
// bind the two sides together. A drifted value (`'Approved'`, `'active'`, `''`)
// makes `isApprovedAdmin` return false, which is fail-CLOSED at the six
// permission gates but fail-OPEN at three spots — most damagingly the
// `AuthService.deleteAccount` last-admin block, where the final real admin
// could delete their account and orphan the workspace.
//
// A DB-level CHECK is the only place both repos are forced through, so it is
// the constraint that actually holds.

import { beforeEach, describe, expect, it } from 'vitest';
import { sql } from 'drizzle-orm';

import { workspaceMembers } from '@/lib/db/schema';
import { createPgliteDb } from '@/lib/db/client-pglite';
import { seedBuyerWorkspace, seedUser } from '@/lib/server/repositories/drizzle/__tests__/_seed';

async function setup() {
  const db = await createPgliteDb();
  const ws = await seedBuyerWorkspace(db);
  return { db, workspaceId: ws.id };
}

describe('workspace_members.approval_status', () => {
  beforeEach(async () => {
    await createPgliteDb();
  });

  it('accepts every canonical MemberApprovalStatus value', async () => {
    const { db, workspaceId } = await setup();

    for (const approvalStatus of ['approved', 'pending_approval', 'rejected'] as const) {
      const user = await seedUser(db, { email: `${approvalStatus}@drift.test` });
      await db.insert(workspaceMembers).values({
        workspaceId,
        userId: user.id,
        role: 'admin',
        approvalStatus,
      });
    }

    const rows = await db.select().from(workspaceMembers);
    expect(rows).toHaveLength(3);
  });

  // Each of these is a value the separate admin repo could plausibly write.
  // Raw SQL on purpose: that repo does not share our Drizzle types, so the
  // `$type<MemberApprovalStatus>()` narrowing cannot reach it — the DB CHECK is
  // the only thing standing between it and a silently fail-open permission
  // gate. (Inside THIS repo the same drift is already a compile error, which is
  // why the typed insert path cannot express these values at all.)
  it.each(['Approved', 'active', '', 'PENDING_APPROVAL'])(
    'rejects the drifted value %o written outside our type system',
    async (drifted) => {
      const { db, workspaceId } = await setup();
      const user = await seedUser(db, { email: `drift-${drifted || 'empty'}@drift.test` });

      await expect(
        db.execute(sql`
          INSERT INTO workspace_members (workspace_id, user_id, role, approval_status)
          VALUES (${workspaceId}, ${user.id}, 'admin', ${drifted})
        `),
      ).rejects.toThrow();
    },
  );
});
