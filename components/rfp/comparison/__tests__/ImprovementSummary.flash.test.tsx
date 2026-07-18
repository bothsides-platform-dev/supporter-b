import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { ImprovementSummary } from '../ImprovementSummary';
import type { Bid } from '@/lib/types/bid';

const bid: Bid = {
  id: 'b1',
  rfpId: 'r1',
  pgWsId: 'pg1',
  invitationId: 'inv1',
  round: 1,
  settleCycle: 'D+2',
  settleLimit: 100_000_000,
  guaranteeInsurance: 0,
  signupFee: 0,
  paymentFees: { card: { sole: 0.008, sme1: 0.012, sme2: 0.014, sme3: 0.016, general: 0.02 } },
  customFees: {},
  proposalPdfs: [],
  status: 'submitted',
  submittedBy: 'u1',
};

const current = { feeRate: '2.5%', settlementCycle: 'D+5' };

describe('ImprovementSummary flash', () => {
  it('flash=true이면 카드 수수료 제안값 span에 tier-flash 클래스가 붙는다', () => {
    render(
      <ImprovementSummary bid={bid} current={current} tier="sole" flash={true} />,
    );
    const span = screen.getByTestId('flash-card-fee');
    expect(span).toHaveClass('tier-flash');
  });

  it('flash=false이면 tier-flash 클래스가 없다', () => {
    render(
      <ImprovementSummary bid={bid} current={current} tier="sole" flash={false} />,
    );
    const span = screen.getByTestId('flash-card-fee');
    expect(span).not.toHaveClass('tier-flash');
  });
});
