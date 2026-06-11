import { afterEach, describe, expect, it, vi } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

vi.mock('@/components/messages/CounterpartyProfileCard', () => ({
  CounterpartyProfileCard: ({ counterparty }: { counterparty: { name: string } }) => (
    <span>{counterparty.name}</span>
  ),
}));

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
  round: 1,
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

describe('BidCard 카드 활성화(클릭·키보드)', () => {
  it('카드를 클릭하면 onClick을 호출한다', async () => {
    const onClick = vi.fn();
    const user = userEvent.setup();
    render(
      <BidCard bid={baseBid} pgName="에이페이" isAwarded={false} noteCount={0} onClick={onClick} />,
    );
    await user.click(screen.getByRole('button'));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('Enter 키로 onClick을 호출한다(키보드 접근성)', async () => {
    const onClick = vi.fn();
    const user = userEvent.setup();
    render(
      <BidCard bid={baseBid} pgName="에이페이" isAwarded={false} noteCount={0} onClick={onClick} />,
    );
    screen.getByRole('button').focus();
    await user.keyboard('{Enter}');
    expect(onClick).toHaveBeenCalledTimes(1);
  });
});
