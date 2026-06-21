/**
 * @vitest-environment node
 */
// POST/DELETE /api/user/avatar — 본인 아바타 업로드/삭제.
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { users, userAvatarBlobs } from '@/lib/db/schema';
import { createPgliteDb, type PgliteDB } from '@/lib/db/client-pglite';
import { eq } from 'drizzle-orm';
import {
  __resetForTest,
  __useDrizzleWithDbForTest,
} from '@/lib/server/repositories/factory';
import { seedUser } from '@/lib/server/repositories/drizzle/__tests__/_seed';

const sessionRef: { value: unknown | null } = { value: null };
vi.mock('@/auth', () => ({ auth: () => Promise.resolve(sessionRef.value) }));
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
  sessionRef.value = null;
  getDbSessionVersionMock.mockReset();
  getDbSessionVersionMock.mockResolvedValue(1);
  getDbEmailVerifiedMock.mockReset();
  getDbEmailVerifiedMock.mockResolvedValue(true);
  await __useDrizzleWithDbForTest(db);
});

afterEach(async () => {
  __resetForTest();
  vi.resetModules();
});

const PNG_HEAD = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const JPEG_HEAD = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x00, 0x00, 0x00]);

function makePng(sizeBytes = 100): Buffer {
  const buf = Buffer.alloc(sizeBytes);
  PNG_HEAD.copy(buf);
  return buf;
}
function makeFile(type: string, body: Buffer): File {
  return new File([new Uint8Array(body)], 'avatar.png', { type });
}
async function callPost(form: FormData) {
  const { POST } = await import('../route');
  return POST(new Request('http://localhost/api/user/avatar', { method: 'POST', body: form }));
}
async function callDelete() {
  const { DELETE } = await import('../route');
  return DELETE();
}
function authed(userId: string) {
  sessionRef.value = { user: { id: userId, email: 'x@x.com', sessionVersion: 1 } };
}

it('POST 401 when unauthenticated', async () => {
  const form = new FormData();
  form.append('file', makeFile('image/png', makePng()));
  expect((await callPost(form)).status).toBe(401);
});

it('POST 403 when email not verified', async () => {
  const { id } = await seedUser(db);
  authed(id);
  getDbEmailVerifiedMock.mockResolvedValue(false);
  const form = new FormData();
  form.append('file', makeFile('image/png', makePng()));
  expect((await callPost(form)).status).toBe(403);
});

it('POST 401 when session version is stale', async () => {
  const { id } = await seedUser(db);
  authed(id);
  getDbSessionVersionMock.mockResolvedValue(2);
  const form = new FormData();
  form.append('file', makeFile('image/png', makePng()));
  expect((await callPost(form)).status).toBe(401);
});

it('POST 400 when no file', async () => {
  const { id } = await seedUser(db);
  authed(id);
  expect((await callPost(new FormData())).status).toBe(400);
});

it('POST 413 when file exceeds 5MB', async () => {
  const { id } = await seedUser(db);
  authed(id);
  const big = Buffer.alloc(5 * 1024 * 1024 + 1);
  PNG_HEAD.copy(big);
  const form = new FormData();
  form.append('file', makeFile('image/png', big));
  expect((await callPost(form)).status).toBe(413);
});

it('POST 415 when mime not allowed', async () => {
  const { id } = await seedUser(db);
  authed(id);
  const form = new FormData();
  form.append('file', makeFile('application/pdf', Buffer.from([0x25, 0x50, 0x44, 0x46])));
  expect((await callPost(form)).status).toBe(415);
});

it('POST 415 when magic bytes mismatch stated mime', async () => {
  const { id } = await seedUser(db);
  authed(id);
  const form = new FormData();
  form.append('file', makeFile('image/png', JPEG_HEAD));
  expect((await callPost(form)).status).toBe(415);
});

it('POST upserts blob and stamps avatar_updated_at', async () => {
  const { id } = await seedUser(db);
  authed(id);
  const form = new FormData();
  form.append('file', makeFile('image/png', makePng()));
  expect((await callPost(form)).status).toBe(200);

  const [blob] = await db.select().from(userAvatarBlobs).where(eq(userAvatarBlobs.userId, id));
  expect(blob?.mime).toBe('image/png');
  const [u] = await db.select({ at: users.avatarUpdatedAt }).from(users).where(eq(users.id, id));
  expect(u.at).not.toBeNull();
});

it('DELETE 401 when unauthenticated', async () => {
  expect((await callDelete()).status).toBe(401);
});

it('DELETE removes blob and clears avatar_updated_at', async () => {
  const { id } = await seedUser(db);
  await db.insert(userAvatarBlobs).values({ userId: id, bytes: makePng(), mime: 'image/png' });
  await db.update(users).set({ avatarUpdatedAt: new Date() }).where(eq(users.id, id));
  authed(id);
  expect((await callDelete()).status).toBe(200);
  const rows = await db.select().from(userAvatarBlobs).where(eq(userAvatarBlobs.userId, id));
  expect(rows).toHaveLength(0);
  const [u] = await db.select({ at: users.avatarUpdatedAt }).from(users).where(eq(users.id, id));
  expect(u.at).toBeNull();
});
