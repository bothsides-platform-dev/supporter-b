import { afterEach, beforeEach, describe, it, expect } from 'vitest';
import { useBidBoardStore } from '../bid-board';
import type { Bid } from '@/lib/types/bid';
import type { BidNote } from '@/lib/types/bid-note';

const baseBid: Bid = {
  id: 'bid-1',
  rfpId: 'rfp-1',
  pgWsId: 'pg-1',
  invitationId: 'inv-1',
  settleCycle: 'D+1',
  deposit: 0,
  setupFee: 0,
  monthlyMin: 0,
  bankTransferFeePct: 0,
  easyPayFeePct: 0,
  proposalPdf: { id: 'a', name: '제안서.pdf', size: 1, mimeType: 'application/pdf', url: '' },
  status: 'submitted',
  submittedBy: 'u-1',
  submittedAt: '2026-05-01T00:00:00Z',
};

function note(overrides: Partial<BidNote> = {}): BidNote {
  return {
    id: 'n-' + Math.random().toString(36).slice(2, 8),
    bidId: 'bid-1',
    authorId: 'u-1',
    authorName: '김구매',
    body: 'memo',
    attachments: [],
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

describe('useBidBoardStore', () => {
  beforeEach(() => {
    localStorage.clear();
    useBidBoardStore.setState({ stages: {}, notes: {} });
  });

  afterEach(() => {
    useBidBoardStore.setState({ stages: {}, notes: {} });
  });

  it('getStage falls back to bid.buyerStage then "pending" when no override', () => {
    const { getStage } = useBidBoardStore.getState();
    expect(getStage(baseBid)).toBe('pending');
    expect(getStage({ ...baseBid, buyerStage: 'negotiating' })).toBe('negotiating');
  });

  it('moveStage overrides any field-level value', () => {
    const { moveStage, getStage } = useBidBoardStore.getState();
    moveStage('bid-1', 'decided');
    expect(getStage({ ...baseBid, buyerStage: 'pending' })).toBe('decided');
  });

  it('addNote appends in creation order; getNotes returns same order', () => {
    const { addNote, getNotes } = useBidBoardStore.getState();
    const n1 = note({ body: 'first' });
    const n2 = note({ body: 'second' });
    addNote(n1);
    addNote(n2);
    const list = getNotes('bid-1');
    expect(list).toHaveLength(2);
    expect(list[0].body).toBe('first');
    expect(list[1].body).toBe('second');
  });

  it('removeNote removes only the targeted note', () => {
    const { addNote, removeNote, getNotes } = useBidBoardStore.getState();
    const n1 = note({ body: 'keep' });
    const n2 = note({ body: 'drop' });
    addNote(n1);
    addNote(n2);
    removeNote('bid-1', n2.id);
    const list = getNotes('bid-1');
    expect(list).toHaveLength(1);
    expect(list[0].body).toBe('keep');
  });

  it('removeNote on unknown bid is a no-op', () => {
    const { removeNote, getNotes } = useBidBoardStore.getState();
    removeNote('bid-unknown', 'nope');
    expect(getNotes('bid-unknown')).toEqual([]);
  });
});
