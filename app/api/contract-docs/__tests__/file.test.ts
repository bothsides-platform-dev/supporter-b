/**
 * @vitest-environment node
 */
// GET /api/contract-docs/[id]/file — files/[id]/route.ts 미러: 3중 게이트(auth→
// isSessionRevoked→isEmailUnverified) + ACL(양측 워크스페이스만) + 302 redirect to
// a presigned GET URL. 완료본이 있으면 final, 아니면 base 키를 문서번호 파일명으로 서명.
//
// Coverage:
//   - 401 unauthenticated / sv stale
//   - 403 email not verified
//   - 404 doc not found
//   - 403 session ws가 buyerWsId/pgWsId 어느 쪽도 아님
//   - 302 buyer ws / pg ws 멤버 모두 허용, base 키 사용(미완료), 파일명=`{code}.pdf`
//   - 302 완료 문서는 final 키 사용, 파일명=`{code}-완료본.pdf`
//   - download=1 → disposition:'attachment', 기본은 'inline'
//   - Cache-Control: private, no-store
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { randomUUID } from 'node:crypto';

import { bids, contractDocs, rfpInvitations, rfps } from '@/lib/db/schema';
import { createPgliteDb, type PgliteDB } from '@/lib/db/client-pglite';
import {
  __resetForTest,
  __useDrizzleWithDbForTest,
} from '@/lib/server/repositories/factory';
import {
  seedBizProfile,
  seedBuyerWorkspace,
  seedPgWorkspace,
  seedUser,
} from '@/lib/server/repositories/drizzle/__tests__/_seed';
import { generateToken, hashToken, addMinutes } from '@/lib/server/token';
import {
  __resetStorageForTest,
  __setStorageForTest,
} from '@/lib/server/storage';
import { InMemoryStorage } from '@/lib/server/storage/memory';
import { PARTIES_FIXTURE, TERMS_FIXTURE } from '@/lib/server/contracts/__tests__/_fixtures';

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

async function callGet(id: string) {
  const { GET } = await import('../[id]/file/route');
  const req = new Request(`http://localhost/api/contract-docs/${id}/file`);
  return GET(req, { params: Promise.resolve({ id }) });
}

async function callGetDownload(id: string) {
  const { GET } = await import('../[id]/file/route');
  const req = new Request(`http://localhost/api/contract-docs/${id}/file?download=1`);
  return GET(req, { params: Promise.resolve({ id }) });
}

async function seedScenario(opts: { status?: 'sent' | 'completed'; withFinal?: boolean } = {}) {
  const buyer = await seedUser(db, { email: 'buyer@buy.com' });
  const biz = await seedBizProfile(db);
  const buyerWs = await seedBuyerWorkspace(db, { bizProfileId: biz.id });
  const pgWs = await seedPgWorkspace(db, 'toss.im');
  const pg = await seedUser(db, { email: 'sales@toss.im' });
  const stranger = await seedUser(db, { email: 'rando@x.com' });

  const rfpId = randomUUID();
  await db.insert(rfps).values({
    id: rfpId,
    code: 'P-2607-0060',
    buyerWsId: buyerWs.id,
    bizProfileId: biz.id,
    title: 'contract-docs file test',
    memo: '',
    deadline: new Date(Date.now() + 86_400_000),
    status: 'awarded',
    createdBy: buyer.id,
    sentAt: new Date(),
  });
  const invId = randomUUID();
  await db.insert(rfpInvitations).values({
    id: invId,
    rfpId,
    pgWsId: pgWs.id,
    acceptedByUserId: pg.id,
    tokenHash: hashToken(generateToken()),
    sentAt: new Date(),
    expiresAt: new Date(addMinutes(new Date(), 7 * 24 * 60)),
    status: 'accepted',
  });
  const bidId = randomUUID();
  await db.insert(bids).values({
    id: bidId,
    rfpId,
    pgWsId: pgWs.id,
    invitationId: invId,
    settleCycle: 'D+1',
    settleLimit: '0',
    guaranteeInsurance: '0',
    paymentFees: {},
    submittedBy: pg.id,
    status: 'submitted',
  });
  await db.update(rfps).set({ awardedBidId: bidId }).where(
    (await import('drizzle-orm')).eq(rfps.id, rfpId),
  );

  const docId = randomUUID();
  const status = opts.status ?? 'sent';
  await db.insert(contractDocs).values({
    id: docId,
    code: 'CT-2607-0001',
    rfpId,
    bidId,
    buyerWsId: buyerWs.id,
    pgWsId: pgWs.id,
    status,
    title: '전자계약서',
    parties: PARTIES_FIXTURE,
    termsSnapshot: TERMS_FIXTURE,
    basePdfKey: `contract-docs/${docId}/base.pdf`,
    basePdfSha256: 'a'.repeat(64),
    basePdfSize: 100,
    finalPdfKey: opts.withFinal ? `contract-docs/${docId}/final.pdf` : null,
    finalPdfSha256: opts.withFinal ? 'b'.repeat(64) : null,
    finalPdfSize: opts.withFinal ? 120 : null,
    createdBy: pg.id,
    expiresAt: new Date(Date.now() + 14 * 86_400_000),
    completedAt: status === 'completed' ? new Date() : null,
  });
  await storage.save(`contract-docs/${docId}/base.pdf`, Buffer.from('%PDF base'), 'application/pdf');
  if (opts.withFinal) {
    await storage.save(`contract-docs/${docId}/final.pdf`, Buffer.from('%PDF final'), 'application/pdf');
  }

  return {
    docId,
    docCode: 'CT-2607-0001',
    buyerWsId: buyerWs.id,
    buyerUserId: buyer.id,
    pgWsId: pgWs.id,
    pgUserId: pg.id,
    strangerId: stranger.id,
  };
}

function buyerSession(s: Awaited<ReturnType<typeof seedScenario>>) {
  return {
    user: {
      id: s.buyerUserId,
      email: 'buyer@buy.com',
      workspaceId: s.buyerWsId,
      workspaceType: 'buyer',
      role: 'admin',
    },
  };
}

function pgSession(s: Awaited<ReturnType<typeof seedScenario>>) {
  return {
    user: { id: s.pgUserId, email: 'sales@toss.im', workspaceId: s.pgWsId, workspaceType: 'pg', role: 'admin' },
  };
}

describe('GET /api/contract-docs/[id]/file', () => {
  it('401 when unauthenticated', async () => {
    const s = await seedScenario();
    const r = await callGet(s.docId);
    expect(r.status).toBe(401);
  });

  it('401 when the session is revoked (stale sv)', async () => {
    const s = await seedScenario();
    sessionRef.value = { user: { id: s.buyerUserId, email: 'buyer@buy.com', sessionVersion: 1 } };
    getDbSessionVersionMock.mockResolvedValue(2);
    const r = await callGet(s.docId);
    expect(r.status).toBe(401);
  });

  it('403 when email is not verified', async () => {
    const s = await seedScenario();
    sessionRef.value = { user: { id: s.buyerUserId, email: 'buyer@buy.com', sessionVersion: 1 } };
    getDbEmailVerifiedMock.mockResolvedValue(false);
    const r = await callGet(s.docId);
    expect(r.status).toBe(403);
  });

  it('404 when the doc is not found', async () => {
    const s = await seedScenario();
    sessionRef.value = buyerSession(s);
    const r = await callGet(randomUUID());
    expect(r.status).toBe(404);
  });

  it('403 when the session workspace is neither the buyer nor the pg side', async () => {
    const s = await seedScenario();
    sessionRef.value = { user: { id: s.strangerId, email: 'rando@x.com' } };
    const r = await callGet(s.docId);
    expect(r.status).toBe(403);
  });

  it('302 for the buyer ws — uses the base key + plain filename while not completed', async () => {
    const s = await seedScenario({ status: 'sent' });
    sessionRef.value = buyerSession(s);
    const presignSpy = vi.spyOn(storage, 'presignGet');
    const r = await callGet(s.docId);
    expect(r.status).toBe(302);
    expect(presignSpy).toHaveBeenCalledWith(
      `contract-docs/${s.docId}/base.pdf`,
      expect.objectContaining({
        filename: `${s.docCode}.pdf`,
        mime: 'application/pdf',
        expiresInSeconds: 900,
        disposition: 'inline',
      }),
    );
    expect(r.headers.get('cache-control')).toBe('private, no-store');
  });

  it('302 for the pg ws', async () => {
    const s = await seedScenario({ status: 'sent' });
    sessionRef.value = pgSession(s);
    const r = await callGet(s.docId);
    expect(r.status).toBe(302);
  });

  it('302 for a completed doc — uses the final key + "-완료본" filename', async () => {
    const s = await seedScenario({ status: 'completed', withFinal: true });
    sessionRef.value = buyerSession(s);
    const presignSpy = vi.spyOn(storage, 'presignGet');
    const r = await callGet(s.docId);
    expect(r.status).toBe(302);
    expect(presignSpy).toHaveBeenCalledWith(
      `contract-docs/${s.docId}/final.pdf`,
      expect.objectContaining({ filename: `${s.docCode}-완료본.pdf` }),
    );
  });

  it('download=1 sets disposition to attachment; default is inline', async () => {
    const s = await seedScenario({ status: 'sent' });
    sessionRef.value = buyerSession(s);
    const presignSpy = vi.spyOn(storage, 'presignGet');
    await callGetDownload(s.docId);
    expect(presignSpy).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ disposition: 'attachment' }),
    );
  });
});
