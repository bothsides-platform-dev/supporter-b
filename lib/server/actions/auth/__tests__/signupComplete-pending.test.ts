import { describe, it, expect, beforeEach } from 'vitest';
import { createPgliteDb } from '@/lib/db/client-pglite';
import { workspaces, verificationApplications } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import type { PgliteDB } from '@/lib/db/client-pglite';
import { seedUser } from '@/lib/server/repositories/drizzle/__tests__/_seed';

let db: PgliteDB;
beforeEach(async () => {
  db = await createPgliteDb();
});

describe('createWorkspaceInTx — pending status + verification_application', () => {
  it('buyer 워크스페이스 생성 시 status=pending', async () => {
    const user = await seedUser(db);
    const { createWorkspaceInTx } = await import('@/lib/server/actions/workspace/_createWorkspace');
    const { workspaceId } = await createWorkspaceInTx(db, {
      userId: user.id,
      type: 'buyer',
      name: '구매사',
    });
    const [ws] = await db.select().from(workspaces).where(eq(workspaces.id, workspaceId));
    expect(ws.status).toBe('pending');
  });

  it('pg 워크스페이스 생성 시 status=pending', async () => {
    const user = await seedUser(db);
    const { createWorkspaceInTx } = await import('@/lib/server/actions/workspace/_createWorkspace');
    const { workspaceId } = await createWorkspaceInTx(db, {
      userId: user.id,
      type: 'pg',
      name: '판매사',
    });
    // PG 샘플 시드가 공유 데모 구매사(active)를 함께 만들므로 "첫 워크스페이스"로 단정하면 안 됨.
    const [ws] = await db.select().from(workspaces).where(eq(workspaces.id, workspaceId));
    expect(ws.status).toBe('pending');
  });

  it('워크스페이스 생성 시 verification_application 행이 생성된다', async () => {
    const user = await seedUser(db);
    const { createWorkspaceInTx } = await import('@/lib/server/actions/workspace/_createWorkspace');
    const result = await createWorkspaceInTx(db, {
      userId: user.id,
      type: 'buyer',
      name: '구매사',
    });
    const apps = await db
      .select()
      .from(verificationApplications)
      .where(eq(verificationApplications.workspaceId, result.workspaceId));
    expect(apps).toHaveLength(1);
    expect(apps[0].status).toBe('submitted');
    expect(apps[0].orgType).toBe('buyer');
  });
});
