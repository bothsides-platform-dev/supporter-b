import { describe, it, expect, afterEach, vi } from 'vitest';
import { renderHook, fireEvent } from '@testing-library/react';
import { useCappedEntryScale } from '../use-capped-entry-scale';

class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
vi.stubGlobal('ResizeObserver', ResizeObserverStub);

function stubClientWidth(width: number) {
  Object.defineProperty(document.documentElement, 'clientWidth', { configurable: true, value: width });
}

function refWithWidth(offsetWidth: number) {
  return { current: { offsetWidth } as unknown as HTMLElement };
}

describe('useCappedEntryScale — 콘텐츠 영역 너비를 넘지 않는 진입 스케일 상한', () => {
  const realWidth = document.documentElement.clientWidth;
  afterEach(() => {
    stubClientWidth(realWidth);
  });

  it('여백이 충분하면 designMax 그대로 반환한다', () => {
    stubClientWidth(1920);
    const ref = refWithWidth(1080);
    const { result } = renderHook(() => useCappedEntryScale(ref, 1.1));
    expect(result.current).toBeCloseTo(1.1);
  });

  it('designMax를 곱한 너비가 콘텐츠 영역 너비를 넘으면 그 경계까지만 확대한다', () => {
    stubClientWidth(1100);
    const ref = refWithWidth(1080); // 1080 * 1.1 = 1188 > 1100
    const { result } = renderHook(() => useCappedEntryScale(ref, 1.1));
    expect(result.current).toBeCloseTo(1100 / 1080);
    expect(result.current * 1080).toBeLessThanOrEqual(1100);
  });

  it('스크롤바가 있는 뷰포트(clientWidth < innerWidth)에서도 콘텐츠 영역만 기준으로 삼는다', () => {
    // Windows 기본 스크롤바(~15px)가 있는 경우를 시뮬레이션: innerWidth=1000, clientWidth=985.
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1000 });
    stubClientWidth(985);
    const ref = refWithWidth(985); // 콘텐츠 영역을 꽉 채운 박스
    const { result } = renderHook(() => useCappedEntryScale(ref, 1.1));
    // innerWidth(1000) 기준이면 1.015가 되어 콘텐츠 영역(985)을 넘어섰을 것 — clientWidth 기준이면 1.0.
    expect(result.current).toBeCloseTo(1);
    expect(result.current * 985).toBeLessThanOrEqual(985);
  });

  it('요소 너비를 아직 못 읽으면(0) designMax를 유지한다', () => {
    stubClientWidth(1100);
    const ref = refWithWidth(0);
    const { result } = renderHook(() => useCappedEntryScale(ref, 1.1));
    expect(result.current).toBe(1.1);
  });

  it('window resize 시 재계산해 새 상한을 반영한다', () => {
    stubClientWidth(1920); // 처음엔 여백이 충분해 designMax 그대로
    const ref = refWithWidth(1080);
    const { result } = renderHook(() => useCappedEntryScale(ref, 1.1));
    expect(result.current).toBeCloseTo(1.1);

    stubClientWidth(1100); // 창을 좁힘 — 이제 1.1배는 콘텐츠 영역을 넘는다
    fireEvent(window, new Event('resize'));
    expect(result.current).toBeCloseTo(1100 / 1080);
  });

  it('언마운트 시 resize 리스너를 정리한다', () => {
    const removeSpy = vi.spyOn(window, 'removeEventListener');
    stubClientWidth(1100);
    const ref = refWithWidth(1080);
    const { unmount } = renderHook(() => useCappedEntryScale(ref, 1.1));
    unmount();
    expect(removeSpy).toHaveBeenCalledWith('resize', expect.any(Function));
    removeSpy.mockRestore();
  });

  it('마운트 시 요소를 ResizeObserver로 관찰하고, 언마운트 시 해제한다', () => {
    const observeSpy = vi.spyOn(ResizeObserverStub.prototype, 'observe');
    const disconnectSpy = vi.spyOn(ResizeObserverStub.prototype, 'disconnect');
    stubClientWidth(1920);
    const ref = refWithWidth(1080);
    const { unmount } = renderHook(() => useCappedEntryScale(ref, 1.1));
    expect(observeSpy).toHaveBeenCalledWith(ref.current);
    unmount();
    expect(disconnectSpy).toHaveBeenCalledTimes(1);
    observeSpy.mockRestore();
    disconnectSpy.mockRestore();
  });
});
