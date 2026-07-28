import { describe, it, expect, vi } from 'vitest';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BizLookupField, type LookupResponse } from '../BizLookupField';

type DeferredResponse = LookupResponse;

describe('BizLookupField', () => {
  it('calls onLookup with the formatted bizNo and emits a slim result', async () => {
    const user = userEvent.setup();
    const onLookup = vi.fn(async () => ({
      valid: true as const,
      taxType: 'general' as const,
      status: 'active' as const,
    }));
    const onResult = vi.fn();
    const onReset = vi.fn();

    render(
      <BizLookupField
        onLookup={onLookup}
        onResult={onResult}
        onReset={onReset}
      />,
    );

    await user.type(screen.getByLabelText('사업자 등록번호'), '1234567890');
    await user.click(screen.getByRole('button', { name: '조회' }));

    await waitFor(() =>
      expect(onLookup).toHaveBeenCalledWith('123-45-67890'),
    );
    expect(onResult).toHaveBeenCalledWith({
      bizNo: '123-45-67890',
      taxType: 'general',
      status: 'active',
      verified: true,
    });
  });

  it('renders only the slim NTS fields (no 상호명/대표자/업종/통신판매업)', async () => {
    const user = userEvent.setup();
    const onLookup = vi.fn(async () => ({
      valid: true as const,
      taxType: 'simple' as const,
      status: 'active' as const,
    }));

    render(
      <BizLookupField
        onLookup={onLookup}
        onResult={() => {}}
        onReset={() => {}}
      />,
    );

    await user.type(screen.getByLabelText('사업자 등록번호'), '1234567890');
    await user.click(screen.getByRole('button', { name: '조회' }));

    await waitFor(() =>
      expect(screen.getByText('NTS — 국세청 자동 조회')).toBeInTheDocument(),
    );

    // Slim fields present:
    expect(screen.getByText('사업자번호')).toBeInTheDocument();
    expect(screen.getByText('과세 유형')).toBeInTheDocument();
    expect(screen.getByText('사업자 상태')).toBeInTheDocument();
    expect(screen.getByText('간이과세')).toBeInTheDocument();

    // Pre-Step-6 fields gone:
    expect(screen.queryByText('상호명')).toBeNull();
    expect(screen.queryByText('대표자')).toBeNull();
    expect(screen.queryByText('업종')).toBeNull();
    expect(screen.queryByText('통신판매업')).toBeNull();
  });

  it('shows an error message when onLookup returns valid=false', async () => {
    const user = userEvent.setup();
    const onLookup = vi.fn(async () => ({ valid: false as const }));

    render(
      <BizLookupField
        onLookup={onLookup}
        onResult={() => {}}
        onReset={() => {}}
      />,
    );

    await user.type(screen.getByLabelText('사업자 등록번호'), '9999999999');
    await user.click(screen.getByRole('button', { name: '조회' }));

    expect(
      await screen.findByText(/사업자번호를 찾지 못했어요/),
    ).toBeInTheDocument();
  });

  it('shows API error message when onLookup returns { valid: false, error: ... }', async () => {
    const user = userEvent.setup();
    const onLookup = vi.fn(async () => ({
      valid: false as const,
      error: '조회 중 오류가 발생했어요. 잠시 후 다시 시도해주세요.',
    }));

    render(
      <BizLookupField onLookup={onLookup} onResult={() => {}} onReset={() => {}} />,
    );
    await user.type(screen.getByLabelText('사업자 등록번호'), '1234567890');
    await user.click(screen.getByRole('button', { name: '조회' }));

    expect(
      await screen.findByText(/잠시 후 다시 시도해주세요/),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: '조회' }),
    ).toBeInTheDocument();
  });

  it('shows error and resets to idle when onLookup throws (no infinite loading)', async () => {
    const user = userEvent.setup();
    const onLookup = vi.fn().mockRejectedValue(new Error('network'));

    render(
      <BizLookupField onLookup={onLookup} onResult={() => {}} onReset={() => {}} />,
    );
    await user.type(screen.getByLabelText('사업자 등록번호'), '1234567890');
    await user.click(screen.getByRole('button', { name: '조회' }));

    await waitFor(() =>
      expect(screen.queryByText('조회 중…')).not.toBeInTheDocument(),
    );
    expect(
      await screen.findByText(/오류가 발생했어요/),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '조회' })).toBeInTheDocument();
  });
});

describe('BizLookupField — blockedStatuses', () => {
  it.each([
    ['closed', '9999999999', '폐업'] as const,
    ['suspended', '8888888888', '휴업'] as const,
  ])('does not call onResult and shows error when %s business is looked up with blockedStatuses', async (status, bizNo, statusLabel) => {
    const user = userEvent.setup();
    const onLookup = vi.fn(async () => ({
      valid: true as const,
      taxType: 'general' as const,
      status,
    }));
    const onResult = vi.fn();

    render(
      <BizLookupField
        onLookup={onLookup}
        onResult={onResult}
        onReset={() => {}}
        blockedStatuses={['closed', 'suspended']}
      />,
    );

    await user.type(screen.getByLabelText('사업자 등록번호'), bizNo);
    await user.click(screen.getByRole('button', { name: '조회' }));

    // 차단된 경우 "✓ 확인됨" 배지는 숨겨지고 오류 메시지가 표시된다.
    await waitFor(() =>
      expect(screen.getByRole('alert')).toBeInTheDocument(),
    );
    expect(onResult).not.toHaveBeenCalled();
    expect(screen.getByRole('alert').textContent).toMatch(/사용할 수 없어요/);
    expect(screen.getByText(statusLabel)).toBeInTheDocument();
    expect(screen.queryByText('✓ 확인됨')).not.toBeInTheDocument();
  });

  it('초기화 button resets blocked state and returns to idle', async () => {
    const user = userEvent.setup();
    const onLookup = vi.fn(async () => ({
      valid: true as const,
      taxType: 'general' as const,
      status: 'closed' as const,
    }));
    const onReset = vi.fn();

    render(
      <BizLookupField
        onLookup={onLookup}
        onResult={() => {}}
        onReset={onReset}
        blockedStatuses={['closed', 'suspended']}
      />,
    );

    await user.type(screen.getByLabelText('사업자 등록번호'), '9999999999');
    await user.click(screen.getByRole('button', { name: '조회' }));
    await waitFor(() =>
      expect(screen.getByRole('alert')).toBeInTheDocument(),
    );

    await user.click(screen.getByRole('button', { name: '초기화' }));

    expect(onReset).toHaveBeenCalled();
    expect(screen.queryByText('✓ 확인됨')).not.toBeInTheDocument();
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.getByRole('button', { name: '조회' })).toBeInTheDocument();
  });

  it('still calls onResult for active business even when blockedStatuses is set', async () => {
    const user = userEvent.setup();
    const onLookup = vi.fn(async () => ({
      valid: true as const,
      taxType: 'general' as const,
      status: 'active' as const,
    }));
    const onResult = vi.fn();

    render(
      <BizLookupField
        onLookup={onLookup}
        onResult={onResult}
        onReset={() => {}}
        blockedStatuses={['closed', 'suspended']}
      />,
    );

    await user.type(screen.getByLabelText('사업자 등록번호'), '1234567890');
    await user.click(screen.getByRole('button', { name: '조회' }));

    await waitFor(() =>
      expect(screen.getByText('✓ 확인됨')).toBeInTheDocument(),
    );
    expect(onResult).toHaveBeenCalledWith({
      bizNo: '123-45-67890',
      taxType: 'general',
      status: 'active',
      verified: true,
    });
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('calls onResult for closed business when blockedStatuses is not set (backwards compat)', async () => {
    const user = userEvent.setup();
    const onLookup = vi.fn(async () => ({
      valid: true as const,
      taxType: 'general' as const,
      status: 'closed' as const,
    }));
    const onResult = vi.fn();

    render(
      <BizLookupField
        onLookup={onLookup}
        onResult={onResult}
        onReset={() => {}}
      />,
    );

    await user.type(screen.getByLabelText('사업자 등록번호'), '9999999999');
    await user.click(screen.getByRole('button', { name: '조회' }));

    await waitFor(() =>
      expect(screen.getByText('✓ 확인됨')).toBeInTheDocument(),
    );
    expect(onResult).toHaveBeenCalledWith({
      bizNo: '999-99-99999',
      taxType: 'general',
      status: 'closed',
      verified: true,
    });
  });

  // 국세청 상위 장애 시의 계약: 사용자에게는 **오류를 일절 보이지 않고** 가입을
  // 그대로 진행시킨다. 검증은 관리자 승인(워크스페이스 pending) 단계로 미뤄지고,
  // 장애 사실은 Sentry·심사메일로 운영자에게만 간다.
  describe('degraded (국세청 장애) 응답', () => {
    async function renderDegraded(onResult = vi.fn()) {
      const user = userEvent.setup();
      const onLookup = vi.fn(
        async (): Promise<DeferredResponse> => ({ valid: false, degraded: true }),
      );
      render(
        <BizLookupField onLookup={onLookup} onResult={onResult} onReset={() => {}} />,
      );
      await user.type(screen.getByLabelText('사업자 등록번호'), '1234567890');
      await user.click(screen.getByRole('button', { name: '조회' }));
      return { onResult };
    }

    it('오류를 표시하지 않는다', async () => {
      await renderDegraded();
      await waitFor(() =>
        expect(screen.getByText('확인은 가입 심사 중에 완료돼요.')).toBeInTheDocument(),
      );
      // role="alert" 가 뜨면 사용자에게 오류로 읽힌다 — 저하 모드의 핵심 계약.
      expect(screen.queryByRole('alert')).toBeNull();
      expect(screen.queryByText('사업자번호를 찾지 못했어요.')).toBeNull();
    });

    // onResult 가 불려야 부모 폼의 제출 게이트(bizProfile !== null)가 열린다 —
    // 이게 안 되면 장애 중 가입이 계속 막힌다(이번 작업의 본래 목적).
    it('미검증 프로필로 onResult 를 호출해 제출 게이트를 연다', async () => {
      const onResult = vi.fn();
      await renderDegraded(onResult);
      await waitFor(() =>
        expect(onResult).toHaveBeenCalledWith({
          bizNo: '123-45-67890',
          verified: false,
        }),
      );
    });

    // 조회하지 못한 값을 표시하면 확인된 것처럼 읽힌다.
    it('확인 배지와 과세 유형·사업자 상태를 표시하지 않는다', async () => {
      await renderDegraded();
      await waitFor(() =>
        expect(screen.getByText('확인은 가입 심사 중에 완료돼요.')).toBeInTheDocument(),
      );
      expect(screen.queryByText('✓ 확인됨')).toBeNull();
      expect(screen.queryByText('과세 유형')).toBeNull();
      expect(screen.queryByText('사업자 상태')).toBeNull();
      expect(screen.queryByText('NTS — 국세청 자동 조회')).toBeNull();
      // 입력한 번호 자체는 확인용으로 남는다.
      expect(screen.getByText('123-45-67890')).toBeInTheDocument();
    });
  });
});

describe('BizLookupField — 동시성/레이스', () => {
  it('does not re-fire onLookup when Enter is pressed during loading', async () => {
    const user = userEvent.setup();
    const resolvers: Array<(v: DeferredResponse) => void> = [];
    const onLookup = vi.fn(
      () => new Promise<DeferredResponse>((resolve) => resolvers.push(resolve)),
    );

    render(
      <BizLookupField onLookup={onLookup} onResult={() => {}} onReset={() => {}} />,
    );
    const input = screen.getByLabelText('사업자 등록번호');
    await user.type(input, '1234567890');
    await user.type(input, '{Enter}'); // 조회 시작 → loading
    await user.type(input, '{Enter}{Enter}'); // 로딩 중 연타 — 무시되어야 한다

    expect(onLookup).toHaveBeenCalledTimes(1);

    await act(async () => {
      resolvers[0]!({ valid: false });
    });
    expect(await screen.findByText(/사업자번호를 찾지 못했어요/)).toBeInTheDocument();
  });

  it('ignores a stale in-flight result after the input is edited', async () => {
    const user = userEvent.setup();
    const resolvers: Array<(v: DeferredResponse) => void> = [];
    const onLookup = vi.fn(
      () => new Promise<DeferredResponse>((resolve) => resolvers.push(resolve)),
    );
    const onResult = vi.fn();

    render(
      <BizLookupField onLookup={onLookup} onResult={onResult} onReset={() => {}} />,
    );
    const input = screen.getByLabelText('사업자 등록번호');
    await user.type(input, '1234567890');
    await user.click(screen.getByRole('button', { name: '조회' })); // in-flight
    await user.type(input, '{Backspace}'); // 조회 중 입력 수정 → idle 리셋

    // 이전 번호의 응답이 뒤늦게 도착 — 폐기되어야 한다.
    await act(async () => {
      resolvers[0]!({ valid: true, taxType: 'general', status: 'active' });
    });

    expect(onResult).not.toHaveBeenCalled();
    expect(screen.queryByText('NTS — 국세청 자동 조회')).not.toBeInTheDocument();
    await waitFor(() =>
      expect(screen.getByRole('button', { name: '조회' })).toBeInTheDocument(),
    );
  });

  // resolve 경로뿐 아니라 reject 경로의 stale 가드도 검증 — 입력 수정 후
  // 도착한 이전 조회의 '실패'가 새 idle 상태를 오류로 덮어쓰면 안 된다.
  it('ignores a stale in-flight rejection after the input is edited', async () => {
    const user = userEvent.setup();
    const rejecters: Array<(e: unknown) => void> = [];
    const onLookup = vi.fn(
      () => new Promise<DeferredResponse>((_resolve, reject) => rejecters.push(reject)),
    );
    const onResult = vi.fn();

    render(
      <BizLookupField onLookup={onLookup} onResult={onResult} onReset={() => {}} />,
    );
    const input = screen.getByLabelText('사업자 등록번호');
    await user.type(input, '1234567890');
    await user.click(screen.getByRole('button', { name: '조회' })); // in-flight
    await user.type(input, '{Backspace}'); // 조회 중 입력 수정 → idle 리셋

    await act(async () => {
      rejecters[0]!(new Error('network'));
    });

    expect(onResult).not.toHaveBeenCalled();
    expect(screen.queryByRole('alert')).toBeNull(); // stale 오류 메시지 미표시
    expect(screen.getByRole('button', { name: '조회' })).toBeInTheDocument();
  });
});
