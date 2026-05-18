import { afterEach, beforeEach, describe, it, expect } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BidBoard } from '../BidBoard';
import { useBidBoardStore } from '@/lib/stores/bid-board';
import type { Bid } from '@/lib/types/bid';

function buildBid(overrides: Partial<Bid> & Pick<Bid, 'id' | 'pgWsId'>): Bid {
  return {
    rfpId: 'rfp-1',
    invitationId: 'inv-' + overrides.id,
    settleCycle: 'D+1',
    deposit: 0,
    setupFee: 0,
    monthlyMin: 0,
    bankTransferFeePct: 0.005,
    easyPayFeePct: 0.025,
    proposalPdf: {
      id: 'pdf-' + overrides.id,
      name: '제안서.pdf',
      size: 1024,
      mimeType: 'application/pdf',
      url: '',
    },
    status: 'submitted',
    submittedBy: 'pg-user',
    submittedAt: '2026-05-01T00:00:00Z',
    ...overrides,
  };
}

const TOSS = buildBid({ id: 'b-toss', pgWsId: 'ws-toss' });
const INICIS = buildBid({ id: 'b-inicis', pgWsId: 'ws-inicis' });

const props = {
  rfpId: 'P-2604-0001',
  bids: [TOSS, INICIS],
  grade: 'sme1' as const,
  rfpStatus: 'sent',
  awardedBidId: undefined,
  pgWsNameMap: { 'ws-toss': '토스페이먼츠', 'ws-inicis': '이니시스' },
  authorId: 'u-buyer',
  authorName: '김구매',
};

describe('BidBoard', () => {
  beforeEach(() => {
    localStorage.clear();
    useBidBoardStore.setState({ stages: {}, notes: {} });
  });
  afterEach(() => {
    useBidBoardStore.setState({ stages: {}, notes: {} });
  });

  it('renders three columns and seeds 토스 into 협상중 (dev demo seed)', async () => {
    render(<BidBoard {...props} />);

    // Column tags
    expect(screen.getAllByText('진행전').length).toBeGreaterThan(0);
    expect(screen.getAllByText('협상중').length).toBeGreaterThan(0);
    expect(screen.getAllByText('결정').length).toBeGreaterThan(0);

    // Cards
    expect(screen.getByText('토스페이먼츠')).toBeInTheDocument();
    expect(screen.getByText('이니시스')).toBeInTheDocument();

    // Demo seed pushes 토스 to negotiating; ini-icis stays in pending. The card
    // body is a <button> containing the PG name; closest() walks up to it from
    // the visible text node, sidestepping the separate ⋯ menu trigger button.
    const tossCard = screen.getByText('토스페이먼츠').closest('button')!;
    const inicisCard = screen.getByText('이니시스').closest('button')!;
    expect(within(tossCard).getByText(/메모 1/)).toBeInTheDocument();
    expect(within(inicisCard).getByText(/메모 0/)).toBeInTheDocument();
  });

  it('moves a card via the ⋯ menu', async () => {
    const user = userEvent.setup();
    render(<BidBoard {...props} />);

    // Open 이니시스 ⋯ menu
    await user.click(screen.getByRole('button', { name: '이니시스 메뉴' }));
    // The base-ui menu portals items into the document; pick the "결정" target.
    const menuItem = await screen.findByText(/결정으로/);
    await user.click(menuItem);

    // Store should reflect the move.
    expect(useBidBoardStore.getState().stages['b-inicis']).toBe('decided');
  });

  it('forces awarded bid into decided regardless of override', () => {
    // Pre-seed 토스 into pending; awardedBidId must override.
    useBidBoardStore.setState({
      stages: { 'b-toss': 'pending' },
      notes: {},
    });
    render(<BidBoard {...props} awardedBidId="b-toss" rfpStatus="awarded" />);
    // Effect runs synchronously after mount; assert state.
    expect(useBidBoardStore.getState().stages['b-toss']).toBe('decided');
  });
});
