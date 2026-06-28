import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

// InfoTip mounts a base-ui Popover which requires ResizeObserver
class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
vi.stubGlobal('ResizeObserver', ResizeObserverStub);

import { BidStepSettlement } from '../BidStepSettlement';

afterEach(cleanup);

function renderStep(over: Partial<React.ComponentProps<typeof BidStepSettlement>> = {}) {
  const onField = vi.fn();
  render(
    <BidStepSettlement
      cycleUnit="D"
      cycleNum="1"
      settleLimit="0"
      guaranteeInsurance="0"
      onField={onField}
      {...over}
    />,
  );
  return { onField };
}

describe('BidStepSettlement', () => {
  it('정산주기 단위 선택에 D(일)·W(주)·M(개월) 옵션이 표시된다', () => {
    renderStep();
    expect(screen.getByRole('option', { name: 'D (일)' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'W (주)' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'M (개월)' })).toBeInTheDocument();
  });

  it('정산주기 숫자 입력 시 onField(cycleNum) 호출', async () => {
    const user = userEvent.setup();
    const { onField } = renderStep({ cycleNum: '' });
    await user.type(screen.getByPlaceholderText('1'), '2');
    expect(onField).toHaveBeenCalledWith('cycleNum', '2');
  });

  it('W 단위 선택 시 onField(cycleUnit, "W") 호출', async () => {
    const user = userEvent.setup();
    const { onField } = renderStep({ cycleNum: '3' });
    await user.selectOptions(screen.getByRole('combobox'), 'W');
    expect(onField).toHaveBeenCalledWith('cycleUnit', 'W');
  });

  it('정산주기 일수는 소수점을 받지 않는다 (정수 전용)', async () => {
    const user = userEvent.setup();
    const { onField } = renderStep({ cycleNum: '' });
    await user.type(screen.getByPlaceholderText('1'), '1.5');
    const cycleVals = onField.mock.calls
      .filter((c) => c[0] === 'cycleNum')
      .map((c) => c[1]);
    expect(cycleVals.some((v: string) => v.includes('.'))).toBe(false);
  });

});
