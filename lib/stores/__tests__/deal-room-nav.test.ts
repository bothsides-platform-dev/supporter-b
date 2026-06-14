import { afterEach, describe, it, expect } from 'vitest';
import { useDealRoomNav } from '../deal-room-nav';

afterEach(() => {
  // 모듈 싱글턴 — 테스트 간 상태 격리.
  useDealRoomNav.setState({ basePath: '', codes: [], fullscreen: false });
});

describe('useDealRoomNav — fullscreen 슬라이스', () => {
  it('초기값은 false 다', () => {
    expect(useDealRoomNav.getState().fullscreen).toBe(false);
  });

  it('setFullscreen 으로 토글한다', () => {
    useDealRoomNav.getState().setFullscreen(true);
    expect(useDealRoomNav.getState().fullscreen).toBe(true);
    useDealRoomNav.getState().setFullscreen(false);
    expect(useDealRoomNav.getState().fullscreen).toBe(false);
  });

  it('setOrder 는 fullscreen 을 건드리지 않는다 (독립 슬라이스)', () => {
    useDealRoomNav.getState().setFullscreen(true);
    useDealRoomNav.getState().setOrder('/rfp', ['P-1', 'P-2']);
    expect(useDealRoomNav.getState().fullscreen).toBe(true);
    expect(useDealRoomNav.getState().codes).toEqual(['P-1', 'P-2']);
  });
});
