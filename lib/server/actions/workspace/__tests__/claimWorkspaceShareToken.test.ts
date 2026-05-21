// claimWorkspaceShareTokenAction tests.
//
// Generic workspace share link: any authenticated user presenting a valid raw
// shareToken joins the workspace as a member. Coverage:
//   - UNAUTHENTICATED when no session
//   - SHARE_INVALID for an unknown token
//   - success inserts exactly one workspace_members row + returns workspaceId
//   - idempotent re-claim stays at one membership row
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
import { DrizzleWorkspaceRepository } from '@/lib/server/repositories/drizzle/workspace';
import { workspaceMembers } from '@/lib/db/schema';

const sessionRef: { value: { user: { id: string } } | null } = { value: null };
vi.mock('@/lib/auth/session', () => ({
  requireSession: () =>
    sessionRef.value
      ? Promise.resolve(sessionRef.value)
      : Promise.reject(new Error('UNAUTHENTICATED')),
}));

import { claimWorkspaceShareTokenAction } from '../claimWorkspaceShareTokenAction';

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

async function shareTokenOf(wsId: string): Promise<string> {
  const ws = await new DrizzleWorkspaceRepository(db).findById(wsId);
  return ws!.shareToken;
}

describe('claimWorkspaceShareTokenAction', () => {
  it('returns UNAUTHENTICATED when there is no session', async () => {
    const r = await claimWorkspaceShareTokenAction('whatever');
    expect(r).toEqual({ ok: false, error: 'UNAUTHENTICATED' });
  });

  it('returns SHARE_INVALID for an unknown token', async () => {
    const u = await seedUser(db);
    sessionRef.value = { user: { id: u.id } };
    const r = await claimWorkspaceShareTokenAction('no-such-token');
    expect(r).toEqual({ ok: false, error: 'SHARE_INVALID' });
  });

  it('joins the workspace as a member and returns its id', async () => {
    const ws = await seedPgWorkspace(db, 'PG');
    const u = await seedUser(db);
    sessionRef.value = { user: { id: u.id } };

    const r = await claimWorkspaceShareTokenAction(await shareTokenOf(ws.id));

    expect(r).toEqual({ ok: true, workspaceId: ws.id });
    const rows = await db
      .select()
      .from(workspaceMembers)
      .where(
        and(
          eq(workspaceMembers.workspaceId, ws.id),
          eq(workspaceMembers.userId, u.id),
        ),
      );
    expect(rows).toHaveLength(1);
    expect(rows[0].role).toBe('member');
  });

  it('is idempotent — re-claiming keeps exactly one membership row', async () => {
    const ws = await seedPgWorkspace(db, 'PG');
    const u = await seedUser(db);
    sessionRef.value = { user: { id: u.id } };
    const token = await shareTokenOf(ws.id);

    const r1 = await claimWorkspaceShareTokenAction(token);
    const r2 = await claimWorkspaceShareTokenAction(token);

    expect(r1).toEqual({ ok: true, workspaceId: ws.id });
    expect(r2).toEqual({ ok: true, workspaceId: ws.id });
    const rows = await db
      .select()
      .from(workspaceMembers)
      .where(
        and(
          eq(workspaceMembers.workspaceId, ws.id),
          eq(workspaceMembers.userId, u.id),
        ),
      );
    expect(rows).toHaveLength(1);
  });
});
