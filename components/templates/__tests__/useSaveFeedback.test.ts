import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useSaveFeedback } from '../useSaveFeedback';

describe('useSaveFeedback', () => {
  afterEach(() => vi.useRealTimers());

  it('shows saving, then saved, and completes after the success cue', async () => {
    vi.useFakeTimers();
    const done = vi.fn();
    const { result } = renderHook(() => useSaveFeedback());

    let release!: () => void;
    const promise = result.current.run(
      () => new Promise<{ ok: true }>((resolve) => { release = () => resolve({ ok: true }); }),
      done,
    );
    await act(async () => {});
    expect(result.current.phase).toBe('saving');
    await act(async () => {
      release();
      await promise;
    });

    expect(result.current.phase).toBe('saved');
    expect(done).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(800));
    expect(done).toHaveBeenCalledTimes(1);
    expect(result.current.phase).toBe('idle');
  });
});
