import { describe, expect, it, beforeEach } from 'vitest';
import { eq } from 'drizzle-orm';
import { createPgliteDb } from '@/lib/db/client-pglite';
import { workspaceLogoBlobs, workspaces } from '@/lib/db/schema';
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
    await db.update(workspaces).set({ hasLogo: true }).where(eq(workspaces.id, ws.id));
    const list = await repo.listForUser(u.id);
    expect(list[0].hasLogo).toBe(true);
  });

  it('listForUser reads hasLogo from workspaces.has_logo (not logo blob join)', async () => {
    const ws = await seedBuyerWorkspace(db);
    const u = await seedUser(db);
    await seedMembership(db, ws.id, u.id);
    await db.update(workspaces).set({ hasLogo: true }).where(eq(workspaces.id, ws.id));

    const list = await repo.listForUser(u.id);
    expect(list[0].hasLogo).toBe(true);
  });

  describe('isMember', () => {
    it('returns true when the user is a member of the workspace', async () => {
      const ws = await seedBuyerWorkspace(db);
      const u = await seedUser(db, { email: 'member@buy.com' });
      await seedMembership(db, ws.id, u.id);
      expect(await repo.isMember(u.id, ws.id)).toBe(true);
    });

    it('returns false when the user is not a member', async () => {
      const ws = await seedBuyerWorkspace(db);
      const outsider = await seedUser(db, { email: 'outsider@buy.com' });
      expect(await repo.isMember(outsider.id, ws.id)).toBe(false);
    });

    it('returns false when the user is a member of a different workspace', async () => {
      const wsA = await seedBuyerWorkspace(db);
      const wsB = await seedPgWorkspace(db, 'other.im');
      const u = await seedUser(db, { email: 'a-only@buy.com' });
      await seedMembership(db, wsA.id, u.id);
      expect(await repo.isMember(u.id, wsB.id)).toBe(false);
    });
  });

  describe('memberUserIds', () => {
    it('returns every member user id for the workspace', async () => {
      const ws = await seedBuyerWorkspace(db);
      const u1 = await seedUser(db, { email: 'm1@buy.com' });
      const u2 = await seedUser(db, { email: 'm2@buy.com' });
      await seedMembership(db, ws.id, u1.id, 'admin');
      await seedMembership(db, ws.id, u2.id, 'member');

      const ids = await repo.memberUserIds(ws.id);
      expect(ids).toHaveLength(2);
      expect(ids).toEqual(expect.arrayContaining([u1.id, u2.id]));
    });

    it('returns an empty array for a workspace with no members', async () => {
      const ws = await seedBuyerWorkspace(db);
      expect(await repo.memberUserIds(ws.id)).toEqual([]);
    });

    it('does not include members of a different workspace', async () => {
      const wsA = await seedBuyerWorkspace(db);
      const wsB = await seedPgWorkspace(db, 'other.im');
      const uA = await seedUser(db, { email: 'a@buy.com' });
      const uB = await seedUser(db, { email: 'b@pg.com' });
      await seedMembership(db, wsA.id, uA.id);
      await seedMembership(db, wsB.id, uB.id);

      const ids = await repo.memberUserIds(wsA.id);
      expect(ids).toEqual([uA.id]);
    });
  });

  describe('memberUserIdsBatch', () => {
    it('returns empty Map for empty input', async () => {
      const result = await repo.memberUserIdsBatch([]);
      expect(result).toEqual(new Map());
    });

    it('returns Map keyed by workspaceId with member IDs', async () => {
      const ws1 = await seedPgWorkspace(db, 'batch-ws1.com');
      const ws2 = await seedPgWorkspace(db, 'batch-ws2.com');
      const u1 = await seedUser(db, { email: 'u1@batch-ws1.com' });
      const u2 = await seedUser(db, { email: 'u2@batch-ws2.com' });
      const u3 = await seedUser(db, { email: 'u3@batch-ws1.com' });
      await seedMembership(db, ws1.id, u1.id);
      await seedMembership(db, ws1.id, u3.id);
      await seedMembership(db, ws2.id, u2.id);

      const result = await repo.memberUserIdsBatch([ws1.id, ws2.id]);
      expect(result.get(ws1.id)?.sort()).toEqual([u1.id, u3.id].sort());
      expect(result.get(ws2.id)).toEqual([u2.id]);
    });

    it('workspaceId not in input is absent from Map', async () => {
      const ws1 = await seedPgWorkspace(db, 'batch-absent-a.com');
      const ws2 = await seedPgWorkspace(db, 'batch-absent-b.com');
      const u1 = await seedUser(db, { email: 'absent-u1@batch-a.com' });
      await seedMembership(db, ws1.id, u1.id);

      const result = await repo.memberUserIdsBatch([ws1.id]);
      expect(result.has(ws1.id)).toBe(true);
      expect(result.has(ws2.id)).toBe(false);
    });
  });

  describe('memberEmails', () => {
    it('returns email addresses for every member of the workspace', async () => {
      const ws = await seedPgWorkspace(db, 'pg.email.test');
      const u1 = await seedUser(db, { email: 'sales@pg.email.test' });
      const u2 = await seedUser(db, { email: 'cs@pg.email.test' });
      await seedMembership(db, ws.id, u1.id, 'admin');
      await seedMembership(db, ws.id, u2.id, 'member');

      const emails = await repo.memberEmails(ws.id);
      expect(emails).toHaveLength(2);
      expect(emails).toEqual(expect.arrayContaining(['sales@pg.email.test', 'cs@pg.email.test']));
    });

    it('returns an empty array for a workspace with no members', async () => {
      const ws = await seedBuyerWorkspace(db);
      expect(await repo.memberEmails(ws.id)).toEqual([]);
    });

    it('does not include emails of members from a different workspace', async () => {
      const wsA = await seedPgWorkspace(db, 'pg-a.com');
      const wsB = await seedPgWorkspace(db, 'pg-b.com');
      const uA = await seedUser(db, { email: 'a@pg-a.com' });
      const uB = await seedUser(db, { email: 'b@pg-b.com' });
      await seedMembership(db, wsA.id, uA.id);
      await seedMembership(db, wsB.id, uB.id);

      const emails = await repo.memberEmails(wsA.id);
      expect(emails).toEqual(['a@pg-a.com']);
    });
  });
});
