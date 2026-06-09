import * as React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { BidStepFees } from '../BidStepFees';

const noop = () => {};

function setup(over: Partial<React.ComponentProps<typeof BidStepFees>> = {}) {
  const onFee = vi.fn();
  render(
    <BidStepFees
      feeInputMethods={['card', 'naver_pay', 'virtual_account']}
      customPaymentMethods={[]}
      fees={{}}
      onFee={onFee}
      onBack={noop}
      onNext={noop}
      {...over}
    />,
  );
  return { onFee };
}

describe('BidStepFees 구간 매트릭스', () => {
  it('카드·간편결제는 5구간 컬럼 헤더를 보여준다', () => {
    setup();
    expect(screen.getAllByText('영세').length).toBeGreaterThan(0);
    expect(screen.getAllByText('일반').length).toBeGreaterThan(0);
    expect(screen.getByText('카드')).toBeInTheDocument();
    expect(screen.getByText('네이버페이')).toBeInTheDocument();
  });

  it('계좌·기타는 구간 없이 단일 입력', () => {
    setup();
    expect(screen.getByText(/가상계좌/)).toBeInTheDocument();
  });

  it('구간 셀 입력 시 "<method>:<tier>" 복합 키로 onFee 호출', () => {
    const { onFee } = setup();
    const cell = screen.getByTestId('fee-cell-card-sole');
    fireEvent.change(cell, { target: { value: '0.5' } });
    expect(onFee).toHaveBeenCalledWith('card:sole', '0.5');
  });

  it('요청 안 된 카드 카테고리 수단(해외카드)은 렌더하지 않는다', () => {
    setup();
    expect(screen.queryByText('해외카드')).toBeNull();
  });
});
