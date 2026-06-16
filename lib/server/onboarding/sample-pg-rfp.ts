// PG 온보딩 샘플 견적 요청 — 순수 tx 시딩/선정/삭제 로직 (DB 클라이언트 import 없음).
// createWorkspaceInTx(신규 PG)·backfill 스크립트(기존)·OnboardingService(선정/삭제)가 호출.
// 구매사 샘플(sample-rfp.ts)의 거울이되, 읽기전용이 아니라 PG 가 직접 견적을 제출하는
// 인터랙티브 샌드박스다 — 그래서 bid 는 시드하지 않고, 선정은 PG 행동 뒤에 시뮬레이트한다.
// DB 접근은 전부 리포지토리(getXxxRepo 팩토리)를 통하고 tx 를 끝까지 전달한다.
import { randomUUID } from 'node:crypto';
import {
  getBidRepo,
  getBizProfileRepo,
  getInvitationRepo,
  getRfpAllowedPgRepo,
  getRfpRepo,
  getUserRepo,
  getWorkspaceRepo,
} from '@/lib/server/repositories/factory';
import type { Tx } from '@/lib/server/repositories/types';

export const DEMO_BUYER_NAME = '샘플 쇼핑몰' as const;

const SAMPLE_DEADLINE_MS = 3650 * 24 * 60 * 60 * 1000;

// nextRfpId 와 동일한 yymm 파생 — `P-YYMM-NNNN` 코드를 reserveNextCode 로 동일하게 발급한다.
function currentYearMonth(): string {
  const now = new Date();
  return `${String(now.getFullYear()).slice(2)}${String(now.getMonth() + 1).padStart(2, '0')}`;
}

export type DemoBuyer = { wsId: string; userId: string; name: string };

/**
 * 전역 공유 데모 구매사 워크스페이스 1개(+로그인 불가 시스템 유저 + bizProfile)를 보장한다.
 * 이름 기준 멱등 — 모든 PG 샘플이 이 한 구매사를 공유한다. isDemo=true 로 실제 구매사 표면에서 제외.
 */
export async function ensureDemoBuyer(tx: Tx): Promise<DemoBuyer> {
  const workspaceRepo = await getWorkspaceRepo();
  const userRepo = await getUserRepo();
  const bizProfileRepo = await getBizProfileRepo();

  const existing = await workspaceRepo.findDemoByName(DEMO_BUYER_NAME, 'buyer', tx);
  if (existing) {
    const memberUserId = await workspaceRepo.firstMemberUserId(existing.id, tx);
    if (!memberUserId) {
      throw new Error(`demo buyer workspace ${existing.id} has no member — data integrity error`);
    }
    return { wsId: existing.id, userId: memberUserId, name: DEMO_BUYER_NAME };
  }

  const wsId = randomUUID();
  const userId = randomUUID();
  const bizProfileId = randomUUID();

  // 인박스에 사업자 등급 칩이 보이도록 bizProfile 을 매단다.
  await bizProfileRepo.save(
    {
      id: bizProfileId,
      bizNo: '0000000000',
      taxType: 'general',
      status: 'active',
      grade: 'sme2',
      gradeSource: 'user_confirmed',
    },
    tx,
  );
  await userRepo.createSystemAccount(
    {
      id: userId,
      email: 'demo-buyer@sample.invalid', // .invalid = 예약된 비배달 TLD
      name: DEMO_BUYER_NAME,
    },
    tx,
  );
  await workspaceRepo.createDemo({ id: wsId, type: 'buyer', name: DEMO_BUYER_NAME, bizProfileId }, tx);
  await workspaceRepo.addMember({ workspaceId: wsId, userId, role: 'admin' }, tx);
  return { wsId, userId, name: DEMO_BUYER_NAME };
}

/**
 * PG 워크스페이스 인박스에 데모 구매사가 보낸 샘플 견적 요청 1건 + 수락된 초대를 시드한다.
 * bid 는 시드하지 않는다 — PG 가 위저드로 직접 제출한다. sampleSeededAt 가 이미 설정돼 있으면
 * no-op(멱등). 반드시 tx 안에서 호출.
 */
export async function seedSamplePgRfpInTx(
  tx: Tx,
  input: { pgWsId: string; pgUserId: string },
): Promise<{ seeded: boolean; rfpId?: string }> {
  const workspaceRepo = await getWorkspaceRepo();
  const rfpRepo = await getRfpRepo();
  const allowedPgRepo = await getRfpAllowedPgRepo();
  const invitationRepo = await getInvitationRepo();

  const state = await workspaceRepo.getSampleSeededState(input.pgWsId, tx);
  if (!state || state.sampleSeededAt) return { seeded: false };

  const demo = await ensureDemoBuyer(tx);
  const now = new Date();
  const deadline = new Date(now.getTime() + SAMPLE_DEADLINE_MS);
  const rfpId = randomUUID();
  const code = await rfpRepo.reserveNextCode(currentYearMonth(), tx);

  await rfpRepo.insertNew(
    {
      id: rfpId,
      code,
      buyerWsId: demo.wsId,
      bizProfileId: null,
      title: '온라인 쇼핑몰 PG 견적 요청 (샘플)',
      memo: '둘러보기용 샘플 견적 요청이에요. 직접 견적을 작성해 보내보면, 잠시 뒤 선정 결과를 보여드려요.',
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
      createdBy: demo.userId,
      sentAt: now,
      isSample: true,
    },
    tx,
  );

  await allowedPgRepo.add(rfpId, [input.pgWsId], tx);
  await invitationRepo.insertAccepted(
    {
      id: randomUUID(),
      rfpId,
      pgWsId: input.pgWsId,
      acceptedByUserId: input.pgUserId,
      tokenHash: randomUUID(), // 샘플은 토큰 진입이 없어 임의 unique 값으로 충분
      sentAt: now,
      expiresAt: deadline,
    },
    tx,
  );

  await workspaceRepo.markSampleSeeded(input.pgWsId, now, tx);
  return { seeded: true, rfpId };
}

/**
 * 샘플 견적 선정을 시뮬레이트한다 — PG 가 견적을 제출한 뒤 클라이언트가 호출. 게이트:
 * isSample && 이 PG 가 초대 PG && 제출된 견적 존재. RFP 를 awarded 로 전이하고 awardedBidId 를
 * PG 의 견적으로 설정한다(인박스가 '선정됨'으로 분류). 알림/아웃박스 없음. 이미 awarded 면 관용(ok).
 */
export async function simulateSampleAwardInTx(
  tx: Tx,
  input: { code: string; pgWsId: string },
): Promise<{ ok: true } | { ok: false; error: string }> {
  const rfpRepo = await getRfpRepo();
  const allowedPgRepo = await getRfpAllowedPgRepo();
  const bidRepo = await getBidRepo();

  const rfp = await rfpRepo.findByCode(input.code, tx);
  if (!rfp) return { ok: false, error: 'RFP_NOT_FOUND' };
  if (!rfp.isSample) return { ok: false, error: 'NOT_SAMPLE' };
  if (rfp.status === 'awarded') return { ok: true }; // 더블 호출 관용

  const allowed = await allowedPgRepo.has(rfp.id, input.pgWsId, tx);
  if (!allowed) return { ok: false, error: 'FORBIDDEN' };

  const bids = await bidRepo.findByRfp(rfp.id, tx);
  const bid = bids.find((b) => b.pgWsId === input.pgWsId && b.status === 'submitted');
  if (!bid) return { ok: false, error: 'NO_BID' };

  // status 와 awardedBidId 를 함께 set — rfps CHECK(awardedBidId 있으면 status='awarded') 충족.
  // sent → awarded 는 합법 전이(rfp-state). transition 이 `WHERE status=$prev` 동시성 가드도 한다.
  await rfpRepo.transition(rfp.id, 'awarded', { awardedBidId: bid.id }, tx);
  return { ok: true };
}

/**
 * PG 샘플 견적 요청 하드삭제. 게이트: isSample && 이 PG 가 초대 PG. ⚠️ buyer 샘플과 달리
 * 소유자는 데모 구매사이므로 buyerWsId 로 게이트할 수 없다 — allowlist(초대 PG) 로 소유권을 증명한다.
 * 자식(bids·invitations·allowlist·attachments)은 FK ON DELETE CASCADE 로 함께 제거된다.
 */
export async function deleteSamplePgRfpInTx(
  tx: Tx,
  input: { code: string; pgWsId: string },
): Promise<{ ok: true } | { ok: false; error: string }> {
  const rfpRepo = await getRfpRepo();
  const allowedPgRepo = await getRfpAllowedPgRepo();

  const rfp = await rfpRepo.findByCode(input.code, tx);
  if (!rfp) return { ok: false, error: 'RFP_NOT_FOUND' };
  if (!rfp.isSample) return { ok: false, error: 'NOT_SAMPLE' };

  const allowed = await allowedPgRepo.has(rfp.id, input.pgWsId, tx);
  if (!allowed) return { ok: false, error: 'FORBIDDEN' };

  await rfpRepo.deleteById(rfp.id, tx);
  return { ok: true };
}

/**
 * sampleSeededAt 가 없는 모든 (비-데모) pg 워크스페이스에 샘플을 시드한다(멱등). 각 워크스페이스의
 * admin 멤버를 초대 수락자로 사용한다. 1회성 백필 스크립트가 호출. ⚠️ isDemo 워크스페이스는
 * 온보딩 대상이 아니므로 제외한다(데모 PG 에 샘플이 새지 않도록).
 */
export async function backfillSamplePgRfps(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  database: any,
): Promise<{ seeded: number }> {
  const workspaceRepo = await getWorkspaceRepo();
  const pgs = await workspaceRepo.listWsNeedingSample('pg', database);

  let seeded = 0;
  for (const p of pgs) {
    const adminUserId = await workspaceRepo.findAdminMemberUserId(p.id, database);
    if (!adminUserId) continue;
    const r = await database.transaction((tx: Tx) =>
      seedSamplePgRfpInTx(tx, { pgWsId: p.id, pgUserId: adminUserId }),
    );
    if (r.seeded) seeded++;
  }
  return { seeded };
}
