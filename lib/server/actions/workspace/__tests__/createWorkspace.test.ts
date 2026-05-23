// createWorkspaceInTx (shared with signup) + createWorkspaceAction (in-app,
// logged-in user). Both create a workspace, make the user an admin member, and
// set users.lastActiveWorkspaceId so the new ws is the active one.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { and, eq } from 'drizzle-orm';

import { createPgliteDb, type PgliteDB } from '@/lib/db/client-pglite';
import { __setActionDbForTest } from '@/lib/server/actions/auth/_shared';
import { seedUser } from '@/lib/server/repositories/drizzle/__tests__/_seed';
import { users, workspaces, workspaceMembers, bizProfiles, columns } from '@/lib/db/schema';

const sessionRef: { value: { user: { id: string } } | null } = { value: null };
vi.mock('@/lib/auth/session', () => ({
  requireSession: () =>
    sessionRef.value
      ? Promise.resolve(sessionRef.value)
      : Promise.reject(new Error('UNAUTHENTICATED')),
}));

import { createWorkspaceInTx } from '../_createWorkspace';
import { createWorkspaceAction } from '../createWorkspaceAction';

let db: PgliteDB;
beforeEach(async () => {
  db = await createPgliteDb();
  __setActionDbForTest(db);
  sessionRef.value = null;
});
afterEach(() => {
  __setActionDbForTest(undefined);
});

describe('createWorkspaceInTx', () => {
  it('pg: creates workspace + admin membership + sets lastActiveWorkspaceId', async () => {
    const u = await seedUser(db);
    const { workspaceId } = await createWorkspaceInTx(db, {
      userId: u.id,
      type: 'pg',
      name: 'NewPG',
    });

    const [ws] = await db.select().from(workspaces).where(eq(workspaces.id, workspaceId));
    expect(ws).toMatchObject({ type: 'pg', name: 'NewPG' });

    const [m] = await db
      .select()
      .from(workspaceMembers)
      .where(
        and(
          eq(workspaceMembers.workspaceId, workspaceId),
          eq(workspaceMembers.userId, u.id),
        ),
      );
    expect(m.role).toBe('admin');

    const [usr] = await db.select().from(users).where(eq(users.id, u.id));
    expect(usr.lastActiveWorkspaceId).toBe(workspaceId);
  });

  it('buyer with bizProfile: creates and links the biz profile', async () => {
    const u = await seedUser(db);
    const { workspaceId } = await createWorkspaceInTx(db, {
      userId: u.id,
      type: 'buyer',
      name: 'BuyerCo',
      bizProfile: {
        bizNo: '1112223334',
        taxType: 'general',
        status: 'active',
        grade: 'general',
        gradeSource: 'user_confirmed',
      },
    });

    const [ws] = await db.select().from(workspaces).where(eq(workspaces.id, workspaceId));
    expect(ws.type).toBe('buyer');
    expect(ws.bizProfileId).toBeTruthy();
    const [biz] = await db
      .select()
      .from(bizProfiles)
      .where(eq(bizProfiles.id, ws.bizProfileId as string));
    expect(biz.bizNo).toBe('1112223334');
  });

  it('seeds default kanban columns: buyer gets pipeline + rfp_bids boards', async () => {
    const u = await seedUser(db);
    const { workspaceId } = await createWorkspaceInTx(db, {
      userId: u.id,
      type: 'buyer',
      name: 'BuyerCo',
      bizProfile: {
        bizNo: '2223334445',
        taxType: 'general',
        status: 'active',
        grade: 'general',
        gradeSource: 'user_confirmed',
      },
    });

    const cols = await db.select().from(columns).where(eq(columns.workspaceId, workspaceId));
    expect(cols.filter((c) => c.kind === 'pipeline')).toHaveLength(6);
    expect(cols.filter((c) => c.kind === 'rfp_bids')).toHaveLength(3);
  });

  it('seeds default kanban columns: pg gets only the pipeline board', async () => {
    const u = await seedUser(db);
    const { workspaceId } = await createWorkspaceInTx(db, {
      userId: u.id,
      type: 'pg',
      name: 'NewPG',
    });

    const cols = await db.select().from(columns).where(eq(columns.workspaceId, workspaceId));
    expect(cols.filter((c) => c.kind === 'pipeline')).toHaveLength(6);
    expect(cols.filter((c) => c.kind === 'rfp_bids')).toHaveLength(0);
  });
});

describe('createWorkspaceAction', () => {
  it('logged-in user: creates a workspace with the user as admin', async () => {
    const u = await seedUser(db);
    sessionRef.value = { user: { id: u.id } };

    const r = await createWorkspaceAction({ type: 'pg', name: 'MyPG' });

    expect(r.ok).toBe(true);
    if (r.ok) {
      const [m] = await db
        .select()
        .from(workspaceMembers)
        .where(eq(workspaceMembers.workspaceId, r.workspaceId));
      expect(m).toMatchObject({ userId: u.id, role: 'admin' });
    }
  });

  it('unauthenticated → UNAUTHENTICATED', async () => {
    sessionRef.value = null;
    const r = await createWorkspaceAction({ type: 'pg', name: 'X' });
    expect(r).toEqual({ ok: false, error: 'UNAUTHENTICATED' });
  });

  it('empty name → INVALID_INPUT', async () => {
    const u = await seedUser(db);
    sessionRef.value = { user: { id: u.id } };
    const r = await createWorkspaceAction({ type: 'pg', name: '' });
    expect(r).toEqual({ ok: false, error: 'INVALID_INPUT' });
  });
});
