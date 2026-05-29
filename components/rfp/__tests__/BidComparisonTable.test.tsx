import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
vi.stubGlobal('ResizeObserver', ResizeObserverStub);

afterEach(() => cleanup());

import { BidComparisonTable } from '../BidComparisonTable';
import type { Bid } from '@/lib/types/bid';

const bid: Bid = {
  id: 'bid-toss',
  rfpId: 'P-2604-0001',
  pgWsId: 'ws-toss',
  invitationId: 'inv-1',
  settleCycle: 'D+1',
  settleLimit: 0,
  guaranteeInsurance: 0,
  paymentFees: {},
  proposalPdfs: [],
  status: 'submitted',
  submittedBy: 'pg-user',
  submittedAt: '2026-05-01T00:00:00Z',
};

const pgWsNameMap = { 'ws-toss': '에이페이먼츠' };

function renderTable() {
  return render(
    <BidComparisonTable
      rfpId="P-2604-0001"
      bids={[bid]}
      grade="sme1"
      rfpStatus="sent"
      pgWsNameMap={pgWsNameMap}
    />,
  );
}

describe('BidComparisonTable — PG 프로필 채팅 진입', () => {
  it('각 제출 PG가 클릭 가능한 프로필로 표시된다', () => {
    renderTable();
    expect(
      screen.getByRole('button', { name: '에이페이먼츠 메시지 보내기' }),
    ).toBeInTheDocument();
  });

  it('PG 프로필 클릭 → 컴포즈 Sheet → 채팅보내기 → 구현중 모달', async () => {
    const user = userEvent.setup();
    renderTable();

    await user.click(screen.getByRole('button', { name: '에이페이먼츠 메시지 보내기' }));
    expect(screen.getByPlaceholderText('메시지를 입력하세요…')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '채팅보내기' }));
    expect(screen.getByRole('button', { name: '확인' })).toBeInTheDocument();
  });
});
