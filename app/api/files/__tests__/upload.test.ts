/**
 * @vitest-environment node
 */
// POST /api/files/upload — auth/validation matrix + storage-DB ordering
// (advisor pin 6 — F-6).
//
// Coverage:
//   - 401 unauthenticated
//   - 415 mime header not in allowlist
//   - 415 sniff mismatch (header says PDF, bytes are PNG)
//   - 413 too large
//   - 400 empty file / no file
//   - 403 wrong workspaceType for ownerKind
//   - happy path: row inserted, bytes in storage
//   - F-6: row insert fails → storage object is cleaned up
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { randomUUID } from 'node:crypto';

import { attachments, bids, rfps, rfpInvitations } from '@/lib/db/schema';
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
  seedPgWorkspace,
  seedUser,
} from '@/lib/server/repositories/drizzle/__tests__/_seed';
import { generateToken, hashToken, addMinutes } from '@/lib/server/token';
import {
  __resetStorageForTest,
  __setStorageForTest,
} from '@/lib/server/storage';
import { InMemoryStorage } from '@/lib/server/storage/memory';

// auth() mocked via a settable session ref — same pattern as the bid action tests.
const sessionRef: { value: unknown | null } = { value: null };
vi.mock('@/auth', () => ({
  auth: () => Promise.resolve(sessionRef.value),
}));

let db: PgliteDB;
let storage: InMemoryStorage;

beforeEach(async () => {
  __resetForTest();
  __resetStorageForTest();
  db = await createPgliteDb();
  await __useDrizzleWithDbForTest(db);
  // Install pglite handle for the route's `routeDb()`.
  const filesRoute = await import('../upload/route');
  filesRoute.__setFilesDbForTest(db);
  storage = new InMemoryStorage();
  __setStorageForTest(storage);
  sessionRef.value = null;
});

afterEach(async () => {
  const filesRoute = await import('../upload/route');
  filesRoute.__setFilesDbForTest(undefined);
  __setStorageForTest(undefined);
  __resetStorageForTest();
  __resetForTest();
});

const PDF_HEAD = Buffer.from([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x37]);
const PNG_HEAD = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

function makeFile(name: string, type: string, body: Buffer): File {
  // BlobPart wants Uint8Array<ArrayBuffer>; Buffer's typed view is wider
  // (ArrayBufferLike) so pass the underlying bytes through Uint8Array.
  return new File([new Uint8Array(body)], name, { type });
}

async function callUpload(form: FormData) {
  const { POST } = await import('../upload/route');
  const req = new Request('http://localhost/api/files/upload', {
    method: 'POST',
    body: form,
  });
  return POST(req);
}

async function seedBuyerSession(rfpId?: string) {
  const buyer = await seedUser(db, { email: 'buyer@buy.com' });
  const biz = await seedBizProfile(db);
  const buyerWs = await seedBuyerWorkspace(db, { bizProfileId: biz.id });
  await seedMembership(db, buyerWs.id, buyer.id, 'admin');
  if (rfpId) {
    await db.insert(rfps).values({
      id: rfpId,
      buyerWsId: buyerWs.id,
      bizProfileId: biz.id,
      title: 'upload test',
      memo: '',
      allowedPgWorkspaceIds: [],
      deadline: new Date(Date.now() + 86_400_000),
      status: 'draft',
      createdBy: buyer.id,
    });
  }
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

async function seedPgSession(rfpId: string) {
  // Buyer side
  const buyer = await seedUser(db, { email: 'b@buy.com' });
  const biz = await seedBizProfile(db);
  const buyerWs = await seedBuyerWorkspace(db, { bizProfileId: biz.id });
  await seedMembership(db, buyerWs.id, buyer.id, 'admin');
  // PG side
  const pgWs = await seedPgWorkspace(db, 'toss.im');
  const pg = await seedUser(db, { email: 'sales@toss.im' });
  await seedMembership(db, pgWs.id, pg.id, 'admin');
  // RFP
  await db.insert(rfps).values({
    id: rfpId,
    buyerWsId: buyerWs.id,
    bizProfileId: biz.id,
    title: 'pg upload test',
    memo: '',
    allowedPgWorkspaceIds: [pgWs.id],
    deadline: new Date(Date.now() + 86_400_000),
    status: 'sent',
    createdBy: buyer.id,
    sentAt: new Date(),
  });
  // Accepted invitation linking pg user to RFP
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
  return { pg, pgWs };
}

describe('POST /api/files/upload', () => {
  it('401 when unauthenticated', async () => {
    const f = new FormData();
    f.append('file', makeFile('a.pdf', 'application/pdf', PDF_HEAD));
    f.append('ownerKind', 'rfp');
    f.append('ownerId', '__draft__');
    const r = await callUpload(f);
    expect(r.status).toBe(401);
  });

  it('400 when file is missing', async () => {
    await seedBuyerSession();
    const f = new FormData();
    f.append('ownerKind', 'rfp');
    f.append('ownerId', '__draft__');
    const r = await callUpload(f);
    expect(r.status).toBe(400);
  });

  it('400 INVALID_INPUT when ownerKind/ownerId missing', async () => {
    await seedBuyerSession();
    const f = new FormData();
    f.append('file', makeFile('a.pdf', 'application/pdf', PDF_HEAD));
    const r = await callUpload(f);
    expect(r.status).toBe(400);
  });

  it('415 when stated mime is not allowlisted', async () => {
    await seedBuyerSession();
    const f = new FormData();
    f.append(
      'file',
      makeFile('a.docx', 'application/vnd.ms-word', Buffer.from('xxxx')),
    );
    f.append('ownerKind', 'rfp');
    f.append('ownerId', '__draft__');
    const r = await callUpload(f);
    expect(r.status).toBe(415);
  });

  it('415 when magic bytes mismatch the stated mime', async () => {
    await seedBuyerSession();
    const f = new FormData();
    f.append('file', makeFile('fake.pdf', 'application/pdf', PNG_HEAD));
    f.append('ownerKind', 'rfp');
    f.append('ownerId', '__draft__');
    const r = await callUpload(f);
    expect(r.status).toBe(415);
  });

  it('413 when file exceeds 20MB', async () => {
    await seedBuyerSession();
    const big = Buffer.concat([
      PDF_HEAD as unknown as Uint8Array,
      Buffer.alloc(20 * 1024 * 1024) as unknown as Uint8Array,
    ]);
    const f = new FormData();
    f.append('file', makeFile('big.pdf', 'application/pdf', big));
    f.append('ownerKind', 'rfp');
    f.append('ownerId', '__draft__');
    const r = await callUpload(f);
    expect(r.status).toBe(413);
  });

  it('403 when buyer tries to upload bid_proposal', async () => {
    await seedBuyerSession();
    const f = new FormData();
    f.append('file', makeFile('a.pdf', 'application/pdf', PDF_HEAD));
    f.append('ownerKind', 'bid_proposal');
    f.append('ownerId', 'P-2605-0099');
    const r = await callUpload(f);
    expect(r.status).toBe(403);
  });

  it('403 when PG uploads bid_proposal for an RFP they were not invited to', async () => {
    await seedPgSession('P-2605-0001');
    const f = new FormData();
    f.append('file', makeFile('a.pdf', 'application/pdf', PDF_HEAD));
    f.append('ownerKind', 'bid_proposal');
    f.append('ownerId', 'P-9999-9999');
    const r = await callUpload(f);
    expect(r.status).toBe(403);
  });

  it('happy path — rfp draft: row inserted + bytes in storage', async () => {
    const { buyer } = await seedBuyerSession();
    const f = new FormData();
    f.append('file', makeFile('rfp.pdf', 'application/pdf', PDF_HEAD));
    f.append('ownerKind', 'rfp');
    f.append('ownerId', '__draft__');
    const r = await callUpload(f);
    expect(r.status).toBe(200);
    const body = (await r.json()) as { id: string; name: string; size: number };
    expect(body.name).toBe('rfp.pdf');
    expect(body.size).toBe(PDF_HEAD.length);

    // Row + storage payload
    const [row] = await db
      .select()
      .from(attachments)
      .where(eq(attachments.id, body.id))
      .limit(1);
    expect(row?.uploadedBy).toBe(buyer.id);
    expect(row?.ownerId).toBe('__draft__');
    expect(row?.mimeType).toBe('application/pdf');

    const { size } = await storage.read(row!.storagePath);
    expect(size).toBe(PDF_HEAD.length);
  });

  it('happy path — bid_proposal: invitation gates upload', async () => {
    const rfpId = 'P-2605-0002';
    await seedPgSession(rfpId);
    const f = new FormData();
    f.append('file', makeFile('proposal.pdf', 'application/pdf', PDF_HEAD));
    f.append('ownerKind', 'bid_proposal');
    f.append('ownerId', rfpId);
    const r = await callUpload(f);
    expect(r.status).toBe(200);
    const body = (await r.json()) as { id: string };

    const [row] = await db
      .select()
      .from(attachments)
      .where(eq(attachments.id, body.id))
      .limit(1);
    expect(row?.ownerKind).toBe('bid_proposal');
    expect(row?.ownerId).toBe(rfpId);
  });

  it('403 when PG tries to upload bid_note (buyer-private)', async () => {
    await seedPgSession('P-2605-0011');
    const f = new FormData();
    f.append('file', makeFile('memo.pdf', 'application/pdf', PDF_HEAD));
    f.append('ownerKind', 'bid_note');
    f.append('ownerId', randomUUID());
    const r = await callUpload(f);
    expect(r.status).toBe(403);
  });

  it('403 when buyer uploads bid_note for a bid outside their workspace', async () => {
    // Seed a foreign bid (different buyer ws) and try to attach a note.
    const { buyer: otherBuyer } = await seedBuyerSession();
    // Spin up a second buyer ws + RFP + bid; the current session's buyer is
    // member of the first ws but not the second.
    const foreignBuyer = await seedUser(db, { email: 'b2@buy.com' });
    const foreignBiz = await seedBizProfile(db, { bizNo: '9876543210' });
    const foreignWs = await seedBuyerWorkspace(db, {
      bizProfileId: foreignBiz.id,
    });
    await seedMembership(db, foreignWs.id, foreignBuyer.id, 'admin');
    const pgWs = await seedPgWorkspace(db, 'inicis.com');
    const pgUser = await seedUser(db, { email: 'p@inicis.com' });
    const foreignRfpId = 'P-2605-0099';
    await db.insert(rfps).values({
      id: foreignRfpId,
      buyerWsId: foreignWs.id,
      bizProfileId: foreignBiz.id,
      title: 'foreign',
      memo: '',
      allowedPgWorkspaceIds: [pgWs.id],
      deadline: new Date(Date.now() + 86_400_000),
      status: 'sent',
      createdBy: foreignBuyer.id,
      sentAt: new Date(),
    });
    const invId = randomUUID();
    await db.insert(rfpInvitations).values({
      id: invId,
      rfpId: foreignRfpId,
      pgWsId: pgWs.id,
      acceptedByUserId: pgUser.id,
      tokenHash: hashToken(generateToken()),
      sentAt: new Date(),
      expiresAt: new Date(addMinutes(new Date(), 7 * 24 * 60)),
      status: 'accepted',
    });
    const foreignBidId = randomUUID();
    await db.insert(bids).values({
      id: foreignBidId,
      rfpId: foreignRfpId,
      pgWsId: pgWs.id,
      invitationId: invId,
      settleCycle: 'D+1',
      deposit: '0',
      setupFee: '0',
      monthlyMin: '0',
      bankTransferFeePct: '0.015',
      easyPayFeePct: '0.018',
      proposalAttachmentId: null,
      submittedBy: pgUser.id,
    });
    // Quieten the unused-var lint: confirm seedBuyerSession returned the
    // outer buyer; their identity is what differentiates ws membership.
    expect(otherBuyer.id).not.toBe(foreignBuyer.id);

    const f = new FormData();
    f.append('file', makeFile('m.pdf', 'application/pdf', PDF_HEAD));
    f.append('ownerKind', 'bid_note');
    f.append('ownerId', foreignBidId);
    const r = await callUpload(f);
    expect(r.status).toBe(403);
  });

  it('happy path — bid_note: buyer ws member uploads attachment for own bid', async () => {
    const { buyer, buyerWs } = await seedBuyerSession();
    const ownBiz = await seedBizProfile(db, { bizNo: '5555555555' });
    const pgWs = await seedPgWorkspace(db, 'toss.im');
    const pg = await seedUser(db, { email: 'p@toss.im' });
    const ownRfpId = 'P-2605-0070';
    await db.insert(rfps).values({
      id: ownRfpId,
      buyerWsId: buyerWs.id,
      bizProfileId: ownBiz.id,
      title: 'own',
      memo: '',
      allowedPgWorkspaceIds: [pgWs.id],
      deadline: new Date(Date.now() + 86_400_000),
      status: 'sent',
      createdBy: buyer.id,
      sentAt: new Date(),
    });
    const invId = randomUUID();
    await db.insert(rfpInvitations).values({
      id: invId,
      rfpId: ownRfpId,
      pgWsId: pgWs.id,
      acceptedByUserId: pg.id,
      tokenHash: hashToken(generateToken()),
      sentAt: new Date(),
      expiresAt: new Date(addMinutes(new Date(), 7 * 24 * 60)),
      status: 'accepted',
    });
    const ownBidId = randomUUID();
    await db.insert(bids).values({
      id: ownBidId,
      rfpId: ownRfpId,
      pgWsId: pgWs.id,
      invitationId: invId,
      settleCycle: 'D+1',
      deposit: '0',
      setupFee: '0',
      monthlyMin: '0',
      bankTransferFeePct: '0.015',
      easyPayFeePct: '0.018',
      proposalAttachmentId: null,
      submittedBy: pg.id,
    });

    const f = new FormData();
    f.append('file', makeFile('note.pdf', 'application/pdf', PDF_HEAD));
    f.append('ownerKind', 'bid_note');
    f.append('ownerId', ownBidId);
    const r = await callUpload(f);
    expect(r.status).toBe(200);
    const body = (await r.json()) as { id: string };

    const [row] = await db
      .select()
      .from(attachments)
      .where(eq(attachments.id, body.id))
      .limit(1);
    expect(row?.ownerKind).toBe('bid_note');
    expect(row?.ownerId).toBe(ownBidId);
    expect(row?.uploadedBy).toBe(buyer.id);
  });

  it('cleanup ordering — repo.save throws → storage object deleted (F-6)', async () => {
    await seedBuyerSession();

    // Real (in-memory) storage with a spy on delete.
    const realStorage = new InMemoryStorage();
    const deleteSpy = vi.spyOn(realStorage, 'delete');
    __setStorageForTest(realStorage);

    // Stub the attachment repo module via vi.doMock + dynamic import of a
    // fresh route module copy. The other repos still come from the
    // pglite-backed factory through the route's normal lookup.
    let savedKey: string | undefined;
    vi.resetModules();
    vi.doMock('@/lib/server/repositories/factory', async (importOriginal) => {
      const actual =
        await importOriginal<typeof import('@/lib/server/repositories/factory')>();
      return {
        ...actual,
        getAttachmentRepo: async () => ({
          save: async (a: { storagePath: string }) => {
            savedKey = a.storagePath;
            throw new Error('forced failure');
          },
          findById: async () => undefined,
        }),
      };
    });

    try {
      // Re-import the route under the doMock so it picks up the stubbed factory.
      const { POST, __setFilesDbForTest } = await import('../upload/route');
      __setFilesDbForTest(db);

      const form = new FormData();
      form.append('file', makeFile('a.pdf', 'application/pdf', PDF_HEAD));
      form.append('ownerKind', 'rfp');
      form.append('ownerId', '__draft__');
      const req = new Request('http://localhost/api/files/upload', {
        method: 'POST',
        body: form,
      });
      await expect(POST(req)).rejects.toThrow('forced failure');

      expect(savedKey).toBeDefined();
      expect(deleteSpy).toHaveBeenCalledWith(savedKey);
      await expect(realStorage.read(savedKey!)).rejects.toMatchObject({
        code: 'ENOENT',
      });
    } finally {
      vi.doUnmock('@/lib/server/repositories/factory');
      vi.resetModules();
    }
  });
});
