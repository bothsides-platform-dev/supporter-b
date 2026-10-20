import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { Bid } from '@/lib/types/bid';
import type { RFP } from '@/lib/types/rfp';
import { BidRoundHistory } from '../BidRoundHistory';
import { historyRfp, roundBid } from './bid-round-fixtures';

afterEach(cleanup);

describe('BidRoundHistory', () => {
  it('defaults to changed conditions and exposes unchanged conditions through the view controls', async () => {
    const user = userEvent.setup();
    render(<BidRoundHistory rfp={historyRfp} bids={[roundBid(1), roundBid(2, { signupFee: 0 })]} authorNames={{}} />);
    expect(screen.getByRole('combobox', { name: '비교 기준' })).toHaveValue('bid-1');
    expect(screen.getByRole('combobox', { name: '확인할 견적' })).toHaveValue('bid-2');
    expect(screen.getByRole('status')).toHaveTextContent('1개 항목이 달라졌어요');
    expect(screen.queryByRole('row', { name: /정산한도/ })).not.toBeInTheDocument();
    expect(screen.getByRole('row', { name: /가입비/ })).toHaveTextContent('−150,000원');
    await user.click(screen.getByRole('button', { name: '전체 항목' }));
    expect(screen.getByRole('row', { name: /정산한도/ })).toHaveTextContent('같음');
    expect(screen.getByRole('button', { name: '전체 항목' })).toHaveAttribute('aria-pressed', 'true');
    await user.click(screen.getByRole('button', { name: /변경 항목/ }));
    expect(screen.queryByRole('row', { name: /정산한도/ })).not.toBeInTheDocument();
  });

  it('allows earlier baselines only and repairs the baseline when selecting an earlier target', async () => {
    const user = userEvent.setup();
    render(<BidRoundHistory rfp={historyRfp} bids={[roundBid(3), roundBid(1), roundBid(2)]} authorNames={{}} />);
    const before = screen.getByRole('combobox', { name: '비교 기준' });
    const after = screen.getByRole('combobox', { name: '확인할 견적' });
    expect(before).toHaveValue('bid-2');
    expect(within(before).getAllByRole('option')).toHaveLength(2);
    await user.selectOptions(after, 'bid-2');
    expect(before).toHaveValue('bid-1');
    expect(within(before).getAllByRole('option')).toHaveLength(1);
    await user.selectOptions(after, 'bid-3');
    expect(before).toHaveValue('bid-1');
  });

  it('shows an identical-conditions message and opens memo/attachment-only changes', () => {
    render(<BidRoundHistory rfp={historyRfp} bids={[roundBid(1), roundBid(2, {
      memo: '서류를 추가했어요', proposalPdfs: [{ id: 'f', name: '견적.pdf', url: '/f', size: 10, mimeType: 'application/pdf' }],
    })]} authorNames={{}} />);
    expect(screen.getByRole('status')).toHaveTextContent('조건이 같아요');
    expect(screen.getByText('메모 변경')).toBeInTheDocument();
    expect(screen.getByText('첨부 변경')).toBeInTheDocument();
    expect(screen.getByText('서류를 추가했어요').closest('details')).toHaveAttribute('open');
    expect(screen.getByRole('link', { name: /^견적.pdf/ })).toHaveAttribute('href', '/f');
  });

  it('keeps other memo changes collapsed but discoverable and supports keyboard expansion and view changes', async () => {
    const user = userEvent.setup();
    render(<BidRoundHistory rfp={historyRfp} bids={[roundBid(1), roundBid(2, { signupFee: 0, memo: '새 메모' })]} authorNames={{}} />);
    const summary = screen.getByText('메모·첨부').closest('summary')!;
    expect(summary.closest('details')).not.toHaveAttribute('open');
    expect(summary).toHaveTextContent('메모 변경');
    screen.getByRole('button', { name: '전체 항목' }).focus();
    await user.keyboard('{Enter}');
    expect(screen.getByRole('row', { name: /정산한도/ })).toBeInTheDocument();
    // Native details keyboard activation is verified in the browser; jsdom lacks its default action.
    await user.click(summary);
    expect(summary.closest('details')).toHaveAttribute('open');
  });

  it('hides empty histories and gives a single round readable detail without comparison controls', () => {
    const { rerender } = render(<BidRoundHistory rfp={historyRfp} bids={[]} authorNames={{}} />);
    expect(screen.queryByRole('region')).not.toBeInTheDocument();
    rerender(<BidRoundHistory rfp={historyRfp} bids={[roundBid(1)]} authorNames={{}} />);
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
    expect(screen.getByText('정산한도')).toBeInTheDocument();
  });

  it('shows each round as read-only conditions with author and proposal', () => {
    const bid = {
      id: 'bid-1', round: 1, submittedAt: '2026-09-24T00:00:00.000Z', submittedBy: 'author-1',
      settleCycle: 'D+2', settleLimit: 1000000, guaranteeInsurance: 0, signupFee: 0,
      paymentFees: { card: { general: 0.012 } }, customFees: {}, memo: '이전 메모',
      proposalPdfs: [{ id: 'file-1', name: '이전 견적서.pdf', size: 100, mimeType: 'application/pdf', url: '/api/files/file-1' }],
    } as Bid;
    render(<BidRoundHistory rfp={{ code: 'P-TEST', title: '테스트', deadline: '2026-09-25T00:00:00.000Z' } as RFP}
      bids={[bid]} authorNames={{ 'bid-1': '담당자 김' }} />);
    expect(screen.getByRole('heading', { name: '견적' })).toBeInTheDocument();
    expect(screen.getByText('담당자 김')).toBeInTheDocument();
    expect(screen.getByText('이전 메모')).toBeInTheDocument();
    expect(within(screen.getByRole('rowgroup', { name: '카드' })).getByRole('row', { name: /일반/ }))
      .toHaveTextContent('1.20%');
    expect(screen.getByRole('link', { name: /^이전 견적서\.pdf/ })).toHaveAttribute('href', '/api/files/file-1');
  });
});
