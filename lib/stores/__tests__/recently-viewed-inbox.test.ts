import { describe, it, expect, beforeEach } from 'vitest';

import { useRecentlyViewedInbox } from '@/lib/stores/recently-viewed-inbox';

beforeEach(() => {
  useRecentlyViewedInbox.setState({ rfpIds: [] });
  localStorage.clear();
});

describe('useRecentlyViewedInbox', () => {
  it('markViewed: 조회한 rfpId를 기록한다', () => {
    useRecentlyViewedInbox.getState().markViewed('rfp-1');
    expect(useRecentlyViewedInbox.getState().isViewed('rfp-1')).toBe(true);
  });

  it('isViewed: 기록하지 않은 rfpId는 false 를 반환한다', () => {
    expect(useRecentlyViewedInbox.getState().isViewed('rfp-unknown')).toBe(false);
  });

  it('markViewed: 동일 rfpId를 중복 호출해도 배열에 한 번만 존재한다', () => {
    const { markViewed } = useRecentlyViewedInbox.getState();
    markViewed('rfp-1');
    markViewed('rfp-1');
    markViewed('rfp-1');
    expect(useRecentlyViewedInbox.getState().rfpIds.filter((id) => id === 'rfp-1')).toHaveLength(1);
  });

  it('markViewed: 100개 초과 시 오래된 항목이 제거된다', () => {
    const { markViewed } = useRecentlyViewedInbox.getState();
    for (let i = 1; i <= 101; i++) markViewed(`rfp-${i}`);
    const { rfpIds } = useRecentlyViewedInbox.getState();
    expect(rfpIds).toHaveLength(100);
    expect(rfpIds).not.toContain('rfp-1');
    expect(rfpIds).toContain('rfp-101');
  });

  it('markViewed: 여러 rfpId 를 독립적으로 추적한다', () => {
    const { markViewed } = useRecentlyViewedInbox.getState();
    markViewed('rfp-a');
    markViewed('rfp-b');
    const state = useRecentlyViewedInbox.getState();
    expect(state.isViewed('rfp-a')).toBe(true);
    expect(state.isViewed('rfp-b')).toBe(true);
    expect(state.isViewed('rfp-c')).toBe(false);
  });
});
