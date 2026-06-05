// submitBidAction v2 — payment_fees JSONB 모델 테스트.
//
// Coverage:
//   - 새 정산조건 필드(settleLimit, guaranteeInsurance) 저장
//   - payment_fees JSONB 저장
//   - 카드 수수료는 등급 무관 협상 입력 — 상한 검증 없이 그대로 저장
//   - 허용되지 않는 결제수단 키 → INVALID_INPUT
//   - requiredPaymentMethods가 비어있으면 payment_fees 자유 허용
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';

import { bids, bizProfiles, rfps, rfpInvitations } from '@/lib/db/schema';
import {
  seedBizProfile,
  seedBuyerWorkspace,
  seedMembership,
  seedPgWorkspace,
  seedUser,
} from '@/lib/server/repositories/drizzle/__tests__/_seed';
import { generateToken, hashToken, addMinutes } from '@/lib/server/token';
import { setupRfpActionEnv, teardownRfpActionEnv } from '../../rfp/__tests__/_setup';
import type { PgliteDB } from '@/lib/db/client-pglite';

const sessionRef: {
  value: {
    user: {
      id: string;
      email: string;
      name?: string;
      workspaceId: string;
      workspaceType: 'pg';
      role: 'admin' | 'member';
    };
  } | null;
} = { value: null };

vi.mock('@/lib/auth/session', () => ({
  requireSession: () => {
    if (!sessionRef.value) return Promise.reject(new Error('UNAUTHENTICATED'));
    return Promise.resolve(sessionRef.value);
  },
  requirePgSession: () => {
    if (!sessionRef.value) return Promise.reject(new Error('FORBIDDEN_PG'));
    return Promise.resolve(sessionRef.value);
  },
  requireBuyerSession: () => {
    if (!sessionRef.value) return Promise.reject(new Error('FORBIDDEN_BUYER'));
    return Promise.resolve(sessionRef.value);
  },
}));

import { submitBidAction } from '../submitBidAction';

let db: PgliteDB;

type Setup = {
  rfpId: string;
  buyerWsId: string;
  pgWsId: string;
  pgUserId: string;
  pgUserEmail: string;
};

async function seedSetup(
  grade: 'sme2' | 'general' = 'sme2',
  requiredPaymentMethods: string[] = [],
  customPaymentMethods: { id: string; label: string }[] = [],
): Promise<Setup> {
  const buyer = await seedUser(db, { email: 'buyer@test.com' });
  const biz = await seedBizProfile(db);
  if (grade !== 'general') {
    await db.update(bizProfiles).set({ grade }).where(eq(bizProfiles.id, biz.id));
  }
  const buyerWs = await seedBuyerWorkspace(db, { bizProfileId: biz.id });
  await seedMembership(db, buyerWs.id, buyer.id, 'admin');

  const pgWs = await seedPgWorkspace(db, 'pg.test', { name: '테스트PG' });
  const pgUser = await seedUser(db, { email: 'sales@pg.test' });
  await seedMembership(db, pgWs.id, pgUser.id, 'admin');

  const rfpId = randomUUID();
  await db.insert(rfps).values({
    id: rfpId,
    code: 'P-2605-0099',
    buyerWsId: buyerWs.id,
    bizProfileId: biz.id,
    title: 'v2 bid test',
    memo: '',
    deadline: new Date(Date.now() + 86_400_000),
    status: 'sent',
    createdBy: buyer.id,
    sentAt: new Date(),
    requiredPaymentMethods,
    customPaymentMethods,
  });

  const invId = randomUUID();
  const rawToken = generateToken();
  await db.insert(rfpInvitations).values({
    id: invId,
    rfpId,
    pgWsId: pgWs.id,
    acceptedByUserId: pgUser.id,
    tokenHash: hashToken(rawToken),
    sentAt: new Date(),
    expiresAt: new Date(addMinutes(new Date(), 7 * 24 * 60)),
    status: 'accepted',
  });

  return {
    rfpId,
    buyerWsId: buyerWs.id,
    pgWsId: pgWs.id,
    pgUserId: pgUser.id,
    pgUserEmail: pgUser.email,
  };
}

const baseInput = {
  settleCycle: 'D+1',
  settleLimit: 10_000_000,
  guaranteeInsurance: 1_000_000,
  paymentFees: {
    bank_transfer: 0.001,
  },
};

describe('submitBidAction v2 — payment_fees model', () => {
  beforeEach(async () => {
    db = await setupRfpActionEnv();
  });
  afterEach(() => {
    teardownRfpActionEnv();
    sessionRef.value = null;
  });

  it('저장 — settleLimit·guaranteeInsurance·payment_fees 컬럼에 기록됨', async () => {
    const s = await seedSetup('general', ['bank_transfer']);
    sessionRef.value = {
      user: {
        id: s.pgUserId,
        email: s.pgUserEmail,
        workspaceId: s.pgWsId,
        workspaceType: 'pg',
        role: 'admin',
      },
    };

    const r = await submitBidAction({
      rfpId: s.rfpId,
      settleCycle: 'D+3',
      settleLimit: 50_000_000,
      guaranteeInsurance: 2_000_000,
      paymentFees: { bank_transfer: 0.002 },
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;

    const [row] = await db.select().from(bids).where(eq(bids.id, r.bidId));
    expect(row.settleCycle).toBe('D+3');
    expect(Number(row.settleLimit)).toBe(50_000_000);
    expect(Number(row.guaranteeInsurance)).toBe(2_000_000);
    expect(row.paymentFees).toEqual({ bank_transfer: 0.002 });
  });

  it('capped 등급(sme2)이어도 카드 수수료는 상한 없이 협상 입력으로 허용된다', async () => {
    const s = await seedSetup('sme2', ['card']);
    sessionRef.value = {
      user: {
        id: s.pgUserId,
        email: s.pgUserEmail,
        workspaceId: s.pgWsId,
        workspaceType: 'pg',
        role: 'admin',
      },
    };

    // 카드는 법정 고정이 아닌 협상 대상 — sme2에서 2%도 그대로 저장된다.
    const r = await submitBidAction({
      ...baseInput,
      rfpId: s.rfpId,
      paymentFees: { card: 0.02 },
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;

    const [row] = await db.select().from(bids).where(eq(bids.id, r.bidId));
    expect((row.paymentFees as Record<string, number>).card).toBe(0.02);
  });

  it('일반 등급 카드 수수료 상한 없음 → 높은 요율도 허용', async () => {
    const s = await seedSetup('general', ['card']);
    sessionRef.value = {
      user: {
        id: s.pgUserId,
        email: s.pgUserEmail,
        workspaceId: s.pgWsId,
        workspaceType: 'pg',
        role: 'admin',
      },
    };

    const r = await submitBidAction({
      ...baseInput,
      rfpId: s.rfpId,
      paymentFees: { card: 0.05 },
    });
    expect(r.ok).toBe(true);
  });

  it('유효하지 않은 결제수단 키 → INVALID_INPUT', async () => {
    const s = await seedSetup('general', []);
    sessionRef.value = {
      user: {
        id: s.pgUserId,
        email: s.pgUserEmail,
        workspaceId: s.pgWsId,
        workspaceType: 'pg',
        role: 'admin',
      },
    };

    const r = await submitBidAction({
      ...baseInput,
      rfpId: s.rfpId,
      // @ts-expect-error — 의도적으로 잘못된 키 전달
      paymentFees: { bitcoin: 0.001 },
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe('INVALID_INPUT');
  });

  function pgSession(s: Setup) {
    return {
      user: {
        id: s.pgUserId,
        email: s.pgUserEmail,
        workspaceId: s.pgWsId,
        workspaceType: 'pg' as const,
        role: 'admin' as const,
      },
    };
  }

  it('요청되지 않은 결제수단에 요율 제출 → PAYMENT_METHOD_NOT_REQUESTED', async () => {
    const s = await seedSetup('general', ['bank_transfer']);
    sessionRef.value = pgSession(s);

    const r = await submitBidAction({
      ...baseInput,
      rfpId: s.rfpId,
      paymentFees: { card: 0.01 }, // card는 요청 목록에 없음
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe('PAYMENT_METHOD_NOT_REQUESTED');
  });

  it('요청된 결제수단만 제출 → 허용', async () => {
    const s = await seedSetup('general', ['card', 'bank_transfer']);
    sessionRef.value = pgSession(s);

    const r = await submitBidAction({
      ...baseInput,
      rfpId: s.rfpId,
      paymentFees: { card: 0.01, bank_transfer: 0.002 },
    });
    expect(r.ok).toBe(true);
  });

  it('requiredPaymentMethods 빈 배열 → 모든 결제수단 자유 허용', async () => {
    const s = await seedSetup('general', []);
    sessionRef.value = pgSession(s);

    const r = await submitBidAction({
      ...baseInput,
      rfpId: s.rfpId,
      paymentFees: { card: 0.01, naver_pay: 0.02 },
    });
    expect(r.ok).toBe(true);
  });

  it('커스텀 결제수단 요율 제출 → customFees 저장', async () => {
    const s = await seedSetup('general', [], [{ id: 'c1', label: '포인트' }]);
    sessionRef.value = pgSession(s);

    const r = await submitBidAction({
      ...baseInput,
      rfpId: s.rfpId,
      paymentFees: { bank_transfer: 0.001 },
      customFees: { c1: 0.02 },
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;

    const [row] = await db.select().from(bids).where(eq(bids.id, r.bidId));
    expect(row.customFees).toEqual({ c1: 0.02 });
  });

  it('선언되지 않은 커스텀 id로 요율 제출 → PAYMENT_METHOD_NOT_REQUESTED', async () => {
    const s = await seedSetup('general', [], [{ id: 'c1', label: '포인트' }]);
    sessionRef.value = pgSession(s);

    const r = await submitBidAction({
      ...baseInput,
      rfpId: s.rfpId,
      paymentFees: { bank_transfer: 0.001 },
      customFees: { unknown: 0.02 },
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe('PAYMENT_METHOD_NOT_REQUESTED');
  });
});
