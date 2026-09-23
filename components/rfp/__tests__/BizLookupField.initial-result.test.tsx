// Coverage: ISSUE-002 — 복원된 조회 결과(initialResult)도 새로 조회한 결과와 똑같이 초기화·재조회할 수 있어야 한다
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BizLookupField } from '../BizLookupField';

afterEach(cleanup);

const restored = {
  bizNo: '124-81-00998',
  taxType: 'general' as const,
  status: 'active' as const,
  verified: true,
};

describe('BizLookupField — initialResult 복원', () => {
  it('복원 상태에서는 입력이 잠기고 조회 없이 결과 패널을 보여준다', () => {
    const onLookup = vi.fn();
    render(
      <BizLookupField onLookup={onLookup} onResult={vi.fn()} onReset={vi.fn()} initialResult={restored} />,
    );
    expect(screen.getByLabelText('사업자 등록번호')).toHaveValue('124-81-00998');
    expect(screen.getByLabelText('사업자 등록번호')).toBeDisabled();
    expect(screen.getByText('✓ 확인됨')).toBeInTheDocument();
    expect(screen.getByText('일반과세')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '조회' })).not.toBeInTheDocument();
    expect(onLookup).not.toHaveBeenCalled();
  });

  it('초기화를 누르면 onReset 을 부르고 입력을 비워 다시 조회할 수 있게 한다', async () => {
    const user = userEvent.setup();
    const onReset = vi.fn();
    const onResult = vi.fn();
    const onLookup = vi.fn(async () => ({
      valid: true as const,
      taxType: 'simple' as const,
      status: 'active' as const,
    }));
    render(
      <BizLookupField onLookup={onLookup} onResult={onResult} onReset={onReset} initialResult={restored} />,
    );

    await user.click(screen.getByRole('button', { name: '초기화' }));
    expect(onReset).toHaveBeenCalledTimes(1);
    const input = screen.getByLabelText('사업자 등록번호');
    expect(input).toHaveValue('');
    expect(input).toBeEnabled();
    expect(screen.queryByText('✓ 확인됨')).not.toBeInTheDocument();

    await user.type(input, '1234567890');
    await user.click(screen.getByRole('button', { name: '조회' }));
    await waitFor(() =>
      expect(onResult).toHaveBeenCalledWith({
        bizNo: '123-45-67890',
        taxType: 'simple',
        status: 'active',
        verified: true,
      }),
    );
  });

  it('미검증 복원 결과는 확인됨·과세 유형 없이 심사 안내를 보여준다', () => {
    render(
      <BizLookupField
        onLookup={vi.fn()}
        onResult={vi.fn()}
        onReset={vi.fn()}
        initialResult={{ bizNo: '124-81-00998', verified: false }}
      />,
    );
    expect(screen.queryByText('✓ 확인됨')).not.toBeInTheDocument();
    expect(screen.queryByText('과세 유형')).not.toBeInTheDocument();
    expect(screen.getByText('확인은 가입 심사 중에 완료돼요.')).toBeInTheDocument();
  });
});
