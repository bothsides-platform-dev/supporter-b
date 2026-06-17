// 온보딩 샘플 견적 요청 — 순수 tx 시딩/삭제 로직 (DB 클라이언트 import 없음).
// createWorkspaceInTx(신규 구매사)·backfill 스크립트(기존)·OnboardingService(삭제)가 호출.
// DB 접근은 전부 리포지토리(getXxxRepo 팩토리)를 통하고 tx 를 끝까지 전달한다.
import { randomUUID } from 'node:crypto';
import {
  getBidRepo,
  getInvitationRepo,
  getRfpAllowedPgRepo,
  getRfpRepo,
  getUserRepo,
  getWorkspaceRepo,
} from '@/lib/server/repositories/factory';
import type { Tx } from '@/lib/server/repositories/types';

export const DEMO_PG_NAMES = ['샘플페이 A', '샘플페이 B', '샘플페이 C'] as const;

const SAMPLE_DEADLINE_MS = 3650 * 24 * 60 * 60 * 1000;

// nextRfpId 와 동일한 yymm 파생 — `P-YYMM-NNNN` 코드를 reserveNextCode 로 동일하게 발급한다.
function currentYearMonth(): string {
  const now = new Date();
  return `${String(now.getFullYear()).slice(2)}${String(now.getMonth() + 1).padStart(2, '0')}`;
}

type SampleBidSpec = {
  settleCycle: string;
  settleLimit: string;
  guaranteeInsurance: string;
  // PaymentMethod → 단일요율(number) 또는 우대수수료 구간맵(TierRates)
  paymentFees: Record<string, number | Record<string, number>>;
  memo: string;
};

// 세 비더를 의도적으로 차별화 — 비교가 의미를 갖도록.
const SAMPLE_BIDS: SampleBidSpec[] = [
  {
    settleCycle: 'D+2',
    settleLimit: '50000000',
    guaranteeInsurance: '5000000',
    paymentFees: {
      card: { sole: 0.005, sme1: 0.008, sme2: 0.011, sme3: 0.013, general: 0.018 },
      virtual_account: 0.003,
      naver_pay: 0.025,
    },
    memo: '카드 수수료가 가장 낮아요. 정산은 D+2예요.',
  },
  {
    settleCycle: 'D+1',
    settleLimit: '100000000',
    guaranteeInsurance: '3000000',
    paymentFees: {
      card: { sole: 0.006, sme1: 0.009, sme2: 0.012, sme3: 0.015, general: 0.02 },
      virtual_account: 0.0025,
      naver_pay: 0.023,
    },
    memo: '정산이 D+1로 빠르고 한도가 높아요.',
  },
  {
    settleCycle: 'D+1',
    settleLimit: '80000000',
    guaranteeInsurance: '0',
    paymentFees: {
      card: { sole: 0.007, sme1: 0.01, sme2: 0.013, sme3: 0.016, general: 0.022 },
      virtual_account: 0.002,
      naver_pay: 0.019,
    },
    memo: '간편결제 수수료가 낮고 보증보험이 없어요.',
  },
];

export type DemoPg = { wsId: string; userId: string; name: string };

/**
 * 전역 데모 PG 워크스페이스 3개(+로그인 불가 데모 유저)를 보장한다. 이름 기준 멱등 —
 * 모든 구매사의 샘플이 이 3개를 공유한다. isDemo=true 로 실제 PG 발견 표면에서 제외된다.
 */
export async function ensureDemoPgs(tx: Tx): Promise<DemoPg[]> {
  const workspaceRepo = await getWorkspaceRepo();
  const userRepo = await getUserRepo();

  const out: DemoPg[] = [];
  for (let i = 0; i < DEMO_PG_NAMES.length; i++) {
    const name = DEMO_PG_NAMES[i];
    const existing = await workspaceRepo.findDemoByName(name, undefined, tx);
    if (existing) {
      const memberUserId = await workspaceRepo.firstMemberUserId(existing.id, tx);
      if (!memberUserId) {
        throw new Error(`demo PG workspace ${existing.id} has no member — data integrity error`);
      }
      out.push({ wsId: existing.id, userId: memberUserId, name });
      continue;
    }
    const wsId = randomUUID();
    const userId = randomUUID();
    const slug = String.fromCharCode(97 + i); // a, b, c
    await userRepo.createSystemAccount(
      {
        id: userId,
        email: `demo-pg-${slug}@sample.invalid`, // .invalid = 예약된 비배달 TLD
        name,
      },
      tx,
    );
    await workspaceRepo.createDemo({ id: wsId, type: 'pg', name, bizProfileId: null }, tx);
    await workspaceRepo.addMember({ workspaceId: wsId, userId, role: 'admin' }, tx);
    out.push({ wsId, userId, name });
  }
  return out;
}

/**
 * 구매사 워크스페이스에 샘플 견적 요청 1건 + 데모 PG 3사의 견적을 시드한다.
 * sampleSeededAt 가 이미 설정돼 있으면 no-op(멱등). 반드시 tx 안에서 호출.
 */
export async function seedSampleRfpInTx(
  tx: Tx,
  input: { buyerWsId: string; buyerUserId: string },
): Promise<{ seeded: boolean; rfpId?: string }> {
  if (SAMPLE_BIDS.length !== DEMO_PG_NAMES.length) {
    throw new Error('SAMPLE_BIDS must have one entry per demo PG');
  }

  const workspaceRepo = await getWorkspaceRepo();
  const rfpRepo = await getRfpRepo();
  const allowedPgRepo = await getRfpAllowedPgRepo();
  const invitationRepo = await getInvitationRepo();
  const bidRepo = await getBidRepo();

  const state = await workspaceRepo.getSampleSeededState(input.buyerWsId, tx);
  if (!state || state.sampleSeededAt) return { seeded: false };

  const demos = await ensureDemoPgs(tx);
  const now = new Date();
  const deadline = new Date(now.getTime() + SAMPLE_DEADLINE_MS);
  const rfpId = randomUUID();
  const code = await rfpRepo.reserveNextCode(currentYearMonth(), tx);

  await rfpRepo.insertNew(
    {
      id: rfpId,
      code,
      buyerWsId: input.buyerWsId,
      bizProfileId: null,
      title: '온라인 쇼핑몰 PG 견적 요청 (샘플)',
      memo: '결제대행사 비교를 위한 샘플 견적 요청이에요. 받은 견적을 비교하고 선정하는 과정을 둘러볼 수 있어요. 다 살펴봤다면 삭제해도 돼요.',
      websiteUrl: null,
      mainProducts: '패션 의류 · 잡화',
      annualPgVolume: '1200000000',
      currentFeeRate: '2.8%',
      currentSettlementLimit: '30000000',
      currentGuaranteeInsurance: '없음',
      currentSettlementCycle: 'D+5',
      deliveryServicePeriod: null,
      boardVisible: false,
      currentFeeVisibleToPg: true,
      contractType: null,
      currentSolution: null,
      currentSolutionDetail: null,
      deadline,
      status: 'sent',
      requiredPaymentMethods: ['card', 'virtual_account', 'naver_pay'],
      customPaymentMethods: [],
      createdBy: input.buyerUserId,
      sentAt: now,
      isSample: true,
    },
    tx,
  );

  for (let i = 0; i < demos.length; i++) {
    const demo = demos[i];
    const spec = SAMPLE_BIDS[i];
    const invitationId = randomUUID();
    await allowedPgRepo.add(rfpId, [demo.wsId], tx);
    await invitationRepo.insertAccepted(
      {
        id: invitationId,
        rfpId,
        pgWsId: demo.wsId,
        acceptedByUserId: demo.userId,
        tokenHash: randomUUID(), // 샘플은 토큰 진입이 없어 임의 unique 값으로 충분
        sentAt: now,
        expiresAt: deadline,
      },
      tx,
    );
    await bidRepo.save(
      {
        id: randomUUID(),
        rfpId,
        pgWsId: demo.wsId,
        invitationId,
        round: 1,
        settleCycle: spec.settleCycle,
        settleLimit: Number(spec.settleLimit),
        guaranteeInsurance: Number(spec.guaranteeInsurance),
        paymentFees: spec.paymentFees,
        customFees: {},
        proposalPdfs: [],
        memo: spec.memo,
        status: 'submitted',
        submittedBy: demo.userId,
        submittedAt: now.toISOString(),
      },
      tx,
    );
  }

  await workspaceRepo.markSampleSeeded(input.buyerWsId, now, tx);
  return { seeded: true, rfpId };
}

/**
 * sampleSeededAt 가 없는 모든 buyer 워크스페이스에 샘플을 시드한다(멱등). 각 워크스페이스의
 * admin 멤버를 createdBy 로 사용한다. 1회성 백필 스크립트가 호출.
 */
export async function backfillSampleRfps(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  database: any,
): Promise<{ seeded: number }> {
  const workspaceRepo = await getWorkspaceRepo();
  const buyers = await workspaceRepo.listWsNeedingSample('buyer', database);

  let seeded = 0;
  for (const b of buyers) {
    const adminUserId = await workspaceRepo.findAdminMemberUserId(b.id, database);
    if (!adminUserId) continue;
    const r = await database.transaction((tx: Tx) =>
      seedSampleRfpInTx(tx, { buyerWsId: b.id, buyerUserId: adminUserId }),
    );
    if (r.seeded) seeded++;
  }
  return { seeded };
}

/**
 * 샘플 견적 요청 하드삭제. 소유권(workspaceId) + isSample 둘 다 만족할 때만 삭제한다.
 * 실제 RFP 는 이 경로로 절대 삭제되지 않는다. 자식(bids·invitations·allowlist·attachments·
 * team_messages)은 FK ON DELETE CASCADE 로 함께 제거된다. sampleSeededAt 은 유지 → 재시드 안 함.
 */
export async function deleteSampleRfpInTx(
  tx: Tx,
  input: { code: string; workspaceId: string },
): Promise<{ ok: true } | { ok: false; error: string }> {
  const rfpRepo = await getRfpRepo();
  const rfp = await rfpRepo.findByCode(input.code, tx);
  if (!rfp) return { ok: false, error: 'RFP_NOT_FOUND' };
  if (rfp.buyerWsId !== input.workspaceId) return { ok: false, error: 'FORBIDDEN' };
  if (!rfp.isSample) return { ok: false, error: 'NOT_SAMPLE' };
  await rfpRepo.deleteById(rfp.id, tx);
  return { ok: true };
}
