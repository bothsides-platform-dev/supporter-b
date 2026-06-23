import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { FeeComparisonRows } from '../FeeComparisonRows';
import type { Bid } from '@/lib/types/bid';

const baseBid: Bid = {
  id: 'b1',
  rfpId: 'r1',
  pgWsId: 'pg1',
  invitationId: 'inv1',
  status: 'submitted',
  round: 1,
  submittedBy: 'u1',
  proposalPdfs: [],
  paymentFees: {
    card: { sole: 0.8, sme1: 1.2, sme2: 1.4, sme3: 1.6, general: 2.0 },
    naver_pay: { sole: 1.0, sme1: 1.5, sme2: 1.7, sme3: 1.9, general: 2.2 },
    overseas_card: 2.5,
  },
  customFees: {},
  settleCycle: 'D+2',
  settleLimit: 100_000_000,
  guaranteeInsurance: 0,
};

const tieredRow = {
  key: 'card',
  label: '카드',
  isTiered: true,
  getValue: (b: Bid, tier: string) =>
    typeof b.paymentFees.card === 'object'
      ? (b.paymentFees.card as Record<string, number>)[tier] ?? null
      : (b.paymentFees.card as number | null | undefined) ?? null,
};

const flatRow = {
  key: 'overseas_card',
  label: '해외카드',
  isTiered: false,
  getValue: (b: Bid) =>
    typeof b.paymentFees.overseas_card === 'number' ? b.paymentFees.overseas_card : null,
};

describe('FeeComparisonRows flash', () => {
  it('flash=true이면 isTiered 행의 값 span에 tier-flash 클래스가 붙는다', () => {
    render(
      <FeeComparisonRows
        feeRows={[tieredRow]}
        sortedBids={[baseBid]}
        active={baseBid}
        tier="sole"
        pgWsNameMap={{ pg1: 'PG사' }}
        onSelect={vi.fn()}
        flash={true}
      />,
    );
    const span = screen.getByTestId('fee-value-card');
    expect(span).toHaveClass('tier-flash');
  });

  it('flash=false이면 tier-flash 클래스가 없다', () => {
    render(
      <FeeComparisonRows
        feeRows={[tieredRow]}
        sortedBids={[baseBid]}
        active={baseBid}
        tier="sole"
        pgWsNameMap={{ pg1: 'PG사' }}
        onSelect={vi.fn()}
        flash={false}
      />,
    );
    const span = screen.getByTestId('fee-value-card');
    expect(span).not.toHaveClass('tier-flash');
  });

  it('isTiered=false인 행은 flash=true여도 tier-flash 클래스가 없다', () => {
    render(
      <FeeComparisonRows
        feeRows={[flatRow]}
        sortedBids={[baseBid]}
        active={baseBid}
        tier="sole"
        pgWsNameMap={{ pg1: 'PG사' }}
        onSelect={vi.fn()}
        flash={true}
      />,
    );
    const span = screen.getByTestId('fee-value-overseas_card');
    expect(span).not.toHaveClass('tier-flash');
  });
});
