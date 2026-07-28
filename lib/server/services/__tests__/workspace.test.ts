import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { and, eq } from 'drizzle-orm';

// Must be hoisted before workspace.ts is imported so the static import in
// workspace.ts resolves to the mock, not the real Centrifugo client.
vi.mock('@/lib/server/realtime/centrifugo', () => ({
  disconnectCentrifugoUser: vi.fn().mockResolvedValue(undefined),
}));

import { createPgliteDb } from '@/lib/db/client-pglite';
import {
  __resetForTest,
  __useDrizzleWithDbForTest,
  getOutboxRepo,
  getAuditLogRepo,
  getWorkspaceRepo,
  getUserRepo,
} from '@/lib/server/repositories/factory';
import {
  seedBuyerWorkspace,
  seedMembership,
  seedUser,
} from '@/lib/server/repositories/drizzle/__tests__/_seed';
import { auditLogs, users, workspaceInvitations, workspaceMembers } from '@/lib/db/schema';
import { WorkspaceService } from '../workspace';
import { disconnectCentrifugoUser } from '@/lib/server/realtime/centrifugo';
import type { PgliteDB } from '@/lib/db/client-pglite';

let db: PgliteDB;
let service: WorkspaceService;

async function buildService(): Promise<WorkspaceService> {
  const outboxRepo = await getOutboxRepo();
  const auditRepo = await getAuditLogRepo();
  const workspaceRepo = await getWorkspaceRepo();
  const userRepo = await getUserRepo();
  return new WorkspaceService(db, outboxRepo, auditRepo, workspaceRepo, userRepo);
}

beforeEach(async () => {
  __resetForTest();
  db = await createPgliteDb();
  await __useDrizzleWithDbForTest(db);
  service = await buildService();
});

afterEach(() => {
  __resetForTest();
});

// ─── createWorkspace ─────────────────────────────────────────────────────────

describe('WorkspaceService.createWorkspace', () => {
  it('creates a workspace with admin membership and verification application', async () => {
    const user = await seedUser(db, { email: 'creator@test.com' });

    const result = await service.createWorkspace(
      { type: 'buyer', name: '테스트 구매사', userId: user.id },
      { userId: user.id, workspaceId: '' },
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const ws = await db.query.workspaces.findFirst({
      where: (t, { eq }) => eq(t.id, result.workspaceId),
    });
    expect(ws).toBeDefined();
    expect(ws?.name).toBe('테스트 구매사');
    expect(ws?.type).toBe('buyer');

    const membership = await db.query.workspaceMembers.findFirst({
      where: (t, { and, eq }) => and(eq(t.workspaceId, result.workspaceId), eq(t.userId, user.id)),
    });
    expect(membership?.role).toBe('admin');
  });
});

// ─── changeMemberRole ─────────────────────────────────────────────────────────

describe('WorkspaceService.changeMemberRole', () => {
  it('promotes a member to admin', async () => {
    const admin = await seedUser(db, { email: 'admin@test.com' });
    const member = await seedUser(db, { email: 'member@test.com' });
    const ws = await seedBuyerWorkspace(db);
    await seedMembership(db, ws.id, admin.id, 'admin');
    await seedMembership(db, ws.id, member.id, 'member');

    const result = await service.changeMemberRole(
      { targetUserId: member.id, role: 'admin' },
      { userId: admin.id, workspaceId: ws.id },
    );

    expect(result.ok).toBe(true);

    const [row] = await db
      .select({ role: workspaceMembers.role })
      .from(workspaceMembers)
      .where(and(eq(workspaceMembers.workspaceId, ws.id), eq(workspaceMembers.userId, member.id)));
    expect(row.role).toBe('admin');
  });

  it('returns LAST_ADMIN when demoting the only admin', async () => {
    const admin = await seedUser(db, { email: 'admin@test.com' });
    const ws = await seedBuyerWorkspace(db);
    await seedMembership(db, ws.id, admin.id, 'admin');

    const result = await service.changeMemberRole(
      { targetUserId: admin.id, role: 'member' },
      { userId: admin.id, workspaceId: ws.id },
    );

    expect(result).toEqual({ ok: false, error: 'LAST_ADMIN' });

    // 가드가 트랜잭션 안으로 들어갔으므로, 거절 시 역할·감사로그 모두 쓰이지 않아야 한다.
    const [row] = await db
      .select({ role: workspaceMembers.role })
      .from(workspaceMembers)
      .where(and(eq(workspaceMembers.workspaceId, ws.id), eq(workspaceMembers.userId, admin.id)));
    expect(row.role).toBe('admin');
    expect(await db.select({ id: auditLogs.id }).from(auditLogs)).toHaveLength(0);
  });

  // 미승인 admin 은 잔여 admin 으로 쳐주지 않는다 — 가드가 느슨해지지 않았음을 못박는다.
  it('still returns LAST_ADMIN for the sole approved admin when a pending decoy admin exists', async () => {
    const admin = await seedUser(db, { email: 'admin@test.com' });
    const decoy = await seedUser(db, { email: 'decoy@test.com' });
    const ws = await seedBuyerWorkspace(db);
    await seedMembership(db, ws.id, admin.id, 'admin');
    await seedMembership(db, ws.id, decoy.id, 'admin', { approvalStatus: 'pending_approval' });

    const result = await service.changeMemberRole(
      { targetUserId: admin.id, role: 'member' },
      { userId: admin.id, workspaceId: ws.id },
    );

    expect(result).toEqual({ ok: false, error: 'LAST_ADMIN' });
  });

  it('demotes an approved admin when another approved admin remains', async () => {
    const admin = await seedUser(db, { email: 'admin@test.com' });
    const coAdmin = await seedUser(db, { email: 'coadmin@test.com' });
    const ws = await seedBuyerWorkspace(db);
    await seedMembership(db, ws.id, admin.id, 'admin');
    await seedMembership(db, ws.id, coAdmin.id, 'admin');

    const result = await service.changeMemberRole(
      { targetUserId: coAdmin.id, role: 'member' },
      { userId: admin.id, workspaceId: ws.id },
    );

    expect(result.ok).toBe(true);

    const [row] = await db
      .select({ role: workspaceMembers.role })
      .from(workspaceMembers)
      .where(and(eq(workspaceMembers.workspaceId, ws.id), eq(workspaceMembers.userId, coAdmin.id)));
    expect(row.role).toBe('member');
  });

  // 미승인 admin 은 countAdmins 집계 대상이 아니므로 강등해도 마지막 admin 이 사라지지 않는다.
  it('demotes a pending_approval admin without LAST_ADMIN', async () => {
    const admin = await seedUser(db, { email: 'admin@test.com' });
    const pending = await seedUser(db, { email: 'pending@test.com' });
    const ws = await seedBuyerWorkspace(db);
    await seedMembership(db, ws.id, admin.id, 'admin');
    await seedMembership(db, ws.id, pending.id, 'admin', {
      approvalStatus: 'pending_approval',
    });

    const result = await service.changeMemberRole(
      { targetUserId: pending.id, role: 'member' },
      { userId: admin.id, workspaceId: ws.id },
    );

    expect(result.ok).toBe(true);

    const [row] = await db
      .select({ role: workspaceMembers.role })
      .from(workspaceMembers)
      .where(and(eq(workspaceMembers.workspaceId, ws.id), eq(workspaceMembers.userId, pending.id)));
    expect(row.role).toBe('member');
  });

  // 가드는 'approved' 인지로 판정한다 — 'pending_approval 이 아님' 이 아니라.
  it('demotes a rejected admin without LAST_ADMIN', async () => {
    const admin = await seedUser(db, { email: 'admin@test.com' });
    const rejected = await seedUser(db, { email: 'rejected@test.com' });
    const ws = await seedBuyerWorkspace(db);
    await seedMembership(db, ws.id, admin.id, 'admin');
    await seedMembership(db, ws.id, rejected.id, 'admin', { approvalStatus: 'rejected' });

    const result = await service.changeMemberRole(
      { targetUserId: rejected.id, role: 'member' },
      { userId: admin.id, workspaceId: ws.id },
    );

    expect(result.ok).toBe(true);

    const [row] = await db
      .select({ role: workspaceMembers.role })
      .from(workspaceMembers)
      .where(and(eq(workspaceMembers.workspaceId, ws.id), eq(workspaceMembers.userId, rejected.id)));
    expect(row.role).toBe('member');
  });

  it('returns FORBIDDEN_NOT_ADMIN when caller is not admin', async () => {
    const member = await seedUser(db, { email: 'member@test.com' });
    const target = await seedUser(db, { email: 'target@test.com' });
    const ws = await seedBuyerWorkspace(db);
    await seedMembership(db, ws.id, member.id, 'member');
    await seedMembership(db, ws.id, target.id, 'member');

    const result = await service.changeMemberRole(
      { targetUserId: target.id, role: 'admin' },
      { userId: member.id, workspaceId: ws.id },
    );

    expect(result).toEqual({ ok: false, error: 'FORBIDDEN_NOT_ADMIN' });
  });

  it('returns MEMBER_NOT_FOUND when target is not in workspace', async () => {
    const admin = await seedUser(db, { email: 'admin@test.com' });
    const stranger = await seedUser(db, { email: 'stranger@test.com' });
    const ws = await seedBuyerWorkspace(db);
    await seedMembership(db, ws.id, admin.id, 'admin');

    const result = await service.changeMemberRole(
      { targetUserId: stranger.id, role: 'member' },
      { userId: admin.id, workspaceId: ws.id },
    );

    expect(result).toEqual({ ok: false, error: 'MEMBER_NOT_FOUND' });
  });
});

// ─── removeMember ─────────────────────────────────────────────────────────────

describe('WorkspaceService.removeMember', () => {
  it('removes a member from the workspace', async () => {
    const admin = await seedUser(db, { email: 'admin@test.com' });
    const member = await seedUser(db, { email: 'member@test.com' });
    const ws = await seedBuyerWorkspace(db);
    await seedMembership(db, ws.id, admin.id, 'admin');
    await seedMembership(db, ws.id, member.id, 'member');

    const result = await service.removeMember(
      { targetUserId: member.id },
      { userId: admin.id, workspaceId: ws.id },
    );

    expect(result.ok).toBe(true);

    const rows = await db
      .select()
      .from(workspaceMembers)
      .where(and(eq(workspaceMembers.workspaceId, ws.id), eq(workspaceMembers.userId, member.id)));
    expect(rows).toHaveLength(0);
  });

  it('bumps sessionVersion of removed member and calls disconnectCentrifugoUser', async () => {
    vi.mocked(disconnectCentrifugoUser).mockClear();

    const admin = await seedUser(db, { email: 'admin@test.com' });
    const member = await seedUser(db, { email: 'member@test.com' });
    const ws = await seedBuyerWorkspace(db);
    await seedMembership(db, ws.id, admin.id, 'admin');
    await seedMembership(db, ws.id, member.id, 'member');

    const [before] = await db.select({ sv: users.sessionVersion }).from(users).where(eq(users.id, member.id));

    await service.removeMember(
      { targetUserId: member.id },
      { userId: admin.id, workspaceId: ws.id },
    );

    const [after] = await db.select({ sv: users.sessionVersion }).from(users).where(eq(users.id, member.id));
    expect(after.sv).toBe(before.sv + 1);
    expect(disconnectCentrifugoUser).toHaveBeenCalledWith(member.id);
    expect(disconnectCentrifugoUser).toHaveBeenCalledTimes(1);
  });

  it('returns SELF_REMOVAL when trying to remove yourself', async () => {
    const admin = await seedUser(db, { email: 'admin@test.com' });
    const ws = await seedBuyerWorkspace(db);
    await seedMembership(db, ws.id, admin.id, 'admin');

    const result = await service.removeMember(
      { targetUserId: admin.id },
      { userId: admin.id, workspaceId: ws.id },
    );

    expect(result).toEqual({ ok: false, error: 'SELF_REMOVAL' });
  });

  it('returns FORBIDDEN_NOT_ADMIN when caller is not admin', async () => {
    const member = await seedUser(db, { email: 'member@test.com' });
    const target = await seedUser(db, { email: 'target@test.com' });
    const ws = await seedBuyerWorkspace(db);
    await seedMembership(db, ws.id, member.id, 'member');
    await seedMembership(db, ws.id, target.id, 'member');

    const result = await service.removeMember(
      { targetUserId: target.id },
      { userId: member.id, workspaceId: ws.id },
    );

    expect(result).toEqual({ ok: false, error: 'FORBIDDEN_NOT_ADMIN' });
  });
});

// ─── pending_approval admin has NO admin authority ─────────────────────────────
// Canonical-PG joiners are role='admin' but approvalStatus='pending_approval'
// until vetted. The shell only gates RSC renders, not server actions, so the
// service gates MUST treat an unapproved admin as a non-admin.

describe('WorkspaceService — pending_approval admin is not an effective admin', () => {
  it('changeMemberRole returns FORBIDDEN_NOT_ADMIN for a pending admin actor', async () => {
    const pending = await seedUser(db, { email: 'pending@test.com' });
    const target = await seedUser(db, { email: 'target@test.com' });
    const ws = await seedBuyerWorkspace(db);
    await seedMembership(db, ws.id, pending.id, 'admin', { approvalStatus: 'pending_approval' });
    await seedMembership(db, ws.id, target.id, 'member');

    const result = await service.changeMemberRole(
      { targetUserId: target.id, role: 'admin' },
      { userId: pending.id, workspaceId: ws.id },
    );

    expect(result).toEqual({ ok: false, error: 'FORBIDDEN_NOT_ADMIN' });
  });

  it('removeMember returns FORBIDDEN_NOT_ADMIN for a pending admin actor', async () => {
    const pending = await seedUser(db, { email: 'pending@test.com' });
    const victim = await seedUser(db, { email: 'victim@test.com' });
    const ws = await seedBuyerWorkspace(db);
    await seedMembership(db, ws.id, pending.id, 'admin', { approvalStatus: 'pending_approval' });
    await seedMembership(db, ws.id, victim.id, 'admin');

    const result = await service.removeMember(
      { targetUserId: victim.id },
      { userId: pending.id, workspaceId: ws.id },
    );

    expect(result).toEqual({ ok: false, error: 'FORBIDDEN_NOT_ADMIN' });

    const rows = await db
      .select()
      .from(workspaceMembers)
      .where(and(eq(workspaceMembers.workspaceId, ws.id), eq(workspaceMembers.userId, victim.id)));
    expect(rows).toHaveLength(1);
  });

  it('inviteMember returns FORBIDDEN_NOT_ADMIN for a pending admin actor', async () => {
    const pending = await seedUser(db, { email: 'pending@test.com' });
    const ws = await seedBuyerWorkspace(db);
    await seedMembership(db, ws.id, pending.id, 'admin', { approvalStatus: 'pending_approval' });

    const result = await service.inviteMember(
      { email: 'confederate@test.com', role: 'admin' },
      { userId: pending.id, workspaceId: ws.id },
    );

    expect(result).toEqual({ ok: false, error: 'FORBIDDEN_NOT_ADMIN' });
  });
});

// ─── inviteMember ─────────────────────────────────────────────────────────────

describe('WorkspaceService.inviteMember', () => {
  it('creates an invitation and enqueues an outbox email', async () => {
    const admin = await seedUser(db, { email: 'admin@test.com' });
    const ws = await seedBuyerWorkspace(db, { name: '초대 테스트사' });
    await seedMembership(db, ws.id, admin.id, 'admin');

    const result = await service.inviteMember(
      { email: 'newmember@test.com', role: 'member' },
      { userId: admin.id, workspaceId: ws.id },
    );

    expect(result.ok).toBe(true);

    const invites = await db.select().from(workspaceInvitations);
    expect(invites).toHaveLength(1);
    expect(invites[0].invitedEmail).toBe('newmember@test.com');
    expect(invites[0].status).toBe('pending');
  });

  it('returns ALREADY_INVITED when duplicate invitation exists', async () => {
    const admin = await seedUser(db, { email: 'admin@test.com' });
    const ws = await seedBuyerWorkspace(db);
    await seedMembership(db, ws.id, admin.id, 'admin');

    await service.inviteMember(
      { email: 'dup@test.com', role: 'member' },
      { userId: admin.id, workspaceId: ws.id },
    );

    const result = await service.inviteMember(
      { email: 'dup@test.com', role: 'member' },
      { userId: admin.id, workspaceId: ws.id },
    );

    expect(result).toEqual({ ok: false, error: 'ALREADY_INVITED' });
  });

  it('returns FORBIDDEN_NOT_ADMIN when caller is not admin', async () => {
    const member = await seedUser(db, { email: 'member@test.com' });
    const ws = await seedBuyerWorkspace(db);
    await seedMembership(db, ws.id, member.id, 'member');

    const result = await service.inviteMember(
      { email: 'newguy@test.com', role: 'member' },
      { userId: member.id, workspaceId: ws.id },
    );

    expect(result).toEqual({ ok: false, error: 'FORBIDDEN_NOT_ADMIN' });
  });
});

// ─── cancelInvite ─────────────────────────────────────────────────────────────

describe('WorkspaceService.cancelInvite', () => {
  it('marks a pending invitation as expired', async () => {
    const admin = await seedUser(db, { email: 'admin@test.com' });
    const ws = await seedBuyerWorkspace(db);
    await seedMembership(db, ws.id, admin.id, 'admin');

    await service.inviteMember(
      { email: 'invited@test.com', role: 'member' },
      { userId: admin.id, workspaceId: ws.id },
    );

    const result = await service.cancelInvite(
      { email: 'invited@test.com' },
      { userId: admin.id, workspaceId: ws.id },
    );

    expect(result.ok).toBe(true);

    const [inv] = await db.select().from(workspaceInvitations);
    expect(inv.status).toBe('expired');
  });

  it('returns INVITE_NOT_FOUND when no pending invitation exists', async () => {
    const admin = await seedUser(db, { email: 'admin@test.com' });
    const ws = await seedBuyerWorkspace(db);
    await seedMembership(db, ws.id, admin.id, 'admin');

    const result = await service.cancelInvite(
      { email: 'nobody@test.com' },
      { userId: admin.id, workspaceId: ws.id },
    );

    expect(result).toEqual({ ok: false, error: 'INVITE_NOT_FOUND' });
  });
});

// ─── acceptInvite ─────────────────────────────────────────────────────────────

describe('WorkspaceService.acceptInvite', () => {
  it('claims a valid invitation and adds the user to the workspace', async () => {
    const admin = await seedUser(db, { email: 'admin@test.com' });
    const ws = await seedBuyerWorkspace(db, { name: '수락 테스트사' });
    await seedMembership(db, ws.id, admin.id, 'admin');

    // Create an invitation directly in DB for test
    const invitedUser = await seedUser(db, { email: 'invited@test.com' });
    const { generateToken, hashToken } = await import('@/lib/server/token');
    const rawToken = generateToken();
    const tokenHash = hashToken(rawToken);
    await db.insert(workspaceInvitations).values({
      workspaceId: ws.id,
      invitedEmail: 'invited@test.com',
      invitedByUserId: admin.id,
      role: 'member',
      tokenHash,
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      status: 'pending',
    });

    const result = await service.acceptInvite(rawToken, {
      userId: invitedUser.id,
      userEmail: 'invited@test.com',
      workspaceId: '',
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.workspaceId).toBe(ws.id);

    const membership = await db.query.workspaceMembers.findFirst({
      where: (t, { and, eq }) => and(eq(t.workspaceId, ws.id), eq(t.userId, invitedUser.id)),
    });
    expect(membership).toBeDefined();
  });

  it('returns INVITE_INVALID for an unknown token', async () => {
    const user = await seedUser(db, { email: 'user@test.com' });
    const ws = await seedBuyerWorkspace(db);

    const result = await service.acceptInvite('totally-fake-token-that-does-not-exist', {
      userId: user.id,
      userEmail: 'user@test.com',
      workspaceId: ws.id,
    });

    expect(result).toEqual({ ok: false, error: 'INVITE_INVALID' });
  });

  it('returns INVITE_EMAIL_MISMATCH when user email differs from invited email', async () => {
    const admin = await seedUser(db, { email: 'admin@test.com' });
    const ws = await seedBuyerWorkspace(db);
    await seedMembership(db, ws.id, admin.id, 'admin');

    const otherUser = await seedUser(db, { email: 'other@test.com' });
    const { generateToken, hashToken } = await import('@/lib/server/token');
    const rawToken = generateToken();
    const tokenHash = hashToken(rawToken);
    await db.insert(workspaceInvitations).values({
      workspaceId: ws.id,
      invitedEmail: 'right@test.com',
      invitedByUserId: admin.id,
      role: 'member',
      tokenHash,
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      status: 'pending',
    });

    const result = await service.acceptInvite(rawToken, {
      userId: otherUser.id,
      userEmail: 'other@test.com',
      workspaceId: ws.id,
    });

    expect(result).toEqual({ ok: false, error: 'INVITE_EMAIL_MISMATCH' });
  });
});

// ─── 감사 로그 (C5) ───────────────────────────────────────────────────────────

describe('WorkspaceService — 감사 로그 기록', () => {
  async function rowsFor(action: string) {
    return db.select().from(auditLogs).where(eq(auditLogs.action, action));
  }

  it('createWorkspace 성공 시 workspace.create 감사 행을 남긴다', async () => {
    const user = await seedUser(db, { email: 'creator@audit.com' });
    const r = await service.createWorkspace(
      { type: 'buyer', name: '감사 구매사', userId: user.id },
      { userId: user.id, workspaceId: '' },
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;

    const rows = await rowsFor('workspace.create');
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      actorUserId: user.id,
      actorWorkspaceId: r.workspaceId,
      entityType: 'workspace',
      entityId: r.workspaceId,
    });
  });

  it('inviteMember 성공 시 workspace.member_invite 감사 행을 남긴다', async () => {
    const admin = await seedUser(db, { email: 'admin@audit.com' });
    const ws = await seedBuyerWorkspace(db);
    await seedMembership(db, ws.id, admin.id, 'admin');

    const r = await service.inviteMember(
      { email: 'newbie@audit.com', role: 'member' },
      { userId: admin.id, workspaceId: ws.id },
    );
    expect(r.ok).toBe(true);

    const rows = await rowsFor('workspace.member_invite');
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ actorUserId: admin.id, actorWorkspaceId: ws.id });
    expect(rows[0]!.metadata).toMatchObject({ email: 'newbie@audit.com', role: 'member' });
  });

  it('acceptInvite 성공 시 workspace.invite_accept 감사 행을 남긴다', async () => {
    const admin = await seedUser(db, { email: 'admin@audit.com' });
    const ws = await seedBuyerWorkspace(db);
    await seedMembership(db, ws.id, admin.id, 'admin');
    const invited = await seedUser(db, { email: 'joiner@audit.com' });
    const { generateToken, hashToken } = await import('@/lib/server/token');
    const rawToken = generateToken();
    await db.insert(workspaceInvitations).values({
      workspaceId: ws.id,
      invitedEmail: 'joiner@audit.com',
      invitedByUserId: admin.id,
      role: 'member',
      tokenHash: hashToken(rawToken),
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      status: 'pending',
    });

    const r = await service.acceptInvite(rawToken, {
      userId: invited.id,
      userEmail: 'joiner@audit.com',
      workspaceId: '',
    });
    expect(r.ok).toBe(true);

    const rows = await rowsFor('workspace.invite_accept');
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ actorUserId: invited.id, actorWorkspaceId: ws.id });
  });

  it('changeMemberRole 성공 시 workspace.member_role_change 감사 행을 남긴다', async () => {
    const admin = await seedUser(db, { email: 'admin@audit.com' });
    const member = await seedUser(db, { email: 'member@audit.com' });
    const ws = await seedBuyerWorkspace(db);
    await seedMembership(db, ws.id, admin.id, 'admin');
    await seedMembership(db, ws.id, member.id, 'member');

    const r = await service.changeMemberRole(
      { targetUserId: member.id, role: 'admin' },
      { userId: admin.id, workspaceId: ws.id },
    );
    expect(r.ok).toBe(true);

    const rows = await rowsFor('workspace.member_role_change');
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ actorUserId: admin.id, actorWorkspaceId: ws.id });
    expect(rows[0]!.metadata).toMatchObject({ targetUserId: member.id, role: 'admin' });
  });

  it('removeMember 성공 시 workspace.member_remove 감사 행을 남긴다', async () => {
    const admin = await seedUser(db, { email: 'admin@audit.com' });
    const member = await seedUser(db, { email: 'member@audit.com' });
    const ws = await seedBuyerWorkspace(db);
    await seedMembership(db, ws.id, admin.id, 'admin');
    await seedMembership(db, ws.id, member.id, 'member');

    const r = await service.removeMember(
      { targetUserId: member.id },
      { userId: admin.id, workspaceId: ws.id },
    );
    expect(r.ok).toBe(true);

    const rows = await rowsFor('workspace.member_remove');
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ actorUserId: admin.id, actorWorkspaceId: ws.id });
    expect(rows[0]!.metadata).toMatchObject({ targetUserId: member.id });
  });
});
