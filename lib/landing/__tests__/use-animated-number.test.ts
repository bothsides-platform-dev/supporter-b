/// @vitest-environment jsdom

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act } from 'react';
import { renderHook } from '@testing-library/react';
import { useAnimatedNumber } from '../use-animated-number';

function stubMatchMedia(matches: boolean) {
  window.matchMedia = vi.fn().mockReturnValue({
    matches,
    media: '',
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }) as unknown as typeof window.matchMedia;
}

describe('useAnimatedNumber', () => {
  beforeEach(() => {
    vi.useFakeTimers({
      toFake: ['requestAnimationFrame', 'cancelAnimationFrame', 'setTimeout', 'clearTimeout', 'Date', 'performance'],
    });
    stubMatchMedia(false); // non-reduced-motion by default
  });

  afterEach(() => {
    vi.useRealTimers();
    // @ts-expect-error remove the test stub
    delete window.matchMedia;
  });

  it('returns the initial target immediately on mount, with no animation', () => {
    const { result } = renderHook(() => useAnimatedNumber(100));
    expect(result.current).toBe(100);
  });

  it('animates from the previous value toward a new target over the given duration', () => {
    const { result, rerender } = renderHook(({ target }) => useAnimatedNumber(target, 200), {
      initialProps: { target: 0 },
    });
    rerender({ target: 100 });

    act(() => {
      vi.advanceTimersByTime(100); // halfway through the 200ms duration
    });
    expect(result.current).toBeGreaterThan(0);
    expect(result.current).toBeLessThan(100);

    act(() => {
      vi.advanceTimersByTime(200); // past the end
    });
    expect(result.current).toBe(100);
  });

  it('restarts from the current displayed value when the target changes mid-flight', () => {
    const { result, rerender } = renderHook(({ target }) => useAnimatedNumber(target, 200), {
      initialProps: { target: 0 },
    });
    rerender({ target: 100 });
    act(() => {
      vi.advanceTimersByTime(100); // halfway to 100
    });
    const midValue = result.current;

    rerender({ target: 50 }); // change target before the first animation finishes
    act(() => {
      vi.advanceTimersByTime(1); // first tick after the new target
    });
    // it should continue from roughly where it was, not jump back to 0 or to the old target of 100
    expect(result.current).toBeLessThanOrEqual(midValue + 1);

    act(() => {
      vi.advanceTimersByTime(400);
    });
    expect(result.current).toBe(50);
  });
});
