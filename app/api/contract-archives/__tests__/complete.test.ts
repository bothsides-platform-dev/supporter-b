/**
 * @vitest-environment node
 */
// POST /api/contract-archives/[id]/complete — 계약 보관함 수동 업로드 2-phase, phase 2
// (PUT 완료 검증 + pending→ready 전이). `app/api/files/[id]/complete/route.ts` 미러.
//
// 차이점: 소유 검증이 `createdBy`(archives 는 uploadedBy 가 아니라 createdBy),
// `source==='upload'` 가 아닌 행(signing 출처)은 404, 성공 응답 바디는 `{ id }` 만.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { randomUUID } from 'node:crypto';

import { createPgliteDb, type PgliteDB } from '@/lib/db/client-pglite';
import {
  __resetForTest,
  __useDrizzleWithDbForTest,
  getContractArchiveRepo,
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
import { uploadKey } from '@/lib/server/services/contract-archive';
import { contractArchives } from '@/lib/db/schema';

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
const isPgMembershipBlockedMock = vi.hoisted(() =>
  vi.fn(async (..._args: unknown[]) => false),
);
vi.mock('@/lib/auth/pg-membership-gate', () => ({
  isPgMembershipBlocked: (...a: unknown[]) => isPgMembershipBlockedMock(...a),
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
  isPgMembershipBlockedMock.mockReset();
  isPgMembershipBlockedMock.mockResolvedValue(false);
});

afterEach(async () => {
  __setStorageForTest(undefined);
  __resetStorageForTest();
  __resetForTest();
});

async function callComplete(id: string) {
  const { POST } = await import('../[id]/complete/route');
  const req = new Request(
    `http://localhost/api/contract-archives/${id}/complete`,
    { method: 'POST' },
  );
  return POST(req, { params: Promise.resolve({ id }) });
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

async function seedPendingUpload(opts: {
  workspaceId: string;
  createdBy: string;
  documentSize: number;
}) {
  const id = randomUUID();
  const repo = await getContractArchiveRepo();
  await repo.insertPendingUpload({
    id,
    workspaceId: opts.workspaceId,
    title: '계약서',
    documentKey: uploadKey(id),
    documentName: 'contract.pdf',
    documentSize: opts.documentSize,
    createdBy: opts.createdBy,
  });
  return id;
}

const PDF_BYTES = Buffer.from('%PDF-1.7\n%%mock contract archive bytes%%\n');
const PNG_BYTES = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d,
]);

describe('POST /api/contract-archives/[id]/complete', () => {
  it('409 NOT_UPLOADED when the object has not landed yet — row is kept', async () => {
    const { buyer, buyerWs } = await seedBuyerSession();
    const id = await seedPendingUpload({
      workspaceId: buyerWs.id,
      createdBy: buyer.id,
      documentSize: PDF_BYTES.length,
    });
    const r = await callComplete(id);
    expect(r.status).toBe(409);
    const body = (await r.json()) as { error: string };
    expect(body.error).toBe('NOT_UPLOADED');

    const repo = await getContractArchiveRepo();
    const row = await repo.findById(id);
    expect(row?.status).toBe('pending');
  });

  it('200 happy path — object present + magic bytes + size match → row flips to ready', async () => {
    const { buyer, buyerWs } = await seedBuyerSession();
    const id = await seedPendingUpload({
      workspaceId: buyerWs.id,
      createdBy: buyer.id,
      documentSize: PDF_BYTES.length,
    });
    await storage.save(uploadKey(id), PDF_BYTES, 'application/pdf');

    const r = await callComplete(id);
    expect(r.status).toBe(200);
    const body = (await r.json()) as { id: string };
    expect(body.id).toBe(id);

    const repo = await getContractArchiveRepo();
    const row = await repo.findById(id);
    expect(row?.status).toBe('ready');
  });

  it('415 MIME_MISMATCH when magic bytes are not PDF — object + row deleted', async () => {
    const { buyer, buyerWs } = await seedBuyerSession();
    const id = await seedPendingUpload({
      workspaceId: buyerWs.id,
      createdBy: buyer.id,
      documentSize: PNG_BYTES.length,
    });
    await storage.save(uploadKey(id), PNG_BYTES, 'application/pdf');

    const r = await callComplete(id);
    expect(r.status).toBe(415);
    const body = (await r.json()) as { error: string };
    expect(body.error).toBe('MIME_MISMATCH');

    const repo = await getContractArchiveRepo();
    expect(await repo.findById(id)).toBeUndefined();
    await expect(storage.head(uploadKey(id))).rejects.toMatchObject({
      code: 'ENOENT',
    });
  });

  it('400 SIZE_MISMATCH when declared size differs from the actual object — object + row deleted', async () => {
    const { buyer, buyerWs } = await seedBuyerSession();
    const id = await seedPendingUpload({
      workspaceId: buyerWs.id,
      createdBy: buyer.id,
      documentSize: PDF_BYTES.length + 999,
    });
    await storage.save(uploadKey(id), PDF_BYTES, 'application/pdf');

    const r = await callComplete(id);
    expect(r.status).toBe(400);
    const body = (await r.json()) as { error: string };
    expect(body.error).toBe('SIZE_MISMATCH');

    const repo = await getContractArchiveRepo();
    expect(await repo.findById(id)).toBeUndefined();
    await expect(storage.head(uploadKey(id))).rejects.toMatchObject({
      code: 'ENOENT',
    });
  });

  it('404 NOT_FOUND when the caller did not create the row (존재 오라클 회피)', async () => {
    const { buyerWs } = await seedBuyerSession();
    const otherUser = await seedUser(db, { email: 'other@buy.com' });
    const id = await seedPendingUpload({
      workspaceId: buyerWs.id,
      createdBy: otherUser.id,
      documentSize: PDF_BYTES.length,
    });
    await storage.save(uploadKey(id), PDF_BYTES, 'application/pdf');

    const r = await callComplete(id);
    // 403 이 아니라 404 — 형제 라우트가 문서화한 존재-오라클 회피 정책과 맞춘다.
    expect(r.status).toBe(404);
    const body = (await r.json()) as { error: string };
    expect(body.error).toBe('NOT_FOUND');
  });

  it('200 idempotent when the row is already ready — no storage re-check', async () => {
    const { buyer, buyerWs } = await seedBuyerSession();
    const id = await seedPendingUpload({
      workspaceId: buyerWs.id,
      createdBy: buyer.id,
      documentSize: PDF_BYTES.length,
    });
    const repo = await getContractArchiveRepo();
    expect(await repo.markUploadReady(id)).toBe(true);
    // No object saved to storage — if the route re-checked storage this
    // would 409, proving the ready fast-path skips it.

    const r = await callComplete(id);
    expect(r.status).toBe(200);
    const body = (await r.json()) as { id: string };
    expect(body.id).toBe(id);
  });
  // ── 인증 게이트 부인 테스트 ────────────────────────────────────────────────
  //
  // 이 라우트만 형제(presign·download)와 달리 부인 테스트가 없었다 — 모든 테스트가
  // 세션을 심고 게이트 mock 을 허용으로 고정한 채 한 번도 뒤집지 않아, 전문(preamble)
  // 네 줄을 통째로 지워도 스위트가 초록이었다.
  it('401 — 세션 없음', async () => {
    const res = await callComplete(randomUUID());
    expect(res.status).toBe(401);
  });

  it('403 — PG 멤버십 승인 게이트에 막힌 세션', async () => {
    const { buyer, buyerWs } = await seedBuyerSession();
    const id = await seedPendingUpload({
      workspaceId: buyerWs.id,
      createdBy: buyer.id,
      documentSize: PDF_BYTES.length,
    });
    isPgMembershipBlockedMock.mockResolvedValue(true);

    const res = await callComplete(id);

    expect(res.status).toBe(403);
  });

  // 이 라우트는 업로드 전용이다. 게이트가 없으면 서명 출처 행을 `ready` 로 전이시켜
  // documentKey 에 바이트가 없는 행이 완료된 것처럼 보이게 만들 수 있다.
  it('404 — 서명 출처 행은 이 라우트로 전이시킬 수 없다', async () => {
    const { buyer, buyerWs } = await seedBuyerSession();
    const id = randomUUID();
    await db.insert(contractArchives).values({
      id,
      workspaceId: buyerWs.id,
      source: 'signing',
      title: '서명 보관본',
      status: 'pending',
      createdBy: buyer.id,
    });

    const res = await callComplete(id);

    expect(res.status).toBe(404);
    const repo = await getContractArchiveRepo();
    expect((await repo.findById(id))?.status).toBe('pending');
  });

  it('404 — uuid 가 아닌 경로 파라미터는 500 이 아니라 404', async () => {
    await seedBuyerSession();
    const res = await callComplete('not-a-uuid');
    expect(res.status).toBe(404);
  });
});
