// submitBidAction tests.
//
// Coverage:
//   - canAccess 가드: 초대된 PG 워크스페이스 멤버 누구나 통과
//   - 카드 수수료는 등급 무관 협상 입력 — 상한 검증 없이 그대로 저장
//   - UNIQUE(rfpId, pgWsId) 위반 → BID_ALREADY_SUBMITTED (advisor pin 4)
//   - bid.submitted 알림 — buyer ws 전 멤버 인앱 + 메일 (advisor pin 6)
//   - dedupeKey 형식: bid:{rfpId}:{pgWsId}:{userId}
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { and, eq } from 'drizzle-orm';

import {
  bids,
  bizProfiles,
  pgSigningTemplates,
  notifications,
  outboxEntries,
  rfps,
  rfpInvitations,
  workspaceMembers,
} from '@/lib/db/schema';
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
  buyerUserIds: string[];
  buyerEmails: string[];
  pgWsId: string;
  pgUserId: string;
  pgUserEmail: string;
  invitationId: string;
};

async function seedSetup(grade: 'sme2' | 'general' = 'sme2'): Promise<Setup> {
  // Buyer with two members.
  const buyer1 = await seedUser(db, { email: 'b1@buyer.com' });
  const buyer2 = await seedUser(db, { email: 'b2@buyer.com' });
  const biz = await seedBizProfile(db);
  // Override the seed grade — _seed defaults to 'general'.
  if (grade !== 'general') {
    await db.update(bizProfiles).set({ grade }).where(eq(bizProfiles.id, biz.id));
  }
  const buyerWs = await seedBuyerWorkspace(db, { bizProfileId: biz.id });
  await seedMembership(db, buyerWs.id, buyer1.id, 'admin');
  await seedMembership(db, buyerWs.id, buyer2.id, 'member');

  // PG ws + claimer.
  const pgWs = await seedPgWorkspace(db, 'toss.im', { name: '서포터 B 페이' });
  const pgUser = await seedUser(db, { email: 'sales@toss.im' });
  await seedMembership(db, pgWs.id, pgUser.id, 'admin');

  const rfpId = randomUUID();
  await db.insert(rfps).values({
    id: rfpId,
    code: 'P-2605-0001',
    buyerWsId: buyerWs.id,
    bizProfileId: biz.id,
    title: 'bid test',
    memo: '',
    deadline: new Date(Date.now() + 86_400_000),
    status: 'sent',
    createdBy: buyer1.id,
    sentAt: new Date(),
  });

  const invId = randomUUID();
  const rawToken = generateToken();
  await db.insert(rfpInvitations).values({
    id: invId,
    rfpId,
    pgWsId: pgWs.id,
    acceptedByUserId: pgUser.id, // 이미 클레임된 상태로 시드.
    tokenHash: hashToken(rawToken),
    sentAt: new Date(),
    expiresAt: new Date(addMinutes(new Date(), 7 * 24 * 60)),
    status: 'accepted',
  });

  return {
    rfpId,
    buyerWsId: buyerWs.id,
    buyerUserIds: [buyer1.id, buyer2.id],
    buyerEmails: ['b1@buyer.com', 'b2@buyer.com'],
    pgWsId: pgWs.id,
    pgUserId: pgUser.id,
    pgUserEmail: pgUser.email,
    invitationId: invId,
  };
}

const baseInput = {
  settleCycle: 'D+1',
  // 0 은 서버가 거부한다(정산한도는 양수) — 전용 거부 테스트가 따로 있다.
  settleLimit: 50_000_000,
  guaranteeInsurance: 0,
  paymentFees: { bank_transfer: 0.001 },
};

describe('submitBidAction', () => {
  beforeEach(async () => {
    db = await setupRfpActionEnv();
  });
  afterEach(() => {
    teardownRfpActionEnv();
    sessionRef.value = null;
  });

  it('rejects without PG session', async () => {
    const s = await seedSetup();
    sessionRef.value = null;
    const r = await submitBidAction({ rfpId: s.rfpId, ...baseInput });
    expect(r.ok).toBe(false);
  });

  it('rejects a malformed settleCycle and writes no bid (server trust boundary)', async () => {
    const s = await seedSetup();
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
      ...baseInput,
      settleCycle: '협의', // free text — must not reach the DB
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe('INVALID_INPUT');

    const [bid] = await db.select().from(bids).where(eq(bids.rfpId, s.rfpId));
    expect(bid).toBeUndefined();
  });

  it('canAccess passes — workspace peer who never claimed token can still submit', async () => {
    const s = await seedSetup();
    // 같은 PG 워크스페이스 동료 — 토큰 미클레임. 정책상 ws 멤버이면 제출 가능.
    const peer = await seedUser(db, { email: 'cs@toss.im' });
    await seedMembership(db, s.pgWsId, peer.id);

    sessionRef.value = {
      user: {
        id: peer.id,
        email: 'cs@toss.im',
        workspaceId: s.pgWsId,
        workspaceType: 'pg',
        role: 'member',
      },
    };
    const r = await submitBidAction({ rfpId: s.rfpId, ...baseInput });
    expect(r.ok).toBe(true);
    if (!r.ok) return;

    // Bid row inserted under the peer's workspace, attributed to peer.
    const [row] = await db
      .select()
      .from(bids)
      .where(eq(bids.rfpId, s.rfpId));
    expect(row).toBeDefined();
    expect(row.pgWsId).toBe(s.pgWsId);
    expect(row.submittedBy).toBe(peer.id);
  });

  it('sme2 등급이어도 카드 수수료는 상한 없이 협상 입력으로 저장된다', async () => {
    const s = await seedSetup('sme2');
    sessionRef.value = {
      user: {
        id: s.pgUserId,
        email: s.pgUserEmail,
        workspaceId: s.pgWsId,
        workspaceType: 'pg',
        role: 'admin',
      },
    };

    // 카드는 법정 고정이 아닌 협상 대상 — sme2에서 2%도 거부 없이 저장된다.
    const r = await submitBidAction({
      rfpId: s.rfpId,
      ...baseInput,
      paymentFees: { card: 0.02 },
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;

    const [row] = await db.select().from(bids).where(eq(bids.id, r.bidId));
    expect((row.paymentFees as { card?: number })?.card).toBe(0.02);
  });

  it('null grade (no bizProfile) allows any card fee rate', async () => {
    const s = await seedSetup('general');
    // Drop bizProfile entirely — RFP created in 사전 제안 mode.
    await db.update(rfps).set({ bizProfileId: null }).where(eq(rfps.id, s.rfpId));

    sessionRef.value = {
      user: {
        id: s.pgUserId,
        email: s.pgUserEmail,
        workspaceId: s.pgWsId,
        workspaceType: 'pg',
        role: 'admin',
      },
    };

    // 5% card fee — allowed because null grade maps to 'general' (no cap).
    const r = await submitBidAction({
      rfpId: s.rfpId,
      ...baseInput,
      paymentFees: { card: 0.05 },
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;

    const [row] = await db.select().from(bids).where(eq(bids.id, r.bidId));
    expect((row.paymentFees as { card?: number })?.card).toBe(0.05);
  });

  it('general grade allows any card fee rate — no statutory cap', async () => {
    const s = await seedSetup('general');
    sessionRef.value = {
      user: {
        id: s.pgUserId,
        email: s.pgUserEmail,
        workspaceId: s.pgWsId,
        workspaceType: 'pg',
        role: 'admin',
      },
    };

    // 5% card fee — general grade has no statutory cap (NaN).
    const r = await submitBidAction({
      rfpId: s.rfpId,
      ...baseInput,
      paymentFees: { card: 0.05 },
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;

    const [row] = await db.select().from(bids).where(eq(bids.id, r.bidId));
    expect((row.paymentFees as { card?: number })?.card).toBe(0.05);
  });

  it('🚨 second submit returns BID_ALREADY_SUBMITTED on UNIQUE(rfpId, pgWsId) (advisor pin 4)', async () => {
    const s = await seedSetup();
    sessionRef.value = {
      user: {
        id: s.pgUserId,
        email: s.pgUserEmail,
        workspaceId: s.pgWsId,
        workspaceType: 'pg',
        role: 'admin',
      },
    };

    const r1 = await submitBidAction({ rfpId: s.rfpId, ...baseInput });
    expect(r1.ok).toBe(true);

    const r2 = await submitBidAction({ rfpId: s.rfpId, ...baseInput });
    expect(r2.ok).toBe(false);
    if (!r2.ok) expect(r2.error).toBe('BID_ALREADY_SUBMITTED');
  });

  it('emits in-app + outbox notifications to all buyer ws members (advisor pin 6) with member-keyed dedupe', async () => {
    const s = await seedSetup();
    sessionRef.value = {
      user: {
        id: s.pgUserId,
        email: s.pgUserEmail,
        workspaceId: s.pgWsId,
        workspaceType: 'pg',
        role: 'admin',
      },
    };

    const r = await submitBidAction({ rfpId: s.rfpId, ...baseInput });
    expect(r.ok).toBe(true);

    // — In-app notifications: one per buyer member.
    const notifs = await db
      .select()
      .from(notifications)
      .where(
        and(
          eq(notifications.workspaceId, s.buyerWsId),
          eq(notifications.type, 'bid.submitted'),
        ),
      );
    expect(notifs.map((n) => n.userId).sort()).toEqual(
      [...s.buyerUserIds].sort(),
    );
    for (const n of notifs) expect(n.channel).toBe('in_app');

    // — Outbox: one bid.submitted entry per buyer member email,
    //   dedupeKey = bid:{rfpId}:{pgWsId}:{userId}.
    const outbox = await db
      .select()
      .from(outboxEntries)
      .where(eq(outboxEntries.event, 'bid.submitted'));
    expect(outbox).toHaveLength(s.buyerUserIds.length);
    expect(outbox.map((o) => o.toAddr).sort()).toEqual(
      [...s.buyerEmails].sort(),
    );
    expect(outbox.map((o) => o.dedupeKey).sort()).toEqual(
      [...s.buyerUserIds]
        .map((u) => `bid:${s.rfpId}:${s.pgWsId}:${u}`)
        .sort(),
    );
  });

  it('카드 구간맵을 그대로 저장한다', async () => {
    const s = await seedSetup();
    sessionRef.value = {
      user: {
        id: s.pgUserId,
        email: s.pgUserEmail,
        workspaceId: s.pgWsId,
        workspaceType: 'pg',
        role: 'admin',
      },
    };

    // Set card as a required payment method so the service gate passes.
    await db.update(rfps).set({ requiredPaymentMethods: ['card'] }).where(eq(rfps.id, s.rfpId));

    const r = await submitBidAction({
      rfpId: s.rfpId,
      settleCycle: 'D+1',
      settleLimit: 50_000_000,
      guaranteeInsurance: 0,
      paymentFees: { card: { sole: 0.005, general: 0.018 } },
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;

    const [row] = await db.select().from(bids).where(eq(bids.id, r.bidId));
    expect((row.paymentFees as { card?: unknown }).card).toEqual({ sole: 0.005, general: 0.018 });
  });

  it('잘못된 구간 키는 거부한다', async () => {
    const s = await seedSetup();
    sessionRef.value = {
      user: {
        id: s.pgUserId,
        email: s.pgUserEmail,
        workspaceId: s.pgWsId,
        workspaceType: 'pg',
        role: 'admin',
      },
    };

    await db.update(rfps).set({ requiredPaymentMethods: ['card'] }).where(eq(rfps.id, s.rfpId));

    const r = await submitBidAction({
      rfpId: s.rfpId,
      settleCycle: 'D+1',
      settleLimit: 50_000_000,
      guaranteeInsurance: 0,
      paymentFees: { card: { bogus: 0.1 } as never },
    });
    expect(r.ok).toBe(false);
  });

  it('rejects settleLimit 0 and writes no bid (server trust boundary)', async () => {
    // 클라이언트 게이트(isSettleLimitValid)는 0 을 막지만, 배포 창에 구 번들을 든
    // 탭이나 직접 액션 호출은 그것을 우회한다 — 서버가 같은 판정을 해야 한다.
    const s = await seedSetup();
    sessionRef.value = {
      user: {
        id: s.pgUserId,
        email: s.pgUserEmail,
        workspaceId: s.pgWsId,
        workspaceType: 'pg',
        role: 'admin',
      },
    };

    const r = await submitBidAction({ ...baseInput, rfpId: s.rfpId, settleLimit: 0 });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe('INVALID_INPUT');

    const [bid] = await db.select().from(bids).where(eq(bids.rfpId, s.rfpId));
    expect(bid).toBeUndefined();
  });

  it('rejects a negative settleLimit and writes no bid', async () => {
    // .positive() 는 0 과 음수를 함께 막는다 — 둘 다 고정해 둬야 나중에
    // .nonnegative() 로 되돌리는 변경이 두 테스트를 동시에 깨뜨린다.
    const s = await seedSetup();
    sessionRef.value = {
      user: {
        id: s.pgUserId,
        email: s.pgUserEmail,
        workspaceId: s.pgWsId,
        workspaceType: 'pg',
        role: 'admin',
      },
    };

    const r = await submitBidAction({ ...baseInput, rfpId: s.rfpId, settleLimit: -1 });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe('INVALID_INPUT');

    const [bid] = await db.select().from(bids).where(eq(bids.rfpId, s.rfpId));
    expect(bid).toBeUndefined();
  });

  it('rejects when RFP is not in sent state', async () => {
    const s = await seedSetup();
    await db.update(rfps).set({ status: 'closed' }).where(eq(rfps.id, s.rfpId));

    sessionRef.value = {
      user: {
        id: s.pgUserId,
        email: s.pgUserEmail,
        workspaceId: s.pgWsId,
        workspaceType: 'pg',
        role: 'admin',
      },
    };

    const r = await submitBidAction({ rfpId: s.rfpId, ...baseInput });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe('RFP_NOT_OPEN');

    const [bid] = await db
      .select()
      .from(bids)
      .where(eq(bids.rfpId, s.rfpId));
    expect(bid).toBeUndefined();

    const [member] = await db
      .select()
      .from(workspaceMembers)
      .where(eq(workspaceMembers.workspaceId, s.buyerWsId));
    expect(member).toBeDefined();
  });

  // 견적별 계약서 템플릿 — .strict() 라 액션 스키마에 없으면 제출 전체가 INVALID_INPUT.
  it('accepts and persists a signingTemplateId owned by the PG', async () => {
    const s = await seedSetup();
    sessionRef.value = {
      user: {
        id: s.pgUserId,
        email: s.pgUserEmail,
        workspaceId: s.pgWsId,
        workspaceType: 'pg',
        role: 'admin',
      },
    };
    const templateId = randomUUID();
    await db.insert(pgSigningTemplates).values({
      id: templateId,
      workspaceId: s.pgWsId,
      snowsignTemplateId: `tmpl_${templateId.slice(0, 8)}`,
      name: '가맹계약서',
      roleMapping: { 구매사: 'buyer', PG: 'pg' },
      createdBy: s.pgUserId,
    });

    const r = await submitBidAction({ rfpId: s.rfpId, ...baseInput, signingTemplateId: templateId });
    expect(r.ok).toBe(true);

    const [bid] = await db.select().from(bids).where(eq(bids.rfpId, s.rfpId));
    expect(bid!.signingTemplateId).toBe(templateId);
  });

  it('rejects a non-uuid signingTemplateId at the trust boundary', async () => {
    const s = await seedSetup();
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
      ...baseInput,
      signingTemplateId: 'not-a-uuid',
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toBe('INVALID_INPUT');

    const [bid] = await db.select().from(bids).where(eq(bids.rfpId, s.rfpId));
    expect(bid).toBeUndefined();
  });
});
