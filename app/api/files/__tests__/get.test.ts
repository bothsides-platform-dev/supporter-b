/**
 * @vitest-environment node
 */
// GET /api/files/[id] — auth + ACL + headers + body bytes.
//
// Coverage:
//   - 401 unauthenticated
//   - 404 row not found
//   - 403 authenticated but not allowed
//   - 200 + Content-Type / Content-Length / Cache-Control / Content-Disposition
//   - 200 body bytes equal stored bytes
//   - 410 when row exists but storage object is missing (advisor pin: orphan path)
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { randomUUID } from 'node:crypto';

import { attachments, rfps, rfpInvitations } from '@/lib/db/schema';
import { createPgliteDb, type PgliteDB } from '@/lib/db/client-pglite';
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
import { newAttachmentPath } from '@/lib/server/storage/path';

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
  // The GET route shares the same global override key as the upload route.
  const upload = await import('../upload/route');
  upload.__setFilesDbForTest(db);
  storage = new InMemoryStorage();
  __setStorageForTest(storage);
  sessionRef.value = null;
});

afterEach(async () => {
  const upload = await import('../upload/route');
  upload.__setFilesDbForTest(undefined);
  __setStorageForTest(undefined);
  __resetStorageForTest();
  __resetForTest();
});

const PDF_HEAD = Buffer.from('%PDF-1.7 hello payload', 'utf8');

async function callGet(id: string, headers?: HeadersInit) {
  const { GET } = await import('../[id]/route');
  const req = new Request(`http://localhost/api/files/${id}`, { headers });
  return GET(req, { params: Promise.resolve({ id }) });
}

async function readBody(res: Response): Promise<Buffer> {
  const arr = await res.arrayBuffer();
  return Buffer.from(arr);
}

async function seedScenario() {
  const buyer = await seedUser(db, { email: 'buyer@buy.com' });
  const biz = await seedBizProfile(db);
  const buyerWs = await seedBuyerWorkspace(db, { bizProfileId: biz.id });
  await seedMembership(db, buyerWs.id, buyer.id, 'admin');
  const pgWs = await seedPgWorkspace(db, 'toss.im');
  const pg = await seedUser(db, { email: 'sales@toss.im' });
  await seedMembership(db, pgWs.id, pg.id, 'admin');
  const stranger = await seedUser(db, { email: 'rando@x.com' });

  const rfpId = 'P-2605-0050';
  await db.insert(rfps).values({
    id: rfpId,
    buyerWsId: buyerWs.id,
    bizProfileId: biz.id,
    title: 'get test',
    memo: '',
    allowedPgWorkspaceIds: [pgWs.id],
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

  // Persist the bytes via the test storage and an attachments row pointing at it.
  const key = newAttachmentPath('rfp.pdf');
  await storage.save(key, PDF_HEAD, 'application/pdf');
  const id = randomUUID();
  await db.insert(attachments).values({
    id,
    ownerKind: 'rfp',
    ownerId: rfpId,
    name: 'rfp.pdf',
    size: PDF_HEAD.length,
    mimeType: 'application/pdf',
    storagePath: key,
    uploadedBy: buyer.id,
  });

  return {
    rfpId,
    attachmentId: id,
    storageKey: key,
    buyerWsId: buyerWs.id,
    buyerUserId: buyer.id,
    pgWsId: pgWs.id,
    pgUserId: pg.id,
    strangerId: stranger.id,
  };
}

describe('GET /api/files/[id]', () => {
  it('401 when unauthenticated', async () => {
    const s = await seedScenario();
    const r = await callGet(s.attachmentId);
    expect(r.status).toBe(401);
  });

  it('404 when attachment row not found', async () => {
    const buyer = await seedUser(db, { email: 'b@x.com' });
    sessionRef.value = {
      user: {
        id: buyer.id,
        email: buyer.email,
        workspaceId: undefined,
        workspaceType: undefined,
        role: undefined,
      },
    };
    const r = await callGet(randomUUID());
    expect(r.status).toBe(404);
  });

  it('403 when authenticated user has no access', async () => {
    const s = await seedScenario();
    sessionRef.value = {
      user: { id: s.strangerId, email: 'rando@x.com' },
    };
    const r = await callGet(s.attachmentId);
    expect(r.status).toBe(403);
  });

  it('200 with required headers + body bytes for buyer ws member', async () => {
    const s = await seedScenario();
    sessionRef.value = {
      user: {
        id: s.buyerUserId,
        email: 'buyer@buy.com',
        workspaceId: s.buyerWsId,
        workspaceType: 'buyer',
        role: 'admin',
      },
    };
    const r = await callGet(s.attachmentId);
    expect(r.status).toBe(200);
    expect(r.headers.get('content-type')).toBe('application/pdf');
    expect(r.headers.get('content-length')).toBe(String(PDF_HEAD.length));
    // ACL revalidation via ETag — browser may cache (private only) but must
    // re-check on every use. no-store dropped so If-None-Match works.
    expect(r.headers.get('cache-control')).toBe(
      'private, max-age=0, must-revalidate',
    );
    expect(r.headers.get('etag')).toBe(`"${s.attachmentId}"`);
    expect(r.headers.get('accept-ranges')).toBe('bytes');
    expect(r.headers.get('content-disposition')).toContain(
      'inline; filename="rfp.pdf"',
    );
    const body = await readBody(r);
    expect(body.equals(PDF_HEAD as unknown as Uint8Array)).toBe(true);
  });

  it('304 when If-None-Match matches and user still has access', async () => {
    const s = await seedScenario();
    sessionRef.value = {
      user: {
        id: s.buyerUserId,
        email: 'buyer@buy.com',
        workspaceId: s.buyerWsId,
        workspaceType: 'buyer',
        role: 'admin',
      },
    };
    const r = await callGet(s.attachmentId, {
      'If-None-Match': `"${s.attachmentId}"`,
    });
    expect(r.status).toBe(304);
    // 304 must not carry a body (browser revalidates from its cache).
    const body = await readBody(r);
    expect(body.length).toBe(0);
    // ETag echoed so the browser can keep its cached representation.
    expect(r.headers.get('etag')).toBe(`"${s.attachmentId}"`);
  });

  it('403 wins over 304 — ACL is enforced before If-None-Match', async () => {
    const s = await seedScenario();
    // Stranger with a (somehow) valid ETag for someone else's attachment
    // must still get 403. Caching can never widen access.
    sessionRef.value = {
      user: { id: s.strangerId, email: 'rando@x.com' },
    };
    const r = await callGet(s.attachmentId, {
      'If-None-Match': `"${s.attachmentId}"`,
    });
    expect(r.status).toBe(403);
  });

  it('206 with Content-Range for valid Range request', async () => {
    const s = await seedScenario();
    sessionRef.value = {
      user: {
        id: s.buyerUserId,
        email: 'buyer@buy.com',
        workspaceId: s.buyerWsId,
        workspaceType: 'buyer',
        role: 'admin',
      },
    };
    // bytes=0-4 → first 5 bytes (HTTP inclusive end)
    const r = await callGet(s.attachmentId, { Range: 'bytes=0-4' });
    expect(r.status).toBe(206);
    expect(r.headers.get('content-range')).toBe(
      `bytes 0-4/${PDF_HEAD.length}`,
    );
    expect(r.headers.get('content-length')).toBe('5');
    expect(r.headers.get('accept-ranges')).toBe('bytes');
    const body = await readBody(r);
    expect(body.equals(PDF_HEAD.subarray(0, 5) as unknown as Uint8Array)).toBe(
      true,
    );
  });

  it('206 with suffix Range (bytes=-N → last N bytes)', async () => {
    const s = await seedScenario();
    sessionRef.value = {
      user: {
        id: s.buyerUserId,
        email: 'buyer@buy.com',
        workspaceId: s.buyerWsId,
        workspaceType: 'buyer',
        role: 'admin',
      },
    };
    const r = await callGet(s.attachmentId, { Range: 'bytes=-7' });
    expect(r.status).toBe(206);
    const len = PDF_HEAD.length;
    expect(r.headers.get('content-range')).toBe(
      `bytes ${len - 7}-${len - 1}/${len}`,
    );
    expect(r.headers.get('content-length')).toBe('7');
    const body = await readBody(r);
    expect(
      body.equals(PDF_HEAD.subarray(len - 7) as unknown as Uint8Array),
    ).toBe(true);
  });

  it('clamps Range end to file size (bytes=N-huge → bytes N-(size-1))', async () => {
    const s = await seedScenario();
    sessionRef.value = {
      user: {
        id: s.buyerUserId,
        email: 'buyer@buy.com',
        workspaceId: s.buyerWsId,
        workspaceType: 'buyer',
        role: 'admin',
      },
    };
    const r = await callGet(s.attachmentId, { Range: 'bytes=3-9999' });
    expect(r.status).toBe(206);
    const len = PDF_HEAD.length;
    expect(r.headers.get('content-range')).toBe(`bytes 3-${len - 1}/${len}`);
    expect(r.headers.get('content-length')).toBe(String(len - 3));
  });

  it('416 when Range is unsatisfiable (start beyond size)', async () => {
    const s = await seedScenario();
    sessionRef.value = {
      user: {
        id: s.buyerUserId,
        email: 'buyer@buy.com',
        workspaceId: s.buyerWsId,
        workspaceType: 'buyer',
        role: 'admin',
      },
    };
    const r = await callGet(s.attachmentId, {
      Range: `bytes=${PDF_HEAD.length + 100}-`,
    });
    expect(r.status).toBe(416);
    expect(r.headers.get('content-range')).toBe(
      `bytes */${PDF_HEAD.length}`,
    );
  });

  it('200 for accepted PG invitation user', async () => {
    const s = await seedScenario();
    sessionRef.value = {
      user: {
        id: s.pgUserId,
        email: 'sales@toss.im',
        workspaceId: s.pgWsId,
        workspaceType: 'pg',
        role: 'admin',
      },
    };
    const r = await callGet(s.attachmentId);
    expect(r.status).toBe(200);
  });

  it('410 when row exists but storage object is missing', async () => {
    const s = await seedScenario();
    // Delete the stored bytes but keep the row.
    await storage.delete(s.storageKey);
    sessionRef.value = {
      user: {
        id: s.buyerUserId,
        email: 'buyer@buy.com',
        workspaceId: s.buyerWsId,
        workspaceType: 'buyer',
        role: 'admin',
      },
    };
    const r = await callGet(s.attachmentId);
    expect(r.status).toBe(410);
  });
});
