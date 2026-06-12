// 온보딩 샘플 견적 요청 — 순수 tx 시딩/삭제 로직 (DB 클라이언트 import 없음).
// createWorkspaceInTx(신규 구매사)·backfill 스크립트(기존)·OnboardingService(삭제)가 호출.
import { randomUUID } from 'node:crypto';
import { and, eq, isNull } from 'drizzle-orm';
import { users, workspaceMembers, workspaces, rfps, rfpAllowedPg, rfpInvitations, bids } from '@/lib/db/schema';
import { nextRfpId } from '@/lib/server/rfp-id';

export const DEMO_PG_NAMES = ['샘플페이 A', '샘플페이 B', '샘플페이 C'] as const;

const SAMPLE_DEADLINE_MS = 3650 * 24 * 60 * 60 * 1000;

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
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function ensureDemoPgs(tx: any): Promise<DemoPg[]> {
  const out: DemoPg[] = [];
  for (let i = 0; i < DEMO_PG_NAMES.length; i++) {
    const name = DEMO_PG_NAMES[i];
    const [existing] = await tx
      .select({ id: workspaces.id })
      .from(workspaces)
      .where(and(eq(workspaces.isDemo, true), eq(workspaces.name, name)))
      .limit(1);
    if (existing) {
      const [member] = await tx
        .select({ userId: workspaceMembers.userId })
        .from(workspaceMembers)
        .where(eq(workspaceMembers.workspaceId, existing.id))
        .limit(1);
      if (!member) {
        throw new Error(`demo PG workspace ${existing.id} has no member — data integrity error`);
      }
      out.push({ wsId: existing.id, userId: member.userId, name });
      continue;
    }
    const wsId = randomUUID();
    const userId = randomUUID();
    const slug = String.fromCharCode(97 + i); // a, b, c
    await tx.insert(users).values({
      id: userId,
      email: `demo-pg-${slug}@sample.invalid`, // .invalid = 예약된 비배달 TLD
      passwordHash: '!', // 사용 불가 — 데모 계정은 절대 인증되지 않는다
      name,
      isSystemAccount: true,
      emailVerified: true,
    });
    await tx.insert(workspaces).values({
      id: wsId,
      type: 'pg',
      name,
      status: 'active', // 승인 플로우 우회 — 데모 PG라 실제 계정이 아님
      isDemo: true,
    });
    await tx.insert(workspaceMembers).values({ workspaceId: wsId, userId, role: 'admin' });
    out.push({ wsId, userId, name });
  }
  return out;
}

/**
 * 구매사 워크스페이스에 샘플 견적 요청 1건 + 데모 PG 3사의 견적을 시드한다.
 * sampleSeededAt 가 이미 설정돼 있으면 no-op(멱등). 반드시 tx 안에서 호출.
 */
export async function seedSampleRfpInTx(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  tx: any,
  input: { buyerWsId: string; buyerUserId: string },
): Promise<{ seeded: boolean; rfpId?: string }> {
  if (SAMPLE_BIDS.length !== DEMO_PG_NAMES.length) {
    throw new Error('SAMPLE_BIDS must have one entry per demo PG');
  }

  const [ws] = await tx
    .select({ sampleSeededAt: workspaces.sampleSeededAt })
    .from(workspaces)
    .where(eq(workspaces.id, input.buyerWsId))
    .limit(1);
  if (!ws || ws.sampleSeededAt) return { seeded: false };

  const demos = await ensureDemoPgs(tx);
  const now = new Date();
  const deadline = new Date(now.getTime() + SAMPLE_DEADLINE_MS);
  const rfpId = randomUUID();
  const code = await nextRfpId(tx);

  await tx.insert(rfps).values({
    id: rfpId,
    code,
    buyerWsId: input.buyerWsId,
    title: '온라인 쇼핑몰 PG 견적 요청 (샘플)',
    memo: '결제대행사 비교를 위한 샘플 견적 요청이에요. 받은 견적을 비교하고 선정하는 과정을 둘러볼 수 있어요. 다 살펴봤다면 삭제해도 돼요.',
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
    createdBy: input.buyerUserId,
    sentAt: now,
  });

  for (let i = 0; i < demos.length; i++) {
    const demo = demos[i];
    const spec = SAMPLE_BIDS[i];
    const invitationId = randomUUID();
    await tx.insert(rfpAllowedPg).values({ rfpId, pgWsId: demo.wsId });
    await tx.insert(rfpInvitations).values({
      id: invitationId,
      rfpId,
      pgWsId: demo.wsId,
      acceptedByUserId: demo.userId,
      tokenHash: randomUUID(), // 샘플은 토큰 진입이 없어 임의 unique 값으로 충분
      sentAt: now,
      expiresAt: deadline,
      status: 'accepted',
    });
    await tx.insert(bids).values({
      id: randomUUID(),
      rfpId,
      pgWsId: demo.wsId,
      invitationId,
      settleCycle: spec.settleCycle,
      settleLimit: spec.settleLimit,
      guaranteeInsurance: spec.guaranteeInsurance,
      paymentFees: spec.paymentFees,
      customFees: {},
      memo: spec.memo,
      status: 'submitted',
      submittedBy: demo.userId,
      submittedAt: now,
    });
  }

  await tx.update(workspaces).set({ sampleSeededAt: now }).where(eq(workspaces.id, input.buyerWsId));
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
  const buyers = await database
    .select({ id: workspaces.id })
    .from(workspaces)
    .where(
      and(
        eq(workspaces.type, 'buyer'),
        // 데모 워크스페이스(예: PG 샘플이 쓰는 공유 데모 구매사)는 온보딩 대상이 아니다.
        eq(workspaces.isDemo, false),
        isNull(workspaces.sampleSeededAt),
      ),
    );

  let seeded = 0;
  for (const b of buyers as { id: string }[]) {
    const [admin] = await database
      .select({ userId: workspaceMembers.userId })
      .from(workspaceMembers)
      .where(and(eq(workspaceMembers.workspaceId, b.id), eq(workspaceMembers.role, 'admin')))
      .limit(1);
    if (!admin) continue;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const r = await database.transaction((tx: any) =>
      seedSampleRfpInTx(tx, { buyerWsId: b.id, buyerUserId: admin.userId }),
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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  tx: any,
  input: { code: string; workspaceId: string },
): Promise<{ ok: true } | { ok: false; error: string }> {
  const [rfp] = await tx
    .select({ id: rfps.id, buyerWsId: rfps.buyerWsId, isSample: rfps.isSample })
    .from(rfps)
    .where(eq(rfps.code, input.code))
    .limit(1);
  if (!rfp) return { ok: false, error: 'RFP_NOT_FOUND' };
  if (rfp.buyerWsId !== input.workspaceId) return { ok: false, error: 'FORBIDDEN' };
  if (!rfp.isSample) return { ok: false, error: 'NOT_SAMPLE' };
  await tx.delete(rfps).where(eq(rfps.id, rfp.id));
  return { ok: true };
}
