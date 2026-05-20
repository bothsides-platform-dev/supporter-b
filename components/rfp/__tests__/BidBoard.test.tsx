import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest';
import { render, screen, within, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { Bid } from '@/lib/types/bid';

// next/navigation mock — kanban triggers router.refresh() post-action.
const refresh = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh }),
}));

// Mock the server action that the kanban calls on drag/menu moves.
const updateStageMock = vi.fn(
  async (_input: unknown) => ({ ok: true as const }),
);
vi.mock('@/lib/server/actions/bid/updateBuyerStageAction', () => ({
  updateBuyerStageAction: (input: unknown) => updateStageMock(input),
}));

// BidBoard transitively imports BidDetailModal, which imports the note actions
// — short-circuit them too so the next-auth chain stays out of jsdom.
vi.mock('@/lib/server/actions/bid/addBidNoteAction', () => ({
  addBidNoteAction: async () => ({ ok: true as const, noteId: 'unused' }),
}));
vi.mock('@/lib/server/actions/bid/removeBidNoteAction', () => ({
  removeBidNoteAction: async () => ({ ok: true as const }),
}));

import { BidBoard } from '../BidBoard';

function buildBid(
  overrides: Partial<Bid> & Pick<Bid, 'id' | 'pgWsId'>,
): Bid {
  return {
    rfpId: 'rfp-1',
    invitationId: 'inv-' + overrides.id,
    settleCycle: 'D+1',
    deposit: 0,
    setupFee: 0,
    monthlyMin: 0,
    bankTransferFeePct: 0.005,
    easyPayFeePct: 0.025,
    proposalPdfs: [
      {
        id: 'pdf-' + overrides.id,
        name: '제안서.pdf',
        size: 1024,
        mimeType: 'application/pdf',
        url: '',
      },
    ],
    status: 'submitted',
    buyerStage: 'pending',
    submittedBy: 'pg-user',
    submittedAt: '2026-05-01T00:00:00Z',
    ...overrides,
  };
}

const TOSS = buildBid({
  id: 'b-toss',
  pgWsId: 'ws-toss',
  buyerStage: 'negotiating',
});
const INICIS = buildBid({ id: 'b-inicis', pgWsId: 'ws-inicis' });

const baseProps = {
  rfpId: 'P-2604-0001',
  bids: [TOSS, INICIS],
  notesByBid: { 'b-toss': [], 'b-inicis': [] },
  grade: 'sme1' as const,
  rfpStatus: 'sent',
  awardedBidId: undefined,
  pgWsNameMap: { 'ws-toss': '토스페이먼츠', 'ws-inicis': '이니시스' },
  authorId: 'u-buyer',
  authorName: '김구매',
};

describe('BidBoard', () => {
  beforeEach(() => {
    updateStageMock.mockClear();
    refresh.mockClear();
  });
  afterEach(() => {
    cleanup();
  });

  it('renders three columns and groups bids by bid.buyerStage', () => {
    render(<BidBoard {...baseProps} />);

    expect(screen.getAllByText('진행전').length).toBeGreaterThan(0);
    expect(screen.getAllByText('협상중').length).toBeGreaterThan(0);
    expect(screen.getAllByText('결정').length).toBeGreaterThan(0);

    expect(screen.getByText('토스페이먼츠')).toBeInTheDocument();
    expect(screen.getByText('이니시스')).toBeInTheDocument();

    // Note counts come from props, not localStorage.
    const tossCard = screen.getByText('토스페이먼츠').closest('button')!;
    const inicisCard = screen.getByText('이니시스').closest('button')!;
    expect(within(tossCard).getByText(/메모 0/)).toBeInTheDocument();
    expect(within(inicisCard).getByText(/메모 0/)).toBeInTheDocument();
  });

  it('moves a card via the ⋯ menu — calls updateBuyerStageAction', async () => {
    const user = userEvent.setup();
    render(<BidBoard {...baseProps} />);

    await user.click(screen.getByRole('button', { name: '이니시스 메뉴' }));
    const menuItem = await screen.findByText(/결정으로/);
    await user.click(menuItem);

    expect(updateStageMock).toHaveBeenCalledWith({
      bidId: 'b-inicis',
      to: 'decided',
    });
  });
});
