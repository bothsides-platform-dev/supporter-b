import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, act } from '@testing-library/react';
import { HomeHeaderActionsRegistrar } from '../HomeHeaderActionsRegistrar';
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

  it('초기에는 lastRefreshedAt이 null이다', () => {
    render(<HomeHeaderActionsRegistrar />);
    expect(useHeaderActionsStore.getState().refreshSlot?.lastRefreshedAt).toBeNull();
  });

  it('onRefresh 호출 후 lastRefreshedAt이 채워진다', () => {
    render(<HomeHeaderActionsRegistrar />);
    expect(useHeaderActionsStore.getState().refreshSlot?.lastRefreshedAt).toBeNull();
    act(() => {
      useHeaderActionsStore.getState().refreshSlot?.onRefresh();
    });
    expect(useHeaderActionsStore.getState().refreshSlot?.lastRefreshedAt).toBeInstanceOf(Date);
  });
});
