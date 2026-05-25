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
  requireBuyerSession: () => {
    if (!sessionRef.value) return Promise.reject(new Error('FORBIDDEN_BUYER'));
    return Promise.resolve(sessionRef.value);
  },
  requirePgSession: () => {
    if (!sessionRef.value) return Promise.reject(new Error('FORBIDDEN_PG'));
    return Promise.resolve(sessionRef.value);
  },
}));

import { searchBidsAction } from '../searchBidsAction';

let db: PgliteDB;

beforeEach(async () => {
  db = await setupRfpActionEnv();
  sessionRef.value = null;
});

afterEach(() => {
  teardownRfpActionEnv();
});

// Returns the RFP's uuid id (FK target). `code` is the human display id.
async function seedRfp(opts: {
  code: string;
  buyerWsId: string;
  title: string;
  createdBy: string;
}): Promise<string> {
  const id = randomUUID();
  await db.insert(rfps).values({
    id,
    code: opts.code,
    buyerWsId: opts.buyerWsId,
    title: opts.title,
    memo: '',
    deadline: new Date(Date.now() + 86_400_000),
    status: 'sent',
    createdBy: opts.createdBy,
    sentAt: new Date(),
  });
  return id;
}

async function seedBid(opts: {
  rfpId: string;
  pgWsId: string;
  invitationId: string;
  submittedBy: string;
  status?: 'draft' | 'submitted' | 'withdrawn';
  memo?: string | null;
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
    status: opts.status ?? 'submitted',
    submittedBy: opts.submittedBy,
    submittedAt: new Date(),
  });
  return bidId;
}

async function seedInvitation(opts: {
  rfpId: string;
  pgWsId: string;
}) {
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

describe('searchBidsAction', () => {
  it('비인증 상태에서 빈 배열 반환', async () => {
    sessionRef.value = null;
    const result = await searchBidsAction();
    expect(result).toEqual([]);
  });

  it('buyer: 자신의 RFP에 달린 submitted 제안서를 PG사명·메모와 함께 반환', async () => {
    const buyer = await seedUser(db, { email: 'buyer@co.com' });
    const buyerWs = await seedBuyerWorkspace(db);
    await seedMembership(db, buyerWs.id, buyer.id, 'admin');

    const pgWs = await seedPgWorkspace(db, 'toss.im', { name: '서포터 B 페이' });
    const pgUser = await seedUser(db, { email: 'pg@toss.im' });
    await seedMembership(db, pgWs.id, pgUser.id, 'admin');

    const rfpId = await seedRfp({ code: 'P-2605-0001', buyerWsId: buyerWs.id, title: '수수료 문의', createdBy: buyer.id });
    const invId = await seedInvitation({ rfpId, pgWsId: pgWs.id });
    await seedBid({ rfpId, pgWsId: pgWs.id, invitationId: invId, submittedBy: pgUser.id, memo: '정산 협의 가능' });

    sessionRef.value = { user: { id: buyer.id, workspaceId: buyerWs.id, workspaceType: 'buyer', role: 'admin' } };

    const result = await searchBidsAction();

    expect(result).toHaveLength(1);
    expect(result[0].rfpTitle).toBe('수수료 문의');
    expect(result[0].pgWsName).toBe('서포터 B 페이');
    expect(result[0].memo).toBe('정산 협의 가능');
    expect(result[0].href).toBe('/rfp/P-2605-0001');
  });

  it('buyer: draft·withdrawn 제안서는 제외', async () => {
    const buyer = await seedUser(db, { email: 'buyer@co.com' });
    const buyerWs = await seedBuyerWorkspace(db);
    await seedMembership(db, buyerWs.id, buyer.id, 'admin');

    const pgWs = await seedPgWorkspace(db, 'toss.im', { name: '서포터 B 페이' });
    const pgUser = await seedUser(db, { email: 'pg@toss.im' });
    await seedMembership(db, pgWs.id, pgUser.id, 'admin');

    const rfpId = await seedRfp({ code: 'P-2605-0002', buyerWsId: buyerWs.id, title: 'Draft Test', createdBy: buyer.id });
    const invId = await seedInvitation({ rfpId, pgWsId: pgWs.id });
    await seedBid({ rfpId, pgWsId: pgWs.id, invitationId: invId, submittedBy: pgUser.id, status: 'draft' });

    sessionRef.value = { user: { id: buyer.id, workspaceId: buyerWs.id, workspaceType: 'buyer', role: 'admin' } };

    const result = await searchBidsAction();
    expect(result).toHaveLength(0);
  });

  it('pg: 자신이 제출한 제안서를 /inbox/[rfpId] href와 함께 반환', async () => {
    const buyer = await seedUser(db, { email: 'buyer@co.com' });
    const buyerWs = await seedBuyerWorkspace(db);
    await seedMembership(db, buyerWs.id, buyer.id, 'admin');

    const pgWs = await seedPgWorkspace(db, 'kakao.com', { name: '카카오페이' });
    const pgUser = await seedUser(db, { email: 'sales@kakao.com' });
    await seedMembership(db, pgWs.id, pgUser.id, 'admin');

    const rfpId = await seedRfp({ code: 'P-2605-0003', buyerWsId: buyerWs.id, title: 'PG Test RFP', createdBy: buyer.id });
    const invId = await seedInvitation({ rfpId, pgWsId: pgWs.id });
    await seedBid({ rfpId, pgWsId: pgWs.id, invitationId: invId, submittedBy: pgUser.id });

    sessionRef.value = { user: { id: pgUser.id, workspaceId: pgWs.id, workspaceType: 'pg', role: 'admin' } };

    const result = await searchBidsAction();

    expect(result).toHaveLength(1);
    expect(result[0].rfpTitle).toBe('PG Test RFP');
    expect(result[0].href).toBe('/inbox/P-2605-0003');
  });
});
