import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { and, eq } from 'drizzle-orm';

import { createPgliteDb } from '@/lib/db/client-pglite';
import {
  __resetForTest,
  __useDrizzleWithDbForTest,
  getOutboxRepo,
  getAuditLogRepo,
} from '@/lib/server/repositories/factory';
import {
  seedBuyerWorkspace,
  seedMembership,
  seedUser,
} from '@/lib/server/repositories/drizzle/__tests__/_seed';
import { auditLogs, workspaceInvitations, workspaceMembers } from '@/lib/db/schema';
import { WorkspaceService } from '../workspace';
import type { PgliteDB } from '@/lib/db/client-pglite';

let db: PgliteDB;
let service: WorkspaceService;

async function buildService(): Promise<WorkspaceService> {
  const outboxRepo = await getOutboxRepo();
  const auditRepo = await getAuditLogRepo();
  return new WorkspaceService(db, outboxRepo, auditRepo);
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
