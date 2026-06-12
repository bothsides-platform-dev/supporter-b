import { describe, it, expect } from 'vitest';
import { classifyPgInvitation, toPgCard } from '../pg-kanban';
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
});
