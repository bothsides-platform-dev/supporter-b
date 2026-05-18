import { afterEach, beforeEach, describe, it, expect } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BidDetailModal } from '../BidDetailModal';
import { useBidBoardStore } from '@/lib/stores/bid-board';
import type { Bid } from '@/lib/types/bid';

const bid: Bid = {
  id: 'bid-toss',
  rfpId: 'P-2604-0001',
  pgWsId: 'ws-toss',
  invitationId: 'inv-1',
  settleCycle: 'D+1',
  deposit: 5_000_000,
  setupFee: 0,
  monthlyMin: 100_000,
  bankTransferFeePct: 0.005,
  easyPayFeePct: 0.025,
  proposalPdf: { id: 'pdf', name: '제안서.pdf', size: 1024, mimeType: 'application/pdf', url: '' },
  status: 'submitted',
  submittedBy: 'pg-user',
  submittedAt: '2026-05-01T00:00:00Z',
};

describe('BidDetailModal', () => {
  beforeEach(() => {
    localStorage.clear();
    useBidBoardStore.setState({ stages: {}, notes: {} });
  });
  afterEach(() => {
    useBidBoardStore.setState({ stages: {}, notes: {} });
  });

  it('renders the 6-figure KPI grid and stage tag when open', () => {
    render(
      <BidDetailModal
        open
        onOpenChange={() => {}}
        bid={bid}
        pgName="토스페이먼츠"
        stage="negotiating"
        grade="sme1"
        authorId="u-1"
        authorName="김구매"
      />,
    );
    expect(screen.getByText('정산주기')).toBeInTheDocument();
    expect(screen.getByText('보증금')).toBeInTheDocument();
    expect(screen.getByText('셋업비')).toBeInTheDocument();
    expect(screen.getByText('월최저')).toBeInTheDocument();
    expect(screen.getByText('계좌이체')).toBeInTheDocument();
    expect(screen.getByText('간편결제')).toBeInTheDocument();
    expect(screen.getByText('협상중')).toBeInTheDocument();
    // Statutory card fee row for sme1 (1.10% fixed).
    expect(screen.getByText(/1\.10% 고정/)).toBeInTheDocument();
  });

  it('records a memo and shows it newest-first with serial 01', async () => {
    const user = userEvent.setup();
    render(
      <BidDetailModal
        open
        onOpenChange={() => {}}
        bid={bid}
        pgName="토스페이먼츠"
        stage="pending"
        grade="sme1"
        authorId="u-1"
        authorName="김구매"
      />,
    );

    const textarea = screen.getByPlaceholderText(/협상 진행/);
    await user.type(textarea, '셋업비 0원 컨펌');
    await user.click(screen.getByRole('button', { name: '기록' }));

    // Store side effect.
    const stored = useBidBoardStore.getState().notes['bid-toss'];
    expect(stored).toHaveLength(1);
    expect(stored[0].body).toBe('셋업비 0원 컨펌');
    expect(stored[0].authorName).toBe('김구매');

    // UI side: serial 01 + body visible.
    expect(screen.getByText(/\b01\b/)).toBeInTheDocument();
    expect(screen.getByText('셋업비 0원 컨펌')).toBeInTheDocument();
  });

  it('reverses display order: newest first, serials count up by creation', async () => {
    const user = userEvent.setup();
    render(
      <BidDetailModal
        open
        onOpenChange={() => {}}
        bid={bid}
        pgName="토스페이먼츠"
        stage="pending"
        grade="sme1"
        authorId="u-1"
        authorName="김구매"
      />,
    );

    const textarea = screen.getByPlaceholderText(/협상 진행/);
    await user.type(textarea, 'first');
    await user.click(screen.getByRole('button', { name: '기록' }));
    await user.type(textarea, 'second');
    await user.click(screen.getByRole('button', { name: '기록' }));

    const items = screen.getAllByRole('listitem');
    // Newest (second) appears first; 02 is its serial.
    expect(within(items[0]).getByText('second')).toBeInTheDocument();
    expect(within(items[0]).getByText(/\b02\b/)).toBeInTheDocument();
    expect(within(items[1]).getByText('first')).toBeInTheDocument();
    expect(within(items[1]).getByText(/\b01\b/)).toBeInTheDocument();
  });
});
