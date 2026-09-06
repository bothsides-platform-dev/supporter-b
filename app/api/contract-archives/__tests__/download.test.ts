/**
 * @vitest-environment node
 */
// GET /api/contract-archives/[id]/download?doc=document|audit
//
// `app/api/files/[id]/route.ts`(첨부 다운로드)의 미러 — ACL 재검증 후 302 로
// presigned R2 GET 에 넘긴다. 로컬로 바이트를 흘리지 않는다.
//
// 차이점: ACL 의 SSOT 가 **행 소유 워크스페이스**다(첨부는 소유 애그리거트를 타고
// 올라간다). 그리고 신규 /api 라우트이므로 `isPgMembershipBlocked` 인라인 게이트가
// 붙는다(v0.4.20.0 잔여 홀을 늘리지 않는다).
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
import { __resetStorageForTest, __setStorageForTest } from '@/lib/server/storage';
import { InMemoryStorage } from '@/lib/server/storage/memory';
import { archiveUploadKey as uploadKey } from '@/lib/contract-archive/storage-key';

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
const isPgMembershipBlockedMock = vi.hoisted(() => vi.fn(async (..._args: unknown[]) => false));
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

async function callDownload(id: string, doc?: string) {
  const { GET } = await import('../[id]/download/route');
  const qs = doc === undefined ? '' : `?doc=${doc}`;
  const req = new Request(`http://localhost/api/contract-archives/${id}/download${qs}`);
  return GET(req, { params: Promise.resolve({ id }) });
}

async function seedBuyerSession() {
  const buyer = await seedUser(db, { email: `buyer-${randomUUID().slice(0, 6)}@buy.com` });
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

async function seedReadyUpload(workspaceId: string, createdBy: string) {
  const id = randomUUID();
  const repo = await getContractArchiveRepo();
  await repo.insertPendingUploadWithinCap({
    id,
    workspaceId,
    title: '계약서',
    documentKey: uploadKey(id),
    documentName: '계약서.pdf',
    documentSize: 1234,
    createdBy,
  }, 1000);
  await repo.markUploadReady(id);
  return id;
}

describe('GET /api/contract-archives/[id]/download', () => {
  it('302 로 presigned GET 에 넘긴다 — 바이트를 흘리지 않는다', async () => {
    const { buyer, buyerWs } = await seedBuyerSession();
    const id = await seedReadyUpload(buyerWs.id, buyer.id);

    const res = await callDownload(id, 'document');

    expect(res.status).toBe(302);
    expect(decodeURIComponent(res.headers.get('location') ?? '')).toContain(uploadKey(id));
    // 302 자체는 캐시되면 안 된다 — ACL 은 매 요청 재검증해야 한다.
    expect(res.headers.get('cache-control')).toBe('private, no-store');
  });

  it('doc 파라미터가 없으면 완료본으로 본다', async () => {
    const { buyer, buyerWs } = await seedBuyerSession();
    const id = await seedReadyUpload(buyerWs.id, buyer.id);

    const res = await callDownload(id);

    expect(res.status).toBe(302);
  });

  it('알 수 없는 doc 값은 400 — 조용히 완료본으로 떨어뜨리지 않는다', async () => {
    const { buyer, buyerWs } = await seedBuyerSession();
    const id = await seedReadyUpload(buyerWs.id, buyer.id);

    const res = await callDownload(id, 'secrets');

    expect(res.status).toBe(400);
  });

  it('401 — 세션 없음', async () => {
    const res = await callDownload(randomUUID(), 'document');
    expect(res.status).toBe(401);
  });

  it('403 — PG 멤버십 승인 게이트에 막힌 세션', async () => {
    const { buyer, buyerWs } = await seedBuyerSession();
    const id = await seedReadyUpload(buyerWs.id, buyer.id);
    isPgMembershipBlockedMock.mockResolvedValue(true);

    const res = await callDownload(id, 'document');

    expect(res.status).toBe(403);
  });

  it('404 — 다른 워크스페이스의 행(존재 오라클 회피)', async () => {
    const owner = await seedUser(db, { email: `owner-${randomUUID().slice(0, 6)}@x.com` });
    const ownerWs = await seedBuyerWorkspace(db, { bizProfileId: (await seedBizProfile(db)).id });
    await seedMembership(db, ownerWs.id, owner.id, 'admin');
    const id = await seedReadyUpload(ownerWs.id, owner.id);
    // 세션은 **다른** 워크스페이스다.
    await seedBuyerSession();

    const res = await callDownload(id, 'document');

    expect(res.status).toBe(404);
  });

  it('인증서가 없는 행의 audit 요청은 404 — 완료본으로 폴백하지 않는다', async () => {
    const { buyer, buyerWs } = await seedBuyerSession();
    const id = await seedReadyUpload(buyerWs.id, buyer.id);

    const res = await callDownload(id, 'audit');

    expect(res.status).toBe(404);
  });
  // pending 은 R2 에 바이트가 아직 없다 — 404 로 뭉개면 재시도하면 되는 상태가
  // 영구 부재로 읽힌다. 모든 행이 pending 으로 태어나므로 가장 흔한 비-해피 경로다.
  it('409 — 보관 준비 중(pending)은 404 가 아니다', async () => {
    const { buyer, buyerWs } = await seedBuyerSession();
    const id = randomUUID();
    const repo = await getContractArchiveRepo();
    await repo.insertPendingUploadWithinCap({
      id,
      workspaceId: buyerWs.id,
      title: '계약서',
      documentKey: uploadKey(id),
      documentName: '계약서.pdf',
      documentSize: 1234,
      createdBy: buyer.id,
    }, 1000); // markUploadReady 하지 않는다

    const res = await callDownload(id, 'document');

    expect(res.status).toBe(409);
  });

  it('404 — uuid 가 아닌 경로 파라미터는 500 이 아니라 404', async () => {
    await seedBuyerSession();
    const res = await callDownload('not-a-uuid', 'document');
    expect(res.status).toBe(404);
  });

  // 이 링크는 새 탭에서 열린다 — 실패 응답이 팝업에 그대로 보이므로 JSON 이 아니라
  // 사람이 읽는 한글 페이지여야 한다.
  it('실패 응답은 JSON 이 아니라 한글 HTML 페이지다', async () => {
    const { buyer, buyerWs } = await seedBuyerSession();
    const id = await seedReadyUpload(buyerWs.id, buyer.id);

    const res = await callDownload(id, 'audit'); // 인증서 없음 → 404

    expect(res.headers.get('content-type')).toContain('text/html');
    const body = await res.text();
    expect(body).not.toContain('ARCHIVE_DOC_NOT_FOUND');
    expect(body).toContain('그 문서는 이 계약서에 없어요.');
  });
});
