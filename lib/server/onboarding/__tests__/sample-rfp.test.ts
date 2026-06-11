import { beforeEach, describe, expect, it } from 'vitest';
import { and, eq } from 'drizzle-orm';
import { createPgliteDb, type PgliteDB } from '@/lib/db/client-pglite';
import { __resetForTest, __useDrizzleWithDbForTest } from '@/lib/server/repositories/factory';
import { workspaces, workspaceMembers, users } from '@/lib/db/schema';
import { ensureDemoPgs, DEMO_PG_NAMES } from '../sample-rfp';

let db: PgliteDB;

beforeEach(async () => {
  __resetForTest();
  db = await createPgliteDb();
  await __useDrizzleWithDbForTest(db);
});

describe('ensureDemoPgs', () => {
  it('creates 3 demo PG workspaces + demo users, idempotently', async () => {
    const first = await db.transaction((tx) => ensureDemoPgs(tx));
    expect(first).toHaveLength(3);
    expect(first.map((d) => d.name)).toEqual([...DEMO_PG_NAMES]);

    const second = await db.transaction((tx) => ensureDemoPgs(tx));
    // same workspace ids returned (no duplicates created)
    expect(second.map((d) => d.wsId).sort()).toEqual(first.map((d) => d.wsId).sort());

    const demoWs = await db.select().from(workspaces).where(eq(workspaces.isDemo, true));
    expect(demoWs).toHaveLength(3);
    const sys = await db.select().from(users).where(eq(users.isSystemAccount, true));
    expect(sys).toHaveLength(3);
    // 데모 계정은 절대 인증되지 않아야 한다 — 사용 불가 passwordHash
    expect(sys.every((u) => u.passwordHash === '!')).toBe(true);
    // each demo ws has an admin membership
    for (const d of first) {
      const [m] = await db
        .select()
        .from(workspaceMembers)
        .where(and(eq(workspaceMembers.workspaceId, d.wsId), eq(workspaceMembers.userId, d.userId)));
      expect(m.role).toBe('admin');
    }
  });
});
