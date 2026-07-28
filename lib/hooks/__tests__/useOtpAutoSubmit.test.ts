/**
 * useOtpAutoSubmit — OTP 코드가 정해진 자릿수를 채우는 순간 자동 제출하는 훅.
 *
 * 계약 네 가지:
 *   1. 6자리에 도달하면 onComplete 를 호출한다.
 *   2. 같은 코드로는 두 번 자동 발화하지 않는다 (실패 후 되돌려 입력해도 서버
 *      시도 횟수를 자동으로 소진시키지 않는다 — 같은 코드 재시도는 버튼 클릭만).
 *   3. enabled=false 면 발화하지 않고 기록도 남기지 않는다 (나중에 켜지면 발화).
 *   4. reset() 은 기록을 지운다 (재전송으로 서버 코드가 갈릴 때).
 */
import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { useOtpAutoSubmit } from '@/lib/hooks/useOtpAutoSubmit';

function setup(initial: { code: string; enabled?: boolean }) {
  const onComplete = vi.fn();
  const view = renderHook(
    ({ code, enabled }: { code: string; enabled?: boolean }) =>
      useOtpAutoSubmit({ code, enabled, onComplete }),
    { initialProps: initial },
  );
  return { onComplete, ...view };
}

describe('useOtpAutoSubmit', () => {
  it('자릿수 미달이면 발화하지 않는다', () => {
    const { onComplete, rerender } = setup({ code: '' });

    rerender({ code: '12345' });

    expect(onComplete).not.toHaveBeenCalled();
  });

  it('6자리에 도달하면 onComplete 를 1회 호출한다', () => {
    const { onComplete, rerender } = setup({ code: '' });

    rerender({ code: '123456' });

    expect(onComplete).toHaveBeenCalledTimes(1);
  });

  it('마운트 시점에 이미 6자리면 그대로 발화한다', () => {
    const { onComplete } = setup({ code: '123456' });

    expect(onComplete).toHaveBeenCalledTimes(1);
  });

  it('같은 코드로 되돌아와도 다시 발화하지 않는다', () => {
    const { onComplete, rerender } = setup({ code: '' });

    rerender({ code: '123456' });
    rerender({ code: '12345' }); // 한 자 지움
    rerender({ code: '123456' }); // 같은 자를 다시 입력

    expect(onComplete).toHaveBeenCalledTimes(1);
  });

  it('다른 코드로 바뀌면 다시 발화한다', () => {
    const { onComplete, rerender } = setup({ code: '' });

    rerender({ code: '123456' });
    rerender({ code: '12345' });
    rerender({ code: '123457' });

    expect(onComplete).toHaveBeenCalledTimes(2);
  });

  it('enabled=false 면 발화하지 않고, true 로 켜지는 순간 발화한다', () => {
    const { onComplete, rerender } = setup({ code: '', enabled: false });

    rerender({ code: '123456', enabled: false });
    expect(onComplete).not.toHaveBeenCalled();

    rerender({ code: '123456', enabled: true });
    expect(onComplete).toHaveBeenCalledTimes(1);
  });

  it('reset() 후에는 같은 코드라도 다시 발화한다', () => {
    const { onComplete, rerender, result } = setup({ code: '' });

    rerender({ code: '123456' });
    expect(onComplete).toHaveBeenCalledTimes(1);

    act(() => result.current.reset());
    rerender({ code: '' });
    rerender({ code: '123456' });

    expect(onComplete).toHaveBeenCalledTimes(2);
  });

  // onComplete 는 렌더마다 새 closure 라 ref 로 잡는데, 그 동기화 effect 가 자동
  // 제출 effect 보다 먼저 선언돼야 같은 커밋에서 최신 closure 를 본다. 순서가
  // 뒤집히면 직전 렌더의 closure — 즉 5자리 코드 — 를 제출한다.
  it('발화 시점의 최신 콜백을 호출한다', () => {
    const seen: string[] = [];
    const { rerender } = renderHook(
      ({ code }: { code: string }) =>
        useOtpAutoSubmit({ code, onComplete: () => seen.push(code) }),
      { initialProps: { code: '' } },
    );

    rerender({ code: '12345' });
    rerender({ code: '123456' });

    expect(seen).toEqual(['123456']);
  });
});
