// acceptWorkspaceInviteAction tests.
//
// Coverage:
//   - UNAUTHENTICATED when no session
//   - INVITE_INVALID for unknown token
//   - INVITE_EXPIRED for expired or already-accepted invitation
//   - INVITE_EMAIL_MISMATCH when user email differs from invited email
//   - success: workspace_members row inserted, invitation marked accepted
//   - case-insensitive email matching
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { and, eq } from 'drizzle-orm';

import { createPgliteDb, type PgliteDB } from '@/lib/db/client-pglite';
import {
  __resetForTest,
  __useDrizzleWithDbForTest,
} from '@/lib/server/repositories/factory';
import { __setActionDbForTest } from '@/lib/server/actions/auth/_shared';
import {
  seedPgWorkspace,
  seedUser,
} from '@/lib/server/repositories/drizzle/__tests__/_seed';
import { workspaceInvitations, workspaceMembers } from '@/lib/db/schema';
import { generateToken, hashToken } from '@/lib/server/token';

const sessionRef: {
  value: { user: { id: string; email: string } } | null;
} = { value: null };
vi.mock('@/lib/auth/session', () => ({
  requireSession: () =>
    sessionRef.value
      ? Promise.resolve(sessionRef.value)
      : Promise.reject(new Error('UNAUTHENTICATED')),
}));

import { acceptWorkspaceInviteAction } from '../acceptWorkspaceInviteAction';

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

async function seedInvitation(
  opts: {
    workspaceId: string;
    invitedByUserId: string;
    invitedEmail?: string;
    status?: 'pending' | 'accepted' | 'expired';
    expiresAt?: Date;
  },
): Promise<{ rawToken: string }> {
  const rawToken = generateToken();
  const tokenHash = hashToken(rawToken);
  await db.insert(workspaceInvitations).values({
    workspaceId: opts.workspaceId,
    invitedEmail: opts.invitedEmail ?? 'invited@example.com',
    invitedByUserId: opts.invitedByUserId,
    tokenHash,
    status: opts.status ?? 'pending',
    expiresAt: opts.expiresAt ?? new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
  });
  return { rawToken };
}

describe('acceptWorkspaceInviteAction', () => {
  it('returns UNAUTHENTICATED when there is no session', async () => {
    const r = await acceptWorkspaceInviteAction('whatever');
    expect(r).toEqual({ ok: false, error: 'UNAUTHENTICATED' });
  });

  it('returns INVITE_INVALID for an unknown token', async () => {
    const u = await seedUser(db, { email: 'user@example.com' });
    sessionRef.value = { user: { id: u.id, email: u.email } };

    const r = await acceptWorkspaceInviteAction(generateToken());
    expect(r).toEqual({ ok: false, error: 'INVITE_INVALID' });
  });

  it('returns INVITE_EXPIRED when the invitation is already past its expiry', async () => {
    const ws = await seedPgWorkspace(db, 'WS');
    const admin = await seedUser(db, { email: 'admin@example.com' });
    const u = await seedUser(db, { email: 'invited@example.com' });
    sessionRef.value = { user: { id: u.id, email: u.email } };

    const { rawToken } = await seedInvitation({
      workspaceId: ws.id,
      invitedByUserId: admin.id,
      invitedEmail: 'invited@example.com',
      expiresAt: new Date(Date.now() - 1000),
    });
    const r = await acceptWorkspaceInviteAction(rawToken);
    expect(r).toEqual({ ok: false, error: 'INVITE_EXPIRED' });
  });

  it('returns INVITE_EXPIRED for an already-accepted invitation', async () => {
    const ws = await seedPgWorkspace(db, 'WS');
    const admin = await seedUser(db, { email: 'admin@example.com' });
    const u = await seedUser(db, { email: 'invited@example.com' });
    sessionRef.value = { user: { id: u.id, email: u.email } };

    const { rawToken } = await seedInvitation({
      workspaceId: ws.id,
      invitedByUserId: admin.id,
      invitedEmail: 'invited@example.com',
      status: 'accepted',
    });
    const r = await acceptWorkspaceInviteAction(rawToken);
    expect(r).toEqual({ ok: false, error: 'INVITE_EXPIRED' });
  });

  it('returns INVITE_EMAIL_MISMATCH when user email differs from invited email', async () => {
    const ws = await seedPgWorkspace(db, 'WS');
    const admin = await seedUser(db, { email: 'admin@example.com' });
    const u = await seedUser(db, { email: 'wrong@example.com' });
    sessionRef.value = { user: { id: u.id, email: u.email } };

    const { rawToken } = await seedInvitation({
      workspaceId: ws.id,
      invitedByUserId: admin.id,
      invitedEmail: 'invited@example.com',
    });
    const r = await acceptWorkspaceInviteAction(rawToken);
    expect(r).toEqual({ ok: false, error: 'INVITE_EMAIL_MISMATCH' });
  });

  it('inserts membership + marks invitation accepted on success', async () => {
    const ws = await seedPgWorkspace(db, 'WS');
    const admin = await seedUser(db, { email: 'admin@example.com' });
    const u = await seedUser(db, { email: 'invited@example.com' });
    sessionRef.value = { user: { id: u.id, email: u.email } };

    const { rawToken } = await seedInvitation({
      workspaceId: ws.id,
      invitedByUserId: admin.id,
      invitedEmail: 'invited@example.com',
    });
    const r = await acceptWorkspaceInviteAction(rawToken);

    expect(r).toEqual({ ok: true, workspaceId: ws.id });

    const members = await db
      .select()
      .from(workspaceMembers)
      .where(
        and(
          eq(workspaceMembers.workspaceId, ws.id),
          eq(workspaceMembers.userId, u.id),
        ),
      );
    expect(members).toHaveLength(1);
    expect(members[0].role).toBe('member');

    const [inv] = await db
      .select()
      .from(workspaceInvitations)
      .where(eq(workspaceInvitations.workspaceId, ws.id));
    expect(inv.status).toBe('accepted');
    expect(inv.acceptedByUserId).toBe(u.id);
  });

  it('accepts when invited email and user email differ only by case', async () => {
    const ws = await seedPgWorkspace(db, 'WS');
    const admin = await seedUser(db, { email: 'admin@example.com' });
    const u = await seedUser(db, { email: 'Invited@Example.com' });
    sessionRef.value = { user: { id: u.id, email: u.email } };

    const { rawToken } = await seedInvitation({
      workspaceId: ws.id,
      invitedByUserId: admin.id,
      invitedEmail: 'invited@example.com',
    });
    const r = await acceptWorkspaceInviteAction(rawToken);
    expect(r).toEqual({ ok: true, workspaceId: ws.id });
  });
});
