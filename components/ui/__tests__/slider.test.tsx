import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';

// Radix Slider observes element size; jsdom has no ResizeObserver.
vi.stubGlobal(
  'ResizeObserver',
  class {
    observe() {}
    unobserve() {}
    disconnect() {}
  },
);

import { Slider } from '../slider';

describe('Slider — mobile touch scroll', () => {
  // 세로 스와이프(스크롤)를 브라우저에 넘겨야 모바일에서 슬라이더 위를 지나갈 때
  // 페이지 스크롤이 걸리지 않는다. touch-action:none 은 세로 스크롤까지 삼킨다.
  it('lets vertical scroll pass through with touch-action: pan-y (not none)', () => {
    const { container } = render(
      <Slider value={50} min={0} max={100} onValueChange={() => {}} ariaLabel="test" />,
    );
    const root = container.firstElementChild as HTMLElement;
    expect(root.className).toContain('touch-pan-y');
    expect(root.className).not.toContain('touch-none');
  });
});
