/**
 * @vitest-environment node
 */
// POST /api/files/[id]/complete — phase 2 of the two-phase presigned upload.
//
// Coverage:
//   - 401 unauthenticated / 403 email unverified
//   - 404 row not found
//   - 403 when caller is not the uploader
//   - 200 idempotent when already ready
//   - 409 NOT_UPLOADED when the object isn't in storage yet (row kept)
//   - 400 SIZE_MISMATCH when stored size != declared size (object + row removed)
//   - 415 MIME_MISMATCH when sniffed bytes != declared mime (object + row removed)
//   - 200 + markReady on success
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { randomUUID } from 'node:crypto';

import { attachments } from '@/lib/db/schema';
import { createPgliteDb, type PgliteDB } from '@/lib/db/client-pglite';
import { eq } from 'drizzle-orm';
import {
  __resetForTest,
  __useDrizzleWithDbForTest,
} from '@/lib/server/repositories/factory';
import { seedUser } from '@/lib/server/repositories/drizzle/__tests__/_seed';
import {
  __resetStorageForTest,
  __setStorageForTest,
} from '@/lib/server/storage';
import { InMemoryStorage } from '@/lib/server/storage/memory';

const sessionRef: { value: unknown | null } = { value: null };
vi.mock('@/auth', () => ({
  auth: () => Promise.resolve(sessionRef.value),
}));
const getDbSessionVersionMock = vi.hoisted(() => vi.fn());
const getDbEmailVerifiedMock = vi.hoisted(() => vi.fn());
vi.mock('@/lib/auth/session-version-db', () => ({
  getDbSessionVersion: (...a: unknown[]) => getDbSessionVersionMock(...a),
  getDbEmailVerified: (...a: unknown[]) => getDbEmailVerifiedMock(...a),
}));

let db: PgliteDB;
let storage: InMemoryStorage;

const PDF_HEAD = Buffer.from([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x37]);
const PNG_HEAD = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

beforeEach(async () => {
  __resetForTest();
  __resetStorageForTest();
  db = await createPgliteDb();
  await __useDrizzleWithDbForTest(db);
  storage = new InMemoryStorage();
  __setStorageForTest(storage);
  sessionRef.value = null;
  getDbSessionVersionMock.mockReset();
  getDbSessionVersionMock.mockResolvedValue(1);
  getDbEmailVerifiedMock.mockReset();
  getDbEmailVerifiedMock.mockResolvedValue(true);
});

afterEach(async () => {
  __setStorageForTest(undefined);
  __resetStorageForTest();
  __resetForTest();
});

async function callComplete(id: string) {
  const { POST } = await import('../[id]/complete/route');
  const req = new Request(`http://localhost/api/files/${id}/complete`, {
    method: 'POST',
  });
  return POST(req, { params: Promise.resolve({ id }) });
}

async function seedPendingRow(opts: {
  uploaderId: string;
  size: number;
  mimeType: string;
  name?: string;
}) {
  const id = randomUUID();
  await db.insert(attachments).values({
    id,
    name: opts.name ?? 'a.pdf',
    size: opts.size,
    mimeType: opts.mimeType,
    uploadedBy: opts.uploaderId,
    status: 'pending',
  });
  return id;
}

describe('POST /api/files/[id]/complete', () => {
  it('401 when unauthenticated', async () => {
    const r = await callComplete(randomUUID());
    expect(r.status).toBe(401);
  });

  it('403 when email not verified', async () => {
    sessionRef.value = { user: { id: 'user-1', email: 'u@x.com', sessionVersion: 1 } };
    getDbEmailVerifiedMock.mockResolvedValue(false);
    const r = await callComplete(randomUUID());
    expect(r.status).toBe(403);
  });

  it('404 when attachment row not found', async () => {
    const buyer = await seedUser(db, { email: 'b@x.com' });
    sessionRef.value = { user: { id: buyer.id, email: buyer.email } };
    const r = await callComplete(randomUUID());
    expect(r.status).toBe(404);
  });

  it('403 when caller is not the uploader', async () => {
    const uploader = await seedUser(db, { email: 'up@x.com' });
    const stranger = await seedUser(db, { email: 'str@x.com' });
    const id = await seedPendingRow({
      uploaderId: uploader.id,
      size: PDF_HEAD.length,
      mimeType: 'application/pdf',
    });
    sessionRef.value = { user: { id: stranger.id, email: stranger.email } };
    const r = await callComplete(id);
    expect(r.status).toBe(403);
  });

  it('200 idempotent when already ready', async () => {
    const uploader = await seedUser(db, { email: 'up2@x.com' });
    const id = randomUUID();
    await db.insert(attachments).values({
      id,
      name: 'ready.pdf',
      size: PDF_HEAD.length,
      mimeType: 'application/pdf',
      uploadedBy: uploader.id,
      status: 'ready',
    });
    sessionRef.value = { user: { id: uploader.id, email: uploader.email } };
    const r = await callComplete(id);
    expect(r.status).toBe(200);
    const body = (await r.json()) as { id: string; name: string };
    expect(body.id).toBe(id);
    expect(body.name).toBe('ready.pdf');
  });

  it('409 NOT_UPLOADED when object missing from storage — row is kept', async () => {
    const uploader = await seedUser(db, { email: 'up3@x.com' });
    const id = await seedPendingRow({
      uploaderId: uploader.id,
      size: PDF_HEAD.length,
      mimeType: 'application/pdf',
    });
    sessionRef.value = { user: { id: uploader.id, email: uploader.email } };
    const r = await callComplete(id);
    expect(r.status).toBe(409);
    const body = (await r.json()) as { error: string };
    expect(body.error).toBe('NOT_UPLOADED');

    const [row] = await db
      .select()
      .from(attachments)
      .where(eq(attachments.id, id))
      .limit(1);
    expect(row).toBeTruthy();
    expect(row?.status).toBe('pending');
  });

  it('400 SIZE_MISMATCH when stored size differs — object + row removed', async () => {
    const uploader = await seedUser(db, { email: 'up4@x.com' });
    const id = await seedPendingRow({
      uploaderId: uploader.id,
      size: 999, // declared size doesn't match what's actually uploaded
      mimeType: 'application/pdf',
    });
    await storage.save(id, PDF_HEAD, 'application/pdf');
    sessionRef.value = { user: { id: uploader.id, email: uploader.email } };
    const r = await callComplete(id);
    expect(r.status).toBe(400);
    const body = (await r.json()) as { error: string };
    expect(body.error).toBe('SIZE_MISMATCH');

    const [row] = await db
      .select()
      .from(attachments)
      .where(eq(attachments.id, id))
      .limit(1);
    expect(row).toBeUndefined();
    await expect(storage.head(id)).rejects.toThrow();
  });

  it('415 MIME_MISMATCH when sniffed bytes differ from declared mime — object + row removed', async () => {
    const uploader = await seedUser(db, { email: 'up5@x.com' });
    const id = await seedPendingRow({
      uploaderId: uploader.id,
      size: PNG_HEAD.length,
      mimeType: 'application/pdf', // declared pdf
    });
    await storage.save(id, PNG_HEAD, 'application/pdf'); // actually png bytes
    sessionRef.value = { user: { id: uploader.id, email: uploader.email } };
    const r = await callComplete(id);
    expect(r.status).toBe(415);
    const body = (await r.json()) as { error: string };
    expect(body.error).toBe('MIME_MISMATCH');

    const [row] = await db
      .select()
      .from(attachments)
      .where(eq(attachments.id, id))
      .limit(1);
    expect(row).toBeUndefined();
    await expect(storage.head(id)).rejects.toThrow();
  });

  it('200 + markReady on success', async () => {
    const uploader = await seedUser(db, { email: 'up6@x.com' });
    const id = await seedPendingRow({
      uploaderId: uploader.id,
      size: PDF_HEAD.length,
      mimeType: 'application/pdf',
      name: 'done.pdf',
    });
    await storage.save(id, PDF_HEAD, 'application/pdf');
    sessionRef.value = { user: { id: uploader.id, email: uploader.email } };
    const r = await callComplete(id);
    expect(r.status).toBe(200);
    const body = (await r.json()) as {
      id: string;
      name: string;
      size: number;
      mimeType: string;
    };
    expect(body).toEqual({
      id,
      name: 'done.pdf',
      size: PDF_HEAD.length,
      mimeType: 'application/pdf',
    });

    const [row] = await db
      .select()
      .from(attachments)
      .where(eq(attachments.id, id))
      .limit(1);
    expect(row?.status).toBe('ready');
  });
});
