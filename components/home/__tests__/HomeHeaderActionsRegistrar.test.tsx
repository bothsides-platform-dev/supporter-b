import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, act } from '@testing-library/react';
import { HomeHeaderActionsRegistrar, MIN_REFRESH_SPIN_MS } from '../HomeHeaderActionsRegistrar';
import { useHeaderActionsStore } from '@/lib/stores/header-actions';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));

beforeEach(() => {
  useHeaderActionsStore.setState({ refreshSlot: null });
});

describe('HomeHeaderActionsRegistrar', () => {
  it('마운트 시 store에 refreshSlot이 등록된다', () => {
    render(<HomeHeaderActionsRegistrar />);
    expect(useHeaderActionsStore.getState().refreshSlot).not.toBeNull();
    expect(typeof useHeaderActionsStore.getState().refreshSlot?.onRefresh).toBe('function');
  });

  it('언마운트 시 refreshSlot이 null로 클리어된다', () => {
    const { unmount } = render(<HomeHeaderActionsRegistrar />);
    unmount();
    expect(useHeaderActionsStore.getState().refreshSlot).toBeNull();
  });

  it('마운트 시 lastRefreshedAt이 Date로 초기화된다', () => {
    render(<HomeHeaderActionsRegistrar />);
    expect(useHeaderActionsStore.getState().refreshSlot?.lastRefreshedAt).toBeInstanceOf(Date);
  });

  it('onRefresh 호출 후 lastRefreshedAt이 갱신된다', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2025-01-01T00:00:00Z'));
    render(<HomeHeaderActionsRegistrar />);
    const before = useHeaderActionsStore.getState().refreshSlot?.lastRefreshedAt as Date;
    vi.advanceTimersByTime(1000);
    act(() => {
      useHeaderActionsStore.getState().refreshSlot?.onRefresh();
    });
    const after = useHeaderActionsStore.getState().refreshSlot?.lastRefreshedAt as Date;
    expect(after).toBeInstanceOf(Date);
    expect(after.getTime()).toBeGreaterThan(before.getTime());
    vi.useRealTimers();
  });

  it('목업 router.refresh()에서는 isPending만으로는 1회전(1500ms)보다 짧게 끝난다', () => {
    vi.useFakeTimers();
    render(<HomeHeaderActionsRegistrar />);

    act(() => {
      useHeaderActionsStore.getState().refreshSlot?.onRefresh();
    });

    // Mocked refresh resolves synchronously — transition ends in the same act batch.
    expect(useHeaderActionsStore.getState().refreshSlot?.isRefreshing).toBe(true);

    act(() => {
      vi.advanceTimersByTime(1);
    });

    // Without the min-spin guard this would already be false (< 1500ms spin cycle).
    expect(MIN_REFRESH_SPIN_MS).toBeLessThan(1500);
    expect(useHeaderActionsStore.getState().refreshSlot?.isRefreshing).toBe(true);

    act(() => {
      vi.advanceTimersByTime(MIN_REFRESH_SPIN_MS);
    });
    expect(useHeaderActionsStore.getState().refreshSlot?.isRefreshing).toBe(false);

    vi.useRealTimers();
  });

  it(`onRefresh 후 isRefreshing이 최소 ${MIN_REFRESH_SPIN_MS}ms 유지된다`, () => {
    vi.useFakeTimers();
    render(<HomeHeaderActionsRegistrar />);

    act(() => {
      useHeaderActionsStore.getState().refreshSlot?.onRefresh();
    });
    expect(useHeaderActionsStore.getState().refreshSlot?.isRefreshing).toBe(true);

    act(() => {
      vi.advanceTimersByTime(MIN_REFRESH_SPIN_MS - 1);
    });
    expect(useHeaderActionsStore.getState().refreshSlot?.isRefreshing).toBe(true);

    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(useHeaderActionsStore.getState().refreshSlot?.isRefreshing).toBe(false);

    vi.useRealTimers();
  });
});
