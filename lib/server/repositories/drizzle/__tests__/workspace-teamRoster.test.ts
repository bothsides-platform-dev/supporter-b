import { describe, expect, it } from 'vitest';
import { createPgliteDb } from '@/lib/db/client-pglite';
import { DrizzleWorkspaceRepository } from '../workspace';
import { seedUser, seedBuyerWorkspace, seedMembership } from './_seed';
import { users } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';

describe('teamRoster avatarUpdatedAt', () => {
  it('includes avatarUpdatedAt (ISO) for members with an avatar, null otherwise', async () => {
    const db = await createPgliteDb();
    const { id: wsId } = await seedBuyerWorkspace(db);
    const { id: withAvatar } = await seedUser(db, { name: 'A' });
    const { id: without } = await seedUser(db, { name: 'B' });
    await seedMembership(db, wsId, withAvatar);
    await seedMembership(db, wsId, without);
    await db.update(users).set({ avatarUpdatedAt: new Date('2026-06-21T00:00:00.000Z') }).where(eq(users.id, withAvatar));

    const repo = new DrizzleWorkspaceRepository(db);
    const roster = await repo.teamRoster(wsId);
    const a = roster.find((r) => r.userId === withAvatar);
    const b = roster.find((r) => r.userId === without);
    expect(a?.avatarUpdatedAt).toBe('2026-06-21T00:00:00.000Z');
    expect(b?.avatarUpdatedAt).toBeNull();
  });
});
