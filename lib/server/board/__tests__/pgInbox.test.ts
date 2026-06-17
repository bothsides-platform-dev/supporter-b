import { describe, expect, it } from 'vitest';
import { pgInboxDataToRows, buildPgPipelineCards, type PgInboxData } from '../pgInbox';
import type { PgInvitationPair } from '@/lib/server/repositories/types';
import type { Bid } from '@/lib/types/bid';
import type { RFP } from '@/lib/types/rfp';
import type { RfpInvitation } from '@/lib/types/invitation';
import type { BoardColumn } from '@/lib/types/column';

// ── fixtures ──────────────────────────────────────────────────────────────────

const BASE_RFP: RFP = {
  id: 'rfp-1',
  code: 'P-2606-0001',
  buyerWsId: 'buyer-ws-1',
  title: '테스트 견적',
  memo: '',
  rfpFiles: [],
  allowedPgWorkspaceIds: [],
  deadline: '2026-12-31',
  status: 'sent',
  createdBy: 'user-1',
  createdAt: '2026-06-01T00:00:00Z',
  requiredPaymentMethods: [],
  customPaymentMethods: [],
  isSample: false,
  contractType: null,
};

const BASE_INVITATION: RfpInvitation = {
  id: 'inv-1',
  rfpId: 'rfp-1',
  pgWsId: 'pg-ws-1',
  uniqueToken: 'tok-1',
  sentAt: '2026-06-01T00:00:00Z',
  expiresAt: '2026-12-31T00:00:00Z',
  status: 'accepted',
  boardColumnId: null,
};

const BASE_BID: Bid = {
  id: 'bid-1',
  rfpId: 'rfp-1',
  pgWsId: 'pg-ws-1',
  invitationId: 'inv-1',
  status: 'submitted',
  settleCycle: 'D+1',
  settleLimit: '0',
  guaranteeInsurance: '0',
  paymentFees: {},
  submittedBy: 'user-pg-1',
  submittedAt: '2026-06-10T00:00:00Z',
} as unknown as Bid;

/** PG pipeline 시스템 컬럼 4개 */
const PG_COLUMNS: BoardColumn[] = [
  { id: 'col-received', workspaceId: 'pg-ws-1', kind: 'pipeline', title: '신규', position: 'a', color: null, lifecycleKey: 'received' },
  { id: 'col-submitted', workspaceId: 'pg-ws-1', kind: 'pipeline', title: '견적 보냄', position: 'b', color: null, lifecycleKey: 'submitted' },
  { id: 'col-won', workspaceId: 'pg-ws-1', kind: 'pipeline', title: '선정됨', position: 'c', color: null, lifecycleKey: 'won' },
  { id: 'col-lost', workspaceId: 'pg-ws-1', kind: 'pipeline', title: '미선정', position: 'd', color: null, lifecycleKey: 'lost' },
];

function pair(rfp: RFP = BASE_RFP, invitation: RfpInvitation = BASE_INVITATION, buyerName = '테스트 구매사'): PgInvitationPair {
  return { rfp, invitation, buyerName } as PgInvitationPair;
}

function data(overrides: Partial<PgInboxData> = {}): PgInboxData {
  return {
    pairs: [pair()],
    bidByRfp: new Map(),
    pendingRequoteRfpIds: new Set(),
    ...overrides,
  };
}

// ── pgInboxDataToRows ─────────────────────────────────────────────────────────

describe('pgInboxDataToRows', () => {
  it('received 단계(bid 없음)는 bidId 를 생략한다', () => {
    const rows = pgInboxDataToRows(data({ bidByRfp: new Map() }));
    expect(rows).toHaveLength(1);
    expect(rows[0].stage).toBe('received');
    expect(rows[0].bidId).toBeUndefined();
  });

  it('received 단계(draft bid 존재)는 bidId 를 생략한다', () => {
    // draft 상태 bid 가 있어도 stage = received → bidId 생략 규칙 적용.
    const draftBid = { ...BASE_BID, id: 'bid-draft', status: 'draft' } as unknown as Bid;
    const rows = pgInboxDataToRows(data({ bidByRfp: new Map([['rfp-1', draftBid]]) }));
    expect(rows[0].stage).toBe('received');
    expect(rows[0].bidId).toBeUndefined();
  });

  it('submitted 단계는 bidId 를 포함하고 rfpId 는 rfp.code 와 같다', () => {
    const bid = { ...BASE_BID, id: 'bid-42', status: 'submitted' } as unknown as Bid;
    const rows = pgInboxDataToRows(data({ bidByRfp: new Map([['rfp-1', bid]]) }));
    expect(rows[0].stage).toBe('submitted');
    expect(rows[0].bidId).toBe('bid-42');
    expect(rows[0].rfpId).toBe('P-2606-0001'); // rfp.code, not rfp.id
  });

  it('rfp.bizProfile.grade 가 있으면 GRADE_LABELS 로 변환한다', () => {
    const rfp: RFP = { ...BASE_RFP, bizProfile: { grade: 'sme1', gradeSource: 'user_confirmed' } };
    const rows = pgInboxDataToRows(data({ pairs: [pair(rfp)] }));
    expect(rows[0].grade).toBe('중소1');
    expect(rows[0].gradeRaw).toBe('sme1');
  });

  it('bizProfile 없으면 grade 는 "—"', () => {
    const rows = pgInboxDataToRows(data());
    expect(rows[0].grade).toBe('—');
    expect(rows[0].gradeRaw).toBeUndefined();
  });

  it('pendingRequoteRfpIds 에 rfp.id 가 있으면 hasPendingRequote=true', () => {
    const rows = pgInboxDataToRows(data({ pendingRequoteRfpIds: new Set(['rfp-1']) }));
    expect(rows[0].hasPendingRequote).toBe(true);
  });

  it('pendingRequoteRfpIds 에 rfp.id 가 없으면 hasPendingRequote=false', () => {
    const rows = pgInboxDataToRows(data({ pendingRequoteRfpIds: new Set() }));
    expect(rows[0].hasPendingRequote).toBe(false);
  });

  it('isSample·contractType 을 그대로 전달한다', () => {
    const rfp: RFP = { ...BASE_RFP, isSample: true, contractType: 'renewal' };
    const rows = pgInboxDataToRows(data({ pairs: [pair(rfp)] }));
    expect(rows[0].isSample).toBe(true);
    expect(rows[0].contractType).toBe('renewal');
  });

  it('invitationId 는 invitation.id 와 같다', () => {
    const inv: RfpInvitation = { ...BASE_INVITATION, id: 'inv-99' };
    const rows = pgInboxDataToRows(data({ pairs: [pair(BASE_RFP, inv)] }));
    expect(rows[0].invitationId).toBe('inv-99');
  });
});

// ── buildPgPipelineCards ──────────────────────────────────────────────────────

describe('buildPgPipelineCards', () => {
  it('cardId 는 invitation.id 다', () => {
    const inv: RfpInvitation = { ...BASE_INVITATION, id: 'inv-77' };
    const cards = buildPgPipelineCards(data({ pairs: [pair(BASE_RFP, inv)] }), PG_COLUMNS);
    expect(cards[0].cardId).toBe('inv-77');
  });

  it('bid 없는 초대 → received 컬럼에 배치된다', () => {
    const cards = buildPgPipelineCards(data({ bidByRfp: new Map() }), PG_COLUMNS);
    expect(cards[0].columnId).toBe('col-received');
  });

  it('제출된 bid → submitted 컬럼에 배치된다', () => {
    const bid = { ...BASE_BID, status: 'submitted' } as unknown as Bid;
    const cards = buildPgPipelineCards(data({ bidByRfp: new Map([['rfp-1', bid]]) }), PG_COLUMNS);
    expect(cards[0].columnId).toBe('col-submitted');
  });

  it('invitation.boardColumnId 가 있으면 lifecycleKey 보다 우선한다', () => {
    const inv: RfpInvitation = { ...BASE_INVITATION, boardColumnId: 'col-won' };
    const cards = buildPgPipelineCards(data({ pairs: [pair(BASE_RFP, inv)] }), PG_COLUMNS);
    expect(cards[0].columnId).toBe('col-won');
  });

  it('payload 에 buyerName 과 hasPendingRequote 가 포함된다', () => {
    const d = data({
      pairs: [pair(BASE_RFP, BASE_INVITATION, '오롤리데이')],
      pendingRequoteRfpIds: new Set(['rfp-1']),
    });
    const cards = buildPgPipelineCards(d, PG_COLUMNS);
    const payload = cards[0].payload as { buyerName?: string; hasPendingRequote?: boolean };
    expect(payload.buyerName).toBe('오롤리데이');
    expect(payload.hasPendingRequote).toBe(true);
  });
});
