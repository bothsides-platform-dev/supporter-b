import { describe, it, expect, vi, afterEach } from 'vitest';
import { act, renderHook } from '@testing-library/react';

import { useRemainingMs } from '../useRemainingMs';

afterEach(() => {
  vi.useRealTimers();
});

describe('useRemainingMs', () => {
  // 값이 없거나 파싱할 수 없으면 "쿨다운 없음"(null)이다 — NaN 이 남은 시간으로 새면
  // 버튼이 영영 비활성이 되거나 "NaN분 뒤" 가 인쇄된다.
  it.each([undefined, '', 'not-a-date'])('%s → null (타이머도 걸지 않는다)', (until) => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useRemainingMs(until));
    expect(result.current).toBeNull();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('만료 시각에 null 로 떨어지고, 언마운트하면 타이머를 남기지 않는다', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-23T00:00:00.000Z'));
    const { result, unmount } = renderHook(() => useRemainingMs('2026-09-23T00:02:30.000Z'));
    expect(result.current).toBe(150_000);

    act(() => {
      vi.advanceTimersByTime(60_000);
    });
    expect(result.current).toBe(90_000);

    act(() => {
      vi.advanceTimersByTime(90_000);
    });
    expect(result.current).toBeNull();
    expect(vi.getTimerCount()).toBe(0);

    const { unmount: unmount2 } = renderHook(() => useRemainingMs('2026-09-23T01:00:00.000Z'));
    expect(vi.getTimerCount()).toBe(1);
    unmount2();
    unmount();
    expect(vi.getTimerCount()).toBe(0);
  });
});
