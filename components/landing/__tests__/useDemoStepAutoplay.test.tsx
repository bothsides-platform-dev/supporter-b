import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

const mockReduced = vi.hoisted(() => vi.fn(() => false));
vi.mock('@/lib/landing/prefers-reduced-motion', () => ({
  prefersReducedMotion: mockReduced,
}));

import { useDemoStepAutoplay } from '../useDemoStepAutoplay';

describe('useDemoStepAutoplay — 자동재생→조작 하이브리드', () => {
  beforeEach(() => {
    mockReduced.mockReturnValue(false);
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('step 1에서 시작한다', () => {
    const { result } = renderHook(() => useDemoStepAutoplay(5, 1000));
    expect(result.current.step).toBe(1);
  });

  it('인터벌마다 step이 전진하고 마지막 step에서 멈춘다(초과 없음)', () => {
    const { result } = renderHook(() => useDemoStepAutoplay(3, 1000));
    act(() => vi.advanceTimersByTime(1000));
    expect(result.current.step).toBe(2);
    act(() => vi.advanceTimersByTime(1000));
    expect(result.current.step).toBe(3);
    act(() => vi.advanceTimersByTime(5000));
    expect(result.current.step).toBe(3);
  });

  it('stop() 이후에는 자동 전진하지 않는다', () => {
    const { result } = renderHook(() => useDemoStepAutoplay(5, 1000));
    act(() => result.current.stop());
    act(() => vi.advanceTimersByTime(5000));
    expect(result.current.step).toBe(1);
    expect(result.current.stopped).toBe(true);
  });

  it('stop() 이후 setStep으로 수동 제어가 가능하다', () => {
    const { result } = renderHook(() => useDemoStepAutoplay(5, 1000));
    act(() => result.current.stop());
    act(() => result.current.setStep(4));
    expect(result.current.step).toBe(4);
  });

  it('동작 줄이기 선호 시 자동 전진하지 않는다', () => {
    mockReduced.mockReturnValue(true);
    const { result } = renderHook(() => useDemoStepAutoplay(5, 1000));
    act(() => vi.advanceTimersByTime(5000));
    expect(result.current.step).toBe(1);
  });

  it('enabled=false면 자동 전진하지 않는다 (뷰 진입 전 대기)', () => {
    const { result } = renderHook(() => useDemoStepAutoplay(5, 1000, false));
    act(() => vi.advanceTimersByTime(5000));
    expect(result.current.step).toBe(1);
  });

  it('enabled가 false→true로 바뀌면 그때부터 전진한다 (뷰 진입 시 시작)', () => {
    const { result, rerender } = renderHook(
      ({ en }: { en: boolean }) => useDemoStepAutoplay(5, 1000, en),
      { initialProps: { en: false } },
    );
    act(() => vi.advanceTimersByTime(5000));
    expect(result.current.step).toBe(1);
    rerender({ en: true });
    act(() => vi.advanceTimersByTime(1000));
    expect(result.current.step).toBe(2);
  });
});
