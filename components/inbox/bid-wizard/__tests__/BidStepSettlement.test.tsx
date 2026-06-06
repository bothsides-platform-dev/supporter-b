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
  const onNext = vi.fn();
  render(
    <BidStepSettlement
      cycleUnit="D"
      cycleNum="1"
      settleLimit="0"
      guaranteeInsurance="0"
      onField={onField}
      onNext={onNext}
      {...over}
    />,
  );
  return { onField, onNext };
}

describe('BidStepSettlement', () => {
  it('정산주기 숫자 입력 시 onField(cycleNum) 호출', async () => {
    const user = userEvent.setup();
    const { onField } = renderStep({ cycleNum: '' });
    await user.type(screen.getByPlaceholderText('1'), '2');
    expect(onField).toHaveBeenCalledWith('cycleNum', '2');
  });

  it('다음 버튼 클릭 시 onNext 호출', async () => {
    const user = userEvent.setup();
    const { onNext } = renderStep();
    await user.click(screen.getByRole('button', { name: '수수료' }));
    expect(onNext).toHaveBeenCalled();
  });
});
