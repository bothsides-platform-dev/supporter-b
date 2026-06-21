import { describe, expect, it, beforeEach } from 'vitest';
import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { createPgliteDb } from '@/lib/db/client-pglite';
import { users as usersForTest, workspaceInvitations, workspaceLogoBlobs, workspaceMembers, workspaces } from '@/lib/db/schema';
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

  it('findById returns logoUpdatedAt: null when no logo blob exists', async () => {
    const ws = await seedBuyerWorkspace(db);
    const fetched = await repo.findById(ws.id);
    expect(fetched).toBeDefined();
    expect(fetched!.logoUpdatedAt).toBeNull();
  });

  it('findById returns logoUpdatedAt as ISO string when logo blob exists', async () => {
    const ws = await seedBuyerWorkspace(db);
    await db.insert(workspaceLogoBlobs).values({
      workspaceId: ws.id,
      bytes: Buffer.from([0x89, 0x50, 0x4e, 0x47]),
      mime: 'image/png',
    });
    const fetched = await repo.findById(ws.id);
    expect(fetched!.logoUpdatedAt).not.toBeNull();
  });

  it('listForUser returns logoUpdatedAt: null when no logo is set', async () => {
    const ws = await seedBuyerWorkspace(db);
    const u = await seedUser(db);
    await seedMembership(db, ws.id, u.id);
    const list = await repo.listForUser(u.id);
    expect(list).toHaveLength(1);
    expect(list[0].logoUpdatedAt).toBeNull();
  });

  it('listForUser returns logoUpdatedAt as ISO string when set', async () => {
    const ws = await seedBuyerWorkspace(db);
    const u = await seedUser(db);
    await seedMembership(db, ws.id, u.id);
    await db.update(workspaces).set({ logoUpdatedAt: new Date('2026-01-01T00:00:00Z') }).where(eq(workspaces.id, ws.id));
    const list = await repo.listForUser(u.id);
    expect(list[0].logoUpdatedAt).not.toBeNull();
  });

  it('listForUser reads logoUpdatedAt from workspaces.logo_updated_at', async () => {
    const ws = await seedBuyerWorkspace(db);
    const u = await seedUser(db);
    await seedMembership(db, ws.id, u.id);
    const now = new Date('2026-06-01T12:00:00Z');
    await db.update(workspaces).set({ logoUpdatedAt: now }).where(eq(workspaces.id, ws.id));

    const list = await repo.listForUser(u.id);
    expect(list[0].logoUpdatedAt).toBe(now.toISOString());
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
      expect(await repo.findEarliestActiveWorkspace()).toEqual({
        id: first,
        type: 'buyer',
      });
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

    it('persists approvalStatus: pending_approval to DB', async () => {
      const ws = await seedPgWorkspace(db, '정규PG');
      const u = await seedUser(db, { email: 'pending@add.test' });
      await repo.addMember({ workspaceId: ws.id, userId: u.id, role: 'member', approvalStatus: 'pending_approval' });
      const [row] = await db.select().from(workspaceMembers)
        .where(eq(workspaceMembers.userId, u.id));
      expect(row).toBeDefined();
      expect(row.approvalStatus).toBe('pending_approval');
    });
  });

  describe('getMemberApprovalStatus', () => {
    it('returns pending_approval when member is awaiting approval', async () => {
      const ws = await seedPgWorkspace(db, '정규PG2');
      const u = await seedUser(db, { email: 'pending2@status.test' });
      await repo.addMember({ workspaceId: ws.id, userId: u.id, role: 'member', approvalStatus: 'pending_approval' });
      expect(await repo.getMemberApprovalStatus(u.id, ws.id)).toBe('pending_approval');
    });

    it('returns approved for a standard (approved) member', async () => {
      const ws = await seedBuyerWorkspace(db);
      const u = await seedUser(db, { email: 'approved@status.test' });
      await repo.addMember({ workspaceId: ws.id, userId: u.id, role: 'member' });
      expect(await repo.getMemberApprovalStatus(u.id, ws.id)).toBe('approved');
    });

    it('returns rejected when member has been rejected', async () => {
      const ws = await seedPgWorkspace(db, '정규PG3');
      const u = await seedUser(db, { email: 'rejected@status.test' });
      await repo.addMember({ workspaceId: ws.id, userId: u.id, role: 'member', approvalStatus: 'rejected' });
      expect(await repo.getMemberApprovalStatus(u.id, ws.id)).toBe('rejected');
    });

    it('returns undefined when user is not a member of the workspace', async () => {
      const ws = await seedBuyerWorkspace(db);
      const u = await seedUser(db, { email: 'nonmember@status.test' });
      expect(await repo.getMemberApprovalStatus(u.id, ws.id)).toBeUndefined();
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

  describe('adminRecipients', () => {
    it('returns userId + email for every admin member only', async () => {
      const ws = await seedPgWorkspace(db, 'admin-recip.test');
      const a1 = await seedUser(db, { email: 'a1@admin-recip.test' });
      const a2 = await seedUser(db, { email: 'a2@admin-recip.test' });
      const m1 = await seedUser(db, { email: 'm1@admin-recip.test' });
      await seedMembership(db, ws.id, a1.id, 'admin');
      await seedMembership(db, ws.id, a2.id, 'admin');
      await seedMembership(db, ws.id, m1.id, 'member');

      const recipients = await repo.adminRecipients(ws.id);
      expect(recipients).toHaveLength(2);
      expect(recipients).toEqual(
        expect.arrayContaining([
          { userId: a1.id, email: 'a1@admin-recip.test' },
          { userId: a2.id, email: 'a2@admin-recip.test' },
        ]),
      );
    });

    it('returns an empty array when there is no admin member', async () => {
      const ws = await seedPgWorkspace(db, 'no-admin-recip.test');
      const m = await seedUser(db, { email: 'm@no-admin-recip.test' });
      await seedMembership(db, ws.id, m.id, 'member');
      expect(await repo.adminRecipients(ws.id)).toEqual([]);
    });

    it('excludes system accounts even when they are admins', async () => {
      const ws = await seedPgWorkspace(db, 'sys-admin-recip.test');
      const human = await seedUser(db, { email: 'human@sys-admin-recip.test' });
      const sysId = randomUUID();
      await db.insert(usersForTest).values({
        id: sysId,
        email: 'system@sys-admin-recip.test',
        passwordHash: 'x',
        name: 'System',
        avatarColor: 'ink',
        isSystemAccount: true,
      });
      await seedMembership(db, ws.id, human.id, 'admin');
      await seedMembership(db, ws.id, sysId, 'admin');

      const recipients = await repo.adminRecipients(ws.id);
      expect(recipients).toEqual([{ userId: human.id, email: 'human@sys-admin-recip.test' }]);
    });

    it('does not include admins of a different workspace', async () => {
      const wsA = await seedPgWorkspace(db, 'admin-recip-a.com');
      const wsB = await seedPgWorkspace(db, 'admin-recip-b.com');
      const a = await seedUser(db, { email: 'a@admin-recip-a.com' });
      const b = await seedUser(db, { email: 'b@admin-recip-b.com' });
      await seedMembership(db, wsA.id, a.id, 'admin');
      await seedMembership(db, wsB.id, b.id, 'admin');
      expect(await repo.adminRecipients(wsA.id)).toEqual([{ userId: a.id, email: 'a@admin-recip-a.com' }]);
    });
  });

  describe('memberRecipientsBatch', () => {
    it('returns workspaceId + userId + role + email for all members across workspaces', async () => {
      const ws1 = await seedPgWorkspace(db, 'mrb-1.com');
      const ws2 = await seedPgWorkspace(db, 'mrb-2.com');
      const a1 = await seedUser(db, { email: 'a1@mrb-1.com' });
      const m1 = await seedUser(db, { email: 'm1@mrb-1.com' });
      const a2 = await seedUser(db, { email: 'a2@mrb-2.com' });
      await seedMembership(db, ws1.id, a1.id, 'admin');
      await seedMembership(db, ws1.id, m1.id, 'member');
      await seedMembership(db, ws2.id, a2.id, 'admin');

      const rows = await repo.memberRecipientsBatch([ws1.id, ws2.id]);
      expect(rows).toHaveLength(3);
      expect(rows).toEqual(
        expect.arrayContaining([
          { workspaceId: ws1.id, userId: a1.id, role: 'admin', email: 'a1@mrb-1.com' },
          { workspaceId: ws1.id, userId: m1.id, role: 'member', email: 'm1@mrb-1.com' },
          { workspaceId: ws2.id, userId: a2.id, role: 'admin', email: 'a2@mrb-2.com' },
        ]),
      );
    });

    it('returns an empty array for empty input', async () => {
      expect(await repo.memberRecipientsBatch([])).toEqual([]);
    });

    it('excludes system accounts', async () => {
      const ws = await seedPgWorkspace(db, 'mrb-sys.com');
      const human = await seedUser(db, { email: 'human@mrb-sys.com' });
      const sysId = randomUUID();
      await db.insert(usersForTest).values({
        id: sysId,
        email: 'system@mrb-sys.com',
        passwordHash: 'x',
        name: 'System',
        avatarColor: 'ink',
        isSystemAccount: true,
      });
      await seedMembership(db, ws.id, human.id, 'admin');
      await seedMembership(db, ws.id, sysId, 'admin');

      const rows = await repo.memberRecipientsBatch([ws.id]);
      expect(rows).toEqual([
        { workspaceId: ws.id, userId: human.id, role: 'admin', email: 'human@mrb-sys.com' },
      ]);
    });
  });

  describe('getBizProfileIdAndName', () => {
    it('returns bizProfileId + name when a biz profile is set', async () => {
      const biz = await seedBizProfile(db);
      const ws = await seedBuyerWorkspace(db, { name: '비즈회사', bizProfileId: biz.id });
      expect(await repo.getBizProfileIdAndName(ws.id)).toEqual({
        bizProfileId: biz.id,
        name: '비즈회사',
      });
    });

    it('returns bizProfileId null when no biz profile is set', async () => {
      const ws = await seedBuyerWorkspace(db, { name: '노비즈' });
      expect(await repo.getBizProfileIdAndName(ws.id)).toEqual({
        bizProfileId: null,
        name: '노비즈',
      });
    });

    it('returns undefined for an unknown workspace', async () => {
      expect(
        await repo.getBizProfileIdAndName('00000000-0000-0000-0000-000000000000'),
      ).toBeUndefined();
    });
  });

  describe('filterPgIds', () => {
    it('returns only the ids whose workspace type is pg', async () => {
      const pgA = await seedPgWorkspace(db, 'fp-a.com');
      const pgB = await seedPgWorkspace(db, 'fp-b.com');
      const buyer = await seedBuyerWorkspace(db);
      const result = await repo.filterPgIds([pgA.id, buyer.id, pgB.id]);
      expect(result.sort()).toEqual([pgA.id, pgB.id].sort());
    });

    it('omits unknown ids', async () => {
      const pg = await seedPgWorkspace(db, 'fp-only.com');
      const result = await repo.filterPgIds([pg.id, '00000000-0000-0000-0000-000000000000']);
      expect(result).toEqual([pg.id]);
    });

    it('returns empty array for empty input', async () => {
      expect(await repo.filterPgIds([])).toEqual([]);
    });
  });

  describe('createInvitation', () => {
    it('inserts a pending invitation row with the given fields', async () => {
      const ws = await seedBuyerWorkspace(db);
      const inviter = await seedUser(db, { email: 'inviter@create-inv.test' });
      const expiresAt = new Date(Date.now() + 7 * 24 * 3600 * 1000);

      await repo.createInvitation({
        workspaceId: ws.id,
        invitedEmail: 'invitee@create-inv.test',
        invitedByUserId: inviter.id,
        role: 'member',
        tokenHash: 'create-inv-hash-1',
        expiresAt,
      });

      const [row] = await db
        .select()
        .from(workspaceInvitations)
        .where(eq(workspaceInvitations.tokenHash, 'create-inv-hash-1'));
      expect(row.workspaceId).toBe(ws.id);
      expect(row.invitedEmail).toBe('invitee@create-inv.test');
      expect(row.invitedByUserId).toBe(inviter.id);
      expect(row.role).toBe('member');
      expect(row.status).toBe('pending');
    });

    it('throws a unique violation when a pending invite already exists for the same (workspace, email)', async () => {
      const ws = await seedBuyerWorkspace(db);
      const inviter = await seedUser(db, { email: 'inviter2@create-inv.test' });
      const expiresAt = new Date(Date.now() + 7 * 24 * 3600 * 1000);
      await repo.createInvitation({
        workspaceId: ws.id,
        invitedEmail: 'dup@create-inv.test',
        invitedByUserId: inviter.id,
        role: 'member',
        tokenHash: 'create-inv-hash-2a',
        expiresAt,
      });

      await expect(
        repo.createInvitation({
          workspaceId: ws.id,
          invitedEmail: 'dup@create-inv.test',
          invitedByUserId: inviter.id,
          role: 'member',
          tokenHash: 'create-inv-hash-2b',
          expiresAt,
        }),
      ).rejects.toThrow();
    });
  });

  describe('resetPendingInvitationToken', () => {
    it('updates tokenHash + expiresAt on a matching pending invite and returns true', async () => {
      const ws = await seedBuyerWorkspace(db);
      const inviter = await seedUser(db, { email: 'admin@reset.test' });
      const { id } = await seedInvitation(db, {
        workspaceId: ws.id,
        invitedByUserId: inviter.id,
        invitedEmail: 'Pending@Reset.test',
        tokenHash: 'reset-old-hash',
        status: 'pending',
      });
      const newExpires = new Date(Date.now() + 14 * 24 * 3600 * 1000);

      const ok = await repo.resetPendingInvitationToken({
        workspaceId: ws.id,
        email: 'pending@reset.test',
        tokenHash: 'reset-new-hash',
        expiresAt: newExpires,
      });
      expect(ok).toBe(true);

      const [row] = await db
        .select({ tokenHash: workspaceInvitations.tokenHash })
        .from(workspaceInvitations)
        .where(eq(workspaceInvitations.id, id));
      expect(row.tokenHash).toBe('reset-new-hash');
    });

    it('returns false when there is no matching pending invite', async () => {
      const ws = await seedBuyerWorkspace(db);
      const ok = await repo.resetPendingInvitationToken({
        workspaceId: ws.id,
        email: 'nobody@reset.test',
        tokenHash: 'x',
        expiresAt: new Date(),
      });
      expect(ok).toBe(false);
    });
  });

  describe('expirePendingInvitation', () => {
    it('marks a matching pending invite as expired and returns true', async () => {
      const ws = await seedBuyerWorkspace(db);
      const inviter = await seedUser(db, { email: 'admin@expire.test' });
      const { id } = await seedInvitation(db, {
        workspaceId: ws.id,
        invitedByUserId: inviter.id,
        invitedEmail: 'Pending@Expire.test',
        status: 'pending',
      });

      const ok = await repo.expirePendingInvitation({ workspaceId: ws.id, email: 'pending@expire.test' });
      expect(ok).toBe(true);

      const [row] = await db
        .select({ status: workspaceInvitations.status })
        .from(workspaceInvitations)
        .where(eq(workspaceInvitations.id, id));
      expect(row.status).toBe('expired');
    });

    it('returns false when there is no matching pending invite', async () => {
      const ws = await seedBuyerWorkspace(db);
      const ok = await repo.expirePendingInvitation({ workspaceId: ws.id, email: 'nobody@expire.test' });
      expect(ok).toBe(false);
    });
  });

  describe('findInvitationClaimByTokenHash', () => {
    it('returns claim fields for an existing invitation', async () => {
      const ws = await seedBuyerWorkspace(db);
      const inviter = await seedUser(db, { email: 'admin@claim-find.test' });
      const expiresAt = new Date(Date.now() + 7 * 24 * 3600 * 1000);
      const { id } = await seedInvitation(db, {
        workspaceId: ws.id,
        invitedByUserId: inviter.id,
        invitedEmail: 'invitee@claim-find.test',
        tokenHash: 'claim-find-hash',
        role: 'admin',
        status: 'pending',
        expiresAt,
      });

      const found = await repo.findInvitationClaimByTokenHash('claim-find-hash');
      expect(found).toBeDefined();
      expect(found!.id).toBe(id);
      expect(found!.workspaceId).toBe(ws.id);
      expect(found!.role).toBe('admin');
      expect(found!.status).toBe('pending');
      expect(found!.invitedEmail).toBe('invitee@claim-find.test');
      expect(found!.expiresAt).toBeInstanceOf(Date);
    });

    it('returns undefined for an unknown token hash', async () => {
      expect(await repo.findInvitationClaimByTokenHash('no-such-claim-hash')).toBeUndefined();
    });
  });

  describe('countAdmins', () => {
    it('counts admin members of a workspace', async () => {
      const ws = await seedBuyerWorkspace(db);
      const a1 = await seedUser(db, { email: 'a1@count-admin.test' });
      const a2 = await seedUser(db, { email: 'a2@count-admin.test' });
      const m1 = await seedUser(db, { email: 'm1@count-admin.test' });
      await seedMembership(db, ws.id, a1.id, 'admin');
      await seedMembership(db, ws.id, a2.id, 'admin');
      await seedMembership(db, ws.id, m1.id, 'member');
      expect(await repo.countAdmins(ws.id)).toBe(2);
    });

    it('returns 0 when there are no admins', async () => {
      const ws = await seedBuyerWorkspace(db);
      const m = await seedUser(db, { email: 'm@count-admin.test' });
      await seedMembership(db, ws.id, m.id, 'member');
      expect(await repo.countAdmins(ws.id)).toBe(0);
    });
  });

  describe('updateMemberRole', () => {
    it('changes a member role', async () => {
      const ws = await seedBuyerWorkspace(db);
      const u = await seedUser(db, { email: 'u@update-role.test' });
      await seedMembership(db, ws.id, u.id, 'member');
      await repo.updateMemberRole({ workspaceId: ws.id, userId: u.id, role: 'admin' });
      expect(await repo.getMembership(u.id, ws.id)).toEqual({ role: 'admin', type: 'buyer' });
    });
  });

  describe('removeMember', () => {
    it('removes a member from the workspace', async () => {
      const ws = await seedBuyerWorkspace(db);
      const u = await seedUser(db, { email: 'u@remove-member.test' });
      await seedMembership(db, ws.id, u.id, 'member');
      await repo.removeMember({ workspaceId: ws.id, userId: u.id });
      expect(await repo.getMembership(u.id, ws.id)).toBeUndefined();
    });
  });

  describe('findActiveCanonicalPgById', () => {
    it('returns id + canonicalPgKey for an active canonical PG workspace', async () => {
      const id = randomUUID();
      await db.insert(workspaces).values({
        id,
        type: 'pg',
        name: 'Toss',
        status: 'active',
        canonicalPgKey: 'tosspayments',
      });
      expect(await repo.findActiveCanonicalPgById(id)).toEqual({ id, canonicalPgKey: 'tosspayments', name: 'Toss' });
    });

    it('returns undefined when the workspace has no canonicalPgKey', async () => {
      const ws = await seedPgWorkspace(db, 'plain-pg'); // active, but canonicalPgKey null
      expect(await repo.findActiveCanonicalPgById(ws.id)).toBeUndefined();
    });

    it('returns undefined when the workspace is a buyer', async () => {
      const id = randomUUID();
      await db.insert(workspaces).values({
        id,
        type: 'buyer',
        name: 'BuyerCo',
        status: 'active',
        canonicalPgKey: 'should-not-match',
      });
      expect(await repo.findActiveCanonicalPgById(id)).toBeUndefined();
    });

    it('returns undefined when the workspace is not active', async () => {
      const id = randomUUID();
      await db.insert(workspaces).values({
        id,
        type: 'pg',
        name: 'Pending PG',
        status: 'pending',
        canonicalPgKey: 'pendingpg',
      });
      expect(await repo.findActiveCanonicalPgById(id)).toBeUndefined();
    });

    it('returns undefined for an unknown id', async () => {
      expect(await repo.findActiveCanonicalPgById(randomUUID())).toBeUndefined();
    });
  });

  describe('deleteWorkspaces', () => {
    it('deletes the given workspaces and leaves others intact', async () => {
      const a = await seedBuyerWorkspace(db, { name: 'A' });
      const b = await seedBuyerWorkspace(db, { name: 'B' });
      await repo.deleteWorkspaces([a.id]);
      const [rowA] = await db.select().from(workspaces).where(eq(workspaces.id, a.id));
      const [rowB] = await db.select().from(workspaces).where(eq(workspaces.id, b.id));
      expect(rowA).toBeUndefined();
      expect(rowB).toBeDefined();
    });

    it('is a no-op for an empty id list', async () => {
      const a = await seedBuyerWorkspace(db);
      await repo.deleteWorkspaces([]);
      const [rowA] = await db.select().from(workspaces).where(eq(workspaces.id, a.id));
      expect(rowA).toBeDefined();
    });
  });

  describe('setLogoUpdatedAt + logoUpdatedAt exposure', () => {
    it('findById exposes logoUpdatedAt (ISO) from the logo blob, null when absent', async () => {
      const ws = await seedBuyerWorkspace(db);
      expect((await repo.findById(ws.id))!.logoUpdatedAt).toBeNull();
      await db.insert(workspaceLogoBlobs).values({
        workspaceId: ws.id,
        bytes: Buffer.from([0x89, 0x50, 0x4e, 0x47]),
        mime: 'image/png',
        updatedAt: new Date('2026-06-21T00:00:00.000Z'),
      });
      expect((await repo.findById(ws.id))!.logoUpdatedAt).toBe('2026-06-21T00:00:00.000Z');
    });

    it('setLogoUpdatedAt writes/clears workspaces.logo_updated_at and listForUser reflects it', async () => {
      const ws = await seedBuyerWorkspace(db);
      const u = await seedUser(db);
      await seedMembership(db, ws.id, u.id);
      await repo.setLogoUpdatedAt(ws.id, new Date('2026-06-21T00:00:00.000Z'));
      expect((await repo.listForUser(u.id))[0].logoUpdatedAt).toBe('2026-06-21T00:00:00.000Z');
      await repo.setLogoUpdatedAt(ws.id, null);
      expect((await repo.listForUser(u.id))[0].logoUpdatedAt).toBeNull();
    });
  });

  describe('removeAllMembershipsForUser', () => {
    it('removes every membership for the user, leaving other members', async () => {
      const ws1 = await seedBuyerWorkspace(db);
      const ws2 = await seedPgWorkspace(db, 'pg2');
      const me = await seedUser(db, { email: 'me@rmall.test' });
      const other = await seedUser(db, { email: 'other@rmall.test' });
      await seedMembership(db, ws1.id, me.id, 'admin');
      await seedMembership(db, ws2.id, me.id, 'member');
      await seedMembership(db, ws1.id, other.id, 'member');

      await repo.removeAllMembershipsForUser(me.id);

      expect(await repo.getMembership(me.id, ws1.id)).toBeUndefined();
      expect(await repo.getMembership(me.id, ws2.id)).toBeUndefined();
      expect(await repo.getMembership(other.id, ws1.id)).toEqual({ role: 'member', type: 'buyer' });
    });
  });
});
