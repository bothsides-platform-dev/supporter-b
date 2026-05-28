import { describe, expect, it, beforeEach } from 'vitest';
import { createPgliteDb } from '@/lib/db/client-pglite';
import { workspaceLogoBlobs } from '@/lib/db/schema';
import { DrizzleWorkspaceRepository } from '../workspace';
import { seedBuyerWorkspace, seedPgWorkspace, seedUser, seedMembership } from './_seed';

describe('DrizzleWorkspaceRepository', () => {
  let repo: DrizzleWorkspaceRepository;
  let db: Awaited<ReturnType<typeof createPgliteDb>>;

  beforeEach(async () => {
    db = await createPgliteDb();
    repo = new DrizzleWorkspaceRepository(db);
  });

  it('findById hydrates members and biz profile when present', async () => {
    const ws = await seedPgWorkspace(db, '서포터 B 페이');
    const u = await seedUser(db, { email: 'a@toss.im' });
    await seedMembership(db, ws.id, u.id, 'admin');
    const fetched = await repo.findById(ws.id);
    expect(fetched).toBeDefined();
    expect(fetched!.type).toBe('pg');
    expect(fetched!.members[0].role).toBe('admin');
  });

  it('findById returns undefined for unknown id', async () => {
    expect(await repo.findById('00000000-0000-0000-0000-000000000000')).toBeUndefined();
  });

  it('findByShareToken hydrates the workspace for a known token', async () => {
    const ws = await seedPgWorkspace(db, '서포터 B 페이');
    const seeded = await repo.findById(ws.id);
    const fetched = await repo.findByShareToken(seeded!.shareToken);
    expect(fetched).toBeDefined();
    expect(fetched!.id).toBe(ws.id);
    expect(fetched!.shareToken).toBe(seeded!.shareToken);
  });

  it('findByShareToken returns undefined for unknown token', async () => {
    expect(await repo.findByShareToken('no-such-token')).toBeUndefined();
  });

  it('findById returns hasLogo: false when no logo blob exists', async () => {
    const ws = await seedBuyerWorkspace(db);
    const fetched = await repo.findById(ws.id);
    expect(fetched).toBeDefined();
    expect(fetched!.hasLogo).toBe(false);
  });

  it('findById returns hasLogo: true when logo blob exists', async () => {
    const ws = await seedBuyerWorkspace(db);
    await db.insert(workspaceLogoBlobs).values({
      workspaceId: ws.id,
      bytes: Buffer.from([0x89, 0x50, 0x4e, 0x47]),
      mime: 'image/png',
    });
    const fetched = await repo.findById(ws.id);
    expect(fetched!.hasLogo).toBe(true);
  });

  it('listForUser includes hasLogo for each workspace', async () => {
    const ws = await seedBuyerWorkspace(db);
    const u = await seedUser(db);
    await seedMembership(db, ws.id, u.id);
    const list = await repo.listForUser(u.id);
    expect(list).toHaveLength(1);
    expect(list[0].hasLogo).toBe(false);
  });

  it('listForUser returns hasLogo: true when logo blob exists', async () => {
    const ws = await seedBuyerWorkspace(db);
    const u = await seedUser(db);
    await seedMembership(db, ws.id, u.id);
    await db.insert(workspaceLogoBlobs).values({
      workspaceId: ws.id,
      bytes: Buffer.from([0x89, 0x50, 0x4e, 0x47]),
      mime: 'image/png',
    });
    const list = await repo.listForUser(u.id);
    expect(list[0].hasLogo).toBe(true);
  });
});
