import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, act, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

vi.stubGlobal(
  'ResizeObserver',
  class {
    observe() {}
    unobserve() {}
    disconnect() {}
  },
);

import { CoachmarkTour } from '../CoachmarkTour';
import type { CoachmarkStep } from '../types';

function stubRect(el: HTMLElement) {
  el.getBoundingClientRect = () =>
    ({
      x: 0,
      y: 0,
      top: 10,
      left: 10,
      right: 60,
      bottom: 60,
      width: 50,
      height: 50,
      toJSON() {},
    }) as DOMRect;
  el.scrollIntoView = vi.fn();
}

function appendTarget(id: string) {
  const el = document.createElement('div');
  el.setAttribute('data-coachmark', id);
  stubRect(el);
  document.body.appendChild(el);
  return el;
}

const steps: CoachmarkStep[] = [
  { target: 'a', title: 'A 제목', body: 'A 설명', placement: 'bottom' },
  { target: 'b', title: 'B 제목', body: 'B 설명', placement: 'bottom' },
];

afterEach(() => {
  cleanup();
  document.body.innerHTML = '';
});

describe('CoachmarkTour', () => {
  it('steps가 빈 배열이면 아무것도 렌더하지 않는다', () => {
    const { container } = render(<CoachmarkTour steps={[]} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('첫 step의 target을 찾으면 오버레이를 렌더한다', async () => {
    appendTarget('a');
    render(<CoachmarkTour steps={steps} />);

    await waitFor(() => expect(screen.getByRole('dialog')).toHaveAttribute('aria-label', 'A 제목'));
  });

  it('다음 클릭 시 다음 step으로 넘어가고, 마지막 다음 클릭 시 onFinish를 호출한다', async () => {
    const user = userEvent.setup();
    appendTarget('a');
    appendTarget('b');
    const onFinish = vi.fn();
    render(<CoachmarkTour steps={steps} onFinish={onFinish} />);

    await waitFor(() => expect(screen.getByRole('dialog')).toHaveAttribute('aria-label', 'A 제목'));
    await user.click(screen.getByRole('button', { name: '다음' }));
    await waitFor(() => expect(screen.getByRole('dialog')).toHaveAttribute('aria-label', 'B 제목'));

    await user.click(screen.getByRole('button', { name: '확인' }));
    expect(onFinish).toHaveBeenCalledTimes(1);
  });

  it('건너뛰기 클릭 시 onSkip을 호출한다', async () => {
    const user = userEvent.setup();
    appendTarget('a');
    const onSkip = vi.fn();
    render(<CoachmarkTour steps={steps} onSkip={onSkip} />);

    await waitFor(() => expect(screen.getByRole('dialog')).toBeInTheDocument());
    await user.click(screen.getByRole('button', { name: '건너뛰기' }));
    expect(onSkip).toHaveBeenCalledTimes(1);
  });

  it('Esc 키 입력 시 onSkip을 호출한다', async () => {
    const user = userEvent.setup();
    appendTarget('a');
    const onSkip = vi.fn();
    render(<CoachmarkTour steps={steps} onSkip={onSkip} />);

    await waitFor(() => expect(screen.getByRole('dialog')).toBeInTheDocument());
    await user.keyboard('{Escape}');
    expect(onSkip).toHaveBeenCalledTimes(1);
  });

  it('현재 step의 target을 타임아웃 내 찾지 못하면 자동으로 다음 step으로 넘어간다', async () => {
    vi.useFakeTimers();
    // step a는 없고 b만 있음 — a는 notFound로 자동 스킵, b가 렌더돼야 한다.
    appendTarget('b');

    render(<CoachmarkTour steps={steps} timeoutMs={100} />);

    await act(async () => {
      vi.advanceTimersByTime(100);
    });

    expect(screen.getByRole('dialog')).toHaveAttribute('aria-label', 'B 제목');
    vi.useRealTimers();
  });

  it('마지막 step까지 target을 못 찾으면 onFinish를 호출한다', async () => {
    vi.useFakeTimers();
    const onFinish = vi.fn();
    // 둘 다 DOM에 없음
    render(<CoachmarkTour steps={steps} onFinish={onFinish} timeoutMs={100} />);

    await act(async () => {
      vi.advanceTimersByTime(100);
    });
    await act(async () => {
      vi.advanceTimersByTime(100);
    });

    expect(onFinish).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });
});
