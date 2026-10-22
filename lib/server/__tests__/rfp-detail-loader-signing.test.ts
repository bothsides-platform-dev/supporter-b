// rfp-detail-loader — 전자서명(SigningView) 로드 경로.
//   - loadBuyerRfpDetail: 구매사는 자기 RFP 계약을 항상 본다.
//   - loadPgRfpDetail: 낙찰 PG(awardedToMe)만 본다 — 미낙찰 PG는 null(봉인 경계).
//   - 진행 중(sent/in_progress + providerRef) 계약은 진입 시 lazy reconcile(best-effort).
// 컨벤션: contract-signing.test.ts / rfp-detail-loader.test.ts 와 동일 — pglite + seed.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';

import { bids, rfpInvitations, rfps } from '@/lib/db/schema';
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
  db = await createPgliteDb();
  await __useDrizzleWithDbForTest(db);
  reconcileSpy = vi.fn(async () => {});
  __setContractSigningServiceForTest({
    reconcileIfStale: reconcileSpy,
  } as unknown as ContractSigningService);
});
afterEach(() => {
  __resetForTest();
});

describe('플랫폼 합의서 딜룸 경계',()=>{
 it('구매사에게 새 계약만 보여주며 공급자 참조는 제거한다',async()=>{
  const env=await seedAwarded();await seedContract(env,{kind:'platform_buyer'},[part('buyer')]);
  const result=await loadBuyerRfpDetail({code:env.rfpCode,workspaceId:env.buyerWsId,userId:env.buyerId,userName:'구매사'});
  expect(result?.signing?.contract.kind).toBe('platform_buyer');
  expect(result?.signing?.contract.providerRef).toBeUndefined();
  expect(reconcileSpy).toHaveBeenCalledTimes(1);
 });
 it('기존 계약은 구매사에게도 숨기고 사용자 조회로 동기화를 유발하지 않는다',async()=>{
  const env=await seedAwarded();await seedContract(env);
  const result=await loadBuyerRfpDetail({code:env.rfpCode,workspaceId:env.buyerWsId,userId:env.buyerId,userName:'구매사'});
  expect(result?.signing).toBeNull();expect(reconcileSpy).not.toHaveBeenCalled();
 });
 it('선정 PG에게도 계약과 계약 템플릿을 제공하지 않는다',async()=>{
  const env=await seedAwarded();await seedContract(env,{kind:'platform_buyer'});
  expect(await loadPgRfpDetail({code:env.rfpCode,workspaceId:env.pgWsId})).toMatchObject({signing:null,signingTemplates:[],linkedSigningTemplate:null});
  expect(reconcileSpy).not.toHaveBeenCalled();
  expect(await loadPgRfpDetail({code:env.rfpCode,workspaceId:randomUUID()})).toBeNull();
 });
});
