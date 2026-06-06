import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { bids, rfpInvitations, rfps } from '@/lib/db/schema';
import {
  seedBuyerWorkspace,
  seedPgWorkspace,
  seedUser,
  seedMembership,
} from '@/lib/server/repositories/drizzle/__tests__/_seed';
import {
  setupRfpActionEnv,
  teardownRfpActionEnv,
} from '../../rfp/__tests__/_setup';
import type { PgliteDB } from '@/lib/db/client-pglite';

const sessionRef: {
  value: {
    user: {
      id: string;
      workspaceId: string;
      workspaceType: 'buyer' | 'pg';
      role: 'admin';
    };
  } | null;
} = { value: null };

vi.mock('@/lib/auth/session', () => ({
  requireSession: () => {
    if (!sessionRef.value) return Promise.reject(new Error('UNAUTHENTICATED'));
    return Promise.resolve(sessionRef.value);
  },
}));

import { searchEntitiesAction } from '../searchEntitiesAction';

let db: PgliteDB;

beforeEach(async () => {
  db = await setupRfpActionEnv();
  sessionRef.value = null;
});

afterEach(() => {
  teardownRfpActionEnv();
});

async function seedRfp(opts: {
  code: string;
  buyerWsId: string;
  title: string;
  createdBy: string;
  memo?: string;
}): Promise<string> {
  const id = randomUUID();
  await db.insert(rfps).values({
    id,
    code: opts.code,
    buyerWsId: opts.buyerWsId,
    title: opts.title,
    memo: opts.memo ?? '',
    deadline: new Date(Date.now() + 86_400_000),
    status: 'sent',
    createdBy: opts.createdBy,
    sentAt: new Date(),
  });
  return id;
}

async function seedInvitation(opts: { rfpId: string; pgWsId: string }) {
  const id = randomUUID();
  await db.insert(rfpInvitations).values({
    id,
    rfpId: opts.rfpId,
    pgWsId: opts.pgWsId,
    tokenHash: randomUUID(),
    sentAt: new Date(),
    expiresAt: new Date(Date.now() + 86_400_000),
    status: 'accepted',
  });
  return id;
}

async function seedBid(opts: {
  rfpId: string;
  pgWsId: string;
  invitationId: string;
  submittedBy: string;
  memo?: string;
  submittedAt?: Date;
}) {
  const bidId = randomUUID();
  await db.insert(bids).values({
    id: bidId,
    rfpId: opts.rfpId,
    pgWsId: opts.pgWsId,
    invitationId: opts.invitationId,
    settleCycle: 'D+1',
    settleLimit: '0',
    guaranteeInsurance: '0',
    paymentFees: {},
    memo: opts.memo ?? '',
    status: 'submitted',
    submittedBy: opts.submittedBy,
    submittedAt: opts.submittedAt ?? new Date(),
  });
  return bidId;
}

async function seedBuyer() {
  const buyer = await seedUser(db, { email: 'buyer@co.com' });
  const buyerWs = await seedBuyerWorkspace(db);
  await seedMembership(db, buyerWs.id, buyer.id, 'admin');
  return { buyer, buyerWs };
}

describe('searchEntitiesAction — guards', () => {
  it('비인증이면 빈 그룹', async () => {
    sessionRef.value = null;
    expect(await searchEntitiesAction('수수료')).toEqual({
      rfps: [],
      bids: [],
      opportunities: [],
    });
  });

  it('빈/공백 쿼리는 DB 조회 없이 빈 그룹', async () => {
    const { buyer, buyerWs } = await seedBuyer();
    await seedRfp({ code: 'P-2605-0001', buyerWsId: buyerWs.id, title: '수수료 문의', createdBy: buyer.id });
    sessionRef.value = { user: { id: buyer.id, workspaceId: buyerWs.id, workspaceType: 'buyer', role: 'admin' } };

    expect(await searchEntitiesAction('')).toEqual({ rfps: [], bids: [], opportunities: [] });
    expect(await searchEntitiesAction('   ')).toEqual({ rfps: [], bids: [], opportunities: [] });
  });
});

describe('searchEntitiesAction — buyer RFP search', () => {
  it('제목 부분일치로 RFP를 경량 투영으로 반환', async () => {
    const { buyer, buyerWs } = await seedBuyer();
    await seedRfp({ code: 'P-2605-0001', buyerWsId: buyerWs.id, title: '수수료 인하 문의', createdBy: buyer.id });
    await seedRfp({ code: 'P-2605-0002', buyerWsId: buyerWs.id, title: '전혀 다른 건', createdBy: buyer.id });
    sessionRef.value = { user: { id: buyer.id, workspaceId: buyerWs.id, workspaceType: 'buyer', role: 'admin' } };

    const { rfps: found } = await searchEntitiesAction('수수료');
    expect(found).toHaveLength(1);
    expect(found[0]).toEqual({
      code: 'P-2605-0001',
      title: '수수료 인하 문의',
      memo: '',
      status: 'sent',
      href: '/rfp/P-2605-0001',
    });
  });

  it('메모 부분일치로도 검색', async () => {
    const { buyer, buyerWs } = await seedBuyer();
    await seedRfp({ code: 'P-2605-0003', buyerWsId: buyerWs.id, title: '제목', createdBy: buyer.id, memo: '긴급 정산 협의' });
    sessionRef.value = { user: { id: buyer.id, workspaceId: buyerWs.id, workspaceType: 'buyer', role: 'admin' } };

    const { rfps: found } = await searchEntitiesAction('정산');
    expect(found.map((r: { code: string }) => r.code)).toEqual(['P-2605-0003']);
  });

  it('escapeIlike: % 를 리터럴로 매칭 (와일드카드로 새지 않음)', async () => {
    const { buyer, buyerWs } = await seedBuyer();
    await seedRfp({ code: 'P-2605-0010', buyerWsId: buyerWs.id, title: '수수료 50% 인하', createdBy: buyer.id });
    await seedRfp({ code: 'P-2605-0011', buyerWsId: buyerWs.id, title: '수수료 5000 인하', createdBy: buyer.id });
    sessionRef.value = { user: { id: buyer.id, workspaceId: buyerWs.id, workspaceType: 'buyer', role: 'admin' } };

    const { rfps: found } = await searchEntitiesAction('50%');
    expect(found.map((r: { code: string }) => r.code)).toEqual(['P-2605-0010']);
  });

  it('다른 워크스페이스의 RFP는 검색되지 않음', async () => {
    const { buyer, buyerWs } = await seedBuyer();
    const other = await seedUser(db, { email: 'other@co.com' });
    const otherWs = await seedBuyerWorkspace(db, { name: '다른구매사' });
    await seedMembership(db, otherWs.id, other.id, 'admin');
    await seedRfp({ code: 'P-2605-0020', buyerWsId: otherWs.id, title: '수수료 남의것', createdBy: other.id });
    sessionRef.value = { user: { id: buyer.id, workspaceId: buyerWs.id, workspaceType: 'buyer', role: 'admin' } };

    const { rfps: found } = await searchEntitiesAction('수수료');
    expect(found).toHaveLength(0);
  });
});

describe('searchEntitiesAction — bids search', () => {
  it('buyer: 제목/PG사명/메모 매칭 + submittedAt 최신순', async () => {
    const { buyer, buyerWs } = await seedBuyer();
    const pgWs = await seedPgWorkspace(db, 'toss.im', { name: '토스페이먼츠' });
    const pgUser = await seedUser(db, { email: 'pg@toss.im' });
    await seedMembership(db, pgWs.id, pgUser.id, 'admin');

    // 같은 (rfp, pg) 쌍은 bid UNIQUE 라 서로 다른 RFP 2개로 정렬을 검증한다.
    const oldRfp = await seedRfp({ code: 'P-2605-0030', buyerWsId: buyerWs.id, title: '수수료 협의 A', createdBy: buyer.id });
    const oldInv = await seedInvitation({ rfpId: oldRfp, pgWsId: pgWs.id });
    await seedBid({ rfpId: oldRfp, pgWsId: pgWs.id, invitationId: oldInv, submittedBy: pgUser.id, memo: '오래된 제안', submittedAt: new Date(Date.now() - 10_000) });

    const newRfp = await seedRfp({ code: 'P-2605-0031', buyerWsId: buyerWs.id, title: '수수료 협의 B', createdBy: buyer.id });
    const newInv = await seedInvitation({ rfpId: newRfp, pgWsId: pgWs.id });
    await seedBid({ rfpId: newRfp, pgWsId: pgWs.id, invitationId: newInv, submittedBy: pgUser.id, memo: '최신 제안', submittedAt: new Date() });

    sessionRef.value = { user: { id: buyer.id, workspaceId: buyerWs.id, workspaceType: 'buyer', role: 'admin' } };

    const { bids: found } = await searchEntitiesAction('수수료');
    expect(found).toHaveLength(2);
    expect(found[0].memo).toBe('최신 제안'); // newest first
    expect(found[0].pgWsName).toBe('토스페이먼츠');
    expect(found[0].href).toBe('/rfp/P-2605-0031');
  });

  it('pg: 제출 bids를 /inbox href로 반환', async () => {
    const { buyer, buyerWs } = await seedBuyer();
    const pgWs = await seedPgWorkspace(db, 'kakao.com', { name: '카카오페이' });
    const pgUser = await seedUser(db, { email: 'sales@kakao.com' });
    await seedMembership(db, pgWs.id, pgUser.id, 'admin');

    const rfpId = await seedRfp({ code: 'P-2605-0040', buyerWsId: buyerWs.id, title: '정산 한도 검토', createdBy: buyer.id });
    const invId = await seedInvitation({ rfpId, pgWsId: pgWs.id });
    await seedBid({ rfpId, pgWsId: pgWs.id, invitationId: invId, submittedBy: pgUser.id });

    sessionRef.value = { user: { id: pgUser.id, workspaceId: pgWs.id, workspaceType: 'pg', role: 'admin' } };

    const { bids: found } = await searchEntitiesAction('정산');
    expect(found).toHaveLength(1);
    expect(found[0].href).toBe('/inbox/P-2605-0040');
  });
});

describe('searchEntitiesAction — pg opportunities search', () => {
  it('공개 보드 RFP를 제목으로 검색, 화이트리스트 필드만 노출', async () => {
    const { buyer, buyerWs } = await seedBuyer();
    await seedRfp({ code: 'P-2605-0050', buyerWsId: buyerWs.id, title: '신규 수수료 입찰', createdBy: buyer.id, memo: '민감메모' });

    const pgWs = await seedPgWorkspace(db, 'nice.co', { name: '나이스페이' });
    const pgUser = await seedUser(db, { email: 'pg@nice.co' });
    await seedMembership(db, pgWs.id, pgUser.id, 'admin');

    sessionRef.value = { user: { id: pgUser.id, workspaceId: pgWs.id, workspaceType: 'pg', role: 'admin' } };

    const { opportunities } = await searchEntitiesAction('수수료');
    expect(opportunities).toHaveLength(1);
    const opp = opportunities[0];
    expect(opp.title).toBe('신규 수수료 입찰');
    expect(opp.rfpCode).toBe('P-2605-0050');
    // 화이트리스트 경계: 민감 필드가 절대 새지 않는다
    expect(Object.keys(opp).sort()).toEqual(
      ['buyerName', 'href', 'rfpCode', 'title', 'websiteUrl'].sort(),
    );
    expect(JSON.stringify(opp)).not.toContain('민감메모');
  });

  it('buyer는 opportunities 그룹이 비어있음', async () => {
    const { buyer, buyerWs } = await seedBuyer();
    await seedRfp({ code: 'P-2605-0060', buyerWsId: buyerWs.id, title: '수수료', createdBy: buyer.id });
    sessionRef.value = { user: { id: buyer.id, workspaceId: buyerWs.id, workspaceType: 'buyer', role: 'admin' } };

    const { opportunities } = await searchEntitiesAction('수수료');
    expect(opportunities).toEqual([]);
  });
});
