/**
 * @vitest-environment node
 */
// POST /api/files/presign — 2-phase presigned upload, phase 1 (mint URL).
//
// Coverage:
//   - 401 unauthenticated / 403 email unverified
//   - 400 invalid input (bad ownerKind/name/size/mime)
//   - 413 too large / 415 mime not allowed
//   - 403 ACL denial (same matrix as /api/files/upload)
//   - happy path: pending row inserted, presignPut called, {id, uploadUrl} returned
//   - presign failure → row is best-effort removed, 500
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { randomUUID } from 'node:crypto';

import { attachments, rfps, rfpInvitations } from '@/lib/db/schema';
import { createPgliteDb, type PgliteDB } from '@/lib/db/client-pglite';
import { eq } from 'drizzle-orm';
import {
  __resetForTest,
  __useDrizzleWithDbForTest,
} from '@/lib/server/repositories/factory';
import {
  seedBizProfile,
  seedBuyerWorkspace,
  seedMembership,
  seedUser,
} from '@/lib/server/repositories/drizzle/__tests__/_seed';
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

async function callPresign(body: unknown) {
  const { POST } = await import('../presign/route');
  const req = new Request('http://localhost/api/files/presign', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
  });
  return POST(req);
}

async function seedBuyerSession() {
  const buyer = await seedUser(db, { email: 'buyer@buy.com' });
  const biz = await seedBizProfile(db);
  const buyerWs = await seedBuyerWorkspace(db, { bizProfileId: biz.id });
  await seedMembership(db, buyerWs.id, buyer.id, 'admin');
  sessionRef.value = {
    user: {
      id: buyer.id,
      email: buyer.email,
      workspaceId: buyerWs.id,
      workspaceType: 'buyer',
      role: 'admin',
    },
  };
  return { buyer, buyerWs };
}

describe('POST /api/files/presign', () => {
  it('401 when unauthenticated', async () => {
    const r = await callPresign({
      ownerKind: 'rfp',
      ownerId: '__draft__',
      name: 'a.pdf',
      size: 100,
      mime: 'application/pdf',
    });
    expect(r.status).toBe(401);
  });

  it('403 when email not verified', async () => {
    sessionRef.value = { user: { id: 'user-1', email: 'u@x.com', sessionVersion: 1 } };
    getDbEmailVerifiedMock.mockResolvedValue(false);
    const r = await callPresign({
      ownerKind: 'rfp',
      ownerId: '__draft__',
      name: 'a.pdf',
      size: 100,
      mime: 'application/pdf',
    });
    expect(r.status).toBe(403);
  });

  it('400 when input is invalid (bad mime)', async () => {
    await seedBuyerSession();
    const r = await callPresign({
      ownerKind: 'rfp',
      ownerId: '__draft__',
      name: 'a.docx',
      size: 100,
      mime: 'application/vnd.ms-word',
    });
    expect(r.status).toBe(400);
  });

  it('400 when name is empty', async () => {
    await seedBuyerSession();
    const r = await callPresign({
      ownerKind: 'rfp',
      ownerId: '__draft__',
      name: '',
      size: 100,
      mime: 'application/pdf',
    });
    expect(r.status).toBe(400);
  });

  it('413 when size exceeds 20MB', async () => {
    await seedBuyerSession();
    const r = await callPresign({
      ownerKind: 'rfp',
      ownerId: '__draft__',
      name: 'a.pdf',
      size: 20 * 1024 * 1024 + 1,
      mime: 'application/pdf',
    });
    expect(r.status).toBe(413);
  });

  it('400 when size is zero or negative', async () => {
    await seedBuyerSession();
    const r = await callPresign({
      ownerKind: 'rfp',
      ownerId: '__draft__',
      name: 'a.pdf',
      size: 0,
      mime: 'application/pdf',
    });
    expect(r.status).toBe(400);
  });

  it('403 when buyer tries to presign a bid_proposal', async () => {
    await seedBuyerSession();
    const r = await callPresign({
      ownerKind: 'bid_proposal',
      ownerId: randomUUID(),
      name: 'a.pdf',
      size: 100,
      mime: 'application/pdf',
    });
    expect(r.status).toBe(403);
  });

  it('happy path — rfp draft: pending row inserted, uploadUrl returned', async () => {
    const { buyer } = await seedBuyerSession();
    const presignSpy = vi.spyOn(storage, 'presignPut');
    const r = await callPresign({
      ownerKind: 'rfp',
      ownerId: '__draft__',
      name: 'rfp.pdf',
      size: 1234,
      mime: 'application/pdf',
    });
    expect(r.status).toBe(200);
    const body = (await r.json()) as { id: string; uploadUrl: string };
    expect(body.id).toBeTruthy();
    expect(body.uploadUrl).toContain('memory://put/');

    expect(presignSpy).toHaveBeenCalledWith(
      body.id,
      expect.objectContaining({ mime: 'application/pdf', size: 1234 }),
    );

    const [row] = await db
      .select()
      .from(attachments)
      .where(eq(attachments.id, body.id))
      .limit(1);
    expect(row?.status).toBe('pending');
    expect(row?.uploadedBy).toBe(buyer.id);
    expect(row?.name).toBe('rfp.pdf');
    expect(row?.size).toBe(1234);
    expect(row?.mimeType).toBe('application/pdf');
    expect(row?.rfpId).toBeNull();
  });

  it('happy path — rfp non-draft: row is linked immediately', async () => {
    const { buyer, buyerWs } = await seedBuyerSession();
    const biz = await seedBizProfile(db, { bizNo: '4444444444' });
    const rfpId = randomUUID();
    await db.insert(rfps).values({
      id: rfpId,
      code: 'P-2605-0900',
      buyerWsId: buyerWs.id,
      bizProfileId: biz.id,
      title: 'presign test',
      memo: '',
      deadline: new Date(Date.now() + 86_400_000),
      status: 'sent',
      createdBy: buyer.id,
      sentAt: new Date(),
    });
    const r = await callPresign({
      ownerKind: 'rfp',
      ownerId: rfpId,
      name: 'rfp.pdf',
      size: 1234,
      mime: 'application/pdf',
    });
    expect(r.status).toBe(200);
    const body = (await r.json()) as { id: string };
    const [row] = await db
      .select()
      .from(attachments)
      .where(eq(attachments.id, body.id))
      .limit(1);
    expect(row?.rfpId).toBe(rfpId);
  });

  it('happy path — bid_proposal: invitation gates presign, row is ownerless draft', async () => {
    const buyer = await seedUser(db, { email: 'b@buy.com' });
    const biz = await seedBizProfile(db);
    const buyerWs = await seedBuyerWorkspace(db, { bizProfileId: biz.id });
    await seedMembership(db, buyerWs.id, buyer.id, 'admin');
    const { seedPgWorkspace } = await import(
      '@/lib/server/repositories/drizzle/__tests__/_seed'
    );
    const pgWs = await seedPgWorkspace(db, 'toss.im');
    const pg = await seedUser(db, { email: 'sales@toss.im' });
    await seedMembership(db, pgWs.id, pg.id, 'admin');
    const { generateToken, hashToken, addMinutes } = await import(
      '@/lib/server/token'
    );
    const rfpId = randomUUID();
    await db.insert(rfps).values({
      id: rfpId,
      code: 'P-2605-0901',
      buyerWsId: buyerWs.id,
      bizProfileId: biz.id,
      title: 'pg presign test',
      memo: '',
      deadline: new Date(Date.now() + 86_400_000),
      status: 'sent',
      createdBy: buyer.id,
      sentAt: new Date(),
    });
    await db.insert(rfpInvitations).values({
      id: randomUUID(),
      rfpId,
      pgWsId: pgWs.id,
      acceptedByUserId: pg.id,
      tokenHash: hashToken(generateToken()),
      sentAt: new Date(),
      expiresAt: new Date(addMinutes(new Date(), 7 * 24 * 60)),
      status: 'accepted',
    });
    sessionRef.value = {
      user: {
        id: pg.id,
        email: pg.email,
        workspaceId: pgWs.id,
        workspaceType: 'pg',
        role: 'admin',
      },
    };
    const r = await callPresign({
      ownerKind: 'bid_proposal',
      ownerId: rfpId,
      name: 'proposal.pdf',
      size: 1234,
      mime: 'application/pdf',
    });
    expect(r.status).toBe(200);
    const body = (await r.json()) as { id: string };
    const [row] = await db
      .select()
      .from(attachments)
      .where(eq(attachments.id, body.id))
      .limit(1);
    expect(row?.bidId).toBeNull();
    expect(row?.uploadedBy).toBe(pg.id);
    expect(row?.status).toBe('pending');
  });

  it('500 + row removed when presignPut throws', async () => {
    const { buyer } = await seedBuyerSession();
    vi.spyOn(storage, 'presignPut').mockRejectedValue(new Error('kms down'));
    const r = await callPresign({
      ownerKind: 'rfp',
      ownerId: '__draft__',
      name: 'a.pdf',
      size: 100,
      mime: 'application/pdf',
    });
    expect(r.status).toBe(500);
    const rows = await db
      .select()
      .from(attachments)
      .where(eq(attachments.uploadedBy, buyer.id));
    expect(rows).toHaveLength(0);
  });
});
