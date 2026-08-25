// rfp-detail-loader — 전자서명(SigningView) 로드 경로.
//   - loadBuyerRfpDetail: 구매사는 자기 RFP 계약을 항상 본다.
//   - loadPgRfpDetail: 낙찰 PG(awardedToMe)만 본다 — 미낙찰 PG는 null(봉인 경계).
//   - 진행 중(sent/in_progress + providerRef) 계약은 진입 시 lazy reconcile(best-effort).
// 컨벤션: contract-signing.test.ts / rfp-detail-loader.test.ts 와 동일 — pglite + seed.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';

import { bids, rfpInvitations, rfpRequoteRequests, rfps } from '@/lib/db/schema';
import { createPgliteDb, type PgliteDB } from '@/lib/db/client-pglite';
import {
  __resetForTest,
  __useDrizzleWithDbForTest,
  getPgSigningTemplateRepo,
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

describe('loadPgRfpDetail — signingTemplates / linkedSigningTemplate', () => {
  // 픽커가 실제로 뜨는 상태 — 위저드가 렌더되므로 목록이 있어야 한다.
  it('loadPgRfpDetail() surfaces the workspace signing templates when the BidWizard renders', async () => {
    const env = await seedAwarded();
    // 선정·제출을 되돌려 "아직 견적을 안 낸 진행 중" 상태로 만든다(위저드가 뜨는 상태).
    await db.update(rfps).set({ status: 'sent', awardedBidId: null }).where(eq(rfps.id, env.rfpId));
    await db.delete(bids).where(eq(bids.id, env.bidId));
    const templateRepo = await getPgSigningTemplateRepo();
    await templateRepo.create({
      workspaceId: env.pgWsId,
      snowsignTemplateId: 'sst-1',
      name: '표준 계약서',
      createdBy: env.pgUserId,
    });

    const detail = await loadPgRfpDetail({ code: env.rfpCode, workspaceId: env.pgWsId });
    expect(detail?.signingTemplates.map((t) => t.name)).toContain('표준 계약서');
  });

  // 재요청은 **이미 제출한 PG 에게도 위저드를 다시 띄우는** 유일한 상태다. 게이트에서
  // 이 항이 빠지면(또는 뒤집히면) 여기서만 조용히 망가진다 — 위저드는 뜨는데 목록이
  // 비어 픽커가 사라지고, 초안의 템플릿 선택이 '삭제됨'으로 오인돼 해제된다.
  // 나머지 두 케이스(미제출/선정완료)는 이 항 없이도 통과하므로 이 테스트가 유일한 가드다.
  it('loadPgRfpDetail() still fetches templates when a requote reopens the wizard for a submitted bid', async () => {
    const env = await seedAwarded();
    // 선정을 되돌리고(제출 bid 는 남긴다) 재요청을 연다 — 위저드가 다시 뜨는 상태.
    await db.update(rfps).set({ status: 'sent', awardedBidId: null }).where(eq(rfps.id, env.rfpId));
    await db.insert(rfpRequoteRequests).values({
      id: randomUUID(),
      rfpId: env.rfpId,
      pgWsId: env.pgWsId,
      round: 2,
      message: '조건을 조정해 주세요',
      deadline: new Date(Date.now() + 86_400_000),
      status: 'pending',
      createdByUserId: env.buyerId,
    });
    const templateRepo = await getPgSigningTemplateRepo();
    await templateRepo.create({
      workspaceId: env.pgWsId,
      snowsignTemplateId: 'sst-requote',
      name: '재요청용 계약서',
      createdBy: env.pgUserId,
    });

    const detail = await loadPgRfpDetail({ code: env.rfpCode, workspaceId: env.pgWsId });
    expect(detail?.pendingRequote).not.toBeNull();
    expect(detail?.signingTemplates.map((t) => t.name)).toContain('재요청용 계약서');
  });

  // P4 — 위저드가 안 뜨는 딜룸(선정 완료·제출 완료)에서는 아무도 이 목록을 읽지
  // 않는다. 조건은 `pgDealRoomShowsBidWizard` 가 화면과 공유하는 단일 출처다.
  it('loadPgRfpDetail() skips the template query when the BidWizard will not render', async () => {
    const env = await seedAwarded(); // 선정 완료 — 위저드 없음
    const templateRepo = await getPgSigningTemplateRepo();
    await templateRepo.create({
      workspaceId: env.pgWsId,
      snowsignTemplateId: 'sst-skip',
      name: '안 쓰이는 템플릿',
      createdBy: env.pgUserId,
    });

    const detail = await loadPgRfpDetail({ code: env.rfpCode, workspaceId: env.pgWsId });
    expect(detail?.signingTemplates).toEqual([]);
  });

  it('loadPgRfpDetail() surfaces the linked template name when the awarded bid has one', async () => {
    const env = await seedAwarded();
    const templateRepo = await getPgSigningTemplateRepo();
    const templateId = randomUUID();
    await templateRepo.create({
      id: templateId,
      workspaceId: env.pgWsId,
      snowsignTemplateId: 'sst-2',
      name: '표준 계약서',
      createdBy: env.pgUserId,
    });
    // DB 컬럼 직접 세팅 — `Bid` 도메인 타입엔 이 필드가 없다(봉인 경계, 의도적).
    await db.update(bids).set({ signingTemplateId: templateId }).where(eq(bids.id, env.bidId));

    const detail = await loadPgRfpDetail({ code: env.rfpCode, workspaceId: env.pgWsId });
    expect(detail?.linkedSigningTemplate?.name).toBe('표준 계약서');
  });

  it('loadPgRfpDetail() 은 연결된 서식이 없으면 linkedSigningTemplate 이 null 이다', async () => {
    const env = await seedAwarded();
    const detail = await loadPgRfpDetail({ code: env.rfpCode, workspaceId: env.pgWsId });
    expect(detail?.linkedSigningTemplate).toBeNull();
  });

  // L22 — 화면이 보여주는 이름과 실제 발송(sendFromTemplate: rfp.awardedBidId 기준)이
  // 갈라지면 안 된다. 재견적으로 2라운드(무템플릿)가 최신이 돼도, 발송에 쓰이는 건
  // 낙찰 라운드(1R)의 템플릿이므로 이름도 그걸 보여줘야 한다.
  it('linkedSigningTemplateName follows the awarded bid, not the latest round', async () => {
    const env = await seedAwarded();
    const templateRepo = await getPgSigningTemplateRepo();
    const templateId = randomUUID();
    await templateRepo.create({
      id: templateId,
      workspaceId: env.pgWsId,
      snowsignTemplateId: 'sst-3',
      name: '낙찰 라운드 계약서',
      createdBy: env.pgUserId,
    });
    await db.update(bids).set({ signingTemplateId: templateId }).where(eq(bids.id, env.bidId));

    // 재견적 2라운드 — 템플릿 없음. myBid(최신 라운드)는 이쪽이 된다.
    const [round1] = await db.select().from(bids).where(eq(bids.id, env.bidId));
    await db.insert(bids).values({
      id: randomUUID(),
      rfpId: env.rfpId,
      pgWsId: env.pgWsId,
      invitationId: round1!.invitationId,
      round: 2,
      settleCycle: 'D+2',
      settleLimit: '0',
      guaranteeInsurance: '0',
      paymentFees: {},
      status: 'submitted',
      submittedBy: env.pgUserId,
      submittedAt: new Date(),
    });

    const detail = await loadPgRfpDetail({ code: env.rfpCode, workspaceId: env.pgWsId });
    expect(detail?.linkedSigningTemplate?.name).toBe('낙찰 라운드 계약서');
  });
});

// 봉인 경계 — 구매사 페이로드에 provider 식별자가 새지 않는지.
describe('rfp-detail-loader — 구매사 페이로드의 provider 식별자 (봉인 경계)', () => {
  it('구매사 페이로드에는 provider 계약 식별자가 어디에도 없다', async () => {
    const env = await seedAwarded();
    // snowsignTemplateId 를 값 없이 두면(undefined) JSON.stringify 가 키 자체를
    // 생략해 "벗겨졌다"는 단언이 "애초에 없었다"와 구별되지 않는다(컷 감사 — testing
    // specialist 적발, mutation: strip 구현에서 이 필드를 빼도 green). 값을 실제로
    // 채워 그 값이 페이로드에 없는 것으로 증명한다.
    await seedContract(
      env,
      { providerRef: 'ct_secret_ref', snowsignTemplateId: 'sst_secret_tpl' },
      [part('buyer'), part('pg')],
    );

    const data = await loadBuyerRfpDetail({
      code: env.rfpCode,
      workspaceId: env.buyerWsId,
      userId: env.buyerId,
      userName: '김구매',
    });
    expect(data).not.toBeNull();
    const payload = JSON.stringify(data);
    // providerRef 로는 구매사가 PG 의 계약 문서를 직접 조회할 수 있다.
    expect(payload).not.toContain('ct_secret_ref');
    expect(payload).not.toContain('providerRef');
    // 템플릿 시절의 이력 컬럼도 계속 벗겨져야 한다(옛 행이 남아 있다).
    expect(payload).not.toContain('sst_secret_tpl');
    expect(payload).not.toContain('snowsignTemplateId');
  });
});
