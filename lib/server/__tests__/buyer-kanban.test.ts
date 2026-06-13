import { describe, it, expect } from 'vitest';
import { classifyBuyerRfp, toBuyerCard } from '../buyer-kanban';
import type { RFP } from '@/lib/types/rfp';

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

describe('classifyBuyerRfp', () => {
  it('active: status=sent', () => {
    expect(classifyBuyerRfp({ rfp: makeRfp({ status: 'sent' }) })).toBe('active');
  });

  it('awarded: status=awarded', () => {
    expect(classifyBuyerRfp({ rfp: makeRfp({ status: 'awarded', awardedBidId: 'b1' }) })).toBe('awarded');
  });

  it('closed: status=closed', () => {
    expect(classifyBuyerRfp({ rfp: makeRfp({ status: 'closed' }) })).toBe('closed');
  });

  it('closed: status=cancelled', () => {
    expect(classifyBuyerRfp({ rfp: makeRfp({ status: 'cancelled' }) })).toBe('closed');
  });
});

describe('toBuyerCard', () => {
  it('cancelled RFP → isCancelled=true (마감 컬럼 안 취소 구분 칩용)', () => {
    const card = toBuyerCard({
      rfp: makeRfp({ status: 'cancelled' }),
      bids: [],
      invitations: [],
      stage: 'closed',
    });
    expect(card.isCancelled).toBe(true);
  });

  it('closed(비취소) RFP → isCancelled=false', () => {
    const card = toBuyerCard({
      rfp: makeRfp({ status: 'closed' }),
      bids: [],
      invitations: [],
      stage: 'closed',
    });
    expect(card.isCancelled).toBe(false);
  });
});
