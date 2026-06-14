import { describe, expect, it, beforeEach } from 'vitest';
import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { createPgliteDb } from '@/lib/db/client-pglite';
import { workspaceInvitations, workspaceLogoBlobs, workspaceMembers, workspaces } from '@/lib/db/schema';
import { DrizzleWorkspaceRepository } from '../workspace';
import {
  seedBizProfile,
  seedBuyerWorkspace,
  seedPgWorkspace,
  seedUser,
  seedMembership,
} from './_seed';

/** Insert a workspace_invitations row directly (no shared helper yet). */
async function seedInvitation(
  db: Awaited<ReturnType<typeof createPgliteDb>>,
  opts: {
    workspaceId: string;
    invitedByUserId: string;
    invitedEmail?: string;
    tokenHash?: string;
    role?: 'admin' | 'member';
    status?: 'pending' | 'accepted' | 'expired';
    expiresAt?: Date;
  },
): Promise<{ id: string; tokenHash: string }> {
  const id = randomUUID();
  const tokenHash = opts.tokenHash ?? `hash-${id}`;
  await db.insert(workspaceInvitations).values({
    id,
    workspaceId: opts.workspaceId,
    invitedEmail: opts.invitedEmail ?? `invitee-${id.slice(0, 8)}@example.com`,
    invitedByUserId: opts.invitedByUserId,
    role: opts.role ?? 'member',
    tokenHash,
    status: opts.status ?? 'pending',
    expiresAt: opts.expiresAt ?? new Date(Date.now() + 7 * 24 * 3600 * 1000),
  });
  return { id, tokenHash };
}

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

  describe('search', () => {
    it('returns matching workspaces of the given type by name (ilike)', async () => {
      await seedPgWorkspace(db, '토스페이먼츠');
      await seedPgWorkspace(db, 'KG이니시스');
      const results = await repo.search({ type: 'pg', q: '토스' });
      expect(results).toHaveLength(1);
      expect(results[0].name).toBe('토스페이먼츠');
      expect(results[0]).toHaveProperty('id');
    });

    it('returns all workspaces of the type when q is omitted', async () => {
      await seedPgWorkspace(db, 'pg-search-1.com');
      await seedPgWorkspace(db, 'pg-search-2.com');
      await seedBuyerWorkspace(db, { name: 'buyer-not-included' });
      const results = await repo.search({ type: 'pg' });
      expect(results).toHaveLength(2);
    });

    it('excludes isDemo workspaces', async () => {
      const demoId = randomUUID();
      await db.insert(workspaces).values({
        id: demoId,
        type: 'pg',
        name: '데모 PG',
        status: 'active',
        isDemo: true,
      });
      const results = await repo.search({ type: 'pg', q: '데모' });
      expect(results).toEqual([]);
    });

    it('does not return workspaces of the other type', async () => {
      await seedBuyerWorkspace(db, { name: 'buyer-typed' });
      const results = await repo.search({ type: 'pg', q: 'buyer-typed' });
      expect(results).toEqual([]);
    });
  });

  describe('getName', () => {
    it('returns the workspace name', async () => {
      const ws = await seedPgWorkspace(db, '서포터 페이');
      expect(await repo.getName(ws.id)).toBe('서포터 페이');
    });

    it('returns undefined for an unknown workspace', async () => {
      expect(await repo.getName('00000000-0000-0000-0000-000000000000')).toBeUndefined();
    });
  });

  describe('memberRecipients', () => {
    it('returns userId + email for every member', async () => {
      const ws = await seedPgWorkspace(db, 'recip.test');
      const u1 = await seedUser(db, { email: 'r1@recip.test' });
      const u2 = await seedUser(db, { email: 'r2@recip.test' });
      await seedMembership(db, ws.id, u1.id, 'admin');
      await seedMembership(db, ws.id, u2.id, 'member');

      const recipients = await repo.memberRecipients(ws.id);
      expect(recipients).toHaveLength(2);
      expect(recipients).toEqual(
        expect.arrayContaining([
          { userId: u1.id, email: 'r1@recip.test' },
          { userId: u2.id, email: 'r2@recip.test' },
        ]),
      );
    });

    it('returns empty array for a workspace with no members', async () => {
      const ws = await seedBuyerWorkspace(db);
      expect(await repo.memberRecipients(ws.id)).toEqual([]);
    });

    it('does not include members of a different workspace', async () => {
      const wsA = await seedPgWorkspace(db, 'recip-a.com');
      const wsB = await seedPgWorkspace(db, 'recip-b.com');
      const uA = await seedUser(db, { email: 'a@recip-a.com' });
      const uB = await seedUser(db, { email: 'b@recip-b.com' });
      await seedMembership(db, wsA.id, uA.id);
      await seedMembership(db, wsB.id, uB.id);

      const recipients = await repo.memberRecipients(wsA.id);
      expect(recipients).toEqual([{ userId: uA.id, email: 'a@recip-a.com' }]);
    });
  });

  describe('findActiveById', () => {
    it('returns id + type for an active workspace', async () => {
      const ws = await seedPgWorkspace(db, 'active.test');
      const found = await repo.findActiveById(ws.id);
      expect(found).toEqual({ id: ws.id, type: 'pg' });
    });

    it('returns undefined when the workspace is not active', async () => {
      const id = randomUUID();
      await db.insert(workspaces).values({
        id,
        type: 'buyer',
        name: 'pending-ws',
        status: 'pending',
      });
      expect(await repo.findActiveById(id)).toBeUndefined();
    });

    it('returns undefined for an unknown workspace', async () => {
      expect(await repo.findActiveById('00000000-0000-0000-0000-000000000000')).toBeUndefined();
    });
  });

  describe('findEarliestActiveWorkspace', () => {
    it('returns the earliest-created active workspace', async () => {
      const first = randomUUID();
      const second = randomUUID();
      await db.insert(workspaces).values({
        id: first,
        type: 'buyer',
        name: 'first',
        status: 'active',
        createdAt: new Date('2020-01-01T00:00:00Z'),
      });
      await db.insert(workspaces).values({
        id: second,
        type: 'pg',
        name: 'second',
        status: 'active',
        createdAt: new Date('2021-01-01T00:00:00Z'),
      });
      expect(await repo.findEarliestActiveWorkspace()).toEqual({ id: first });
    });

    it('returns undefined when no active workspace exists', async () => {
      const id = randomUUID();
      await db.insert(workspaces).values({
        id,
        type: 'buyer',
        name: 'pending-only',
        status: 'pending',
      });
      expect(await repo.findEarliestActiveWorkspace()).toBeUndefined();
    });
  });

  describe('getMembership', () => {
    it('returns role + workspace type for a member', async () => {
      const ws = await seedPgWorkspace(db, 'mem.test');
      const u = await seedUser(db, { email: 'm@mem.test' });
      await seedMembership(db, ws.id, u.id, 'admin');
      expect(await repo.getMembership(u.id, ws.id)).toEqual({ role: 'admin', type: 'pg' });
    });

    it('returns undefined when the user is not a member', async () => {
      const ws = await seedBuyerWorkspace(db);
      const u = await seedUser(db, { email: 'nonmember@mem.test' });
      expect(await repo.getMembership(u.id, ws.id)).toBeUndefined();
    });
  });

  describe('findInitialMembership', () => {
    it('returns the earliest-joined membership', async () => {
      const wsA = await seedBuyerWorkspace(db, { name: 'first-joined' });
      const wsB = await seedPgWorkspace(db, 'second-joined.com');
      const u = await seedUser(db, { email: 'init@mem.test' });
      await db.insert(workspaceMembers).values({
        workspaceId: wsA.id,
        userId: u.id,
        role: 'admin',
        joinedAt: new Date('2020-01-01T00:00:00Z'),
      });
      await db.insert(workspaceMembers).values({
        workspaceId: wsB.id,
        userId: u.id,
        role: 'member',
        joinedAt: new Date('2021-01-01T00:00:00Z'),
      });
      expect(await repo.findInitialMembership(u.id)).toEqual({
        workspaceId: wsA.id,
        role: 'admin',
        type: 'buyer',
      });
    });

    it('returns undefined when the user belongs to no workspace', async () => {
      const u = await seedUser(db, { email: 'orphan@mem.test' });
      expect(await repo.findInitialMembership(u.id)).toBeUndefined();
    });
  });

  describe('listMembershipsWithMembers', () => {
    it('returns each membership with workspace name, role, and full member list', async () => {
      const ws = await seedBuyerWorkspace(db, { name: '내 회사' });
      const me = await seedUser(db, { email: 'me@list.test' });
      const other = await seedUser(db, { email: 'other@list.test' });
      await seedMembership(db, ws.id, me.id, 'admin');
      await seedMembership(db, ws.id, other.id, 'member');

      const result = await repo.listMembershipsWithMembers(me.id);
      expect(result).toHaveLength(1);
      expect(result[0].workspaceId).toBe(ws.id);
      expect(result[0].name).toBe('내 회사');
      expect(result[0].role).toBe('admin');
      expect(result[0].members).toHaveLength(2);
      expect(result[0].members).toEqual(
        expect.arrayContaining([
          { userId: me.id, role: 'admin' },
          { userId: other.id, role: 'member' },
        ]),
      );
    });

    it('returns a solo membership with a single-member list', async () => {
      const ws = await seedBuyerWorkspace(db, { name: '1인 회사' });
      const me = await seedUser(db, { email: 'solo@list.test' });
      await seedMembership(db, ws.id, me.id, 'admin');

      const result = await repo.listMembershipsWithMembers(me.id);
      expect(result).toHaveLength(1);
      expect(result[0].members).toEqual([{ userId: me.id, role: 'admin' }]);
    });

    it('returns empty array when the user belongs to no workspace', async () => {
      const me = await seedUser(db, { email: 'none@list.test' });
      expect(await repo.listMembershipsWithMembers(me.id)).toEqual([]);
    });
  });

  describe('setBizProfilePointer / getBizProfileId', () => {
    it('getBizProfileId returns undefined when no biz profile is set', async () => {
      const ws = await seedBuyerWorkspace(db);
      expect(await repo.getBizProfileId(ws.id)).toBeUndefined();
    });

    it('setBizProfilePointer updates the pointer and getBizProfileId reads it back', async () => {
      const ws = await seedBuyerWorkspace(db);
      const biz = await seedBizProfile(db);
      await repo.setBizProfilePointer(ws.id, biz.id);
      expect(await repo.getBizProfileId(ws.id)).toBe(biz.id);
    });

    it('getBizProfileId returns undefined for an unknown workspace', async () => {
      expect(
        await repo.getBizProfileId('00000000-0000-0000-0000-000000000000'),
      ).toBeUndefined();
    });
  });

  describe('rename', () => {
    it('changes the workspace name', async () => {
      const ws = await seedBuyerWorkspace(db, { name: '옛 이름' });
      await repo.rename(ws.id, '새 이름');
      expect(await repo.getName(ws.id)).toBe('새 이름');
    });
  });

  describe('setHasLogo', () => {
    it('sets has_logo to true', async () => {
      const ws = await seedBuyerWorkspace(db);
      await repo.setHasLogo(ws.id, true);
      const [row] = await db
        .select({ hasLogo: workspaces.hasLogo })
        .from(workspaces)
        .where(eq(workspaces.id, ws.id));
      expect(row.hasLogo).toBe(true);
    });

    it('sets has_logo back to false', async () => {
      const ws = await seedBuyerWorkspace(db);
      await repo.setHasLogo(ws.id, true);
      await repo.setHasLogo(ws.id, false);
      const [row] = await db
        .select({ hasLogo: workspaces.hasLogo })
        .from(workspaces)
        .where(eq(workspaces.id, ws.id));
      expect(row.hasLogo).toBe(false);
    });
  });

  describe('createBare', () => {
    it('inserts a workspace row without members', async () => {
      const id = randomUUID();
      await repo.createBare({ id, type: 'pg', name: '경량 워크스페이스', bizProfileId: null });
      const fetched = await repo.findById(id);
      expect(fetched).toBeDefined();
      expect(fetched!.type).toBe('pg');
      expect(fetched!.name).toBe('경량 워크스페이스');
      expect(fetched!.members).toEqual([]);
    });

    it('persists the bizProfileId pointer when provided', async () => {
      const biz = await seedBizProfile(db);
      const id = randomUUID();
      await repo.createBare({ id, type: 'buyer', name: '회사', bizProfileId: biz.id });
      expect(await repo.getBizProfileId(id)).toBe(biz.id);
    });
  });

  describe('addMember', () => {
    it('adds a member with the given role', async () => {
      const ws = await seedBuyerWorkspace(db);
      const u = await seedUser(db, { email: 'added@add.test' });
      await repo.addMember({ workspaceId: ws.id, userId: u.id, role: 'admin' });
      expect(await repo.getMembership(u.id, ws.id)).toEqual({ role: 'admin', type: 'buyer' });
    });

    it('is idempotent (onConflictDoNothing) on a duplicate member', async () => {
      const ws = await seedBuyerWorkspace(db);
      const u = await seedUser(db, { email: 'dup@add.test' });
      await repo.addMember({ workspaceId: ws.id, userId: u.id, role: 'admin' });
      await repo.addMember({ workspaceId: ws.id, userId: u.id, role: 'member' });
      // Role of the first insert wins (no update on conflict).
      expect(await repo.getMembership(u.id, ws.id)).toEqual({ role: 'admin', type: 'buyer' });
      const ids = await repo.memberUserIds(ws.id);
      expect(ids).toEqual([u.id]);
    });
  });

  describe('listPendingInvitations', () => {
    it('returns pending, unexpired invitations with email, createdAt, role', async () => {
      const ws = await seedBuyerWorkspace(db);
      const inviter = await seedUser(db, { email: 'admin@inv.test' });
      await seedInvitation(db, {
        workspaceId: ws.id,
        invitedByUserId: inviter.id,
        invitedEmail: 'pending@inv.test',
        role: 'member',
        status: 'pending',
      });

      const list = await repo.listPendingInvitations(ws.id);
      expect(list).toHaveLength(1);
      expect(list[0].email).toBe('pending@inv.test');
      expect(list[0].role).toBe('member');
      expect(list[0].createdAt).toBeInstanceOf(Date);
    });

    it('excludes accepted and expired invitations', async () => {
      const ws = await seedBuyerWorkspace(db);
      const inviter = await seedUser(db, { email: 'admin2@inv.test' });
      await seedInvitation(db, {
        workspaceId: ws.id,
        invitedByUserId: inviter.id,
        status: 'accepted',
      });
      await seedInvitation(db, {
        workspaceId: ws.id,
        invitedByUserId: inviter.id,
        status: 'pending',
        expiresAt: new Date(Date.now() - 1000),
      });
      expect(await repo.listPendingInvitations(ws.id)).toEqual([]);
    });

    it('does not return invitations from another workspace', async () => {
      const wsA = await seedBuyerWorkspace(db);
      const wsB = await seedBuyerWorkspace(db);
      const inviter = await seedUser(db, { email: 'admin3@inv.test' });
      await seedInvitation(db, { workspaceId: wsB.id, invitedByUserId: inviter.id });
      expect(await repo.listPendingInvitations(wsA.id)).toEqual([]);
    });
  });

  describe('findInvitationByTokenHash', () => {
    it('returns the invitation joined with the workspace name', async () => {
      const ws = await seedBuyerWorkspace(db, { name: '초대 회사' });
      const inviter = await seedUser(db, { email: 'admin@tok.test' });
      const { tokenHash } = await seedInvitation(db, {
        workspaceId: ws.id,
        invitedByUserId: inviter.id,
        invitedEmail: 'invitee@tok.test',
        tokenHash: 'tok-hash-1',
        status: 'pending',
      });

      const found = await repo.findInvitationByTokenHash(tokenHash);
      expect(found).toBeDefined();
      expect(found!.invitedEmail).toBe('invitee@tok.test');
      expect(found!.status).toBe('pending');
      expect(found!.workspaceName).toBe('초대 회사');
      expect(found!.workspaceId).toBe(ws.id);
      expect(found!.expiresAt).toBeInstanceOf(Date);
    });

    it('returns undefined for an unknown token hash', async () => {
      expect(await repo.findInvitationByTokenHash('no-such-hash')).toBeUndefined();
    });
  });

  describe('claimInvitation', () => {
    it('atomically claims a pending invitation and returns workspaceId + role', async () => {
      const ws = await seedBuyerWorkspace(db);
      const inviter = await seedUser(db, { email: 'admin@claim.test' });
      const claimer = await seedUser(db, { email: 'claimer@claim.test' });
      const { id } = await seedInvitation(db, {
        workspaceId: ws.id,
        invitedByUserId: inviter.id,
        role: 'admin',
        status: 'pending',
      });

      const result = await repo.claimInvitation(id, claimer.id);
      expect(result).toEqual({ ok: true, workspaceId: ws.id, role: 'admin' });

      const [row] = await db
        .select({ status: workspaceInvitations.status, acceptedBy: workspaceInvitations.acceptedByUserId })
        .from(workspaceInvitations)
        .where(eq(workspaceInvitations.id, id));
      expect(row.status).toBe('accepted');
      expect(row.acceptedBy).toBe(claimer.id);
    });

    it('fails when the invitation is already accepted', async () => {
      const ws = await seedBuyerWorkspace(db);
      const inviter = await seedUser(db, { email: 'admin2@claim.test' });
      const claimer = await seedUser(db, { email: 'claimer2@claim.test' });
      const { id } = await seedInvitation(db, {
        workspaceId: ws.id,
        invitedByUserId: inviter.id,
        status: 'accepted',
      });
      expect(await repo.claimInvitation(id, claimer.id)).toEqual({ ok: false, reason: 'expired' });
    });

    it('fails when the invitation is expired', async () => {
      const ws = await seedBuyerWorkspace(db);
      const inviter = await seedUser(db, { email: 'admin3@claim.test' });
      const claimer = await seedUser(db, { email: 'claimer3@claim.test' });
      const { id } = await seedInvitation(db, {
        workspaceId: ws.id,
        invitedByUserId: inviter.id,
        status: 'pending',
        expiresAt: new Date(Date.now() - 1000),
      });
      expect(await repo.claimInvitation(id, claimer.id)).toEqual({ ok: false, reason: 'expired' });
    });
  });

  describe('findAdminEmail', () => {
    it('returns the admin member email', async () => {
      const ws = await seedPgWorkspace(db, 'admin-email.test');
      const admin = await seedUser(db, { email: 'theadmin@admin-email.test' });
      const member = await seedUser(db, { email: 'member@admin-email.test' });
      await seedMembership(db, ws.id, admin.id, 'admin');
      await seedMembership(db, ws.id, member.id, 'member');
      expect(await repo.findAdminEmail(ws.id)).toBe('theadmin@admin-email.test');
    });

    it('returns undefined when the workspace has no admin member', async () => {
      const ws = await seedPgWorkspace(db, 'no-admin.test');
      const member = await seedUser(db, { email: 'only-member@no-admin.test' });
      await seedMembership(db, ws.id, member.id, 'member');
      expect(await repo.findAdminEmail(ws.id)).toBeUndefined();
    });
  });
});
