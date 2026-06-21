// useAutoGrowTextarea — 컴포저 textarea 자동 높이 메커니즘(상한·전송 후 리셋).
// ChatComposerTextarea·TeamThreadView 가 각자 인라인 복제하던 로직 + 매직넘버(160)의 단일 출처.
// jsdom 은 scrollHeight 를 0 으로 계산하므로 테스트에서 명시 주입해 상한 동작을 검증한다.

import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';

import { useAutoGrowTextarea, MAX_GROW_PX } from '../useAutoGrowTextarea';

afterEach(() => cleanup());

function Harness({ value, maxPx }: { value: string; maxPx?: number }) {
  const { ref, resize } = useAutoGrowTextarea(value, maxPx);
  return <textarea data-testid="ta" ref={ref} value={value} readOnly onInput={resize} />;
}

function stubScrollHeight(el: HTMLElement, px: number) {
  Object.defineProperty(el, 'scrollHeight', { configurable: true, value: px });
}

describe('useAutoGrowTextarea', () => {
  it('MAX_GROW_PX 매직넘버를 단일 출처로 export 한다', () => {
    expect(MAX_GROW_PX).toBe(160);
  });

  it('내용 높이가 상한 미만이면 scrollHeight 만큼 늘린다', () => {
    render(<Harness value="x" />);
    const ta = screen.getByTestId('ta');
    stubScrollHeight(ta, 48);
    fireEvent.input(ta);
    expect(ta.style.height).toBe('48px');
  });

  it('내용 높이가 상한을 넘으면 상한에서 멈춘다', () => {
    render(<Harness value="x" />);
    const ta = screen.getByTestId('ta');
    stubScrollHeight(ta, 500);
    fireEvent.input(ta);
    expect(ta.style.height).toBe('160px');
  });

  it('value 가 빈 문자열이 되면 높이를 auto 로 리셋한다(전송 후)', () => {
    const { rerender } = render(<Harness value="여러 줄 내용" />);
    const ta = screen.getByTestId('ta');
    ta.style.height = '90px';
    rerender(<Harness value="" />);
    expect(ta.style.height).toBe('auto');
  });
});
