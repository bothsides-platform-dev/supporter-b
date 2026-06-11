import { beforeAll, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { FocusComparison } from '../FocusComparison';
import type { Bid } from '@/lib/types/bid';

// Mocks required to prevent server-action / next-auth chain from loading
vi.mock('@/components/messages/CounterpartyProfileCard', () => ({
  CounterpartyProfileCard: ({ counterparty }: { counterparty: { name: string } }) => (
    <span>{counterparty.name}</span>
  ),
}));
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }) }));
vi.mock('@/lib/http', () => ({ http: { post: vi.fn() } }));
vi.mock('@/lib/server/actions/rfp', () => ({ awardRfpAction: vi.fn() }));
vi.mock('@/lib/server/actions/bid/addBidNoteAction', () => ({ addBidNoteAction: vi.fn() }));
vi.mock('@/lib/server/actions/bid/removeBidNoteAction', () => ({ removeBidNoteAction: vi.fn() }));
vi.mock('@/components/rfp/comparison/AwardResult', () => ({
  AwardResult: ({ pgName }: { pgName: string }) => (
    <div data-testid="award-result">{pgName} 선정 완료</div>
  ),
}));

beforeAll(() => {
  class ResizeObserverStub {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  vi.stubGlobal('ResizeObserver', ResizeObserverStub);
  Element.prototype.scrollIntoView ??= () => {};
});

function bid(id: string, pgWsId: string): Bid {
  return {
    id, rfpId: 'r1', pgWsId, invitationId: 'i1',
    settleCycle: 'D+1', settleLimit: 50000000, guaranteeInsurance: 0,
    paymentFees: { card: 0.018 }, customFees: {}, proposalPdfs: [],
    status: 'submitted', submittedBy: 'u1',
  };
}

const baseProps = {
  bids: [bid('b1', 'pgA'), bid('b2', 'pgB')],
  pgWsNameMap: { pgA: '샘플페이 A', pgB: '샘플페이 B' },
  current: {},
  notesByBid: {},
  awardedBidId: null,
  requiredPaymentMethods: ['card'] as const,
  customPaymentMethods: [],
  rfpId: 'r1',
  rfpCode: 'P-2606-0001',
};

describe('FocusComparison sample sandbox', () => {
  it('shows the award CTA when not a sample', () => {
    render(<FocusComparison {...baseProps} rfpStatus="sent" />);
    expect(screen.getByText('이 견적 선정하기 →')).toBeInTheDocument();
  });

  it('hides the award CTA and shows a sample note when isSample', () => {
    render(<FocusComparison {...baseProps} rfpStatus="sent" isSample />);
    expect(screen.queryByText('이 견적 선정하기 →')).not.toBeInTheDocument();
    expect(screen.getByText('샘플에서는 선정할 수 없어요. 실제 견적 요청을 보내보세요.')).toBeInTheDocument();
  });
});
