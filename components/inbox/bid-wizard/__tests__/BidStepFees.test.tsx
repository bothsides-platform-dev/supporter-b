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

  it('가상계좌는 % 정률이 아니라 건당 정액(원) 입력으로 받는다', () => {
    setup();
    // CurrencyInput: "가상계좌 건당 수수료" 라벨 + "원" suffix (PercentInput 의 % 아님)
    expect(screen.getByText('가상계좌 건당 수수료')).toBeInTheDocument();
    expect(screen.getByText('원')).toBeInTheDocument();
    expect(screen.queryByText('%')).toBeNull();
  });

  it('구간 셀 입력 시 "<method>:<tier>" 복합 키로 onFee 호출', () => {
    const { onFee } = setup();
    const cell = screen.getByTestId('fee-cell-card-sole');
    fireEvent.change(cell, { target: { value: '0.5' } });
    expect(onFee).toHaveBeenCalledWith('card:sole', '0.5');
  });

  it('값이 입력된 구간 셀에 포커스하면 1만원 결제 환산 툴팁을 보여준다', () => {
    setup({ fees: { 'card:sole': '1.25' } });
    fireEvent.focusIn(screen.getByTestId('fee-cell-card-sole'));
    expect(screen.getByRole('tooltip')).toHaveTextContent('1만원 결제 시 125원');
  });

  it('요청 안 된 카드 카테고리 수단(해외카드)은 렌더하지 않는다', () => {
    setup();
    expect(screen.queryByText('해외카드')).toBeNull();
  });

  it('해외카드는 구간 매트릭스가 아니라 단일 입력으로 받는다', () => {
    setup({ feeInputMethods: ['card', 'overseas_card'] });
    // 국내카드는 구간 셀이 있지만, 해외카드는 구간 셀이 없어야 한다.
    expect(screen.getByTestId('fee-cell-card-sole')).toBeInTheDocument();
    expect(screen.queryByTestId('fee-cell-overseas_card-sole')).toBeNull();
    // 해외카드는 단일요율 PercentInput(라벨 "해외카드 수수료")으로 렌더.
    expect(screen.getByText('해외카드 수수료')).toBeInTheDocument();
  });

  it('첫 번째 열(영세, sole) 셀의 툴팁은 left-0 클래스를 갖는다', () => {
    setup({ fees: { 'card:sole': '1.25' } });
    fireEvent.focusIn(screen.getByTestId('fee-cell-card-sole'));
    expect(screen.getByRole('tooltip').className).toContain('left-0');
  });

  it('마지막 열(일반, general) 셀의 툴팁은 right-0 클래스를 갖는다', () => {
    setup({ fees: { 'card:general': '2.00' } });
    fireEvent.focusIn(screen.getByTestId('fee-cell-card-general'));
    expect(screen.getByRole('tooltip').className).toContain('right-0');
  });

  it('중간 열(중소2, sme2) 셀의 툴팁은 left-1/2 클래스를 갖는다', () => {
    setup({ fees: { 'card:sme2': '1.00' } });
    fireEvent.focusIn(screen.getByTestId('fee-cell-card-sme2'));
    expect(screen.getByRole('tooltip').className).toContain('left-1/2');
  });
});
