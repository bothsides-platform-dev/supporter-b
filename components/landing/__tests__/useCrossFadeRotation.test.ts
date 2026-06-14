import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

const mockReduced = vi.hoisted(() => vi.fn(() => false));
vi.mock('@/lib/landing/prefers-reduced-motion', () => ({
  prefersReducedMotion: mockReduced,
}));

import { useCrossFadeRotation } from '../useCrossFadeRotation';

describe('useCrossFadeRotation — 두 카피 자동 전환', () => {
  beforeEach(() => {
    mockReduced.mockReturnValue(false);
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('0에서 시작한다', () => {
    const { result } = renderHook(() => useCrossFadeRotation(2, 1000));
    expect(result.current).toBe(0);
  });

  it('인터벌마다 인덱스가 전진하고 끝에서 0으로 돌아온다', () => {
    const { result } = renderHook(() => useCrossFadeRotation(2, 1000));
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(result.current).toBe(1);
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(result.current).toBe(0);
  });

  it('동작 줄이기 선호 시 전진하지 않는다', () => {
    mockReduced.mockReturnValue(true);
    const { result } = renderHook(() => useCrossFadeRotation(2, 1000));
    act(() => {
      vi.advanceTimersByTime(5000);
    });
    expect(result.current).toBe(0);
  });

  it('항목이 1개면 전진하지 않는다', () => {
    const { result } = renderHook(() => useCrossFadeRotation(1, 1000));
    act(() => {
      vi.advanceTimersByTime(5000);
    });
    expect(result.current).toBe(0);
  });
});
