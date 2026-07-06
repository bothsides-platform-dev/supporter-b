/**
 * @vitest-environment node
 */
// GET /api/files/[id] — auth + ACL + 302 redirect to a presigned GET URL.
//
// Coverage:
//   - 401 unauthenticated
//   - 404 row not found
//   - 404 when row is pending (existence hidden until upload completes)
//   - 403 authenticated but not allowed
//   - 302 Location === storage.presignGet(...) result + Cache-Control: private, no-store
//   - disposition/filename/mime/TTL passed through to presignGet
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
let storage: InMemoryStorage;

beforeEach(async () => {
  __resetForTest();
  __resetStorageForTest();
  db = await createPgliteDb();
  await __useDrizzleWithDbForTest(db);
  // canAccessAttachment resolves the owner chain through the repository
  // factory (configured by __useDrizzleWithDbForTest) — no raw db handle.
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

const PDF_HEAD = Buffer.from('%PDF-1.7 hello payload', 'utf8');

async function callGet(id: string, headers?: HeadersInit) {
  const { GET } = await import('../[id]/route');
  const req = new Request(`http://localhost/api/files/${id}`, { headers });
  return GET(req, { params: Promise.resolve({ id }) });
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

  const rfpId = randomUUID();
  await db.insert(rfps).values({
    id: rfpId,
    code: 'P-2605-0050',
    buyerWsId: buyerWs.id,
    bizProfileId: biz.id,
    title: 'get test',
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

  // Attachment row (linked to RFP) + bytes keyed by the attachment id (C4).
  const id = randomUUID();
  await db.insert(attachments).values({
    id,
    rfpId,
    name: 'rfp.pdf',
    size: PDF_HEAD.length,
    mimeType: 'application/pdf',
    uploadedBy: buyer.id,
  });
  await storage.save(id, PDF_HEAD, 'application/pdf');

  return {
    rfpId,
    attachmentId: id,
    storageKey: id,
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

  it('403 when email not verified', async () => {
    sessionRef.value = { user: { id: 'user-1', email: 'u@x.com', sessionVersion: 1 } };
    getDbEmailVerifiedMock.mockResolvedValue(false);
    const { GET } = await import('../[id]/route');
    const r = await GET(
      new Request('http://localhost/api/files/any-id'),
      { params: Promise.resolve({ id: 'any-id' }) }
    );
    expect(r.status).toBe(403);
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

  it('404 when attachment row is pending (existence hidden)', async () => {
    const s = await seedScenario();
    const pendingId = randomUUID();
    await db.insert(attachments).values({
      id: pendingId,
      rfpId: s.rfpId,
      name: 'pending.pdf',
      size: PDF_HEAD.length,
      mimeType: 'application/pdf',
      uploadedBy: s.buyerUserId,
      status: 'pending',
    });
    sessionRef.value = {
      user: {
        id: s.buyerUserId,
        email: 'buyer@buy.com',
        workspaceId: s.buyerWsId,
        workspaceType: 'buyer',
        role: 'admin',
      },
    };
    const r = await callGet(pendingId);
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

  it('302 to a presigned GET URL for buyer ws member', async () => {
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
    const presignSpy = vi.spyOn(storage, 'presignGet');
    const r = await callGet(s.attachmentId);
    expect(r.status).toBe(302);
    expect(presignSpy).toHaveBeenCalledWith(
      s.attachmentId,
      expect.objectContaining({
        filename: 'rfp.pdf',
        mime: 'application/pdf',
        expiresInSeconds: 900,
      }),
    );
    const location = r.headers.get('location');
    expect(location).toBeTruthy();
    expect(location).toContain(`memory://get/${encodeURIComponent(s.attachmentId)}`);
    expect(r.headers.get('cache-control')).toBe('private, no-store');
  });

  it('302 for accepted PG invitation user', async () => {
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
    expect(r.status).toBe(302);
  });

  it('200 for chat attachment — buyer side, pg side; 403 for stranger', async () => {
    const { chatConversations, chatMessages } = await import('@/lib/db/schema');
    const s = await seedScenario();

    const convId = randomUUID();
    await db.insert(chatConversations).values({
      id: convId,
      buyerWsId: s.buyerWsId,
      pgWsId: s.pgWsId,
    });
    const msgId = randomUUID();
    await db.insert(chatMessages).values({
      id: msgId,
      conversationId: convId,
      authorUserId: s.buyerUserId,
      authorWsId: s.buyerWsId,
      body: '첨부 테스트 메시지',
    });
    const chatAttId = randomUUID();
    await db.insert(attachments).values({
      id: chatAttId,
      chatMessageId: msgId,
      name: 'chat.pdf',
      size: PDF_HEAD.length,
      mimeType: 'application/pdf',
      uploadedBy: s.buyerUserId,
    });
    await storage.save(chatAttId, PDF_HEAD, 'application/pdf');

    sessionRef.value = {
      user: {
        id: s.buyerUserId,
        email: 'buyer@buy.com',
        workspaceId: s.buyerWsId,
        workspaceType: 'buyer',
        role: 'admin',
      },
    };
    expect((await callGet(chatAttId)).status).toBe(302);

    sessionRef.value = {
      user: {
        id: s.pgUserId,
        email: 'sales@toss.im',
        workspaceId: s.pgWsId,
        workspaceType: 'pg',
        role: 'admin',
      },
    };
    expect((await callGet(chatAttId)).status).toBe(302);

    sessionRef.value = {
      user: { id: s.strangerId, email: 'rando@x.com' },
    };
    expect((await callGet(chatAttId)).status).toBe(403);
  });

});

describe('GET /api/files/[id] — master account', () => {
  it('302 for master/operator account accessing RFP attachment without workspaceMembers row', async () => {
    const s = await seedScenario();
    // Master has workspaceId matching the buyer workspace but is NOT in workspaceMembers
    // (listAllWorkspacesForMaster bypasses workspaceMembers; isMember returns false).
    // isMaster flag no longer needed — workspaceId match alone is sufficient.
    sessionRef.value = {
      user: {
        id: randomUUID(),
        email: 'master@support-b.com',
        workspaceId: s.buyerWsId,
        workspaceType: 'buyer' as const,
        role: 'admin',
      },
    };
    const r = await callGet(s.attachmentId);
    expect(r.status).toBe(302);
  });
});

describe('GET /api/files/[id] — 폐기 세션', () => {
  it('sv 가 stale 한(폐기된) 세션은 401', async () => {
    sessionRef.value = { user: { id: '00000000-0000-4000-8000-0000000000aa', email: 'x@x.com', sessionVersion: 1 } };
    getDbSessionVersionMock.mockResolvedValue(2);
    const r = await callGet('00000000-0000-4000-8000-0000000000bb');
    expect(r.status).toBe(401);
  });
});
