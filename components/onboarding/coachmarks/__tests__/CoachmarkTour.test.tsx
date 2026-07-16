import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, act, waitFor, fireEvent } from '@testing-library/react';
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

  it('Esc 키는 아무 동작도 하지 않는다 (스킵은 버튼 클릭만 — 오발 방지)', async () => {
    const user = userEvent.setup();
    appendTarget('a');
    const onSkip = vi.fn();
    render(<CoachmarkTour steps={steps} onSkip={onSkip} />);

    await waitFor(() => expect(screen.getByRole('dialog')).toBeInTheDocument());
    await user.keyboard('{Escape}');
    expect(onSkip).not.toHaveBeenCalled();
    expect(screen.getByRole('dialog')).toBeInTheDocument();
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

  describe('action step (실클릭 진행)', () => {
    const actionSteps: CoachmarkStep[] = [
      { target: 'a', title: '여기를 눌러 A', body: 'A 설명', placement: 'bottom', kind: 'action' },
      { target: 'b', title: '여기를 눌러 B', body: 'B 설명', placement: 'bottom', kind: 'action' },
    ];

    it('타깃 요소를 실제로 클릭하면 다음 step으로 진행한다', async () => {
      const user = userEvent.setup();
      const a = appendTarget('a');
      appendTarget('b');
      render(<CoachmarkTour steps={actionSteps} />);

      await waitFor(() =>
        expect(screen.getByRole('dialog')).toHaveAttribute('aria-label', '여기를 눌러 A'),
      );
      await user.click(a);
      await waitFor(() =>
        expect(screen.getByRole('dialog')).toHaveAttribute('aria-label', '여기를 눌러 B'),
      );
    });

    it('타깃 내부 자식 요소 클릭도 진행한다 (closest 매칭)', async () => {
      const user = userEvent.setup();
      const a = appendTarget('a');
      const child = document.createElement('span');
      child.textContent = '자식';
      a.appendChild(child);
      appendTarget('b');
      render(<CoachmarkTour steps={actionSteps} />);

      await waitFor(() =>
        expect(screen.getByRole('dialog')).toHaveAttribute('aria-label', '여기를 눌러 A'),
      );
      await user.click(child);
      await waitFor(() =>
        expect(screen.getByRole('dialog')).toHaveAttribute('aria-label', '여기를 눌러 B'),
      );
    });

    it('타깃 밖 클릭은 진행하지 않는다', async () => {
      const user = userEvent.setup();
      appendTarget('a');
      const outside = appendTarget('unrelated');
      render(<CoachmarkTour steps={actionSteps} />);

      await waitFor(() =>
        expect(screen.getByRole('dialog')).toHaveAttribute('aria-label', '여기를 눌러 A'),
      );
      await user.click(outside);
      await user.click(document.body);
      expect(screen.getByRole('dialog')).toHaveAttribute('aria-label', '여기를 눌러 A');
    });

    it('마지막 action step 클릭 시 onFinish를 정확히 1회 호출한다', async () => {
      const user = userEvent.setup();
      const a = appendTarget('a');
      const b = appendTarget('b');
      const onFinish = vi.fn();
      render(<CoachmarkTour steps={actionSteps} onFinish={onFinish} />);

      await waitFor(() =>
        expect(screen.getByRole('dialog')).toHaveAttribute('aria-label', '여기를 눌러 A'),
      );
      await user.click(a);
      await waitFor(() =>
        expect(screen.getByRole('dialog')).toHaveAttribute('aria-label', '여기를 눌러 B'),
      );
      await user.click(b);
      await waitFor(() => expect(onFinish).toHaveBeenCalledTimes(1));
    });

    it('타깃 요소가 리렌더로 교체돼도 새 요소 클릭으로 진행한다 (문서 레벨 리스너)', async () => {
      const user = userEvent.setup();
      const original = appendTarget('a');
      appendTarget('b');
      render(<CoachmarkTour steps={actionSteps} />);

      await waitFor(() =>
        expect(screen.getByRole('dialog')).toHaveAttribute('aria-label', '여기를 눌러 A'),
      );
      original.remove();
      const replacement = appendTarget('a');
      await user.click(replacement);
      await waitFor(() =>
        expect(screen.getByRole('dialog')).toHaveAttribute('aria-label', '여기를 눌러 B'),
      );
    });

    it('action step 중에도 Esc는 아무 동작도 하지 않는다', async () => {
      const user = userEvent.setup();
      appendTarget('a');
      const onSkip = vi.fn();
      render(<CoachmarkTour steps={actionSteps} onSkip={onSkip} />);

      await waitFor(() => expect(screen.getByRole('dialog')).toBeInTheDocument());
      await user.keyboard('{Escape}');
      expect(onSkip).not.toHaveBeenCalled();
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });

    it('info → action 혼합 시퀀스가 동작한다', async () => {
      const user = userEvent.setup();
      appendTarget('a');
      const b = appendTarget('b');
      const onFinish = vi.fn();
      const mixed: CoachmarkStep[] = [
        { target: 'a', title: '읽어보세요', body: '설명', placement: 'bottom' },
        { target: 'b', title: '여기를 눌러 B', body: '설명', placement: 'bottom', kind: 'action' },
      ];
      render(<CoachmarkTour steps={mixed} onFinish={onFinish} />);

      await waitFor(() =>
        expect(screen.getByRole('dialog')).toHaveAttribute('aria-label', '읽어보세요'),
      );
      // info step은 말풍선 다음 버튼으로 진행
      await user.click(screen.getByRole('button', { name: '다음' }));
      await waitFor(() =>
        expect(screen.getByRole('dialog')).toHaveAttribute('aria-label', '여기를 눌러 B'),
      );
      // action step은 실제 타깃 클릭으로 종료
      await user.click(b);
      await waitFor(() => expect(onFinish).toHaveBeenCalledTimes(1));
    });
  });

  it('같은 target을 쓰는 연속 step이 둘 다 미존재여도 스킵이 멈추지 않고 onFinish까지 간다', async () => {
    vi.useFakeTimers();
    const onFinish = vi.fn();
    const sameTarget: CoachmarkStep[] = [
      { target: 'ghost', title: 'A', body: 'a', placement: 'bottom' },
      { target: 'ghost', title: 'B', body: 'b', placement: 'bottom' },
    ];
    render(<CoachmarkTour steps={sameTarget} onFinish={onFinish} timeoutMs={100} />);

    await act(async () => {
      vi.advanceTimersByTime(100);
    });
    await act(async () => {
      vi.advanceTimersByTime(100);
    });

    expect(onFinish).toHaveBeenCalledTimes(1);
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

  it('action 클릭 후 다음 타깃이 나타나지 않으면(notFound) 직전 action 스텝으로 복귀한다', async () => {
    vi.useFakeTimers();
    const onFinish = vi.fn();
    const a = appendTarget('a'); // t1 — 존재
    // t2('b')는 DOM에 없음 — 위저드 검증이 클릭을 막아 실제로 진행되지 않은 상황을 흉내낸다.
    const retreatSteps: CoachmarkStep[] = [
      { target: 'a', title: '여기를 눌러 A', body: 'A 설명', placement: 'bottom', kind: 'action' },
      { target: 'b', title: '여기를 눌러 B', body: 'B 설명', placement: 'bottom', kind: 'action' },
    ];
    render(<CoachmarkTour steps={retreatSteps} onFinish={onFinish} timeoutMs={100} />);

    expect(screen.getByRole('dialog')).toHaveAttribute('aria-label', '여기를 눌러 A');

    fireEvent.click(a);

    await act(async () => {
      vi.advanceTimersByTime(100);
    });

    // t2 notFound 타임아웃 → 직전 action step(t1)으로 복귀: 말풍선이 다시 보이고 onFinish는 호출되지 않는다.
    expect(screen.getByRole('dialog')).toHaveAttribute('aria-label', '여기를 눌러 A');
    expect(onFinish).not.toHaveBeenCalled();

    // 복귀 후 t1 클릭이 다시 가능함 — 재클릭 시 다시 t2를 기다리는 상태로 진행한다.
    fireEvent.click(a);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    vi.useRealTimers();
  });

  it('직전 스텝이 info면 복귀하지 않고 기존 전방 스킵을 유지한다', async () => {
    vi.useFakeTimers();
    const onFinish = vi.fn();
    const p0 = appendTarget('p0'); // action, 존재
    appendTarget('p1'); // info, 존재
    // p2(action)는 DOM에 없음
    const mixedSteps: CoachmarkStep[] = [
      { target: 'p0', title: 'P0 제목', body: '설명', placement: 'bottom', kind: 'action' },
      { target: 'p1', title: 'P1 제목', body: '설명', placement: 'bottom' },
      { target: 'p2', title: 'P2 제목', body: '설명', placement: 'bottom', kind: 'action' },
    ];
    render(<CoachmarkTour steps={mixedSteps} onFinish={onFinish} timeoutMs={100} />);

    expect(screen.getByRole('dialog')).toHaveAttribute('aria-label', 'P0 제목');

    fireEvent.click(p0);
    expect(screen.getByRole('dialog')).toHaveAttribute('aria-label', 'P1 제목');

    // info step은 말풍선 다음 버튼으로 진행 — p2로 이동하지만 p2는 DOM에 없다.
    fireEvent.click(screen.getByRole('button', { name: '다음' }));

    await act(async () => {
      vi.advanceTimersByTime(100);
    });

    // 전방 스킵으로 종료(onFinish) — 직전 스텝이 info이므로 p1로 복귀하지 않는다.
    // (만약 잘못 복귀했다면 p1은 DOM에 이미 존재하므로 즉시 found 상태가 되어 다이얼로그가 다시 보였을 것)
    expect(onFinish).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    vi.useRealTimers();
  });

  it('직전 action 스텝 타깃이 이미 사라졌으면 복귀하지 않고 전방 스킵한다', async () => {
    const onFinish = vi.fn();
    const a = appendTarget('gone-a');
    render(
      <CoachmarkTour
        steps={[
          { target: 'gone-a', kind: 'action', title: 'A', body: 'a', placement: 'top' },
          { target: 'gone-b', kind: 'action', title: 'B', body: 'b', placement: 'top' },
        ]}
        onFinish={onFinish}
        timeoutMs={300}
      />,
    );
    await screen.findByText('A');
    await userEvent.click(a);
    // t1('gone-a')를 실제로 DOM에서 제거 — 복귀 검증(prev 타깃이 여전히 존재하는지)이
    // false를 반환해야 하므로, notFound 타임아웃이 떠도 복귀하지 않고 전방 스킵해야 한다.
    a.remove();
    await waitFor(() => expect(onFinish).toHaveBeenCalledTimes(1), { timeout: 3000 });
    expect(document.querySelector('[role="dialog"]')).toBeNull();
  });

  it('action 타깃이 disabled면 말풍선에 막힘 힌트가 나타난다', async () => {
    const btn = document.createElement('button');
    btn.setAttribute('data-coachmark', 'stuck');
    btn.disabled = true;
    // jsdom은 scrollIntoView를 구현하지 않는다 — 파일 기존 관례(stubRect)를 재사용.
    stubRect(btn);
    document.body.appendChild(btn);

    render(
      <CoachmarkTour
        steps={[{ target: 'stuck', kind: 'action', title: 'T', body: 'B', placement: 'top' }]}
      />,
    );
    expect(
      await screen.findByText('입력이 비었거나 형식이 달라요. 고치면 계속 진행할 수 있어요.'),
    ).toBeInTheDocument();
  });
});
