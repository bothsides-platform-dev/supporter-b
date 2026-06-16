import { describe, it, expect } from 'vitest';
import { classifyPgInvitation, toPgCard, comparePgCards } from '../pg-kanban';
import type { PgKanbanCard } from '../pg-kanban';
import type { RFP } from '@/lib/types/rfp';
import type { Bid } from '@/lib/types/bid';
import type { RfpInvitation } from '@/lib/types/invitation';

function makeRfp(overrides: Partial<RFP> = {}): RFP {
  return {
    id: 'rfp-uuid-1',
    code: 'P-2605-0001',
    buyerWsId: 'ws-buyer',
    title: 'RFP 1',
    memo: '',
    rfpFiles: [],
    allowedPgWorkspaceIds: [],
    requiredPaymentMethods: [],
    customPaymentMethods: [],
    deadline: '2026-05-20T00:00:00Z',
    status: 'sent',
    createdBy: 'user-1',
    createdAt: '2026-05-01T00:00:00Z',
    ...overrides,
  };
}

function makeInv(status: RfpInvitation['status'] = 'accepted'): RfpInvitation {
  return {
    id: 'inv-1',
    rfpId: 'P-2605-0001',
    pgWsId: 'ws-pg',
    acceptedByUserId: 'user-pg',
    uniqueToken: '',
    sentAt: '2026-05-01T00:00:00Z',
    expiresAt: '2026-05-20T00:00:00Z',
    status,
  };
}

function makeBid(id: string, status: Bid['status'] = 'submitted'): Bid {
  return {
    id,
    rfpId: 'P-2605-0001',
    pgWsId: 'ws-pg',
    invitationId: 'inv-1',
    settleCycle: 'D+1',
    settleLimit: 0,
    guaranteeInsurance: 0,
    paymentFees: {},
    customFees: {},
    proposalPdfs: [],
    status,
    submittedBy: 'user-pg',
    submittedAt: status === 'submitted' ? '2026-05-05T00:00:00Z' : undefined,
    round: 1,
  };
}

describe('classifyPgInvitation', () => {
  it('received: invitation=accepted + no bid', () => {
    const stage = classifyPgInvitation({
      invitation: makeInv('accepted'),
      bid: undefined,
      rfp: makeRfp(),
    });
    expect(stage).toBe('received');
  });

  it('received: invitation=opened + no bid (열람도 신규로 — 검토중 단계 제거)', () => {
    const stage = classifyPgInvitation({
      invitation: makeInv('opened'),
      bid: undefined,
      rfp: makeRfp(),
    });
    expect(stage).toBe('received');
  });

  it('received: bid=draft (작성중 단계 제거 — 미제출 응답은 신규로)', () => {
    const stage = classifyPgInvitation({
      invitation: makeInv('opened'),
      bid: makeBid('b1', 'draft'),
      rfp: makeRfp(),
    });
    expect(stage).toBe('received');
  });

  it('submitted: bid=submitted + rfp=sent', () => {
    const stage = classifyPgInvitation({
      invitation: makeInv('opened'),
      bid: makeBid('b1', 'submitted'),
      rfp: makeRfp({ status: 'sent' }),
    });
    expect(stage).toBe('submitted');
  });

  it('won: rfp.awardedBidId == thisBid.id', () => {
    const stage = classifyPgInvitation({
      invitation: makeInv('opened'),
      bid: makeBid('b1', 'submitted'),
      rfp: makeRfp({ status: 'awarded', awardedBidId: 'b1' }),
    });
    expect(stage).toBe('won');
  });

  it('lost: 타사 낙찰', () => {
    const stage = classifyPgInvitation({
      invitation: makeInv('opened'),
      bid: makeBid('b1', 'submitted'),
      rfp: makeRfp({ status: 'awarded', awardedBidId: 'b-other' }),
    });
    expect(stage).toBe('lost');
  });

  it('lost: bid=withdrawn', () => {
    const stage = classifyPgInvitation({
      invitation: makeInv('opened'),
      bid: makeBid('b1', 'withdrawn'),
      rfp: makeRfp({ status: 'sent' }),
    });
    expect(stage).toBe('lost');
  });

  it('lost: rfp=closed', () => {
    const stage = classifyPgInvitation({
      invitation: makeInv('opened'),
      bid: makeBid('b1', 'submitted'),
      rfp: makeRfp({ status: 'closed' }),
    });
    expect(stage).toBe('lost');
  });

  it('lost: rfp=cancelled', () => {
    const stage = classifyPgInvitation({
      invitation: makeInv('opened'),
      bid: makeBid('b1', 'submitted'),
      rfp: makeRfp({ status: 'cancelled' }),
    });
    expect(stage).toBe('lost');
  });

  it('won 이 withdrawn bid 보다 우선 — awarded 가 결과', () => {
    // 엣지 케이스: 제출했다가 withdraw 했지만 어떤 이유로 그 bid 가 낙찰된 경우(이론상)
    const stage = classifyPgInvitation({
      invitation: makeInv('opened'),
      bid: makeBid('b1', 'withdrawn'),
      rfp: makeRfp({ status: 'awarded', awardedBidId: 'b1' }),
    });
    expect(stage).toBe('won');
  });

  it('lost: rfp=awarded + no bid (응답 안 한 채로 타사 낙찰됨)', () => {
    const stage = classifyPgInvitation({
      invitation: makeInv('opened'),
      bid: undefined,
      rfp: makeRfp({ status: 'awarded', awardedBidId: 'b-other' }),
    });
    expect(stage).toBe('lost');
  });
});

describe('toPgCard', () => {
  it('buyerName 과 hasPendingRequote 를 카드 페이로드에 전달', () => {
    const card = toPgCard({
      invitation: makeInv('opened'),
      bid: makeBid('b1', 'submitted'),
      rfp: makeRfp(),
      stage: 'submitted',
      buyerName: '오롤리데이',
      hasPendingRequote: true,
    });
    expect(card.buyerName).toBe('오롤리데이');
    expect(card.hasPendingRequote).toBe(true);
  });

  it('hasPendingRequote 미전달 시 false 기본값', () => {
    const card = toPgCard({
      invitation: makeInv('accepted'),
      rfp: makeRfp(),
      stage: 'received',
    });
    expect(card.hasPendingRequote).toBe(false);
    expect(card.buyerName).toBeUndefined();
  });

  it('rfp.updatedAt 있을 때 → card.rfpUpdatedAt 전달', () => {
    const card = toPgCard({
      invitation: makeInv('opened'),
      rfp: makeRfp({ updatedAt: '2026-06-17T10:00:00Z' }),
      stage: 'received',
    });
    expect(card.rfpUpdatedAt).toBe('2026-06-17T10:00:00Z');
  });

  it('rfp.updatedAt 없을 때 → card.rfpUpdatedAt undefined', () => {
    const card = toPgCard({
      invitation: makeInv('accepted'),
      rfp: makeRfp(),
      stage: 'received',
    });
    expect(card.rfpUpdatedAt).toBeUndefined();
  });
});

describe('comparePgCards — 결과 컬럼 정렬', () => {
  it('won 컬럼: rfpUpdatedAt 최신 카드가 먼저', () => {
    const a: PgKanbanCard = {
      invitationId: 'inv-1',
      rfpId: 'P-01',
      title: 'A',
      stage: 'won',
      deadline: '2026-06-01T00:00:00Z',
      rfpUpdatedAt: '2026-06-14T00:00:00Z',
      hasPendingRequote: false,
    };
    const b: PgKanbanCard = { ...a, rfpId: 'P-02', rfpUpdatedAt: '2026-06-17T00:00:00Z' };
    expect(comparePgCards(b, a)).toBeLessThan(0);
  });

  it('lost 컬럼: rfpUpdatedAt 최신 카드가 먼저', () => {
    const a: PgKanbanCard = {
      invitationId: 'inv-3',
      rfpId: 'P-03',
      title: 'C',
      stage: 'lost',
      deadline: '2026-06-01T00:00:00Z',
      rfpUpdatedAt: '2026-06-10T00:00:00Z',
      hasPendingRequote: false,
    };
    const b: PgKanbanCard = { ...a, rfpId: 'P-04', rfpUpdatedAt: '2026-06-16T00:00:00Z' };
    expect(comparePgCards(b, a)).toBeLessThan(0);
  });

  it('received/submitted 컬럼: deadline 오름차순 유지 (기존 동작 회귀 방지)', () => {
    const soon: PgKanbanCard = {
      invitationId: 'inv-5',
      rfpId: 'P-05',
      title: 'E',
      stage: 'received',
      deadline: '2026-06-20T00:00:00Z',
      rfpUpdatedAt: '2026-06-01T00:00:00Z',
      hasPendingRequote: false,
    };
    const later: PgKanbanCard = { ...soon, rfpId: 'P-06', deadline: '2026-07-01T00:00:00Z' };
    expect(comparePgCards(soon, later)).toBeLessThan(0);
  });

  it('rfpUpdatedAt 없을 때 → deadline 으로 fallback 정렬 (나중 마감일이 먼저)', () => {
    const withEarlierDeadline: PgKanbanCard = {
      invitationId: 'inv-7',
      rfpId: 'P-07',
      title: 'G',
      stage: 'won',
      deadline: '2026-06-05T00:00:00Z',
      rfpUpdatedAt: undefined,
      hasPendingRequote: false,
    };
    const withLaterDeadline: PgKanbanCard = {
      ...withEarlierDeadline,
      rfpId: 'P-08',
      deadline: '2026-06-10T00:00:00Z',
    };
    // 결과 컬럼 최신순: 나중 마감일(withLaterDeadline)이 먼저 오도록 정렬
    // comparePgCards(withLaterDeadline, withEarlierDeadline):
    //   ta = '2026-06-10', tb = '2026-06-05'
    //   new Date(tb) - new Date(ta) < 0 → withLaterDeadline 이 앞
    expect(comparePgCards(withLaterDeadline, withEarlierDeadline)).toBeLessThan(0);
  });
});
