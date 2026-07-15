import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { CoachmarkOverlay } from '../CoachmarkOverlay';
import type { CoachmarkStep } from '../types';

function makeRect(overrides: Partial<DOMRect> = {}): DOMRect {
  return {
    x: 0,
    y: 0,
    top: 100,
    left: 100,
    right: 200,
    bottom: 150,
    width: 100,
    height: 50,
    toJSON() {},
    ...overrides,
  } as DOMRect;
}

// jsdom은 AnimationEvent를 구현하지 않아 fireEvent.animationEnd의 eventInit
// animationName이 이벤트 객체에 실리지 않는다 — 일반 Event에 프로퍼티를 직접 실어
// 디스패치한다(컴포넌트의 네이티브 리스너가 animationName으로 필터링하므로 필수).
function fireAnimationEndWithName(el: HTMLElement, animationName: string) {
  const event = new Event('animationend', { bubbles: true });
  Object.assign(event, { animationName });
  fireEvent(el, event);
}

const step: CoachmarkStep = {
  target: 'demo',
  title: '1단계 제목',
  body: '설명 문구입니다.',
  placement: 'bottom',
};

afterEach(() => {
  cleanup();
});

describe('CoachmarkOverlay', () => {
  it('title/body/카운터를 렌더하고 role=dialog로 접근 가능하다', () => {
    render(
      <CoachmarkOverlay
        rect={makeRect()}
        step={step}
        stepIndex={0}
        stepCount={3}
        onNext={() => {}}
        onSkip={() => {}}
        isLast={false}
      />,
    );

    const dialog = screen.getByRole('dialog', { name: '1단계 제목' });
    expect(dialog).toBeInTheDocument();
    expect(screen.getByText('설명 문구입니다.')).toBeInTheDocument();
    expect(screen.getByText('1/3')).toBeInTheDocument();
  });

  it('마지막 step이면 다음 버튼이 "확인"으로 표시된다', () => {
    render(
      <CoachmarkOverlay
        rect={makeRect()}
        step={step}
        stepIndex={2}
        stepCount={3}
        onNext={() => {}}
        onSkip={() => {}}
        isLast={true}
      />,
    );

    expect(screen.getByRole('button', { name: '확인' })).toBeInTheDocument();
  });

  it('마지막이 아니면 다음 버튼이 "다음"으로 표시되고 클릭 시 onNext를 호출한다', async () => {
    const user = userEvent.setup();
    const onNext = vi.fn();
    render(
      <CoachmarkOverlay
        rect={makeRect()}
        step={step}
        stepIndex={0}
        stepCount={3}
        onNext={onNext}
        onSkip={() => {}}
        isLast={false}
      />,
    );

    await user.click(screen.getByRole('button', { name: '다음' }));
    expect(onNext).toHaveBeenCalledTimes(1);
  });

  it('레이아웃 속성(top/left/width/height) transition을 어떤 요소에도 걸지 않는다 (DESIGN.md 모션 하드룰)', () => {
    const { container } = render(
      <CoachmarkOverlay
        rect={makeRect()}
        step={step}
        stepIndex={0}
        stepCount={3}
        onNext={() => {}}
        onSkip={() => {}}
        isLast={false}
      />,
    );
    const all = container.querySelectorAll<HTMLElement>('*');
    all.forEach((el) => {
      expect(el.style.transition).not.toMatch(/top|left|width|height/);
    });
  });

  it('prefers-reduced-motion이면 페이드 애니메이션 클래스를 붙이지 않는다', () => {
    const matchMediaMock = vi.fn().mockReturnValue({ matches: true });
    vi.stubGlobal('matchMedia', matchMediaMock);

    const { container } = render(
      <CoachmarkOverlay
        rect={makeRect()}
        step={step}
        stepIndex={0}
        stepCount={3}
        onNext={() => {}}
        onSkip={() => {}}
        isLast={false}
      />,
    );

    const dialog = screen.getByRole('dialog');
    expect(dialog.className).not.toContain('animate-in');
    const ring = container.querySelector('[data-slot="coachmark-ring"]') as HTMLElement;
    expect(ring.className ?? '').not.toContain('animate-in');

    vi.unstubAllGlobals();
  });

  it('일반 모션에서는 말풍선이 opacity 페이드로 등장하고 링은 소프트 펄스 클래스로 자체 페이드를 소유한다 (transform/opacity만)', () => {
    // jsdom은 matchMedia 미정의 → 기본 reduced. 일반 모션을 명시적으로 스텁.
    const matchMediaMock = vi.fn().mockReturnValue({ matches: false });
    vi.stubGlobal('matchMedia', matchMediaMock);
    const { container } = render(
      <CoachmarkOverlay
        rect={makeRect()}
        step={step}
        stepIndex={0}
        stepCount={3}
        onNext={() => {}}
        onSkip={() => {}}
        isLast={false}
      />,
    );
    const dialog = screen.getByRole('dialog');
    expect(dialog.className).toContain('fade-in');
    // 링은 더 이상 fadeClass(animate-in)를 쓰지 않는다 — coachmark-pulse가 자체
    // 키프레임(coachmark-fade-in)으로 페이드를 소유한다(tw-animate 레이어 충돌 회피).
    const ring = container.querySelector('[data-slot="coachmark-ring"]') as HTMLElement;
    expect(ring.className).not.toContain('fade-in');
    expect(ring.className).toContain('coachmark-pulse');
    vi.unstubAllGlobals();
  });

  it('실드는 배경색 없는 투명 클릭 실드다 (dim 스크림 제거)', () => {
    const { container } = render(
      <CoachmarkOverlay
        rect={makeRect()}
        step={step}
        stepIndex={0}
        stepCount={3}
        onNext={() => {}}
        onSkip={() => {}}
        isLast={false}
      />,
    );
    const shields = container.querySelectorAll<HTMLElement>('[data-slot="coachmark-shield"]');
    expect(shields.length).toBe(4);
    shields.forEach((shield) => {
      expect(shield.className ?? '').not.toContain('bg-black/40');
      expect(shield.className ?? '').not.toContain('dark:bg-white/10');
    });
  });

  it('일반 모션에서는 링에 소프트 펄스 클래스가 붙는다', () => {
    const matchMediaMock = vi.fn().mockReturnValue({ matches: false });
    vi.stubGlobal('matchMedia', matchMediaMock);
    const { container } = render(
      <CoachmarkOverlay
        rect={makeRect()}
        step={step}
        stepIndex={0}
        stepCount={3}
        onNext={() => {}}
        onSkip={() => {}}
        isLast={false}
      />,
    );
    const ring = container.querySelector('[data-slot="coachmark-ring"]') as HTMLElement;
    expect(ring.className).toContain('coachmark-pulse');
    vi.unstubAllGlobals();
  });

  it('prefers-reduced-motion이면 링 펄스 클래스를 붙이지 않는다', () => {
    const matchMediaMock = vi.fn().mockReturnValue({ matches: true });
    vi.stubGlobal('matchMedia', matchMediaMock);
    const { container } = render(
      <CoachmarkOverlay
        rect={makeRect()}
        step={step}
        stepIndex={0}
        stepCount={3}
        onNext={() => {}}
        onSkip={() => {}}
        isLast={false}
      />,
    );
    const ring = container.querySelector('[data-slot="coachmark-ring"]') as HTMLElement;
    expect(ring.className ?? '').not.toContain('coachmark-pulse');
    vi.unstubAllGlobals();
  });

  it('info 스텝에서 말풍선 밖(root) 클릭 시 말풍선 내부 래퍼에 유도 플래시(coachmark-nudge)가 등장한다', async () => {
    const user = userEvent.setup();
    const { container } = render(
      <CoachmarkOverlay
        rect={makeRect()}
        step={step}
        stepIndex={0}
        stepCount={3}
        onNext={() => {}}
        onSkip={() => {}}
        isLast={false}
      />,
    );
    const root = container.querySelector('[data-slot="coachmark-overlay"]') as HTMLElement;
    await user.click(root);
    // nudge는 dialog 자체가 아니라 내부 래퍼(coachmark-bubble-flash)에 붙는다 —
    // dialog(role=dialog)는 리마운트되지 않아야 하므로 nudge 클래스를 직접 갖지 않는다.
    const flash = container.querySelector('[data-slot="coachmark-bubble-flash"]') as HTMLElement;
    expect(flash.className).toContain('coachmark-nudge');
  });

  it('밖 클릭으로 유도 플래시가 붙어도 dialog(role=dialog) DOM 노드는 리마운트되지 않는다 (포커스 안전)', async () => {
    const user = userEvent.setup();
    const { container } = render(
      <CoachmarkOverlay
        rect={makeRect()}
        step={step}
        stepIndex={0}
        stepCount={3}
        onNext={() => {}}
        onSkip={() => {}}
        isLast={false}
      />,
    );
    const dialogBefore = screen.getByRole('dialog');
    const root = container.querySelector('[data-slot="coachmark-overlay"]') as HTMLElement;
    await user.click(root);
    const dialogAfter = screen.getByRole('dialog');
    expect(dialogAfter).toBe(dialogBefore);
    expect(dialogAfter.className).not.toContain('coachmark-nudge');
  });

  it('유도 플래시 애니메이션 종료(animationend) 후 클래스가 제거되고, 다시 밖 클릭하면 재부착되어 재생된다 (리마운트 없는 replay)', async () => {
    const user = userEvent.setup();
    const { container } = render(
      <CoachmarkOverlay
        rect={makeRect()}
        step={step}
        stepIndex={0}
        stepCount={3}
        onNext={() => {}}
        onSkip={() => {}}
        isLast={false}
      />,
    );
    const root = container.querySelector('[data-slot="coachmark-overlay"]') as HTMLElement;
    await user.click(root);
    const flash = container.querySelector('[data-slot="coachmark-bubble-flash"]') as HTMLElement;
    expect(flash.className).toContain('coachmark-nudge');

    fireAnimationEndWithName(flash, 'coachmark-nudge');
    expect(flash.className).not.toContain('coachmark-nudge');

    await user.click(root);
    expect(flash.className).toContain('coachmark-nudge');
  });

  it('다른 애니메이션의 animationend(자손 버블링 포함)는 유도 플래시를 리셋하지 않는다', async () => {
    const user = userEvent.setup();
    const { container } = render(
      <CoachmarkOverlay
        rect={makeRect()}
        step={step}
        stepIndex={0}
        stepCount={3}
        onNext={() => {}}
        onSkip={() => {}}
        isLast={false}
      />,
    );
    const root = container.querySelector('[data-slot="coachmark-overlay"]') as HTMLElement;
    await user.click(root);
    const flash = container.querySelector('[data-slot="coachmark-bubble-flash"]') as HTMLElement;
    expect(flash.className).toContain('coachmark-nudge');

    // 래퍼 자손(예: 버튼)의 무관한 애니메이션 종료가 버블링돼도 넛지는 유지되어야 한다.
    fireAnimationEndWithName(flash, 'enter');
    expect(flash.className).toContain('coachmark-nudge');
  });

  it('info 스텝에서 밖 클릭은 링에는 유도 플래시를 붙이지 않는다 (말풍선에만)', async () => {
    const user = userEvent.setup();
    const { container } = render(
      <CoachmarkOverlay
        rect={makeRect()}
        step={step}
        stepIndex={0}
        stepCount={3}
        onNext={() => {}}
        onSkip={() => {}}
        isLast={false}
      />,
    );
    const root = container.querySelector('[data-slot="coachmark-overlay"]') as HTMLElement;
    await user.click(root);
    const ring = container.querySelector('[data-slot="coachmark-ring"]') as HTMLElement;
    expect(ring.className ?? '').not.toContain('coachmark-nudge');
  });

  it('step 전환(target도 바뀜) 시 이전 step의 유도 플래시가 새 step으로 이어지지 않는다', async () => {
    const user = userEvent.setup();
    const stepA: CoachmarkStep = { ...step, target: 'a', title: 'A 제목' };
    const stepB: CoachmarkStep = { ...step, target: 'b', title: 'B 제목' };
    const { container, rerender } = render(
      <CoachmarkOverlay
        rect={makeRect()}
        step={stepA}
        stepIndex={0}
        stepCount={2}
        onNext={() => {}}
        onSkip={() => {}}
        isLast={false}
      />,
    );
    const root = container.querySelector('[data-slot="coachmark-overlay"]') as HTMLElement;
    await user.click(root);
    expect(
      (container.querySelector('[data-slot="coachmark-bubble-flash"]') as HTMLElement).className,
    ).toContain('coachmark-nudge');

    rerender(
      <CoachmarkOverlay
        rect={makeRect()}
        step={stepB}
        stepIndex={1}
        stepCount={2}
        onNext={() => {}}
        onSkip={() => {}}
        isLast={false}
      />,
    );

    const dialogB = screen.getByRole('dialog');
    expect(dialogB).toHaveAttribute('aria-label', 'B 제목');
    const flashB = container.querySelector('[data-slot="coachmark-bubble-flash"]') as HTMLElement;
    expect(flashB.className).not.toContain('coachmark-nudge');
  });

  it('같은 target을 쓰는 연속 step이라도 stepIndex가 바뀌면 이전 step의 유도 플래시가 새 step으로 이어지지 않는다', async () => {
    const user = userEvent.setup();
    // target은 동일하고 stepIndex만 바뀌는 케이스 — target 비교만으로는 새지만
    // stepIndex 비교로는 리셋되어야 한다(버그4 재발 방지 회귀 테스트).
    const stepSame: CoachmarkStep = { ...step, target: 'same', title: '같은 타깃' };
    const { container, rerender } = render(
      <CoachmarkOverlay
        rect={makeRect()}
        step={stepSame}
        stepIndex={0}
        stepCount={2}
        onNext={() => {}}
        onSkip={() => {}}
        isLast={false}
      />,
    );
    const root = container.querySelector('[data-slot="coachmark-overlay"]') as HTMLElement;
    await user.click(root);
    expect(
      (container.querySelector('[data-slot="coachmark-bubble-flash"]') as HTMLElement).className,
    ).toContain('coachmark-nudge');

    rerender(
      <CoachmarkOverlay
        rect={makeRect()}
        step={stepSame}
        stepIndex={1}
        stepCount={2}
        onNext={() => {}}
        onSkip={() => {}}
        isLast={false}
      />,
    );

    const flashAfter = container.querySelector('[data-slot="coachmark-bubble-flash"]') as HTMLElement;
    expect(flashAfter.className).not.toContain('coachmark-nudge');
  });

  it('info 스텝에서 말풍선 내부 클릭은 유도 플래시를 발동시키지 않는다', async () => {
    const user = userEvent.setup();
    const { container } = render(
      <CoachmarkOverlay
        rect={makeRect()}
        step={step}
        stepIndex={0}
        stepCount={3}
        onNext={() => {}}
        onSkip={() => {}}
        isLast={false}
      />,
    );
    const dialog = screen.getByRole('dialog');
    await user.click(dialog);
    const flash = container.querySelector('[data-slot="coachmark-bubble-flash"]') as HTMLElement;
    expect(flash.className).not.toContain('coachmark-nudge');
  });

  it('건너뛰기 버튼 클릭 시 onSkip을 호출한다', async () => {
    const user = userEvent.setup();
    const onSkip = vi.fn();
    render(
      <CoachmarkOverlay
        rect={makeRect()}
        step={step}
        stepIndex={0}
        stepCount={3}
        onNext={() => {}}
        onSkip={onSkip}
        isLast={false}
      />,
    );

    await user.click(screen.getByRole('button', { name: '건너뛰기' }));
    expect(onSkip).toHaveBeenCalledTimes(1);
  });

  it('타깃이 뷰포트 위로 걸쳐 rect.top이 음수여도 말풍선 top은 뷰포트 안으로 클램프된다', () => {
    render(
      <CoachmarkOverlay
        rect={makeRect({ top: -300, bottom: 500, height: 800, left: 100, right: 900, width: 800 })}
        step={{ ...step, placement: 'right' }}
        stepIndex={0}
        stepCount={1}
        onNext={() => {}}
        onSkip={() => {}}
        isLast
      />,
    );
    const bubble = screen.getByRole('dialog');
    const top = parseFloat(String((bubble as HTMLElement).style.top));
    expect(top).toBeGreaterThanOrEqual(8);
  });

  describe('action kind (클릭-스루 스포트라이트)', () => {
    const actionStep: CoachmarkStep = { ...step, kind: 'action', title: '여기를 눌러 다음으로 가요' };

    it('root가 pointer-events:none이고 클릭 흡수 onClick이 없다', () => {
      const { container } = render(
        <CoachmarkOverlay
          rect={makeRect()}
          step={actionStep}
          stepIndex={0}
          stepCount={3}
          onNext={() => {}}
          onSkip={() => {}}
          isLast={false}
        />,
      );
      const root = container.querySelector('[data-slot="coachmark-overlay"]') as HTMLElement;
      expect(root.className).toContain('pointer-events-none');
    });

    it('구멍 주위 4개 클릭 실드를 렌더하고 각각 pointer-events:auto로 밖 클릭을 흡수한다', () => {
      const { container } = render(
        <CoachmarkOverlay
          rect={makeRect()}
          step={actionStep}
          stepIndex={0}
          stepCount={3}
          onNext={() => {}}
          onSkip={() => {}}
          isLast={false}
        />,
      );
      const shields = container.querySelectorAll('[data-slot="coachmark-shield"]');
      expect(shields).toHaveLength(4);
      shields.forEach((shield) => {
        expect((shield as HTMLElement).style.pointerEvents).toBe('auto');
      });
    });

    it('실드(밖) 클릭 시 링에 유도 플래시(coachmark-nudge) 클래스가 등장한다', async () => {
      const user = userEvent.setup();
      const { container } = render(
        <CoachmarkOverlay
          rect={makeRect()}
          step={actionStep}
          stepIndex={0}
          stepCount={3}
          onNext={() => {}}
          onSkip={() => {}}
          isLast={false}
        />,
      );
      const shields = container.querySelectorAll('[data-slot="coachmark-shield"]');
      await user.click(shields[0]);
      const ring = container.querySelector('[data-slot="coachmark-ring"]') as HTMLElement;
      expect(ring.className).toContain('coachmark-nudge');
    });

    it('실드(밖) 클릭은 말풍선에는 유도 플래시를 붙이지 않는다 (링에만)', async () => {
      const user = userEvent.setup();
      const { container } = render(
        <CoachmarkOverlay
          rect={makeRect()}
          step={actionStep}
          stepIndex={0}
          stepCount={3}
          onNext={() => {}}
          onSkip={() => {}}
          isLast={false}
        />,
      );
      const shields = container.querySelectorAll('[data-slot="coachmark-shield"]');
      await user.click(shields[0]);
      const flash = container.querySelector('[data-slot="coachmark-bubble-flash"]') as HTMLElement;
      expect(flash.className).not.toContain('coachmark-nudge');
    });

    it('같은 target에서 밖 클릭을 반복하면 링이 리마운트되어 유도 플래시가 다시 재생된다 (key에 count 반영)', async () => {
      const user = userEvent.setup();
      const { container } = render(
        <CoachmarkOverlay
          rect={makeRect()}
          step={actionStep}
          stepIndex={0}
          stepCount={3}
          onNext={() => {}}
          onSkip={() => {}}
          isLast={false}
        />,
      );
      const shields = container.querySelectorAll('[data-slot="coachmark-shield"]');
      await user.click(shields[0]);
      const ringAfterFirst = container.querySelector('[data-slot="coachmark-ring"]');
      await user.click(shields[0]);
      const ringAfterSecond = container.querySelector('[data-slot="coachmark-ring"]');
      expect(ringAfterSecond).not.toBe(ringAfterFirst);
      expect((ringAfterSecond as HTMLElement).className).toContain('coachmark-nudge');
    });

    it('prefers-reduced-motion이어도 밖 클릭 시 유도 플래시 클래스는 여전히 붙는다 (정지는 CSS 미디어 쿼리 담당, JS는 게이트하지 않음)', async () => {
      const matchMediaMock = vi.fn().mockReturnValue({ matches: true });
      vi.stubGlobal('matchMedia', matchMediaMock);
      const user = userEvent.setup();
      const { container } = render(
        <CoachmarkOverlay
          rect={makeRect()}
          step={actionStep}
          stepIndex={0}
          stepCount={3}
          onNext={() => {}}
          onSkip={() => {}}
          isLast={false}
        />,
      );
      const shields = container.querySelectorAll('[data-slot="coachmark-shield"]');
      await user.click(shields[0]);
      const ring = container.querySelector('[data-slot="coachmark-ring"]') as HTMLElement;
      expect(ring.className).toContain('coachmark-nudge');
      vi.unstubAllGlobals();
    });

    it('다음/확인 버튼이 없고 건너뛰기만 있다', () => {
      render(
        <CoachmarkOverlay
          rect={makeRect()}
          step={actionStep}
          stepIndex={2}
          stepCount={3}
          onNext={() => {}}
          onSkip={() => {}}
          isLast={true}
        />,
      );
      expect(screen.queryByRole('button', { name: '다음' })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: '확인' })).not.toBeInTheDocument();
      expect(screen.getByRole('button', { name: '건너뛰기' })).toBeInTheDocument();
    });

    it('구멍(스포트라이트) 영역에는 클릭을 막는 요소가 없다 — 링은 pointer-events:none', () => {
      const { container } = render(
        <CoachmarkOverlay
          rect={makeRect()}
          step={actionStep}
          stepIndex={0}
          stepCount={3}
          onNext={() => {}}
          onSkip={() => {}}
          isLast={false}
        />,
      );
      const ring = container.querySelector('[data-slot="coachmark-ring"]') as HTMLElement;
      expect(ring).not.toBeNull();
      expect(ring.style.pointerEvents).toBe('none');
    });

    it('info step(기본)은 전 화면 클릭 흡수를 유지한다 — root가 클릭 가능(비 pointer-events-none)이고 다음 버튼이 있다', () => {
      const { container } = render(
        <CoachmarkOverlay
          rect={makeRect()}
          step={step}
          stepIndex={0}
          stepCount={3}
          onNext={() => {}}
          onSkip={() => {}}
          isLast={false}
        />,
      );
      const root = container.querySelector('[data-slot="coachmark-overlay"]') as HTMLElement;
      expect(root.className).not.toContain('pointer-events-none');
      // 클릭 실드 구조는 action과 동일한 4-rect로 통일 (9999px box-shadow 제거)
      expect(container.querySelectorAll('[data-slot="coachmark-shield"]')).toHaveLength(4);
      expect(screen.getByRole('button', { name: '다음' })).toBeInTheDocument();
    });
  });

  it('타깃이 거의 풀폭이라 좌우 플립이 모두 넘칠 때도 말풍선 left는 뷰포트 안으로 클램프된다', () => {
    // jsdom 기본 innerWidth=1024. rect가 거의 풀폭 → right 배치도 left 플립도 넘친다.
    render(
      <CoachmarkOverlay
        rect={makeRect({ top: 50, bottom: 900, height: 850, left: 20, right: 1010, width: 990 })}
        step={{ ...step, placement: 'right' }}
        stepIndex={0}
        stepCount={1}
        onNext={() => {}}
        onSkip={() => {}}
        isLast
      />,
    );
    const bubble = screen.getByRole('dialog');
    const left = parseFloat(String((bubble as HTMLElement).style.left));
    expect(left).toBeGreaterThanOrEqual(8);
    expect(left).toBeLessThanOrEqual(1024 - 280 - 8);
  });
});
