// inviteWorkspaceMemberAction tests.
//
// Coverage:
//   - UNAUTHENTICATED when no session
//   - FORBIDDEN_NOT_ADMIN when caller is not an admin
//   - INVALID_INPUT for malformed email
//   - ALREADY_INVITED for a duplicate pending invitation
//   - success: workspace_invitations row inserted, outbox entry enqueued
//   - allows re-inviting the same email after their invitation was accepted
//     (requires partial unique index — RED until Bug 3 is fixed)
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { eq } from 'drizzle-orm';

import { createPgliteDb, type PgliteDB } from '@/lib/db/client-pglite';
import {
  __resetForTest,
  __useDrizzleWithDbForTest,
} from '@/lib/server/repositories/factory';
import { __setActionDbForTest } from '@/lib/server/actions/auth/_shared';
import {
  seedPgWorkspace,
  seedUser,
  seedMembership,
} from '@/lib/server/repositories/drizzle/__tests__/_seed';
import { workspaceInvitations, outboxEntries } from '@/lib/db/schema';
import { generateToken, hashToken } from '@/lib/server/token';

vi.mock('@/lib/server/outbox/templates/workspaceInvited', () => ({
  renderWorkspaceInvited: async () => '<p>invited</p>',
}));

const sessionRef: {
  value: {
    user: { id: string; workspaceId: string | null; role: string | null };
  } | null;
} = { value: null };
vi.mock('@/lib/auth/session', () => ({
  requireSession: () =>
    sessionRef.value
      ? Promise.resolve(sessionRef.value)
      : Promise.reject(new Error('UNAUTHENTICATED')),
}));

import { inviteWorkspaceMemberAction } from '../inviteWorkspaceMemberAction';

let db: PgliteDB;

beforeEach(async () => {
  __resetForTest();
  db = await createPgliteDb();
  await __useDrizzleWithDbForTest(db);
  __setActionDbForTest(db);
  sessionRef.value = null;
});

afterEach(() => {
  __setActionDbForTest(undefined);
  __resetForTest();
});

async function makeAdminSession(
  workspaceId: string,
): Promise<{ id: string; email: string }> {
  const admin = await seedUser(db, { email: 'admin@example.com' });
  await seedMembership(db, workspaceId, admin.id, 'admin');
  sessionRef.value = {
    user: { id: admin.id, workspaceId, role: 'admin' },
  };
  return admin;
}

describe('inviteWorkspaceMemberAction', () => {
  it('returns UNAUTHENTICATED when there is no session', async () => {
    const r = await inviteWorkspaceMemberAction({ email: 'user@example.com' });
    expect(r).toEqual({ ok: false, error: 'UNAUTHENTICATED' });
  });

  it('returns FORBIDDEN_NOT_ADMIN when the caller is not an admin', async () => {
    const ws = await seedPgWorkspace(db, 'WS');
    const u = await seedUser(db, { email: 'member@example.com' });
    await seedMembership(db, ws.id, u.id, 'member');
    sessionRef.value = { user: { id: u.id, workspaceId: ws.id, role: 'member' } };

    const r = await inviteWorkspaceMemberAction({ email: 'target@example.com' });
    expect(r).toEqual({ ok: false, error: 'FORBIDDEN_NOT_ADMIN' });
  });

  it('returns INVALID_INPUT for a malformed email', async () => {
    const ws = await seedPgWorkspace(db, 'WS');
    await makeAdminSession(ws.id);

    const r = await inviteWorkspaceMemberAction({ email: 'not-an-email' });
    expect(r).toEqual({ ok: false, error: 'INVALID_INPUT' });
  });

  it('returns ALREADY_INVITED when a pending invitation exists for the same email', async () => {
    const ws = await seedPgWorkspace(db, 'WS');
    const admin = await makeAdminSession(ws.id);

    await db.insert(workspaceInvitations).values({
      workspaceId: ws.id,
      invitedEmail: 'target@example.com',
      invitedByUserId: admin.id,
      tokenHash: hashToken(generateToken()),
      status: 'pending',
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    });

    const r = await inviteWorkspaceMemberAction({ email: 'target@example.com' });
    expect(r).toEqual({ ok: false, error: 'ALREADY_INVITED' });
  });

  it('inserts an invitation row and enqueues an outbox email on success', async () => {
    const ws = await seedPgWorkspace(db, 'WS');
    await makeAdminSession(ws.id);

    const r = await inviteWorkspaceMemberAction({ email: 'newmember@example.com' });
    expect(r).toEqual({ ok: true });

    const invites = await db
      .select()
      .from(workspaceInvitations)
      .where(eq(workspaceInvitations.workspaceId, ws.id));
    expect(invites).toHaveLength(1);
    expect(invites[0].invitedEmail).toBe('newmember@example.com');
    expect(invites[0].status).toBe('pending');
    expect(invites[0].tokenHash).toBeTruthy();

    const outbox = await db.select().from(outboxEntries);
    expect(outbox).toHaveLength(1);
    expect(outbox[0].toAddr).toBe('newmember@example.com');
    expect(outbox[0].event).toBe('workspace.invited');
  });

  it('allows re-inviting the same email after their previous invitation was accepted', async () => {
    const ws = await seedPgWorkspace(db, 'WS');
    const admin = await makeAdminSession(ws.id);

    // Seed an already-accepted invitation for the same email
    await db.insert(workspaceInvitations).values({
      workspaceId: ws.id,
      invitedEmail: 'returning@example.com',
      invitedByUserId: admin.id,
      tokenHash: hashToken(generateToken()),
      status: 'accepted',
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    });

    // Re-inviting should succeed (partial unique index: only pending rows constrained)
    const r = await inviteWorkspaceMemberAction({ email: 'returning@example.com' });
    expect(r).toEqual({ ok: true });
  });

  it('allows re-inviting the same email after their previous invitation expired', async () => {
    const ws = await seedPgWorkspace(db, 'WS');
    const admin = await makeAdminSession(ws.id);

    // Seed an expired invitation
    await db.insert(workspaceInvitations).values({
      workspaceId: ws.id,
      invitedEmail: 'lapsed@example.com',
      invitedByUserId: admin.id,
      tokenHash: hashToken(generateToken()),
      status: 'expired',
      expiresAt: new Date(Date.now() - 1000),
    });

    const r = await inviteWorkspaceMemberAction({ email: 'lapsed@example.com' });
    expect(r).toEqual({ ok: true });
  });
});
