import { describe, expect, it } from 'vitest';
import { toBuyerCard } from '@/lib/server/buyer-kanban';
import type { RFP } from '@/lib/types/rfp';

function rfp(over: Partial<RFP>): RFP {
  return {
    id: 'r1', code: 'P-2606-0001', buyerWsId: 'ws1', title: 't', memo: '',
    rfpFiles: [], allowedPgWorkspaceIds: [], deadline: new Date().toISOString(),
    status: 'sent', createdBy: 'u1', createdAt: new Date().toISOString(),
    requiredPaymentMethods: [], customPaymentMethods: [], ...over,
  };
}

describe('toBuyerCard isSample', () => {
  it('carries isSample onto the card', () => {
    const card = toBuyerCard({ rfp: rfp({ isSample: true }), bids: [], invitations: [], stage: 'active' });
    expect(card.isSample).toBe(true);
  });
  it('defaults to false', () => {
    const card = toBuyerCard({ rfp: rfp({}), bids: [], invitations: [], stage: 'active' });
    expect(card.isSample).toBe(false);
  });
});
