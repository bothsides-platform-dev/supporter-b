/**
 * fetchSessionVersion — the DB side of JWT revocation. Reads
 * users.session_version (default 1); null when the user row is absent.
 * The request-cached wrapper (getDbSessionVersion) just binds the global
 * client + React cache around this.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { createPgliteDb, type PgliteDB } from '@/lib/db/client-pglite';
import { users, workspaces, workspaceMembers } from '@/lib/db/schema';
import {
  __resetForTest,
  __useDrizzleWithDbForTest,
} from '@/lib/server/repositories/factory';
import {
  fetchSessionVersion,
  fetchEmailVerified,
  fetchMemberApprovalStatus,
} from '../session-version-db';

let db: PgliteDB;

beforeEach(async () => {
  db = await createPgliteDb();
  // The reads now resolve through the repo factory — point it at this pglite db.
  await __useDrizzleWithDbForTest(db);
});
afterEach(() => {
  __resetForTest();
});

async function seedUser(email: string): Promise<string> {
  const [row] = await db
    .insert(users)
    .values({ email, passwordHash: 'h', name: 'Tester' })
    .returning({ id: users.id });
  return row.id;
}

describe('fetchSessionVersion', () => {
  it('신규 사용자는 컬럼 기본값 1을 반환한다', async () => {
    const id = await seedUser('fresh@example.com');
    expect(await fetchSessionVersion(id)).toBe(1);
  });

  it('범프된 버전을 그대로 반환한다', async () => {
    const id = await seedUser('bumped@example.com');
    await db.update(users).set({ sessionVersion: 3 }).where(eq(users.id, id));
    expect(await fetchSessionVersion(id)).toBe(3);
  });

  it('사용자 행이 없으면 null을 반환한다', async () => {
    expect(
      await fetchSessionVersion('00000000-0000-4000-8000-000000000000'),
    ).toBeNull();
  });
});

describe('fetchEmailVerified', () => {
  it('신규 사용자는 컬럼 기본값 false 를 반환한다', async () => {
    const id = await seedUser('unverified@example.com');
    expect(await fetchEmailVerified(id)).toBe(false);
  });

  it('인증 완료 사용자는 true 를 반환한다', async () => {
    const id = await seedUser('verified@example.com');
    await db.update(users).set({ emailVerified: true }).where(eq(users.id, id));
    expect(await fetchEmailVerified(id)).toBe(true);
  });

  it('사용자 행이 없으면 false 를 반환한다 (미인증 취급)', async () => {
    expect(
      await fetchEmailVerified('00000000-0000-4000-8000-000000000000'),
    ).toBe(false);
  });
});

describe('fetchMemberApprovalStatus', () => {
  async function seedMembership(
    email: string,
    approvalStatus?: 'approved' | 'pending_approval' | 'rejected',
  ): Promise<{ userId: string; workspaceId: string }> {
    const userId = await seedUser(email);
    const [w] = await db
      .insert(workspaces)
      .values({ type: 'pg', name: 'PG Co', status: 'active' })
      .returning({ id: workspaces.id });
    await db.insert(workspaceMembers).values({
      workspaceId: w.id,
      userId,
      role: 'admin',
      ...(approvalStatus ? { approvalStatus } : {}),
    });
    return { userId, workspaceId: w.id };
  }

  it('컬럼 기본값 멤버는 approved 를 반환한다', async () => {
    const { userId, workspaceId } = await seedMembership('m-default@example.com');
    expect(await fetchMemberApprovalStatus(userId, workspaceId)).toBe('approved');
  });

  it('canonical-PG 합류 멤버는 pending_approval 을 반환한다', async () => {
    const { userId, workspaceId } = await seedMembership(
      'm-pending@example.com',
      'pending_approval',
    );
    expect(await fetchMemberApprovalStatus(userId, workspaceId)).toBe(
      'pending_approval',
    );
  });

  it('멤버십 행이 없으면 null 을 반환한다', async () => {
    const userId = await seedUser('m-none@example.com');
    expect(
      await fetchMemberApprovalStatus(
        userId,
        '00000000-0000-4000-8000-000000000000',
      ),
    ).toBeNull();
  });
});
