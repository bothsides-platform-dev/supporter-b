import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';

import { BidCard } from '../BidCard';
import type { Bid } from '@/lib/types/bid';

afterEach(() => cleanup());

const baseBid: Bid = {
  id: 'bid-1',
  rfpId: 'rfp-1',
  pgWsId: 'ws-1',
  invitationId: 'inv-1',
  settleCycle: 'D+1',
  settleLimit: 1_000_000,
  guaranteeInsurance: 0,
  paymentFees: {},
  customFees: {},
  proposalPdfs: [],
  status: 'submitted',
  submittedBy: 'u1',
  submittedAt: '2026-05-01T00:00:00Z',
};

function renderCard(bid: Bid) {
  return render(
    <BidCard bid={bid} pgName="에이페이" isAwarded={false} noteCount={0} onClick={vi.fn()} />,
  );
}

describe('BidCard 결제수단 요약', () => {
  it('제출한 결제수단을 라벨과 함께 표시한다 (bank_transfer 하드코딩 아님)', () => {
    renderCard({ ...baseBid, paymentFees: { virtual_account: 0.005 } });
    expect(screen.getByText('가상계좌')).toBeInTheDocument();
    expect(screen.getByText('0.50%')).toBeInTheDocument();
  });

  it('제출하지 않은 결제수단 라벨은 표시하지 않는다', () => {
    renderCard({ ...baseBid, paymentFees: { card: 0.02 } });
    expect(screen.queryByText('계좌이체')).toBeNull();
  });
});
