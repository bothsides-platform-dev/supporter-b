import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, within } from '@testing-library/react';
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
      signupFee="0"
      onField={onField}
      {...over}
    />,
  );
  return { onField };
}

describe('BidStepSettlement', () => {
  // 정산한도 0 은 '한도 없음'이 아니라 '정산 불가'로 읽힌다 — 구매사 비교 패널이
  // 저장값을 그대로 `0원` 으로 찍으므로 입력 단계에서 막는다. 서버도 거부하지만
  // 여기서 막아야 사용자가 제출 후에야 알게 되지 않는다.
  it('제출 시도 후 정산한도가 0 이면 에러를 보여준다', () => {
    renderStep({ settleLimit: '0', attempted: true });
    expect(screen.getByText('정산한도를 입력해주세요')).toBeInTheDocument();
  });

  it('제출 시도 후 정산한도가 0 초과면 에러가 없다', () => {
    renderStep({ settleLimit: '50000000', attempted: true });
    expect(screen.queryByText('정산한도를 입력해주세요')).not.toBeInTheDocument();
  });

  it('제출 시도 전에는 정산한도 0 이어도 에러를 띄우지 않는다', () => {
    renderStep({ settleLimit: '0' });
    expect(screen.queryByText('정산한도를 입력해주세요')).not.toBeInTheDocument();
  });

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

  it('가입비 (원/최초 1회) 입력 필드가 렌더되고, 입력 시 onField(signupFee) 호출', async () => {
    const user = userEvent.setup();
    const { onField } = renderStep({ signupFee: '' });
    const label = screen.getByText('가입비 (원/최초 1회)');
    const wrapper = label.closest('.space-y-1') as HTMLElement;
    const input = within(wrapper).getByRole('textbox');
    await user.type(input, '5');
    expect(onField).toHaveBeenCalledWith('signupFee', '5');
  });

});

describe('BidStepSettlement 필수 마커/에러 (정산주기)', () => {
  // settleLimit 을 유효값으로 고정해 이 단계에서 미충족 필드가 정산주기 하나만
  // 남게 한다 — 정산한도도 필수가 된 뒤로(v0.4.27.0) 단수 getter 가 두 필드를
  // 함께 잡아 모호해졌다. 값을 넣어 대상을 좁히는 쪽이 매처를 느슨하게 푸는 것보다
  // 낫다(느슨해지면 정산주기 마커가 사라져도 초록으로 남는다).
  const VALID_LIMIT = '50000000';

  it('라벨에서 임시 별표(*)를 떼고 필수 칩으로 대체한다', () => {
    renderStep({ cycleNum: '', settleLimit: VALID_LIMIT });
    expect(screen.queryByText('정산 주기 *')).toBeNull();
    expect(screen.getByText('정산 주기')).toBeInTheDocument();
    expect(screen.getByText('필수')).toBeInTheDocument(); // 비었으므로 'empty' → '필수'
  });

  it('정산주기가 채워지면 "입력 완료" 칩을 보인다', () => {
    renderStep({ cycleNum: '1' });
    expect(screen.getByText('입력 완료')).toBeInTheDocument();
  });

  it('attempted=true 이고 정산주기가 비면 빨간 에러 메시지를 보인다', () => {
    renderStep({ cycleNum: '', settleLimit: VALID_LIMIT, attempted: true });
    expect(screen.getByRole('alert')).toHaveTextContent('정산 주기를 입력해주세요');
  });

  it('attempted=false 이면 비어 있어도 에러 메시지는 없다', () => {
    renderStep({ cycleNum: '' });
    expect(screen.queryByRole('alert')).toBeNull();
  });
});
