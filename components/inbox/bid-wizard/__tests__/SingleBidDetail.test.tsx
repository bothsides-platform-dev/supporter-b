import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BidRoundHistory } from '../BidRoundHistory';
import { historyRfp, roundBid } from './bid-round-fixtures';

afterEach(cleanup);

describe('single-round quote detail', () => {
  it('identifies the quote once, with its company and submission metadata instead of comparison chrome', () => {
    render(<BidRoundHistory rfp={historyRfp} bids={[roundBid(1)]} pgName="토스페이먼츠"
      authorNames={{ 'bid-1': '김담당' }} />);
    expect(screen.getByRole('heading', { name: '견적' })).toBeInTheDocument();
    expect(screen.getAllByText('토스페이먼츠')).toHaveLength(1);
    expect(screen.getAllByText('김담당')).toHaveLength(1);
    expect(screen.getByText('김담당').closest('header')?.querySelector('time'))
      .toHaveAttribute('dateTime', '2026-10-15T05:20:00Z');
    expect(screen.queryByText('최신')).not.toBeInTheDocument();
    expect(screen.queryByText(/총.*회차/)).not.toBeInTheDocument();
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
  });

  it('separates terms from fee groups and preserves every submitted tier, fee unit, and custom identity', () => {
    render(<BidRoundHistory rfp={historyRfp} bids={[roundBid(1, {
      paymentFees: { card: { sole: 0, sme1: .022, general: .033 }, overseas_card: .035, virtual_account: 300 },
      customFees: { 'custom-a': .014, 'custom-b': .025 },
    })]} authorNames={{}} />);
    const terms = screen.getByRole('region', { name: '정산·가입 조건' });
    expect(terms).toHaveTextContent('8,000,000원');
    expect(terms).toHaveTextContent('0원');
    expect(within(terms).queryByText('카드')).not.toBeInTheDocument();
    const table = screen.getByRole('table', { name: '결제 수수료' });
    const card = within(table).getByRole('rowgroup', { name: '카드' });
    expect(within(card).getByRole('row', { name: /영세/ })).toHaveTextContent('0.00%');
    expect(within(card).getByRole('row', { name: /중소1/ })).toHaveTextContent('2.20%');
    expect(within(card).getByRole('row', { name: /일반/ })).toHaveTextContent('3.30%');
    expect(within(table).getByRole('rowgroup', { name: '해외카드' })).toHaveTextContent('3.50%');
    expect(within(table).getByRole('rowgroup', { name: '가상계좌' })).toHaveTextContent('300원/건');
    const custom = within(table).getAllByRole('rowgroup', { name: '직접 결제' });
    expect(custom).toHaveLength(2);
    expect(custom[0]).toHaveTextContent('1.40%');
    expect(custom[1]).toHaveTextContent('2.50%');
  });

  it('keeps missing terms distinct from zero and preserves empty fee/document states', () => {
    render(<BidRoundHistory rfp={historyRfp} bids={[roundBid(1, {
      settleCycle: '', settleLimit: undefined, signupFee: 0, paymentFees: {},
    })]} authorNames={{}} />);
    const terms = screen.getByRole('region', { name: '정산·가입 조건' });
    expect(within(terms).getByText('정산한도').nextElementSibling).toHaveTextContent('—');
    expect(within(terms).getByText('정산 주기').nextElementSibling).toHaveTextContent('—');
    expect(within(terms).getByText('가입비').nextElementSibling).toHaveTextContent('0원');
    expect(screen.getByRole('region', { name: '결제 수수료' })).toHaveTextContent('—');
    expect(screen.getByRole('region', { name: '메모' })).toHaveTextContent('—');
    expect(screen.getByRole('region', { name: '첨부 0' })).toHaveTextContent('—');
  });

  it('previews long memos, expands by keyboard, and shows named attachment links with sizes', async () => {
    const user = userEvent.setup();
    const memo = `${'상세 조건을 확인해요. '.repeat(40)}마지막 조건이에요.`;
    render(<BidRoundHistory rfp={historyRfp} bids={[roundBid(1, {
      memo, proposalPdfs: [{ id: 'file', name: '견적서.pdf', size: 240000, mimeType: 'application/pdf', url: '/api/files/file' }],
    })]} authorNames={{}} />);
    const toggle = screen.getByRole('button', { name: '메모 전체 보기' });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByText(/마지막 조건이에요/)).not.toBeInTheDocument();
    toggle.focus();
    await user.keyboard('{Enter}');
    expect(screen.getByText(memo)).toBeVisible();
    expect(screen.getByRole('button', { name: '메모 접기' })).toHaveAttribute('aria-expanded', 'true');
    await user.keyboard(' ');
    expect(screen.queryByText(memo)).not.toBeInTheDocument();
    const files = screen.getByRole('region', { name: '첨부 1' });
    expect(files).toHaveTextContent('240 KB');
    expect(within(files).getByRole('link', { name: /견적서.pdf.*열기/ }))
      .toHaveAttribute('href', '/api/files/file');
  });
});
