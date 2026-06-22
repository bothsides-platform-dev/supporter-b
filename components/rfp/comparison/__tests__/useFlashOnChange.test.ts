import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { useFlashOnChange } from '../useFlashOnChange';

describe('useFlashOnChange', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('초기 마운트 시 false (첫 렌더 플래시 안 함)', () => {
    const { result } = renderHook(() => useFlashOnChange('sole'));
    expect(result.current).toBe(false);
  });

  it('dep 변경 후 true로 전환', () => {
    const { result, rerender } = renderHook(({ dep }) => useFlashOnChange(dep), {
      initialProps: { dep: 'sole' },
    });
    act(() => { rerender({ dep: 'sme1' }); });
    expect(result.current).toBe(true);
  });

  it('ms 경과 후 false로 복귀', () => {
    const { result, rerender } = renderHook(({ dep }) => useFlashOnChange(dep, 300), {
      initialProps: { dep: 'sole' },
    });
    act(() => { rerender({ dep: 'sme1' }); });
    expect(result.current).toBe(true);
    act(() => { vi.advanceTimersByTime(300); });
    expect(result.current).toBe(false);
  });
});
