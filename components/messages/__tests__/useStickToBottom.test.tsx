// useStickToBottom — 새 메시지 append 시 하단 자동 추적(ThreadView·TeamThreadView 공용).
// 핵심 순수 로직 isNearBottomMetrics 를 고정한다(실 스크롤 측정은 jsdom 불가).

import { describe, it, expect } from 'vitest';
import { renderHook, act } from '@testing-library/react';

import { isNearBottomMetrics, useStickToBottom, NEAR_BOTTOM_PX } from '../useStickToBottom';

describe('isNearBottomMetrics', () => {
  it('is true within the threshold of the bottom', () => {
    expect(isNearBottomMetrics({ scrollHeight: 1000, scrollTop: 800, clientHeight: 100 })).toBe(true); // 100
    expect(isNearBottomMetrics({ scrollHeight: 1000, scrollTop: 880, clientHeight: 100 })).toBe(true); // 20
  });

  it('is false when scrolled up beyond the threshold', () => {
    expect(isNearBottomMetrics({ scrollHeight: 1000, scrollTop: 500, clientHeight: 100 })).toBe(false); // 400
  });

  it('treats the exact threshold as near (<=)', () => {
    expect(isNearBottomMetrics({ scrollHeight: 1000, scrollTop: 780, clientHeight: 100 })).toBe(true); // 120 <= 120
    expect(NEAR_BOTTOM_PX).toBe(120);
  });

  it('respects a custom threshold', () => {
    expect(isNearBottomMetrics({ scrollHeight: 1000, scrollTop: 700, clientHeight: 100 }, 250)).toBe(true); // 200
  });
});

describe('useStickToBottom', () => {
  it('returns refs and starts with no pill', () => {
    const { result } = renderHook(() =>
      useStickToBottom({ count: 0, isOwnLast: false, withPill: true }),
    );
    expect(result.current.listRef).toBeDefined();
    expect(result.current.bottomRef).toBeDefined();
    expect(result.current.showNewMessagePill).toBe(false);
  });

  it('scrollToBottom is safe with no attached node and leaves no pill', () => {
    const { result } = renderHook(() =>
      useStickToBottom({ count: 1, isOwnLast: true, withPill: true }),
    );
    act(() => result.current.scrollToBottom());
    expect(result.current.showNewMessagePill).toBe(false);
  });
});
