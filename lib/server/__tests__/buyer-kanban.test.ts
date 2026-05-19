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
    id: 'P-2605-0001',
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
    proposalPdf: { id: '', name: '', size: 0, mimeType: '', url: '' },
    status,
    buyerStage: 'pending',
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

  it('sent: status=sent + 제출 bid 0', () => {
    const stage = classifyBuyerRfp({
      rfp: makeRfp({ status: 'sent' }),
      bids: [makeBid('b1', 'draft')], // PG WIP — buyer 한테 안 보임
      invitations: [makeInv('i1')],
      now: FROZEN_NOW,
    });
    expect(stage).toBe('sent');
  });

  it('collecting: status=sent + 제출 bid≥1 + deadline 미경과 + 일부만 응답', () => {
    const stage = classifyBuyerRfp({
      rfp: makeRfp({ status: 'sent', deadline: FUTURE }),
      bids: [makeBid('b1', 'submitted')],
      invitations: [makeInv('i1'), makeInv('i2'), makeInv('i3')],
      now: FROZEN_NOW,
    });
    expect(stage).toBe('collecting');
  });

  it('comparing: deadline 경과', () => {
    const stage = classifyBuyerRfp({
      rfp: makeRfp({ status: 'sent', deadline: PAST }),
      bids: [makeBid('b1', 'submitted')],
      invitations: [makeInv('i1'), makeInv('i2')],
      now: FROZEN_NOW,
    });
    expect(stage).toBe('comparing');
  });

  it('comparing: 모든 활성 초대 PG 가 응답 제출', () => {
    const stage = classifyBuyerRfp({
      rfp: makeRfp({ status: 'sent', deadline: FUTURE }),
      bids: [makeBid('b1', 'submitted'), makeBid('b2', 'submitted')],
      invitations: [
        makeInv('i1', 'accepted'),
        makeInv('i2', 'opened'),
        makeInv('i3', 'expired'), // 모수 제외 — 활성 2건 = bid 2건
      ],
      now: FROZEN_NOW,
    });
    expect(stage).toBe('comparing');
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

  it('withdrawn bid 는 응답 카운트에서 제외 — 다른 bid 가 submitted 면 collecting 유지', () => {
    const stage = classifyBuyerRfp({
      rfp: makeRfp({ status: 'sent', deadline: FUTURE }),
      bids: [makeBid('b1', 'submitted'), makeBid('b2', 'withdrawn')],
      invitations: [makeInv('i1'), makeInv('i2'), makeInv('i3')],
      now: FROZEN_NOW,
    });
    expect(stage).toBe('collecting');
  });

  it('invitation 0건 + 제출 bid 0건 + status=sent → sent', () => {
    // 엣지 케이스: 발송 직후 아직 클레임 전. (실제로는 invitedActive=0 이어도 submittedBids=0
    // 이라 sent 로 판정.)
    const stage = classifyBuyerRfp({
      rfp: makeRfp({ status: 'sent' }),
      bids: [],
      invitations: [],
      now: FROZEN_NOW,
    });
    expect(stage).toBe('sent');
  });
});
