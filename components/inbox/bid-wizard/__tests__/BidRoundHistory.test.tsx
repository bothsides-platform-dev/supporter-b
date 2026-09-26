import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import type { Bid } from '@/lib/types/bid';
import type { RFP } from '@/lib/types/rfp';
import { BidRoundHistory } from '../BidRoundHistory';

afterEach(cleanup);

describe('BidRoundHistory', () => {
  it('shows each round as read-only conditions with author and proposal', () => {
    const bid = {
      id: 'bid-1', round: 1, submittedAt: '2026-09-24T00:00:00.000Z', submittedBy: 'author-1',
      settleCycle: 'D+2', settleLimit: 1000000, guaranteeInsurance: 0, signupFee: 0,
      paymentFees: { card: { general: 0.012 } }, customFees: {}, memo: '이전 메모',
      proposalPdfs: [{ id: 'file-1', name: '이전 견적서.pdf', size: 100, mimeType: 'application/pdf', url: '/api/files/file-1' }],
    } as Bid;
    render(<BidRoundHistory rfp={{ code: 'P-TEST', title: '테스트', deadline: '2026-09-25T00:00:00.000Z' } as RFP}
      bids={[bid]} authorNames={{ 'bid-1': '담당자 김' }} />);
    expect(screen.getByText('1회차')).toBeInTheDocument();
    expect(screen.getByText('담당자 김')).toBeInTheDocument();
    expect(screen.getByText('이전 메모')).toBeInTheDocument();
    expect(screen.getByText('카드 (일반)')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '이전 견적서.pdf' })).toHaveAttribute('href', '/api/files/file-1');
  });
});
