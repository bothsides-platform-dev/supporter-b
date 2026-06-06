import { describe, it, expect, beforeEach } from 'vitest';
import { useHeaderActionsStore } from '../header-actions';

beforeEach(() => {
  useHeaderActionsStore.setState({ refreshSlot: null });
});

describe('useHeaderActionsStore', () => {
  it('초기 상태는 null', () => {
    expect(useHeaderActionsStore.getState().refreshSlot).toBeNull();
  });

  it('setRefreshAction 호출 후 슬롯이 채워진다', () => {
    const onRefresh = () => {};
    useHeaderActionsStore.getState().setRefreshAction({
      onRefresh,
      lastRefreshedAt: null,
      isRefreshing: false,
    });
    const slot = useHeaderActionsStore.getState().refreshSlot;
    expect(slot).not.toBeNull();
    expect(slot?.onRefresh).toBe(onRefresh);
    expect(slot?.isRefreshing).toBe(false);
  });

  it('clearRefreshAction 호출 후 슬롯이 null로 클리어된다', () => {
    useHeaderActionsStore.getState().setRefreshAction({
      onRefresh: () => {},
      lastRefreshedAt: new Date(),
      isRefreshing: false,
    });
    useHeaderActionsStore.getState().clearRefreshAction();
    expect(useHeaderActionsStore.getState().refreshSlot).toBeNull();
  });
});
