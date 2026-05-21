// regenerateWorkspaceShareTokenAction tests.
//
// Admin-only revocation valve for the never-expiring workspace share link.
// Coverage:
//   - FORBIDDEN_NOT_ADMIN for a non-admin session
//   - admin success rotates share_token + returns the fresh share URL
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { eq } from 'drizzle-orm';

import { createPgliteDb, type PgliteDB } from '@/lib/db/client-pglite';
import {
  __resetForTest,
  __useDrizzleWithDbForTest,
} from '@/lib/server/repositories/factory';
import { __setActionDbForTest } from '@/lib/server/actions/auth/_shared';
import { seedPgWorkspace } from '@/lib/server/repositories/drizzle/__tests__/_seed';
import { workspaces } from '@/lib/db/schema';

type SessionUser = {
  id: string;
  workspaceId?: string;
  role?: 'admin' | 'member';
};
const sessionRef: { value: { user: SessionUser } | null } = { value: null };
vi.mock('@/lib/auth/session', () => ({
  requireSession: () =>
    sessionRef.value
      ? Promise.resolve(sessionRef.value)
      : Promise.reject(new Error('UNAUTHENTICATED')),
}));

const revalidatePath = vi.fn();
vi.mock('next/cache', () => ({
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  revalidatePath: (...args: any[]) => revalidatePath(...args),
}));

import { regenerateWorkspaceShareTokenAction } from '../regenerateWorkspaceShareTokenAction';

let db: PgliteDB;

beforeEach(async () => {
  __resetForTest();
  db = await createPgliteDb();
  await __useDrizzleWithDbForTest(db);
  __setActionDbForTest(db);
  revalidatePath.mockClear();
  sessionRef.value = null;
});

afterEach(() => {
  __setActionDbForTest(undefined);
  __resetForTest();
});

async function tokenOf(wsId: string): Promise<string> {
  const [row] = await db
    .select({ t: workspaces.shareToken })
    .from(workspaces)
    .where(eq(workspaces.id, wsId));
  return row.t;
}

describe('regenerateWorkspaceShareTokenAction', () => {
  it('rejects non-admin sessions', async () => {
    const ws = await seedPgWorkspace(db, 'PG');
    sessionRef.value = { user: { id: 'u1', workspaceId: ws.id, role: 'member' } };
    const r = await regenerateWorkspaceShareTokenAction();
    expect(r).toEqual({ ok: false, error: 'FORBIDDEN_NOT_ADMIN' });
  });

  it('admin: rotates the token and returns the fresh share URL', async () => {
    const ws = await seedPgWorkspace(db, 'PG');
    const before = await tokenOf(ws.id);
    sessionRef.value = { user: { id: 'u1', workspaceId: ws.id, role: 'admin' } };

    const r = await regenerateWorkspaceShareTokenAction();

    expect(r.ok).toBe(true);
    const after = await tokenOf(ws.id);
    expect(after).not.toBe(before);
    if (r.ok) expect(r.shareUrl).toBe(`http://localhost:3000/share/workspace/${after}`);
    expect(revalidatePath).toHaveBeenCalledWith('/settings/members');
  });
});
