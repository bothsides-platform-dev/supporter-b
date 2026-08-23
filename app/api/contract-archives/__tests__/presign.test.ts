/**
 * @vitest-environment node
 */
// POST /api/contract-archives/presign — 계약 보관함 수동 업로드 2-phase, phase 1
// (pending 행 생성 + presigned PUT URL 발급).
//
// attachments presign(`app/api/files/presign/__tests__`)과 하네스는 동일하되
// 차이점: 메타(title 등)를 여기서 함께 받고(NOT NULL 이 pending 부터 성립),
// PDF 전용이며 워크스페이스당 업로드 200건 캡 + PG 멤버십 게이트가 추가된다.
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

async function callPresign(body: unknown) {
  const { POST } = await import('../presign/route');
  const req = new Request('http://localhost/api/contract-archives/presign', {
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

describe('POST /api/contract-archives/presign', () => {
  it('401 when unauthenticated', async () => {
    const r = await callPresign({ name: 'a.pdf', size: 100, title: '계약서' });
    expect(r.status).toBe(401);
  });

  it('200 happy path — pending row inserted (source=upload, documentKey=contract-archives/upload/<id>), uploadUrl returned', async () => {
    const { buyer, buyerWs } = await seedBuyerSession();
    const presignSpy = vi.spyOn(storage, 'presignPut');
    const r = await callPresign({
      name: 'contract.pdf',
      size: 1234,
      title: '2026년 결제대행 계약서',
      counterpartyName: '토스페이먼츠',
      contractedAt: '2026-01-15',
    });
    expect(r.status).toBe(200);
    const body = (await r.json()) as { id: string; uploadUrl: string };
    expect(body.id).toBeTruthy();
    expect(body.uploadUrl).toContain('memory://put/');

    expect(presignSpy).toHaveBeenCalledWith(
      `contract-archives/upload/${body.id}`,
      expect.objectContaining({ mime: 'application/pdf', size: 1234 }),
    );

    const repo = await getContractArchiveRepo();
    const row = await repo.findById(body.id);
    expect(row?.status).toBe('pending');
    expect(row?.source).toBe('upload');
    expect(row?.documentKey).toBe(`contract-archives/upload/${body.id}`);
    expect(row?.workspaceId).toBe(buyerWs.id);
    expect(row?.createdBy).toBe(buyer.id);
    expect(row?.title).toBe('2026년 결제대행 계약서');
    expect(row?.counterpartyName).toBe('토스페이먼츠');
    expect(row?.documentName).toBe('contract.pdf');
    expect(row?.documentSize).toBe(1234);
  });

  it('400 INVALID_INPUT when title is missing', async () => {
    await seedBuyerSession();
    const r = await callPresign({ name: 'a.pdf', size: 100 });
    expect(r.status).toBe(400);
    const body = (await r.json()) as { error: string };
    expect(body.error).toBe('INVALID_INPUT');
  });

  it('413 FILE_TOO_LARGE when size exceeds 30MB', async () => {
    await seedBuyerSession();
    const r = await callPresign({
      name: 'a.pdf',
      size: 30 * 1024 * 1024 + 1,
      title: '계약서',
    });
    expect(r.status).toBe(413);
    const body = (await r.json()) as { error: string };
    expect(body.error).toBe('FILE_TOO_LARGE');
  });

  it('403 UPLOAD_LIMIT when workspace already has 200 upload rows', async () => {
    const { buyer, buyerWs } = await seedBuyerSession();
    const repo = await getContractArchiveRepo();
    for (let i = 0; i < 200; i++) {
      await repo.insertPendingUpload({
        id: randomUUID(),
        workspaceId: buyerWs.id,
        title: `기존 계약 ${i}`,
        documentKey: `contract-archives/upload/seed-${i}`,
        documentName: 'seed.pdf',
        documentSize: 10,
        createdBy: buyer.id,
      });
    }
    const r = await callPresign({ name: 'a.pdf', size: 100, title: '새 계약서' });
    expect(r.status).toBe(403);
    const body = (await r.json()) as { error: string };
    expect(body.error).toBe('UPLOAD_LIMIT');
  });

  it('403 FORBIDDEN when PG membership is blocked', async () => {
    await seedBuyerSession();
    isPgMembershipBlockedMock.mockResolvedValueOnce(true);
    const r = await callPresign({ name: 'a.pdf', size: 100, title: '계약서' });
    expect(r.status).toBe(403);
    const body = (await r.json()) as { error: string };
    expect(body.error).toBe('FORBIDDEN');
  });
});
