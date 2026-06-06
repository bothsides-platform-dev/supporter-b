import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import { ImprovementSummary } from '../ImprovementSummary';
import type { Bid } from '@/lib/types/bid';

function makeBid(over: Partial<Bid> = {}): Bid {
  return {
    id: 'b1',
    rfpId: 'r1',
    pgWsId: 'pg1',
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

const fullCurrent = {
  feeRate: '2.8%',
  settlementCycle: 'D+3',
  settlementLimit: '5억',
  guaranteeInsurance: '1,200,000원',
};

afterEach(cleanup);

describe('ImprovementSummary', () => {
  it('shows 현재 → 제안 with an improvement badge for every metric when all current conditions are present', () => {
    render(<ImprovementSummary bid={makeBid()} current={fullCurrent} />);

    const card = within(screen.getByTestId('metric-row-card'));
    expect(card.getByText('2.8%')).toBeInTheDocument(); // current
    expect(card.getByText('2.20%')).toBeInTheDocument(); // proposed
    expect(card.getByText(/0\.60%p/)).toBeInTheDocument(); // improvement badge

    const limit = within(screen.getByTestId('metric-row-limit'));
    expect(limit.getByText('5억')).toBeInTheDocument();
    expect(limit.getByText('700,000,000원')).toBeInTheDocument();
  });

  it('renders a qualitative cycle improvement ("더 빠름") rather than a numeric badge', () => {
    render(<ImprovementSummary bid={makeBid({ settleCycle: 'D+1' })} current={fullCurrent} />);
    const cycle = within(screen.getByTestId('metric-row-cycle'));
    expect(cycle.getByText('더 빠름')).toBeInTheDocument();
  });

  it('shows proposed-only for metrics whose current condition is missing (partial input)', () => {
    render(<ImprovementSummary bid={makeBid()} current={{ feeRate: '2.8%' }} />);

    // card has current → baseline visible
    const card = within(screen.getByTestId('metric-row-card'));
    expect(card.getByText('2.8%')).toBeInTheDocument();

    // limit has no current → proposed only, no baseline arrow
    const limit = within(screen.getByTestId('metric-row-limit'));
    expect(limit.getByText('700,000,000원')).toBeInTheDocument();
    expect(limit.queryByTestId('metric-arrow')).not.toBeInTheDocument();
  });

  it('omits the improvement badge when the current value is not parseable (병기만)', () => {
    render(
      <ImprovementSummary bid={makeBid()} current={{ feeRate: '협의 가능' }} />,
    );
    const card = within(screen.getByTestId('metric-row-card'));
    expect(card.getByText('협의 가능')).toBeInTheDocument();
    expect(card.getByText('2.20%')).toBeInTheDocument();
    expect(card.queryByText(/%p/)).not.toBeInTheDocument();
  });

  it('degrades to a "핵심 수치" summary with guidance when no current conditions are given', () => {
    render(<ImprovementSummary bid={makeBid()} current={{}} />);
    expect(screen.getByText(/현재 조건을 입력하면/)).toBeInTheDocument();
    // proposed values still shown
    expect(screen.getByText('2.20%')).toBeInTheDocument();
    expect(screen.getByText('700,000,000원')).toBeInTheDocument();
    // no improvement badges
    expect(screen.queryByText(/%p/)).not.toBeInTheDocument();
  });
});
