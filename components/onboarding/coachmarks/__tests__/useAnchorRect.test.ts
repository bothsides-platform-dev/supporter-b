import { describe, it, expect, vi, afterEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';

// jsdom에는 ResizeObserver가 없다 — 훅이 방어적으로 가드하는지도 검증한다.
vi.stubGlobal(
  'ResizeObserver',
  class {
    observe() {}
    unobserve() {}
    disconnect() {}
  },
);

import { useAnchorRect } from '../useAnchorRect';

function stubRect(el: HTMLElement, rect: Partial<DOMRect>) {
  el.getBoundingClientRect = () =>
    ({
      x: 0,
      y: 0,
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      width: 0,
      height: 0,
      toJSON() {},
      ...rect,
    }) as DOMRect;
}

describe('useAnchorRect', () => {
  afterEach(() => {
    document.body.innerHTML = '';
    vi.useRealTimers();
  });

  it('요소가 이미 존재하면 즉시 found + rect를 반환한다', async () => {
    const el = document.createElement('div');
    el.setAttribute('data-coachmark', 'step-1');
    stubRect(el, { top: 10, left: 20, width: 100, height: 50 });
    el.scrollIntoView = vi.fn();
    document.body.appendChild(el);

    const { result } = renderHook(() => useAnchorRect('step-1'));

    await waitFor(() => expect(result.current.status).toBe('found'));
    expect(result.current.rect?.top).toBe(10);
    expect(result.current.rect?.width).toBe(100);
    expect(el.scrollIntoView).toHaveBeenCalledWith({ block: 'center' });
  });

  it('요소가 나중에 삽입되면 MutationObserver로 발견해 found로 전환한다', async () => {
    const { result } = renderHook(() => useAnchorRect('step-2'));

    expect(result.current.status).toBe('searching');

    const el = document.createElement('div');
    el.setAttribute('data-coachmark', 'step-2');
    stubRect(el, { top: 5, left: 5, width: 40, height: 40 });
    el.scrollIntoView = vi.fn();

    await act(async () => {
      document.body.appendChild(el);
    });

    await waitFor(() => expect(result.current.status).toBe('found'));
    expect(result.current.rect?.top).toBe(5);
  });

  it('타임아웃 내 요소를 찾지 못하면 notFound를 반환한다', async () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useAnchorRect('missing-target', { timeoutMs: 1000 }));

    expect(result.current.status).toBe('searching');

    await act(async () => {
      vi.advanceTimersByTime(1000);
    });

    expect(result.current.status).toBe('notFound');
    expect(result.current.rect).toBeNull();
  });

  it('target이 null이면 searching 상태를 유지한다', () => {
    const { result } = renderHook(() => useAnchorRect(null));
    expect(result.current.status).toBe('searching');
    expect(result.current.rect).toBeNull();
  });
});
