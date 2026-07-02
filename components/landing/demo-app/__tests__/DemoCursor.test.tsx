import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import { createRef } from 'react';

// P3 회귀 가드: 데모 창이 뷰포트 밖(useInView=false)이면 DemoCursor의 rAF 측정 루프가
// 시작되지 않아야 한다 — motion useInView만 목하고 나머지는 실제 구현을 쓴다.
const useInViewMock = vi.hoisted(() => vi.fn());
vi.mock('motion/react', async (importOriginal) => {
  const actual = await importOriginal<typeof import('motion/react')>();
  return { ...actual, useInView: useInViewMock };
});

import { DemoCursor } from '../DemoCursor';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function renderCursor() {
  const windowRef = createRef<HTMLDivElement>();
  const containerRef = createRef<HTMLDivElement>();
  // DemoCursor reads .current directly — attach plain divs via manual assignment.
  const windowEl = document.createElement('div');
  const containerEl = document.createElement('div');
  (windowRef as { current: HTMLDivElement | null }).current = windowEl;
  (containerRef as { current: HTMLDivElement | null }).current = containerEl;
  return render(
    <DemoCursor windowRef={windowRef} containerRef={containerRef} selector={null} page={0} />,
  );
}

describe('DemoCursor viewport-visibility gating', () => {
  it('does not start the rAF measure loop while the demo window is out of view', () => {
    useInViewMock.mockReturnValue(false);
    const rafSpy = vi.spyOn(window, 'requestAnimationFrame');
    const { container } = renderCursor();

    expect(rafSpy).not.toHaveBeenCalled();
    // state stays null → renders nothing.
    expect(container.firstChild).toBeNull();
  });

  it('starts the rAF measure loop while the demo window is in view (existing behavior)', () => {
    useInViewMock.mockReturnValue(true);
    const rafSpy = vi.spyOn(window, 'requestAnimationFrame');
    renderCursor();

    expect(rafSpy).toHaveBeenCalled();
  });
});
