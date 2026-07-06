import { describe, it, expect, vi, afterEach } from 'vitest';
import { act, renderHook } from '@testing-library/react';

import { createMinWidthHook } from '../useMinWidth';
import { useIsLgUp } from '../useIsLgUp';
import { useIsXlUp } from '../useIsXlUp';

const originalMatchMedia = window.matchMedia;
const originalInnerWidth = window.innerWidth;

afterEach(() => {
  window.matchMedia = originalMatchMedia;
  Object.defineProperty(window, 'innerWidth', {
    configurable: true,
    value: originalInnerWidth,
  });
});

function setInnerWidth(px: number) {
  Object.defineProperty(window, 'innerWidth', { configurable: true, value: px });
}

describe('createMinWidthHook', () => {
  it('innerWidth 가 브레이크포인트 이상이면 true', () => {
    setInnerWidth(1024);
    const useMinWidth = createMinWidthHook(1024);
    const { result } = renderHook(() => useMinWidth());
    expect(result.current).toBe(true);
  });

  it('innerWidth 가 브레이크포인트 미만이면 false', () => {
    setInnerWidth(1023);
    const useMinWidth = createMinWidthHook(1024);
    const { result } = renderHook(() => useMinWidth());
    expect(result.current).toBe(false);
  });

  it('matchMedia 미지원 환경(jsdom 기본)에서도 구독 없이 스냅샷으로 동작한다', () => {
    // jsdom 은 matchMedia 가 없을 수 있다 — 가드가 구독을 생략해도 렌더는 성공해야 한다.
    // @ts-expect-error — 미지원 환경 재현
    window.matchMedia = undefined;
    setInnerWidth(1300);
    const useMinWidth = createMinWidthHook(1280);
    const { result } = renderHook(() => useMinWidth());
    expect(result.current).toBe(true);
  });

  it('matchMedia change 이벤트로 값이 갱신되고 언마운트 시 리스너를 해제한다', () => {
    let changeListener: (() => void) | undefined;
    const removeEventListener = vi.fn();
    window.matchMedia = vi.fn().mockReturnValue({
      addEventListener: (_: string, cb: () => void) => {
        changeListener = cb;
      },
      removeEventListener,
    });

    setInnerWidth(1400);
    const useMinWidth = createMinWidthHook(1280);
    const { result, unmount } = renderHook(() => useMinWidth());
    expect(result.current).toBe(true);
    expect(window.matchMedia).toHaveBeenCalledWith('(min-width: 1280px)');

    act(() => {
      setInnerWidth(1000);
      changeListener?.();
    });
    expect(result.current).toBe(false);

    unmount();
    expect(removeEventListener).toHaveBeenCalledWith('change', changeListener);
  });
});

describe('useIsLgUp / useIsXlUp', () => {
  it('useIsLgUp 은 1024px 경계를 따른다', () => {
    setInnerWidth(1024);
    expect(renderHook(() => useIsLgUp()).result.current).toBe(true);
    setInnerWidth(1023);
    expect(renderHook(() => useIsLgUp()).result.current).toBe(false);
  });

  it('useIsXlUp 은 1280px 경계를 따른다', () => {
    setInnerWidth(1280);
    expect(renderHook(() => useIsXlUp()).result.current).toBe(true);
    setInnerWidth(1279);
    expect(renderHook(() => useIsXlUp()).result.current).toBe(false);
  });
});
