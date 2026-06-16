import { beforeEach, describe, expect, it } from 'vitest';
import { createPgliteDb, type PgliteDB } from '@/lib/db/client-pglite';
import { __resetForTest, __useDrizzleWithDbForTest } from '@/lib/server/repositories/factory';
import { seedPgWorkspace } from '@/lib/server/repositories/drizzle/__tests__/_seed';
import { ensureDemoPgs } from '@/lib/server/onboarding/sample-rfp';
import { searchWorkspaces } from '../search';

let db: PgliteDB;

beforeEach(async () => {
  __resetForTest();
  db = await createPgliteDb();
  await __useDrizzleWithDbForTest(db);
});

describe('searchWorkspaces excludes demo PGs', () => {
  it('returns real PG workspaces but not isDemo ones', async () => {
    const real = await seedPgWorkspace(db, '진짜페이');
    await db.transaction((tx) => ensureDemoPgs(tx)); // creates 3 isDemo PGs

    const all = await searchWorkspaces({ type: 'pg' });
    const ids = all.map((w) => w.id);
    expect(ids).toContain(real.id);
    expect(all.some((w) => w.name.startsWith('샘플페이'))).toBe(false);
  });

  it('name search also excludes demo PGs', async () => {
    await db.transaction((tx) => ensureDemoPgs(tx));
    const hit = await searchWorkspaces({ type: 'pg', q: '샘플페이' });
    expect(hit).toHaveLength(0); // demo PGs never match
  });
});
