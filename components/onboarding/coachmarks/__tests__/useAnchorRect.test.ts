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

  it('추적 요소가 DOM에서 분리되고 같은 target의 새 요소가 마운트되면 재부착한다', async () => {
    vi.useFakeTimers();
    const el = document.createElement('div');
    el.setAttribute('data-coachmark', 'step-remount');
    stubRect(el, { top: 100, left: 100, width: 120, height: 32 });
    el.scrollIntoView = vi.fn();
    document.body.appendChild(el);

    const { result } = renderHook(() => useAnchorRect('step-remount'));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(result.current.rect?.top).toBe(100);

    // 리렌더로 요소가 교체되는 시나리오 — 기존 요소 제거 후 같은 attr의 새 요소.
    el.remove();
    const replacement = document.createElement('div');
    replacement.setAttribute('data-coachmark', 'step-remount');
    stubRect(replacement, { top: 400, left: 100, width: 120, height: 32 });
    replacement.scrollIntoView = vi.fn();
    document.body.appendChild(replacement);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });
    expect(result.current.rect?.top).toBe(400);
    expect(result.current.status).toBe('found');
    // 재부착이 scrollIntoView를 다시 발사하지 않는다 (스크롤 점프 방지).
    expect(replacement.scrollIntoView).not.toHaveBeenCalled();
  });

  it('특수문자가 든 target도 안전하게 매칭한다 (CSS.escape)', async () => {
    const el = document.createElement('div');
    el.setAttribute('data-coachmark', 'weird"target]');
    stubRect(el, { top: 10, left: 20, width: 100, height: 50 });
    el.scrollIntoView = vi.fn();
    document.body.appendChild(el);

    const { result } = renderHook(() => useAnchorRect('weird"target]'));
    await waitFor(() => expect(result.current.status).toBe('found'));
    expect(result.current.rect?.top).toBe(10);
  });

  it('추적 요소가 영구 제거되고 대체 요소가 나타나지 않으면 timeoutMs 내 notFound로 전환한다', async () => {
    vi.useFakeTimers();
    const el = document.createElement('div');
    el.setAttribute('data-coachmark', 'step-vanish');
    stubRect(el, { top: 100, left: 100, width: 120, height: 32 });
    el.scrollIntoView = vi.fn();
    document.body.appendChild(el);

    const { result } = renderHook(() => useAnchorRect('step-vanish', { timeoutMs: 1000 }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(result.current.status).toBe('found');

    // 요소가 사라지고 다시는 안 돌아온다 — 스포트라이트가 허공에 얼어붙지 않도록
    // notFound로 전환해 투어의 자동 스킵 불변식에 합류해야 한다.
    el.remove();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1500);
    });
    expect(result.current.status).toBe('notFound');
    expect(result.current.rect).toBeNull();
  });

  it('스크롤/리사이즈 이벤트 없이 요소 위치만 변해도 rect를 갱신한다 (폴링)', async () => {
    vi.useFakeTimers();
    const el = document.createElement('div');
    el.setAttribute('data-coachmark', 'step-poll');
    stubRect(el, { top: 100, left: 100, width: 120, height: 32 });
    el.scrollIntoView = vi.fn();
    document.body.appendChild(el);

    const { result } = renderHook(() => useAnchorRect('step-poll'));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(result.current.rect?.top).toBe(100);

    // 이벤트 없이 위치만 이동 (형제 요소 리플로우 등) — 폴링이 잡아야 한다.
    stubRect(el, { top: 600, left: 100, width: 120, height: 32 });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });
    expect(result.current.rect?.top).toBe(600);
  });

  it('타깃 버튼이 disabled면 disabled=true, 해제되면 폴링 tick에서 false로 갱신한다', async () => {
    vi.useFakeTimers();
    const btn = document.createElement('button');
    btn.setAttribute('data-coachmark', 'dis-target');
    btn.disabled = true;
    btn.scrollIntoView = vi.fn();
    document.body.appendChild(btn);

    const { result } = renderHook(() => useAnchorRect('dis-target'));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(result.current.status).toBe('found');
    expect(result.current.disabled).toBe(true);

    btn.disabled = false;
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });
    expect(result.current.disabled).toBe(false);
  });

  it('aria-disabled="true"도 disabled로 판정한다', async () => {
    const el = document.createElement('div');
    el.setAttribute('data-coachmark', 'aria-target');
    el.setAttribute('aria-disabled', 'true');
    el.scrollIntoView = vi.fn();
    document.body.appendChild(el);

    const { result } = renderHook(() => useAnchorRect('aria-target'));
    await waitFor(() => expect(result.current.status).toBe('found'));
    expect(result.current.disabled).toBe(true);
  });
});
