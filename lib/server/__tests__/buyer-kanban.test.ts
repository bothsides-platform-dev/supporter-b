import { describe, it, expect } from 'vitest';
import { classifyBuyerRfp } from '../buyer-kanban';
import type { RFP } from '@/lib/types/rfp';
import type { Bid } from '@/lib/types/bid';
import type { RfpInvitation } from '@/lib/types/invitation';

const FROZEN_NOW = new Date('2026-05-10T00:00:00Z');
const FUTURE = new Date('2026-05-20T00:00:00Z').toISOString();
const PAST = new Date('2026-05-01T00:00:00Z').toISOString();

function makeRfp(overrides: Partial<RFP> = {}): RFP {
  return {
    id: 'rfp-uuid-1',
    code: 'P-2605-0001',
    buyerWsId: 'ws-buyer',
    title: 'RFP 1',
    memo: '',
    rfpFiles: [],
    allowedPgWorkspaceIds: [],
    deadline: FUTURE,
    status: 'sent',
    createdBy: 'user-1',
    createdAt: '2026-05-01T00:00:00Z',
    ...overrides,
  };
}

function makeInv(
  id: string,
  status: RfpInvitation['status'] = 'sent',
): RfpInvitation {
  return {
    id,
    rfpId: 'P-2605-0001',
    pgWsId: `ws-pg-${id}`,
    uniqueToken: '',
    sentAt: '2026-05-01T00:00:00Z',
    expiresAt: FUTURE,
    status,
  };
}

function makeBid(id: string, status: Bid['status'] = 'submitted'): Bid {
  return {
    id,
    rfpId: 'P-2605-0001',
    pgWsId: `ws-pg-${id}`,
    invitationId: `inv-${id}`,
    settleCycle: 'D+1',
    deposit: 0,
    setupFee: 0,
    monthlyMin: 0,
    bankTransferFeePct: 0.003,
    easyPayFeePct: 0.015,
    proposalPdfs: [],
    status,
    submittedBy: 'user-1',
    submittedAt: status === 'submitted' ? '2026-05-05T00:00:00Z' : undefined,
  };
}

describe('classifyBuyerRfp', () => {
  it('draft: status=draft', () => {
    const stage = classifyBuyerRfp({
      rfp: makeRfp({ status: 'draft' }),
      bids: [],
      invitations: [],
      now: FROZEN_NOW,
    });
    expect(stage).toBe('draft');
  });

  it('active: status=sent (제출 bid 0건이어도 active)', () => {
    const stage = classifyBuyerRfp({
      rfp: makeRfp({ status: 'sent' }),
      bids: [makeBid('b1', 'draft')],
      invitations: [makeInv('i1')],
      now: FROZEN_NOW,
    });
    expect(stage).toBe('active');
  });

  it('active: status=sent + 제출 bid 있음 + 마감 경과 (수집/비교 구분 없이 active)', () => {
    const stage = classifyBuyerRfp({
      rfp: makeRfp({ status: 'sent', deadline: PAST }),
      bids: [makeBid('b1', 'submitted')],
      invitations: [makeInv('i1'), makeInv('i2')],
      now: FROZEN_NOW,
    });
    expect(stage).toBe('active');
  });

  it('awarded: status=awarded', () => {
    const stage = classifyBuyerRfp({
      rfp: makeRfp({ status: 'awarded', awardedBidId: 'b1' }),
      bids: [makeBid('b1', 'submitted')],
      invitations: [makeInv('i1')],
      now: FROZEN_NOW,
    });
    expect(stage).toBe('awarded');
  });

  it('closed: status=closed', () => {
    const stage = classifyBuyerRfp({
      rfp: makeRfp({ status: 'closed' }),
      bids: [],
      invitations: [],
      now: FROZEN_NOW,
    });
    expect(stage).toBe('closed');
  });

  it('closed: status=cancelled', () => {
    const stage = classifyBuyerRfp({
      rfp: makeRfp({ status: 'cancelled' }),
      bids: [],
      invitations: [],
      now: FROZEN_NOW,
    });
    expect(stage).toBe('closed');
  });
});
