import { describe, it, expect } from 'vitest';
import { classifyBuyerRfp } from '../buyer-kanban';
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
    deadline: '2026-05-20T00:00:00Z',
    status: 'sent',
    createdBy: 'user-1',
    createdAt: '2026-05-01T00:00:00Z',
    ...overrides,
  };
}

describe('classifyBuyerRfp', () => {
  it('draft: status=draft', () => {
    expect(classifyBuyerRfp({ rfp: makeRfp({ status: 'draft' }) })).toBe('draft');
  });

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
