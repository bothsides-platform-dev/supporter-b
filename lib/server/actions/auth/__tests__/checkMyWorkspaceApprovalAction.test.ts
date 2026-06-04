/**
 * @vitest-environment node
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { workspaces, workspaceMembers } from '@/lib/db/schema';
import { setupActionEnv, teardownActionEnv } from './_setup';
import { seedUser } from '@/lib/server/repositories/drizzle/__tests__/_seed';
import { checkMyWorkspaceApprovalAction } from '../checkMyWorkspaceApprovalAction';
import type { PgliteDB } from '@/lib/db/client-pglite';

const sessionRef: { value: unknown | null } = { value: null };
vi.mock('@/auth', () => ({ auth: () => Promise.resolve(sessionRef.value) }));

let db: PgliteDB;
beforeEach(async () => {
  db = await setupActionEnv();
  sessionRef.value = null;
});
afterEach(teardownActionEnv);

async function seedWorkspaceWithStatus(
  userId: string,
  status: 'pending' | 'active' | 'suspended',
): Promise<string> {
  const wsId = randomUUID();
  await db.insert(workspaces).values({ id: wsId, type: 'pg', name: '테스트PG', status });
  await db.insert(workspaceMembers).values({ workspaceId: wsId, userId, role: 'admin' });
  return wsId;
}

describe('checkMyWorkspaceApprovalAction', () => {
  it('미인증 세션이면 approved=false를 반환한다', async () => {
    expect(await checkMyWorkspaceApprovalAction()).toEqual({ approved: false });
  });

  it('워크스페이스 status가 pending이면 approved=false를 반환한다', async () => {
    const u = await seedUser(db, { email: 'pending@x.com' });
    sessionRef.value = { user: { id: u.id } };
    await seedWorkspaceWithStatus(u.id, 'pending');
    expect(await checkMyWorkspaceApprovalAction()).toEqual({ approved: false });
  });

  it('워크스페이스 status가 active이면 approved=true를 반환한다', async () => {
    const u = await seedUser(db, { email: 'active@x.com' });
    sessionRef.value = { user: { id: u.id } };
    await seedWorkspaceWithStatus(u.id, 'active');
    expect(await checkMyWorkspaceApprovalAction()).toEqual({ approved: true });
  });
});
