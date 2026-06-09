import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
vi.stubGlobal('ResizeObserver', ResizeObserverStub);

vi.mock('@/components/messages/CounterpartyProfileCard', () => ({
  CounterpartyProfileCard: ({ counterparty }: { counterparty: { name: string } }) => (
    <span>{counterparty.name}</span>
  ),
}));
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }) }));
vi.mock('@/lib/http', () => ({ http: { post: vi.fn() } }));
const awardRfpAction = vi.fn();
vi.mock('@/lib/server/actions/rfp', () => ({
  awardRfpAction: (...a: unknown[]) => awardRfpAction(...a),
}));
// BidNotesPanel statically imports these server actions (→ next-auth). Mock to
// keep the jsdom collection from loading the auth chain.
vi.mock('@/lib/server/actions/bid/addBidNoteAction', () => ({ addBidNoteAction: vi.fn() }));
vi.mock('@/lib/server/actions/bid/removeBidNoteAction', () => ({ removeBidNoteAction: vi.fn() }));

import { FocusComparison } from '../FocusComparison';
import type { Bid } from '@/lib/types/bid';

function makeBid(over: Partial<Bid>): Bid {
  return {
    id: 'b',
    rfpId: 'r1',
    pgWsId: 'pg',
    invitationId: 'i1',
    settleCycle: 'D+1',
    settleLimit: 700_000_000,
    guaranteeInsurance: 1_000_000,
    paymentFees: { card: 0.022 },
    customFees: {},
    proposalPdfs: [],
    status: 'submitted',
    submittedBy: 'u1',
    ...over,
  };
}

const toss = makeBid({ id: 'b-toss', pgWsId: 'pg-toss', paymentFees: { card: 0.022, bank_transfer: 0.015 } });
const kg = makeBid({ id: 'b-kg', pgWsId: 'pg-kg', settleCycle: 'D+2', settleLimit: 500_000_000, paymentFees: { card: 0.028 } });

const baseProps = {
  bids: [kg, toss], // intentionally not pre-sorted
  pgWsNameMap: { 'pg-toss': '토스페이먼츠', 'pg-kg': 'KG이니시스' },
  current: { feeRate: '2.8%' },
  notesByBid: {} as Record<string, never[]>,
  rfpStatus: 'sent',
  awardedBidId: null,
  requiredPaymentMethods: ['card', 'bank_transfer'] as const,
  customPaymentMethods: [],
  rfpId: 'rfp-uuid-1',
  rfpCode: 'P-2605-0042',
};

beforeEach(() => awardRfpAction.mockReset());
afterEach(cleanup);

describe('FocusComparison', () => {
  it('renders a tab per PG and focuses the lowest card-fee bid by default', () => {
    render(<FocusComparison {...baseProps} />);
    expect(screen.getByRole('tab', { name: /토스페이먼츠/ })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /KG이니시스/ })).toBeInTheDocument();
    // 토스 (2.20%) is the lowest card fee → focused; its proposed value shows
    expect(screen.getByText('2.20%')).toBeInTheDocument();
  });

  it('switches the focused bid when another tab is clicked', async () => {
    const user = userEvent.setup();
    render(<FocusComparison {...baseProps} />);
    await user.click(screen.getByRole('tab', { name: /KG이니시스/ }));
    expect(screen.getByText('2.80%')).toBeInTheDocument();
  });

  it('renders the three detail accordions', () => {
    render(<FocusComparison {...baseProps} />);
    expect(screen.getByText(/전체 결제수단 요율/)).toBeInTheDocument();
    expect(screen.getByText(/PG 메모/)).toBeInTheDocument();
    expect(screen.getByText('내 메모')).toBeInTheDocument();
  });

  it('opens the award confirm dialog from the CTA when the RFP is open', async () => {
    const user = userEvent.setup();
    render(<FocusComparison {...baseProps} />);
    await user.click(screen.getByRole('button', { name: /이 견적 선정하기/ }));
    expect(
      await screen.findByRole('heading', { name: /토스페이먼츠의 견적을 선정할까요/ }),
    ).toBeInTheDocument();
  });

  it('hides the CTA and marks the winner when the RFP is awarded', () => {
    render(
      <FocusComparison {...baseProps} rfpStatus="awarded" awardedBidId="b-toss" />,
    );
    expect(screen.queryByRole('button', { name: /이 견적 선정하기/ })).not.toBeInTheDocument();
    expect(screen.getByText('선정됨')).toBeInTheDocument();
  });

  it('shows an empty state when no bids have arrived', () => {
    render(<FocusComparison {...baseProps} bids={[]} />);
    expect(screen.getByText(/견적을 기다리고 있어요/)).toBeInTheDocument();
  });

  it('구간 셀렉터를 바꾸면 카드 요율 표시가 그 구간 값으로 바뀐다', () => {
    const bids = [
      makeBid({ id: 'a', pgWsId: 'pgA', paymentFees: { card: { sole: 0.005, general: 0.018 } } }),
    ];
    render(<FocusComparison {...baseProps} bids={bids} requiredPaymentMethods={['card']} />);
    // 기본 일반 → 1.80%
    expect(screen.getAllByText('1.80%').length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole('button', { name: '영세' }));
    expect(screen.getAllByText('0.50%').length).toBeGreaterThan(0);
  });

  it('구버전 number bid는 구간 무관 동일 값', () => {
    const bids = [makeBid({ id: 'a', pgWsId: 'pgA', paymentFees: { card: 0.012 } })];
    render(<FocusComparison {...baseProps} bids={bids} requiredPaymentMethods={['card']} />);
    fireEvent.click(screen.getByRole('button', { name: '영세' }));
    expect(screen.getAllByText('1.20%').length).toBeGreaterThan(0);
  });

  it('상세 매트릭스에 활성 견적의 전 구간 카드 요율이 보인다', () => {
    const bids = [makeBid({ id: 'a', pgWsId: 'pgA', paymentFees: { card: { sole: 0.005, sme1: 0.01, sme2: 0.0125, sme3: 0.0145, general: 0.018 } } })];
    render(<FocusComparison {...baseProps} bids={bids} requiredPaymentMethods={['card']} />);
    // accordion panel은 keepMounted=false(기본)이므로 닫힌 상태에서 DOM에 없음 — 트리거 클릭으로 펼친다
    fireEvent.click(screen.getByText(/전체 결제수단 요율/));
    const matrix = screen.getByTestId('tiered-matrix-card');
    expect(matrix).toHaveTextContent('0.50%');
    expect(matrix).toHaveTextContent('1.80%');
  });
});
