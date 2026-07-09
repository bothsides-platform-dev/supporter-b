import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
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

  it('prefers-reduced-motion이면 스포트라이트/말풍선에 transition을 넣지 않는다', () => {
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
    const spotlight = container.querySelector('[data-slot="coachmark-overlay"]')
      ?.firstElementChild as HTMLElement;

    expect(spotlight.style.transition).toBe('none');
    expect(dialog.style.transition).toBe('none');

    vi.unstubAllGlobals();
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

    it('구멍 주위 4개 dim rect를 렌더하고 각각 pointer-events:auto로 밖 클릭을 흡수한다', () => {
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
      const dims = container.querySelectorAll('[data-slot="coachmark-dim"]');
      expect(dims).toHaveLength(4);
      dims.forEach((dim) => {
        expect((dim as HTMLElement).style.pointerEvents).toBe('auto');
      });
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

    it('info step(기본)은 기존 전 화면 흡수 마크업을 유지한다', () => {
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
      expect(container.querySelectorAll('[data-slot="coachmark-dim"]')).toHaveLength(0);
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
