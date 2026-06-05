import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { BidStepFees } from '../BidStepFees';
import type { PaymentMethod } from '@/lib/types/bid';

afterEach(cleanup);

// 'bank' is not a valid PaymentMethod — use 'bank_transfer' (label: '계좌이체')
const methods: PaymentMethod[] = ['card', 'bank_transfer'];

function renderStep(over: Partial<React.ComponentProps<typeof BidStepFees>> = {}) {
  const onFee = vi.fn();
  render(
    <BidStepFees
      feeInputMethods={methods}
      customPaymentMethods={[]}
      fees={{}}
      onFee={onFee}
      onBack={vi.fn()}
      onNext={vi.fn()}
      {...over}
    />,
  );
  return { onFee };
}

describe('BidStepFees', () => {
  it('요청된 결제수단 수만큼 수수료 입력칸 렌더', () => {
    renderStep();
    expect(screen.getByText(/카드 수수료/)).toBeInTheDocument();
    expect(screen.getByText(/계좌이체 수수료/)).toBeInTheDocument();
  });

  it('채움 카운터가 입력된 칸 수를 보여준다', () => {
    renderStep({ fees: { card: '1.5' } });
    expect(screen.getByTestId('fees-count')).toHaveTextContent('1/2');
  });
});
