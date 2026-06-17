// DrizzlePgProfileRepository — pg_profiles row created during PG signup
// (mirrors the insert previously inlined in AuthService.completeSignup).
import { describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';

import { pgProfiles } from '@/lib/db/schema';
import { createPgliteDb } from '@/lib/db/client-pglite';
import { DrizzlePgProfileRepository } from '../pg-profile';
import { seedPgWorkspace } from './_seed';

async function setup() {
  const db = await createPgliteDb();
  return { db, repo: new DrizzlePgProfileRepository(db) };
}

describe('DrizzlePgProfileRepository', () => {
  it('create() inserts a pg_profiles row with bizNo + slaDays', async () => {
    const { db, repo } = await setup();
    const ws = await seedPgWorkspace(db, 'pg.profile');

    await repo.create({ workspaceId: ws.id, bizNo: '1112233344', slaDays: 3 });

    const [row] = await db
      .select()
      .from(pgProfiles)
      .where(eq(pgProfiles.workspaceId, ws.id));
    expect(row.workspaceId).toBe(ws.id);
    expect(row.bizNo).toBe('1112233344');
    expect(row.serviceScope).toBeNull();
    expect(row.slaDays).toBe(3);
  });

  it('create() defaults slaDays to null when omitted', async () => {
    const { db, repo } = await setup();
    const ws = await seedPgWorkspace(db, 'pg.profile2');

    await repo.create({ workspaceId: ws.id, bizNo: '9998887766' });

    const [row] = await db
      .select()
      .from(pgProfiles)
      .where(eq(pgProfiles.workspaceId, ws.id));
    expect(row.bizNo).toBe('9998887766');
    expect(row.slaDays).toBeNull();
    expect(row.serviceScope).toBeNull();
  });
});
