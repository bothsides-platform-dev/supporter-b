import { describe, it, expect } from 'vitest';
import { classifyBuyerRfp, toBuyerCard, compareBuyerCards } from '../buyer-kanban';
import type { BuyerKanbanCard } from '../buyer-kanban';
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

describe('compareBuyerCards — 결과 컬럼 정렬', () => {
  it('awarded 컬럼: updatedAt 최신 카드가 먼저 (createdAt 무관)', () => {
    const older: BuyerKanbanCard = {
      rfpId: 'P-01',
      title: 'A',
      stage: 'awarded',
      deadline: '2026-06-01T00:00:00Z',
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-06-14T00:00:00Z',
      invitedPgCount: 1,
      submittedBidCount: 1,
      isSample: false,
      isCancelled: false,
    };
    const newer: BuyerKanbanCard = {
      ...older,
      rfpId: 'P-02',
      updatedAt: '2026-06-17T00:00:00Z',
    };
    expect(compareBuyerCards(newer, older)).toBeLessThan(0);
    expect(compareBuyerCards(older, newer)).toBeGreaterThan(0);
  });

  it('closed 컬럼: updatedAt 최신 카드가 먼저', () => {
    const a: BuyerKanbanCard = {
      rfpId: 'P-03',
      title: 'B',
      stage: 'closed',
      deadline: '2026-06-01T00:00:00Z',
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-06-10T00:00:00Z',
      invitedPgCount: 0,
      submittedBidCount: 0,
      isSample: false,
      isCancelled: true,
    };
    const b: BuyerKanbanCard = { ...a, rfpId: 'P-04', updatedAt: '2026-06-16T00:00:00Z' };
    expect(compareBuyerCards(b, a)).toBeLessThan(0);
  });

  it('active 컬럼: deadline 오름차순 유지 (기존 동작 회귀 방지)', () => {
    const soon: BuyerKanbanCard = {
      rfpId: 'P-05',
      title: 'C',
      stage: 'active',
      deadline: '2026-06-20T00:00:00Z',
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-06-01T00:00:00Z',
      invitedPgCount: 1,
      submittedBidCount: 0,
      isSample: false,
      isCancelled: false,
    };
    const later: BuyerKanbanCard = { ...soon, rfpId: 'P-06', deadline: '2026-07-01T00:00:00Z' };
    expect(compareBuyerCards(soon, later)).toBeLessThan(0);
  });
});
