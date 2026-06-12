/**
 * fetchSessionVersion — the DB side of JWT revocation. Reads
 * users.session_version (default 1); null when the user row is absent.
 * The request-cached wrapper (getDbSessionVersion) just binds the global
 * client + React cache around this.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { createPgliteDb, type PgliteDB } from '@/lib/db/client-pglite';
import { users } from '@/lib/db/schema';
import { fetchSessionVersion } from '../session-version-db';

let db: PgliteDB;

beforeEach(async () => {
  db = await createPgliteDb();
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
    expect(await fetchSessionVersion(db, id)).toBe(1);
  });

  it('범프된 버전을 그대로 반환한다', async () => {
    const id = await seedUser('bumped@example.com');
    await db.update(users).set({ sessionVersion: 3 }).where(eq(users.id, id));
    expect(await fetchSessionVersion(db, id)).toBe(3);
  });

  it('사용자 행이 없으면 null을 반환한다', async () => {
    expect(
      await fetchSessionVersion(db, '00000000-0000-4000-8000-000000000000'),
    ).toBeNull();
  });
});
