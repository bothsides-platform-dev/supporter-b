// rfp-detail-loader — 전자서명(SigningView) 로드 경로.
//   - loadBuyerRfpDetail: 구매사는 자기 RFP 계약을 항상 본다.
//   - loadPgRfpDetail: 낙찰 PG(awardedToMe)만 본다 — 미낙찰 PG는 null(봉인 경계).
//   - 진행 중(sent/in_progress + providerRef) 계약은 진입 시 lazy reconcile(best-effort).
// 컨벤션: contract-signing.test.ts / rfp-detail-loader.test.ts 와 동일 — pglite + seed.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';

import { bids, pgSigningTemplates, rfpInvitations, rfps } from '@/lib/db/schema';
import { createPgliteDb, type PgliteDB } from '@/lib/db/client-pglite';
import {
  __resetForTest,
  __useDrizzleWithDbForTest,
  getSigningContractRepo,
} from '@/lib/server/repositories/factory';
import {
  seedBuyerWorkspace,
  seedMembership,
  seedPgWorkspace,
  seedRfp,
  seedUser,
} from '@/lib/server/repositories/drizzle/__tests__/_seed';
import {
  __resetContractSigningServiceForTest,
  __setContractSigningServiceForTest,
  type ContractSigningService,
} from '@/lib/server/services/contract-signing';
import type { SigningContract, SigningParticipant } from '@/lib/types/signing';
import { loadBuyerRfpDetail, loadPgRfpDetail } from '../rfp-detail-loader';

let db: PgliteDB;
let reconcileSpy: ReturnType<typeof vi.fn>;

type Env = {
  buyerId: string;
  buyerWsId: string;
  pgUserId: string;
  pgWsId: string;
  rfpId: string;
  rfpCode: string;
  bidId: string;
};

/** 낙찰(awarded) RFP + 초대(accepted) + 제출 bid 를 심고 신원을 반환. */
async function seedAwarded(): Promise<Env> {
  const buyer = await seedUser(db, { email: `buyer-${randomUUID().slice(0, 6)}@x.com`, name: '김구매' });
  const buyerWs = await seedBuyerWorkspace(db, { name: '구매사' });
  await seedMembership(db, buyerWs.id, buyer.id, 'admin');

  const pgUser = await seedUser(db, { email: `pg-${randomUUID().slice(0, 6)}@x.com`, name: '이대행' });
  const pgWs = await seedPgWorkspace(db, `pg-${randomUUID().slice(0, 6)}.io`);
  await seedMembership(db, pgWs.id, pgUser.id, 'admin');

  const rfp = await seedRfp(db, { buyerWsId: buyerWs.id, createdBy: buyer.id });
  const invId = randomUUID();
  await db.insert(rfpInvitations).values({
    id: invId,
    rfpId: rfp.id,
    pgWsId: pgWs.id,
    tokenHash: randomUUID(),
    sentAt: new Date(),
    expiresAt: new Date(Date.now() + 86_400_000 * 7),
    status: 'accepted',
  });
  const bidId = randomUUID();
  await db.insert(bids).values({
    id: bidId,
    rfpId: rfp.id,
    pgWsId: pgWs.id,
    invitationId: invId,
    settleCycle: 'D+2',
    settleLimit: '0',
    guaranteeInsurance: '0',
    paymentFees: {},
    status: 'submitted',
    submittedBy: pgUser.id,
    submittedAt: new Date(),
  });
  await db.update(rfps).set({ status: 'awarded', awardedBidId: bidId }).where(eq(rfps.id, rfp.id));

  return {
    buyerId: buyer.id,
    buyerWsId: buyerWs.id,
    pgUserId: pgUser.id,
    pgWsId: pgWs.id,
    rfpId: rfp.id,
    rfpCode: rfp.code,
    bidId,
  };
}

async function seedContract(
  env: Env,
  over: Partial<SigningContract> = {},
  participants: SigningParticipant[] = [],
): Promise<string> {
  const id = over.id ?? randomUUID();
  const repo = await getSigningContractRepo();
  await repo.create(
    {
      id,
      rfpId: env.rfpId,
      status: 'in_progress',
      round: 1,
      createdBy: env.buyerId,
      createdAt: new Date().toISOString(),
      providerRef: 'ct_x',
      lastPolledAt: new Date().toISOString(),
      ...over,
    },
    participants.map((p) => ({ ...p, contractId: id })),
  );
  return id;
}

function part(role: 'buyer' | 'pg', over: Partial<SigningParticipant> = {}): SigningParticipant {
  return {
    id: randomUUID(),
    contractId: 'c',
    name: role === 'buyer' ? '김구매' : '이대행',
    email: `${role}@x.com`,
    role,
    securityMethod: 'easy_cert',
    status: 'pending',
    ...over,
  };
}

beforeEach(async () => {
  __resetForTest();
  __resetContractSigningServiceForTest();
  db = await createPgliteDb();
  await __useDrizzleWithDbForTest(db);
  reconcileSpy = vi.fn(async () => {});
  __setContractSigningServiceForTest({
    reconcileIfStale: reconcileSpy,
  } as unknown as ContractSigningService);
});
afterEach(() => {
  __resetForTest();
  __resetContractSigningServiceForTest();
});

describe('loadBuyerRfpDetail — signing', () => {
  it('awarded RFP 에 진행 중 계약이 있으면 SigningView 를 내려준다', async () => {
    const env = await seedAwarded();
    const cId = await seedContract(env, {}, [
      part('buyer', { status: 'signed', signedAt: new Date().toISOString() }),
      part('pg', { status: 'pending' }),
    ]);

    const data = await loadBuyerRfpDetail({
      code: env.rfpCode,
      workspaceId: env.buyerWsId,
      userId: env.buyerId,
      userName: '김구매',
    });
    expect(data?.signing?.contract.id).toBe(cId);
    expect(data?.signing?.contract.status).toBe('in_progress');
    expect(data?.signing?.participants).toHaveLength(2);
    // 진행 중 + providerRef → 진입 lazy reconcile 호출.
    expect(reconcileSpy).toHaveBeenCalledWith(cId);
  });

  it('계약이 없으면 signing 은 null 이고 reconcile 하지 않는다', async () => {
    const env = await seedAwarded();
    const data = await loadBuyerRfpDetail({
      code: env.rfpCode,
      workspaceId: env.buyerWsId,
      userId: env.buyerId,
      userName: '김구매',
    });
    expect(data?.signing).toBeNull();
    expect(reconcileSpy).not.toHaveBeenCalled();
  });

  it('awaiting_pg_template(providerRef 없음)은 reconcile 없이 그대로 내려준다', async () => {
    const env = await seedAwarded();
    await seedContract(env, { status: 'awaiting_pg_template', providerRef: undefined, lastPolledAt: undefined }, []);
    const data = await loadBuyerRfpDetail({
      code: env.rfpCode,
      workspaceId: env.buyerWsId,
      userId: env.buyerId,
      userName: '김구매',
    });
    expect(data?.signing?.contract.status).toBe('awaiting_pg_template');
    expect(reconcileSpy).not.toHaveBeenCalled();
  });
});

describe('loadPgRfpDetail — signing (ACL)', () => {
  it('낙찰 PG 는 SigningView 를 본다', async () => {
    const env = await seedAwarded();
    const cId = await seedContract(env, {}, [part('buyer'), part('pg')]);
    const data = await loadPgRfpDetail({ code: env.rfpCode, workspaceId: env.pgWsId });
    expect(data?.awardedToMe).toBe(true);
    expect(data?.signing?.contract.id).toBe(cId);
  });

  it('미낙찰(초대만 된) PG 는 signing 을 절대 못 본다 — null', async () => {
    const env = await seedAwarded();
    await seedContract(env, {}, [part('buyer'), part('pg')]);

    // 같은 RFP 에 초대만 된 제2 PG (미낙찰).
    const other = await seedPgWorkspace(db, `other-${randomUUID().slice(0, 6)}.io`);
    await db.insert(rfpInvitations).values({
      id: randomUUID(),
      rfpId: env.rfpId,
      pgWsId: other.id,
      tokenHash: randomUUID(),
      sentAt: new Date(),
      expiresAt: new Date(Date.now() + 86_400_000 * 7),
      status: 'accepted',
    });

    const data = await loadPgRfpDetail({ code: env.rfpCode, workspaceId: other.id });
    expect(data?.awardedToMe).toBe(false);
    expect(data?.signing).toBeNull();
    expect(reconcileSpy).not.toHaveBeenCalled();
  });
});

// 견적별 계약서 템플릿 — PG 페이로드에만 실린다.
describe('rfp-detail-loader — 계약서 템플릿 (봉인 경계)', () => {
  async function seedTemplate(env: Env, name = '표준 가맹계약서') {
    const id = randomUUID();
    await db.insert(pgSigningTemplates).values({
      id,
      workspaceId: env.pgWsId,
      snowsignTemplateId: `tmpl_${id.slice(0, 8)}`,
      name,
      roleMapping: { 구매사: 'buyer', PG: 'pg' },
      createdBy: env.pgUserId,
    });
    return id;
  }

  it('PG 는 자기 워크스페이스 계약서 템플릿 목록을 받는다', async () => {
    const env = await seedAwarded();
    const templateId = await seedTemplate(env);

    const data = await loadPgRfpDetail({ code: env.rfpCode, workspaceId: env.pgWsId });
    expect(data?.signingTemplates).toEqual([{ id: templateId, name: '표준 가맹계약서' }]);
  });

  it('낙찰 견적이 고른 계약서 id 를 딜룸 기본 선택으로 내려준다', async () => {
    const env = await seedAwarded();
    const templateId = await seedTemplate(env);
    await db.update(bids).set({ signingTemplateId: templateId }).where(eq(bids.id, env.bidId));

    const data = await loadPgRfpDetail({ code: env.rfpCode, workspaceId: env.pgWsId });
    expect(data?.awardedBidSigningTemplateId).toBe(templateId);
  });

  // 봉인 경계 — 이 가드(`awardedToMe &&`)가 빠지면 패자 PG 가 승자 PG 의 계약서 id 를 얻는다.
  it('미낙찰 PG 에게는 낙찰 견적의 계약서 id 를 내려주지 않는다', async () => {
    const env = await seedAwarded();
    const templateId = await seedTemplate(env);
    await db.update(bids).set({ signingTemplateId: templateId }).where(eq(bids.id, env.bidId));

    // 같은 RFP 에 초대만 된 제2 PG (미낙찰).
    const other = await seedPgWorkspace(db, `loser-${randomUUID().slice(0, 6)}.io`);
    await db.insert(rfpInvitations).values({
      id: randomUUID(),
      rfpId: env.rfpId,
      pgWsId: other.id,
      tokenHash: randomUUID(),
      sentAt: new Date(),
      expiresAt: new Date(Date.now() + 86_400_000 * 7),
      status: 'accepted',
    });

    const data = await loadPgRfpDetail({ code: env.rfpCode, workspaceId: other.id });
    expect(data?.awardedToMe).toBe(false);
    expect(data?.awardedBidSigningTemplateId).toBeNull();
    expect(JSON.stringify(data)).not.toContain(templateId);
  });

  it('구매사 페이로드에는 계약서 템플릿이 어디에도 없다', async () => {
    const env = await seedAwarded();
    await seedTemplate(env, '남에게 보이면 안 되는 계약서');
    await seedContract(env, {}, [part('buyer'), part('pg')]);

    const data = await loadBuyerRfpDetail({
      code: env.rfpCode,
      workspaceId: env.buyerWsId,
      userId: env.buyerId,
      userName: '김구매',
    });
    expect(data).not.toBeNull();
    const payload = JSON.stringify(data);
    expect(payload).not.toContain('남에게 보이면 안 되는 계약서');
    expect(payload).not.toContain('signingTemplate');
    // 계약 행 자체가 어떤 계약서를 썼는지 식별한다 — 이름이 없어도 id 가 새면 안 된다.
    // ('signingTemplate' 부분문자열은 'snowsignTemplateId' 를 잡지 못한다.)
    expect(payload).not.toContain('snowsignTemplateId');
    expect(payload).not.toContain('providerRef');
  });
});
