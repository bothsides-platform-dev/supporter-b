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
  // fake-timer 테스트의 단언 실패가 타이머를 누수시켜 뒤 테스트를 연쇄 오염하지 않도록
  // 복원을 teardown에서 무조건 수행한다(개별 테스트 본문의 복원 호출에 의존하지 않음).
  vi.useRealTimers();
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

  describe('오프코스 리졸버 (화면 상태 기반 즉시 점프·복귀)', () => {
    // 실제 앱 구조를 흉내낸다: 화면(위저드 스텝)마다 action 앵커는 정확히 1개만
    // 존재하고, info 앵커(위저드 컨테이너)는 모든 화면에 상존한다.
    const wizardSteps: CoachmarkStep[] = [
      { target: 'content', title: '소개', body: '설명', placement: 'right' },
      { target: 'n1', title: '여기를 눌러 1', body: '설명', placement: 'top', kind: 'action' },
      { target: 'n2', title: '여기를 눌러 2', body: '설명', placement: 'top', kind: 'action' },
    ];

    it('info 표시 중 사용자가 실제 버튼으로 화면을 넘기면 그 화면의 action 스텝으로 점프한다', async () => {
      vi.useFakeTimers();
      appendTarget('content');
      const n1 = appendTarget('n1');
      render(<CoachmarkTour steps={wizardSteps} timeoutMs={10000} />);

      expect(screen.getByRole('dialog')).toHaveAttribute('aria-label', '소개');

      // 사용자가 info 말풍선을 무시하고 실제 다음 버튼을 직접 클릭 — 화면이 스텝 2로
      // 넘어간다(n1 제거, n2 등장). 코치마크는 info(0)에 머물러 있고 content는 상존.
      fireEvent.click(n1);
      n1.remove();
      appendTarget('n2');

      await act(async () => {
        vi.advanceTimersByTime(500);
      });

      expect(screen.getByRole('dialog')).toHaveAttribute('aria-label', '여기를 눌러 2');
    });

    it('사용자가 이전으로 화면을 되돌리면 그 화면의 action 스텝으로 복귀한다', async () => {
      vi.useFakeTimers();
      appendTarget('content');
      const n1 = appendTarget('n1');
      const n2 = appendTarget('n2');
      render(<CoachmarkTour steps={wizardSteps} timeoutMs={10000} />);

      // info → 다음 버튼으로 n1 스텝 진입 → n1 실클릭으로 n2 스텝 진입(화면도 전환).
      fireEvent.click(screen.getByRole('button', { name: '다음' }));
      expect(screen.getByRole('dialog')).toHaveAttribute('aria-label', '여기를 눌러 1');
      fireEvent.click(n1);
      n1.remove();
      expect(screen.getByRole('dialog')).toHaveAttribute('aria-label', '여기를 눌러 2');

      // 사용자가 "이전" 클릭 — 화면이 스텝 1로 돌아간다(n2 제거, n1 재등장).
      n2.remove();
      const n1Again = appendTarget('n1');

      await act(async () => {
        vi.advanceTimersByTime(500);
      });

      expect(screen.getByRole('dialog')).toHaveAttribute('aria-label', '여기를 눌러 1');

      // 복귀한 스텝은 다시 실클릭으로 진행 가능해야 한다.
      appendTarget('n2');
      fireEvent.click(n1Again);
      expect(screen.getByRole('dialog')).toHaveAttribute('aria-label', '여기를 눌러 2');
    });

    it('막힌 클릭(진행 실패)은 notFound 타임아웃을 기다리지 않고 ~0.5s 안에 직전 action 스텝으로 복귀한다', async () => {
      vi.useFakeTimers();
      const onFinish = vi.fn();
      const a = appendTarget('blocked-a');
      // 'blocked-b'는 끝내 등장하지 않는다 — 위저드 검증이 진행을 막은 상황.
      const blockedSteps: CoachmarkStep[] = [
        { target: 'blocked-a', title: '여기를 눌러 A', body: 'a', placement: 'top', kind: 'action' },
        { target: 'blocked-b', title: '여기를 눌러 B', body: 'b', placement: 'top', kind: 'action' },
      ];
      // timeoutMs=10000 — notFound 복귀 경로가 아니라 리졸버가 복귀시켰음을 증명한다.
      render(<CoachmarkTour steps={blockedSteps} onFinish={onFinish} timeoutMs={10000} />);

      expect(screen.getByRole('dialog')).toHaveAttribute('aria-label', '여기를 눌러 A');
      fireEvent.click(a);

      await act(async () => {
        vi.advanceTimersByTime(500);
      });

      expect(screen.getByRole('dialog')).toHaveAttribute('aria-label', '여기를 눌러 A');
      expect(onFinish).not.toHaveBeenCalled();
    });

    it('마지막 직전 action(제출) 클릭 → 확인 스텝 진입, 확인 앵커가 사라지면(취소) 제출 스텝으로 복귀한다', async () => {
      // pgWriteTour 제출→확정 패턴의 특성화 가드 — 확인창 취소 좌초 방지가 새로
      // 의존하게 된 리졸버 복귀 경로를 못박는다(신규 동작의 RED는 tours/
      // PgTutorialFlow/ConfirmDialog 테스트가 담당).
      vi.useFakeTimers();
      const onFinish = vi.fn();
      const submit = appendTarget('cd-submit');
      const confirmSteps: CoachmarkStep[] = [
        { target: 'cd-submit', title: '여기를 눌러 보내요', body: 's', placement: 'top', kind: 'action' },
        { target: 'cd-confirm', title: '여기를 눌러 확정해요', body: 'c', placement: 'top', kind: 'action' },
      ];
      // timeoutMs=10000 — notFound 복귀 경로가 아니라 리졸버 소행임을 증명한다.
      render(<CoachmarkTour steps={confirmSteps} onFinish={onFinish} timeoutMs={10000} />);

      expect(screen.getByRole('dialog')).toHaveAttribute('aria-label', '여기를 눌러 보내요');

      // 제출 클릭 — 마지막 스텝이 아니므로 onFinish 없이 확인 스텝으로 진행.
      fireEvent.click(submit);
      expect(onFinish).not.toHaveBeenCalled();

      // 확인 다이얼로그 열림 — 확인 버튼 앵커 등장(제출 앵커와 공존 = 관망 구간).
      const confirm = appendTarget('cd-confirm');
      await act(async () => {
        vi.advanceTimersByTime(250);
      });
      expect(screen.getByRole('dialog')).toHaveAttribute('aria-label', '여기를 눌러 확정해요');

      // 다이얼로그가 열려 제출·확인 앵커가 공존하는 동안(2개=모호)은 리졸버가
      // 관망한다 — 히스테리시스 2틱을 넘겨도 제출 스텝으로 되끌리지 않는다.
      await act(async () => {
        vi.advanceTimersByTime(750);
      });
      expect(screen.getByRole('dialog')).toHaveAttribute('aria-label', '여기를 눌러 확정해요');

      // 취소 — 확인 앵커 소멸, 제출 앵커만 잔존 → 리졸버 2틱(~0.5s) 복귀.
      confirm.remove();
      await act(async () => {
        vi.advanceTimersByTime(750);
      });
      expect(screen.getByRole('dialog')).toHaveAttribute('aria-label', '여기를 눌러 보내요');
      expect(onFinish).not.toHaveBeenCalled();
    });

    it('한 틱짜리 일시적 불일치(빠른 화면 전환 중)는 점프하지 않는다', async () => {
      vi.useFakeTimers();
      appendTarget('content');
      const n1 = appendTarget('n1');
      render(<CoachmarkTour steps={wizardSteps} timeoutMs={10000} />);

      expect(screen.getByRole('dialog')).toHaveAttribute('aria-label', '소개');

      // 리렌더 과도기 흉내: n1이 잠깐 사라지고 n2가 한 틱 동안만 보였다가 원상복구.
      n1.remove();
      const n2 = appendTarget('n2');
      await act(async () => {
        vi.advanceTimersByTime(250); // 1틱 — 불일치 관찰되지만 아직 점프 금지
      });
      n2.remove();
      appendTarget('n1');
      await act(async () => {
        vi.advanceTimersByTime(1000);
      });

      expect(screen.getByRole('dialog')).toHaveAttribute('aria-label', '소개');
    });

    it('action 앵커가 동시에 2개 이상 보이면(모호) 점프하지 않는다', async () => {
      vi.useFakeTimers();
      appendTarget('amb-a');
      appendTarget('amb-b');
      const ambiguous: CoachmarkStep[] = [
        { target: 'amb-a', title: '여기를 눌러 A', body: 'a', placement: 'top', kind: 'action' },
        { target: 'amb-b', title: '여기를 눌러 B', body: 'b', placement: 'top', kind: 'action' },
      ];
      render(<CoachmarkTour steps={ambiguous} timeoutMs={10000} />);

      expect(screen.getByRole('dialog')).toHaveAttribute('aria-label', '여기를 눌러 A');

      await act(async () => {
        vi.advanceTimersByTime(1000);
      });

      expect(screen.getByRole('dialog')).toHaveAttribute('aria-label', '여기를 눌러 A');
    });

    it('steps 배열 정체성이 렌더마다 바뀌어도(인라인 배열) 리졸버가 동작한다', async () => {
      vi.useFakeTimers();
      appendTarget('content');
      const n1 = appendTarget('n1');
      const { rerender } = render(
        <CoachmarkTour steps={[...wizardSteps]} timeoutMs={10000} />,
      );

      expect(screen.getByRole('dialog')).toHaveAttribute('aria-label', '소개');

      // 오프코스 상태 진입: n1 제거, n2 등장 — info(0)에 머문 코치마크가 점프해야 한다.
      fireEvent.click(n1);
      n1.remove();
      appendTarget('n2');

      // 부모 리렌더 흉내: 매 250ms마다 "새 배열 정체성"의 같은 내용 steps를 다시 넘긴다.
      // 정체성 기반 의존성이면 인터벌·카운터가 매번 리셋돼 점프가 영원히 불가능해진다.
      for (let i = 0; i < 4; i += 1) {
        await act(async () => {
          vi.advanceTimersByTime(250);
        });
        rerender(<CoachmarkTour steps={[...wizardSteps]} timeoutMs={10000} />);
      }

      expect(screen.getByRole('dialog')).toHaveAttribute('aria-label', '여기를 눌러 2');
    });

    it('action 스텝이 1개뿐인 투어는 리졸버 인터벌을 만들지 않는다 (점프 경로 도달 불가)', async () => {
      vi.useFakeTimers();
      const setIntervalSpy = vi.spyOn(globalThis, 'setInterval');
      appendTarget('solo');
      render(
        <CoachmarkTour
          steps={[{ target: 'solo', title: '단독', body: 'b', placement: 'top', kind: 'action' }]}
          timeoutMs={10000}
        />,
      );

      expect(screen.getByRole('dialog')).toHaveAttribute('aria-label', '단독');
      // 250ms 인터벌은 useAnchorRect의 rect 보정 폴 1개뿐이어야 한다 —
      // action이 1개면 expected가 항상 그 스텝이라 리졸버 점프 경로가 도달 불가하므로
      // 인터벌 자체를 만들지 않는다.
      expect(setIntervalSpy.mock.calls.filter((c) => c[1] === 250)).toHaveLength(1);
      setIntervalSpy.mockRestore();
    });

    it('언마운트 시 리졸버 인터벌이 정리된다 (타이머 잔존 0)', async () => {
      vi.useFakeTimers();
      appendTarget('content');
      appendTarget('n1');
      const { unmount } = render(<CoachmarkTour steps={wizardSteps} timeoutMs={10000} />);

      expect(screen.getByRole('dialog')).toHaveAttribute('aria-label', '소개');
      expect(vi.getTimerCount()).toBeGreaterThan(0);

      unmount();
      expect(vi.getTimerCount()).toBe(0);
    });

    it('마지막 action 이후(후행 info 스텝)에는 방금 클릭한 앵커가 남아 있어도 역행하지 않는다', async () => {
      vi.useFakeTimers();
      const a = appendTarget('trail-a');
      appendTarget('trail-info');
      const trailingInfo: CoachmarkStep[] = [
        { target: 'trail-a', title: '여기를 눌러 A', body: 'a', placement: 'top', kind: 'action' },
        { target: 'trail-info', title: '마무리 안내', body: 'b', placement: 'top' },
      ];
      render(<CoachmarkTour steps={trailingInfo} timeoutMs={10000} />);

      expect(screen.getByRole('dialog')).toHaveAttribute('aria-label', '여기를 눌러 A');
      // A 클릭 → 후행 info로 진행. A 앵커는 화면에 그대로 남는다(예: 제출 버튼 잔존).
      fireEvent.click(a);
      expect(screen.getByRole('dialog')).toHaveAttribute('aria-label', '마무리 안내');

      await act(async () => {
        vi.advanceTimersByTime(1000);
      });

      // expected가 없으므로(마지막 action 이후) A로 되끌려가지 않는다.
      expect(screen.getByRole('dialog')).toHaveAttribute('aria-label', '마무리 안내');
    });

    it('두 action 스텝이 같은 target을 공유하면(전제 붕괴) 점프하지 않는다', async () => {
      vi.useFakeTimers();
      appendTarget('dup');
      const dupSteps: CoachmarkStep[] = [
        { target: 'dup', title: '여기를 눌러 A', body: 'a', placement: 'top', kind: 'action' },
        { target: 'dup', title: '여기를 눌러 B', body: 'b', placement: 'top', kind: 'action' },
      ];
      render(<CoachmarkTour steps={dupSteps} timeoutMs={10000} />);

      expect(screen.getByRole('dialog')).toHaveAttribute('aria-label', '여기를 눌러 A');

      await act(async () => {
        vi.advanceTimersByTime(1000);
      });

      // 두 스텝이 같은 요소에 매칭돼 상시 "모호(2개)" — 리졸버는 관망하고 투어는 그대로.
      expect(screen.getByRole('dialog')).toHaveAttribute('aria-label', '여기를 눌러 A');
    });
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
