/**
 * @vitest-environment node
 */
// GET /api/notifications — workspace-scoped history endpoint.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { randomUUID } from 'node:crypto';

import { notifications as notifTable } from '@/lib/db/schema';
import { createPgliteDb, type PgliteDB } from '@/lib/db/client-pglite';
import {
  __resetForTest,
  __useDrizzleWithDbForTest,
} from '@/lib/server/repositories/factory';
import {
  seedBuyerWorkspace,
  seedMembership,
  seedUser,
} from '@/lib/server/repositories/drizzle/__tests__/_seed';

const sessionRef: { value: unknown | null } = { value: null };
vi.mock('@/auth', () => ({
  auth: () => Promise.resolve(sessionRef.value),
}));
// 폐기 세션(sv stale) 차단용 — requireSession 미사용 라우트도 동일 기준 적용.
const getDbSessionVersionMock = vi.hoisted(() => vi.fn());
const getDbEmailVerifiedMock = vi.hoisted(() => vi.fn());
vi.mock('@/lib/auth/session-version-db', () => ({
  getDbSessionVersion: (...a: unknown[]) => getDbSessionVersionMock(...a),
  getDbEmailVerified: (...a: unknown[]) => getDbEmailVerifiedMock(...a),
}));


let db: PgliteDB;

beforeEach(async () => {
  __resetForTest();
  db = await createPgliteDb();
  await __useDrizzleWithDbForTest(db);
  sessionRef.value = null;
  getDbSessionVersionMock.mockReset();
  getDbSessionVersionMock.mockResolvedValue(1);
  getDbEmailVerifiedMock.mockReset();
  getDbEmailVerifiedMock.mockResolvedValue(true);
});

afterEach(() => {
  __resetForTest();
});

async function callGet() {
  const { GET } = await import('../route');
  return GET();
}

async function seedNotif(userId: string, workspaceId: string) {
  await db.insert(notifTable).values({
    id: randomUUID(),
    userId,
    workspaceId,
    type: 'TEST',
    title: 't',
    body: '',
    channel: 'in_app',
    status: 'sent',
  });
}

describe('GET /api/notifications', () => {
  it('401 when unauthenticated', async () => {
    const r = await callGet();
    expect(r.status).toBe(401);
  });

  it('403 when session has no workspaceId', async () => {
    const u = await seedUser(db, { email: 'u@x.com' });
    sessionRef.value = { user: { id: u.id, email: u.email } };
    const r = await callGet();
    expect(r.status).toBe(403);
  });

  it('returns only notifications for the active workspace', async () => {
    const u = await seedUser(db, { email: 'u@x.com' });
    const wsA = await seedBuyerWorkspace(db, { name: 'A' });
    const wsB = await seedBuyerWorkspace(db, { name: 'B' });
    await seedMembership(db, wsA.id, u.id);
    await seedMembership(db, wsB.id, u.id);

    await seedNotif(u.id, wsA.id);
    await seedNotif(u.id, wsA.id);
    await seedNotif(u.id, wsB.id);

    sessionRef.value = { user: { id: u.id, email: u.email, workspaceId: wsA.id } };
    const r = await callGet();
    expect(r.status).toBe(200);

    const body = await r.json();
    expect(body.notifications).toHaveLength(2);
    expect(body.notifications.every((n: { workspaceId: string }) => n.workspaceId === wsA.id)).toBe(true);
  });
});

describe('GET /api/notifications — 미인증 이메일', () => {
  it('403 when email not verified', async () => {
    sessionRef.value = { user: { id: 'u-1', workspaceId: 'ws-1', sessionVersion: 1 } };
    getDbEmailVerifiedMock.mockResolvedValue(false);
    const { GET } = await import('../route');
    const r = await GET();
    expect(r.status).toBe(403);
  });
});

describe('GET /api/notifications — 폐기 세션', () => {
  it('sv 가 stale 한(폐기된) 세션은 401', async () => {
    sessionRef.value = { user: { id: '00000000-0000-4000-8000-0000000000aa', email: 'x@x.com', sessionVersion: 1, workspaceId: '00000000-0000-4000-8000-0000000000cc' } };
    getDbSessionVersionMock.mockResolvedValue(2);
    const r = await callGet();
    expect(r.status).toBe(401);
  });
});
