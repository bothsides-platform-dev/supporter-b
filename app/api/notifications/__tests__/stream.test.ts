/**
 * @vitest-environment node
 */
// GET /api/notifications/stream — workspace-filtered SSE stream.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { seedBuyerWorkspace, seedUser } from '@/lib/server/repositories/drizzle/__tests__/_seed';
import { createPgliteDb, type PgliteDB } from '@/lib/db/client-pglite';
import {
  __resetForTest,
  __useDrizzleWithDbForTest,
} from '@/lib/server/repositories/factory';
import type { Notification } from '@/lib/types/notification';

const sessionRef: { value: unknown | null } = { value: null };
vi.mock('@/auth', () => ({
  auth: () => Promise.resolve(sessionRef.value),
}));
// 폐기 세션(sv stale) 차단용 — requireSession 미사용 라우트도 동일 기준 적용.
const getDbSessionVersionMock = vi.hoisted(() => vi.fn());
vi.mock('@/lib/auth/session-version-db', () => ({
  getDbSessionVersion: (...a: unknown[]) => getDbSessionVersionMock(...a),
}));


// Capture the subscribe callback so tests can trigger emissions.
type NotifHandler = (n: Notification) => void;
let capturedHandlers: Map<string, NotifHandler[]> = new Map();
let capturedUnsubscribeCalls = 0;

vi.mock('@/lib/server/notifications/bus', () => ({
  subscribe: vi.fn((userId: string, handler: NotifHandler) => {
    const list = capturedHandlers.get(userId) ?? [];
    list.push(handler);
    capturedHandlers.set(userId, list);
    return () => {
      capturedUnsubscribeCalls += 1;
    };
  }),
}));

let db: PgliteDB;

beforeEach(async () => {
  __resetForTest();
  db = await createPgliteDb();
  await __useDrizzleWithDbForTest(db);
  sessionRef.value = null;
  getDbSessionVersionMock.mockReset();
  getDbSessionVersionMock.mockResolvedValue(1);
  capturedHandlers = new Map();
  capturedUnsubscribeCalls = 0;
});

afterEach(() => {
  __resetForTest();
});

function makeAbortableRequest(): { req: Request; abort: () => void } {
  const controller = new AbortController();
  const req = new Request('http://localhost/api/notifications/stream', {
    signal: controller.signal,
  });
  return { req, abort: () => controller.abort() };
}

function buildNotif(userId: string, workspaceId: string): Notification {
  return {
    id: crypto.randomUUID(),
    userId,
    workspaceId,
    type: 'TEST',
    title: 't',
    body: '',
    channel: 'inapp',
    status: 'sent',
    createdAt: new Date().toISOString(),
  };
}

async function readFirstDataEvent(stream: ReadableStream<Uint8Array>): Promise<string | null> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  while (true) {
    const { done, value } = await reader.read();
    if (done) return null;
    const text = decoder.decode(value);
    if (text.startsWith('data:')) return text;
  }
}

describe('GET /api/notifications/stream', () => {
  it('401 when unauthenticated', async () => {
    const { GET } = await import('../stream/route');
    const { req } = makeAbortableRequest();
    const r = await GET(req);
    expect(r.status).toBe(401);
  });

  it('403 when session has no workspaceId', async () => {
    const u = await seedUser(db, { email: 'u@x.com' });
    sessionRef.value = { user: { id: u.id, email: u.email } };
    const { GET } = await import('../stream/route');
    const { req } = makeAbortableRequest();
    const r = await GET(req);
    expect(r.status).toBe(403);
  });

  it('현재 workspaceId 알림 emit → SSE 스트림으로 전달된다', async () => {
    const u = await seedUser(db, { email: 'u@x.com' });
    const ws = await seedBuyerWorkspace(db);
    sessionRef.value = { user: { id: u.id, email: u.email, workspaceId: ws.id } };

    const { GET } = await import('../stream/route');
    const { req } = makeAbortableRequest();
    const r = await GET(req);
    expect(r.status).toBe(200);

    // Emit a notification for the active workspace.
    const notif = buildNotif(u.id, ws.id);
    const handlers = capturedHandlers.get(u.id) ?? [];
    handlers.forEach((h) => h(notif));

    const text = await readFirstDataEvent(r.body!);
    expect(text).toContain(notif.id);
  });

  it('다른 workspaceId 알림 emit → SSE 스트림에 전달되지 않는다', async () => {
    const u = await seedUser(db, { email: 'u@x.com' });
    const wsA = await seedBuyerWorkspace(db, { name: 'A' });
    const wsB = await seedBuyerWorkspace(db, { name: 'B' });
    sessionRef.value = { user: { id: u.id, email: u.email, workspaceId: wsA.id } };

    const { GET } = await import('../stream/route');
    const { req, abort } = makeAbortableRequest();
    const r = await GET(req);
    expect(r.status).toBe(200);

    // Emit a notification for a DIFFERENT workspace.
    const notifB = buildNotif(u.id, wsB.id);
    const handlers = capturedHandlers.get(u.id) ?? [];
    handlers.forEach((h) => h(notifB));

    // Abort to close the stream, then verify no data events were written.
    abort();

    const reader = r.body!.getReader();
    const decoder = new TextDecoder();
    let hasDataEvent = false;
    let done = false;
    while (!done) {
      const result = await reader.read();
      done = result.done;
      if (result.value) {
        const text = decoder.decode(result.value);
        if (text.startsWith('data:')) {
          hasDataEvent = true;
          break;
        }
      }
    }
    expect(hasDataEvent).toBe(false);
  });

  it('abort 시 unsubscribe가 호출된다 (listener leak 방지)', async () => {
    const u = await seedUser(db, { email: 'u@x.com' });
    const ws = await seedBuyerWorkspace(db);
    sessionRef.value = { user: { id: u.id, email: u.email, workspaceId: ws.id } };

    const { GET } = await import('../stream/route');
    const { req, abort } = makeAbortableRequest();
    await GET(req);

    abort();
    // Give the abort event microtask a tick to fire.
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(capturedUnsubscribeCalls).toBeGreaterThan(0);
  });
});

describe('GET /api/notifications/stream — 폐기 세션', () => {
  it('sv 가 stale 한(폐기된) 세션은 401', async () => {
    sessionRef.value = { user: { id: '00000000-0000-4000-8000-0000000000aa', email: 'x@x.com', sessionVersion: 1, workspaceId: '00000000-0000-4000-8000-0000000000cc' } };
    getDbSessionVersionMock.mockResolvedValue(2);
    const { GET } = await import('../stream/route');
    const { req } = makeAbortableRequest();
    const r = await GET(req);
    expect(r.status).toBe(401);
  });
});
