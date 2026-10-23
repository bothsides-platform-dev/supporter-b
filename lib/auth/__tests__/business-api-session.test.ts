import { randomUUID } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { eq } from 'drizzle-orm';
import type { Session } from 'next-auth';
import type { PgliteDB } from '@/lib/db/client-pglite';
import { users, workspaceMembers, workspaces } from '@/lib/db/schema';
import { setupServerTestEnv, teardownServerTestEnv } from '@/lib/server/__tests__/_harness';
import { seedMembership, seedPgWorkspace, seedUser } from '@/lib/server/repositories/drizzle/__tests__/_seed';
import { __resetBusForTest, listenerCount } from '@/lib/server/notifications/bus';
import { __resetStorageForTest, __setStorageForTest } from '@/lib/server/storage';
import { InMemoryStorage } from '@/lib/server/storage/memory';
import { checkBusinessApiSession, checkBusinessWorkspace } from '@/lib/server/http/business-api-session';

const authMock = vi.hoisted(() => vi.fn());
const issueToken = vi.hoisted(() => vi.fn().mockResolvedValue('test-token'));
vi.mock('@/auth', () => ({ auth: authMock }));
vi.mock('@/lib/server/realtime/token', () => ({ issueCentrifugoConnectionToken: issueToken }));

let db: PgliteDB;
let session: Session;
let storage: InMemoryStorage;

beforeEach(async () => {
  db = await setupServerTestEnv();
  const user = await seedUser(db);
  const workspace = await seedPgWorkspace(db, 'PG');
  await db.update(users).set({ emailVerified: true }).where(eq(users.id, user.id));
  await seedMembership(db, workspace.id, user.id, 'admin');
  session = { expires: '2099-01-01', user: {
    id: user.id, email: user.email, sessionVersion: 1,
    workspaceId: workspace.id, workspaceType: 'pg', role: 'admin',
  } };
  authMock.mockResolvedValue(session);
  issueToken.mockClear();
  storage = new InMemoryStorage();
  __setStorageForTest(storage);
});

afterEach(() => {
  __resetBusForTest();
  __resetStorageForTest();
  teardownServerTestEnv();
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

const routes = [
  ['files/presign', 'POST', 'json'],
  ['files/[id]/complete', 'POST', 'json'],
  ['files/[id]', 'GET', 'text-upper'],
  ['files/[id]', 'DELETE', 'text-upper'],
  ['contract-archives/presign', 'POST', 'json'],
  ['contract-archives/[id]/complete', 'POST', 'json'],
  ['contract-archives/[id]/download', 'GET', 'html'],
  ['notifications', 'GET', 'text'],
  ['notifications/stream', 'GET', 'text'],
  ['workspaces/search', 'GET', 'json'],
  ['centrifugo/connection-token', 'POST', 'text'],
] as const;

async function callRoute(route: string, method: string) {
  const handlers = await import(/* @vite-ignore */ `../../../app/api/${route}/route.ts`);
  const controller = new AbortController();
  const response: Response = await handlers[method](new NextRequest('http://localhost/api/test?type=pg', {
    method, signal: controller.signal,
    ...(method === 'POST' ? { body: JSON.stringify({
      ownerKind: 'chat', ownerId: '__draft__', name: 'test.pdf', size: 5, mime: 'application/pdf',
    }), headers: { 'Content-Type': 'application/json' } } : {}),
  }), { params: Promise.resolve({ id: randomUUID() }) });
  const subscribers = listenerCount(session.user.id!);
  controller.abort();
  return { response, subscribers };
}

describe('business HTTP API PG approval boundary', () => {
  // Removing a route gate must expose a non-403 response (or a side effect).
  it.each(routes)('%s %s rejects pending, rejected and absent membership before work', async (route, method, format) => {
    const head = vi.spyOn(storage, 'head');
    const presign = vi.spyOn(storage, 'presignPut');
    const remove = vi.spyOn(storage, 'delete');
    for (const approval of ['pending_approval', 'rejected', null] as const) {
      if (approval) {
        await db.update(workspaceMembers).set({ approvalStatus: approval });
      } else {
        await db.delete(workspaceMembers);
      }
      const { response, subscribers } = await callRoute(route, method);
      const retired=route==='contract-archives/presign'||route==='contract-archives/[id]/complete';
      expect(response.status, `${route}: ${approval}`).toBe(retired?404:403);
      if(retired)continue;
      expect(subscribers).toBe(0);
      if (format === 'json') expect(await response.json()).toMatchObject({ error: 'FORBIDDEN' });
      if (format === 'text-upper') expect(await response.text()).toBe('FORBIDDEN');
      if (format === 'text') expect(await response.text()).toBe('Forbidden');
      if (format === 'html') expect(response.headers.get('Content-Type')).toContain('text/html');
    }
    expect(head).not.toHaveBeenCalled();
    expect(presign).not.toHaveBeenCalled();
    expect(remove).not.toHaveBeenCalled();
    expect(issueToken).not.toHaveBeenCalled();
  });

  it('rechecks approval and workspace status while the connection account cache is warm', async () => {
    expect((await callRoute('centrifugo/connection-token', 'POST')).response.status).toBe(200);
    await db.update(workspaceMembers).set({ approvalStatus: 'pending_approval' });
    expect((await callRoute('centrifugo/connection-token', 'POST')).response.status).toBe(403);
    await db.update(workspaceMembers).set({ approvalStatus: 'approved' });
    expect((await callRoute('centrifugo/connection-token', 'POST')).response.status).toBe(200);
    await db.update(workspaces).set({ status: 'suspended' });
    expect((await callRoute('centrifugo/connection-token', 'POST')).response.status).toBe(403);
    expect(issueToken).toHaveBeenCalledTimes(2);
  });

  it('allows an approved PG to read notifications and subscribe', async () => {
    expect((await callRoute('notifications', 'GET')).response.status).toBe(200);
    const { response, subscribers } = await callRoute('notifications/stream', 'GET');
    expect(response.status).toBe(200);
    expect(subscribers).toBe(1);
    expect(listenerCount(session.user.id!)).toBe(0);
  });
});

describe('common business session result', () => {
  it('keeps the authenticated session on success', async () => {
    const result = await checkBusinessApiSession(session);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.session).toBe(session);
  });

  it('rejects absent, revoked and deleted accounts with 401', async () => {
    expect(await checkBusinessApiSession(null)).toEqual({ ok: false, status: 401 });
    session.user.sessionVersion = 0;
    expect(await checkBusinessApiSession(session)).toEqual({ ok: false, status: 401 });
    session.user.sessionVersion = 1;
    await db.delete(workspaceMembers);
    await db.delete(users);
    expect(await checkBusinessApiSession(session)).toEqual({ ok: false, status: 401 });
  });

  it('rejects unverified email with 403 using the live database value', async () => {
    await db.update(users).set({ emailVerified: false });
    expect(await checkBusinessApiSession(session)).toEqual({ ok: false, status: 403 });
    await db.update(users).set({ emailVerified: true });
    expect((await checkBusinessApiSession(session)).ok).toBe(true);
  });

  it.each(['pending', 'suspended'] as const)('rejects %s workspace even for operators', async (status) => {
    vi.stubEnv('MASTER_ACCOUNT_EMAILS', session.user.email!);
    session.user.authProvider = 'google';
    await db.delete(workspaceMembers);
    await db.update(workspaces).set({ status });
    expect(await checkBusinessWorkspace(session)).toEqual({ ok: false, status: 403 });
  });

  it('rejects missing workspace and missing workspace selection', async () => {
    session.user.workspaceId = randomUUID();
    expect(await checkBusinessWorkspace(session)).toEqual({ ok: false, status: 403 });
    session.user.workspaceId = undefined;
    expect(await checkBusinessWorkspace(session)).toEqual({ ok: false, status: 403 });
    expect(await checkBusinessWorkspace(null)).toEqual({ ok: false, status: 401 });
  });

  it('allows the existing buyer and server-allowlisted operator paths', async () => {
    await db.delete(workspaceMembers);
    vi.stubEnv('MASTER_ACCOUNT_EMAILS', session.user.email!);
    session.user.authProvider = 'google';
    expect((await checkBusinessApiSession(session)).ok).toBe(true);
    vi.stubEnv('MASTER_ACCOUNT_EMAILS', 'someone-else@example.com');
    session.user.isMaster = true;
    expect(await checkBusinessApiSession(session)).toEqual({ ok: false, status: 403 });
    session.user.workspaceType = 'buyer';
    await db.update(workspaces).set({ type: 'buyer' });
    expect((await checkBusinessApiSession(session)).ok).toBe(true);
  });
});
