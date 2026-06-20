/**
 * @vitest-environment node
 */
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { userAvatarBlobs } from '@/lib/db/schema';
import { createPgliteDb, type PgliteDB } from '@/lib/db/client-pglite';
import {
  __resetForTest,
  __useDrizzleWithDbForTest,
} from '@/lib/server/repositories/factory';
import { seedUser } from '@/lib/server/repositories/drizzle/__tests__/_seed';

const sessionRef: { value: unknown | null } = { value: null };
vi.mock('@/auth', () => ({ auth: () => Promise.resolve(sessionRef.value) }));

let db: PgliteDB;
beforeEach(async () => {
  __resetForTest();
  db = await createPgliteDb();
  sessionRef.value = null;
  await __useDrizzleWithDbForTest(db);
});
afterEach(async () => {
  __resetForTest();
  vi.resetModules();
});

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

async function callGet(id: string) {
  const { GET } = await import('../route');
  return GET(new Request(`http://localhost/api/user/${id}/avatar`), {
    params: Promise.resolve({ id }),
  });
}
function authed() {
  sessionRef.value = { user: { id: 'viewer-1', email: 'v@v.com' } };
}

it('GET 401 when unauthenticated', async () => {
  const { id } = await seedUser(db);
  expect((await callGet(id)).status).toBe(401);
});

it('GET 404 when user has no avatar', async () => {
  const { id } = await seedUser(db);
  authed();
  expect((await callGet(id)).status).toBe(404);
});

it('GET returns bytes + private immutable cache header', async () => {
  const { id } = await seedUser(db);
  await db.insert(userAvatarBlobs).values({ userId: id, bytes: PNG, mime: 'image/png' });
  authed();
  const res = await callGet(id);
  expect(res.status).toBe(200);
  expect(res.headers.get('Content-Type')).toBe('image/png');
  expect(res.headers.get('Cache-Control')).toContain('private');
  expect(res.headers.get('Cache-Control')).toContain('immutable');
  const body = Buffer.from(await res.arrayBuffer());
  expect(body).toEqual(PNG);
});
