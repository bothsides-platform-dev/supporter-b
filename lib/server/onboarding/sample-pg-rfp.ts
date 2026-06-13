// PG 온보딩 샘플 견적 요청 — 순수 tx 시딩/선정/삭제 로직 (DB 클라이언트 import 없음).
// createWorkspaceInTx(신규 PG)·backfill 스크립트(기존)·OnboardingService(선정/삭제)가 호출.
// 구매사 샘플(sample-rfp.ts)의 거울이되, 읽기전용이 아니라 PG 가 직접 견적을 제출하는
// 인터랙티브 샌드박스다 — 그래서 bid 는 시드하지 않고, 선정은 PG 행동 뒤에 시뮬레이트한다.
import { randomUUID } from 'node:crypto';
import { and, eq, isNull } from 'drizzle-orm';
import {
  users,
  workspaceMembers,
  workspaces,
  bizProfiles,
  rfps,
  rfpAllowedPg,
  rfpInvitations,
  bids,
} from '@/lib/db/schema';
import { nextRfpId } from '@/lib/server/rfp-id';

export const DEMO_BUYER_NAME = '샘플 쇼핑몰' as const;

const SAMPLE_DEADLINE_MS = 3650 * 24 * 60 * 60 * 1000;

export type DemoBuyer = { wsId: string; userId: string; name: string };

/**
 * 전역 공유 데모 구매사 워크스페이스 1개(+로그인 불가 시스템 유저 + bizProfile)를 보장한다.
 * 이름 기준 멱등 — 모든 PG 샘플이 이 한 구매사를 공유한다. isDemo=true 로 실제 구매사 표면에서 제외.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function ensureDemoBuyer(tx: any): Promise<DemoBuyer> {
  const [existing] = await tx
    .select({ id: workspaces.id })
    .from(workspaces)
    .where(and(eq(workspaces.isDemo, true), eq(workspaces.name, DEMO_BUYER_NAME), eq(workspaces.type, 'buyer')))
    .limit(1);
  if (existing) {
    const [member] = await tx
      .select({ userId: workspaceMembers.userId })
      .from(workspaceMembers)
      .where(eq(workspaceMembers.workspaceId, existing.id))
      .limit(1);
    if (!member) {
      throw new Error(`demo buyer workspace ${existing.id} has no member — data integrity error`);
    }
    return { wsId: existing.id, userId: member.userId, name: DEMO_BUYER_NAME };
  }

  const wsId = randomUUID();
  const userId = randomUUID();
  const bizProfileId = randomUUID();

  // 인박스에 사업자 등급 칩이 보이도록 bizProfile 을 매단다.
  await tx.insert(bizProfiles).values({
    id: bizProfileId,
    bizNo: '0000000000',
    taxType: 'general',
    status: 'active',
    grade: 'sme2',
    gradeSource: 'user_confirmed',
  });
  await tx.insert(users).values({
    id: userId,
    email: 'demo-buyer@sample.invalid', // .invalid = 예약된 비배달 TLD
    passwordHash: '!', // 사용 불가 — 데모 계정은 절대 인증되지 않는다
    name: DEMO_BUYER_NAME,
    isSystemAccount: true,
    emailVerified: true,
  });
  await tx.insert(workspaces).values({
    id: wsId,
    type: 'buyer',
    name: DEMO_BUYER_NAME,
    status: 'active', // 승인 플로우 우회 — 데모라 실제 계정이 아님
    isDemo: true,
    bizProfileId,
  });
  await tx.insert(workspaceMembers).values({ workspaceId: wsId, userId, role: 'admin' });
  return { wsId, userId, name: DEMO_BUYER_NAME };
}

/**
 * PG 워크스페이스 인박스에 데모 구매사가 보낸 샘플 견적 요청 1건 + 수락된 초대를 시드한다.
 * bid 는 시드하지 않는다 — PG 가 위저드로 직접 제출한다. sampleSeededAt 가 이미 설정돼 있으면
 * no-op(멱등). 반드시 tx 안에서 호출.
 */
export async function seedSamplePgRfpInTx(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  tx: any,
  input: { pgWsId: string; pgUserId: string },
): Promise<{ seeded: boolean; rfpId?: string }> {
  const [ws] = await tx
    .select({ sampleSeededAt: workspaces.sampleSeededAt })
    .from(workspaces)
    .where(eq(workspaces.id, input.pgWsId))
    .limit(1);
  if (!ws || ws.sampleSeededAt) return { seeded: false };

  const demo = await ensureDemoBuyer(tx);
  const now = new Date();
  const deadline = new Date(now.getTime() + SAMPLE_DEADLINE_MS);
  const rfpId = randomUUID();
  const code = await nextRfpId(tx);

  await tx.insert(rfps).values({
    id: rfpId,
    code,
    buyerWsId: demo.wsId,
    title: '온라인 쇼핑몰 PG 견적 요청 (샘플)',
    memo: '둘러보기용 샘플 견적 요청이에요. 직접 견적을 작성해 보내보면, 잠시 뒤 선정 결과를 보여드려요.',
    mainProducts: '패션 의류 · 잡화',
    annualPgVolume: '1200000000',
    currentFeeRate: '2.8%',
    currentSettlementCycle: 'D+5',
    currentSettlementLimit: '30000000',
    currentGuaranteeInsurance: '없음',
    requiredPaymentMethods: ['card', 'virtual_account', 'naver_pay'],
    deadline,
    status: 'sent',
    boardVisible: false,
    isSample: true,
    createdBy: demo.userId,
    sentAt: now,
  });

  await tx.insert(rfpAllowedPg).values({ rfpId, pgWsId: input.pgWsId });
  await tx.insert(rfpInvitations).values({
    id: randomUUID(),
    rfpId,
    pgWsId: input.pgWsId,
    acceptedByUserId: input.pgUserId,
    tokenHash: randomUUID(), // 샘플은 토큰 진입이 없어 임의 unique 값으로 충분
    sentAt: now,
    expiresAt: deadline,
    status: 'accepted',
  });

  await tx.update(workspaces).set({ sampleSeededAt: now }).where(eq(workspaces.id, input.pgWsId));
  return { seeded: true, rfpId };
}

/**
 * 샘플 견적 선정을 시뮬레이트한다 — PG 가 견적을 제출한 뒤 클라이언트가 호출. 게이트:
 * isSample && 이 PG 가 초대 PG && 제출된 견적 존재. RFP 를 awarded 로 전이하고 awardedBidId 를
 * PG 의 견적으로 설정한다(인박스가 '선정됨'으로 분류). 알림/아웃박스 없음. 이미 awarded 면 관용(ok).
 */
export async function simulateSampleAwardInTx(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  tx: any,
  input: { code: string; pgWsId: string },
): Promise<{ ok: true } | { ok: false; error: string }> {
  const [rfp] = await tx
    .select({ id: rfps.id, isSample: rfps.isSample, status: rfps.status })
    .from(rfps)
    .where(eq(rfps.code, input.code))
    .limit(1);
  if (!rfp) return { ok: false, error: 'RFP_NOT_FOUND' };
  if (!rfp.isSample) return { ok: false, error: 'NOT_SAMPLE' };
  if (rfp.status === 'awarded') return { ok: true }; // 더블 호출 관용

  const [allow] = await tx
    .select({ pgWsId: rfpAllowedPg.pgWsId })
    .from(rfpAllowedPg)
    .where(and(eq(rfpAllowedPg.rfpId, rfp.id), eq(rfpAllowedPg.pgWsId, input.pgWsId)))
    .limit(1);
  if (!allow) return { ok: false, error: 'FORBIDDEN' };

  const [bid] = await tx
    .select({ id: bids.id })
    .from(bids)
    .where(and(eq(bids.rfpId, rfp.id), eq(bids.pgWsId, input.pgWsId), eq(bids.status, 'submitted')))
    .limit(1);
  if (!bid) return { ok: false, error: 'NO_BID' };

  // status 와 awardedBidId 를 함께 set — rfps CHECK(awardedBidId 있으면 status='awarded') 충족.
  await tx.update(rfps).set({ status: 'awarded', awardedBidId: bid.id }).where(eq(rfps.id, rfp.id));
  return { ok: true };
}

/**
 * PG 샘플 견적 요청 하드삭제. 게이트: isSample && 이 PG 가 초대 PG. ⚠️ buyer 샘플과 달리
 * 소유자는 데모 구매사이므로 buyerWsId 로 게이트할 수 없다 — allowlist(초대 PG) 로 소유권을 증명한다.
 * 자식(bids·invitations·allowlist·attachments)은 FK ON DELETE CASCADE 로 함께 제거된다.
 */
export async function deleteSamplePgRfpInTx(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  tx: any,
  input: { code: string; pgWsId: string },
): Promise<{ ok: true } | { ok: false; error: string }> {
  const [rfp] = await tx
    .select({ id: rfps.id, isSample: rfps.isSample })
    .from(rfps)
    .where(eq(rfps.code, input.code))
    .limit(1);
  if (!rfp) return { ok: false, error: 'RFP_NOT_FOUND' };
  if (!rfp.isSample) return { ok: false, error: 'NOT_SAMPLE' };

  const [allow] = await tx
    .select({ pgWsId: rfpAllowedPg.pgWsId })
    .from(rfpAllowedPg)
    .where(and(eq(rfpAllowedPg.rfpId, rfp.id), eq(rfpAllowedPg.pgWsId, input.pgWsId)))
    .limit(1);
  if (!allow) return { ok: false, error: 'FORBIDDEN' };

  await tx.delete(rfps).where(eq(rfps.id, rfp.id));
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
  const pgs = await database
    .select({ id: workspaces.id })
    .from(workspaces)
    .where(
      and(
        eq(workspaces.type, 'pg'),
        eq(workspaces.isDemo, false),
        isNull(workspaces.sampleSeededAt),
      ),
    );

  let seeded = 0;
  for (const p of pgs as { id: string }[]) {
    const [admin] = await database
      .select({ userId: workspaceMembers.userId })
      .from(workspaceMembers)
      .where(and(eq(workspaceMembers.workspaceId, p.id), eq(workspaceMembers.role, 'admin')))
      .limit(1);
    if (!admin) continue;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const r = await database.transaction((tx: any) =>
      seedSamplePgRfpInTx(tx, { pgWsId: p.id, pgUserId: admin.userId }),
    );
    if (r.seeded) seeded++;
  }
  return { seeded };
}
