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

  it('스텝 안내를 role=status 라이브 리전으로 공지한다 (리졸버 점프 포함 비시각 전달)', async () => {
    const { rerender } = render(
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

    // 마운트 후 effect가 채우는 라이브 리전 — 첫 스텝도 공지된다.
    const status = await screen.findByRole('status');
    expect(status).toHaveTextContent('1단계 제목');

    // 스텝이 바뀌면(오프코스 점프 포함) 내용이 갱신돼 폴라이트 공지된다.
    rerender(
      <CoachmarkOverlay
        rect={makeRect()}
        step={{ target: 'next', title: '2단계 제목', body: '다음 설명', placement: 'top', kind: 'action' }}
        stepIndex={1}
        stepCount={3}
        onNext={() => {}}
        onSkip={() => {}}
        isLast={false}
      />,
    );
    expect(await screen.findByRole('status')).toHaveTextContent('2단계 제목');
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

    // pgWriteTour 마지막 스텝은 제출 ConfirmDialog "안"의 확인 버튼을 링한다.
    // ui/dialog의 backdrop·panel은 body 끝 포털 + z-50 — 오버레이 루트가 z-50이면
    // 문서 순서상 나중인 다이얼로그가 위에 그려져 링·말풍선이 불투명 패널에
    // 완전히 가려진다(e2e 클릭 성공과 무관 — 페인트 순서 문제).
    it('오버레이 루트가 ui/dialog(z-50)보다 위에 그려진다', () => {
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
      expect(Number(root.style.zIndex)).toBeGreaterThan(50);
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

describe('오픈 샌드박스 (차단 없음)', () => {
  it('클릭 실드를 렌더하지 않는다 (action/info 공통)', () => {
    for (const kind of ['action', 'info'] as const) {
      const { unmount } = render(
        <CoachmarkOverlay
          rect={{ top: 100, left: 100, width: 120, height: 32, right: 220, bottom: 132 } as DOMRect}
          step={{ target: 't', kind, title: '제목', body: '본문', placement: 'top' }}
          stepIndex={0}
          stepCount={2}
          onNext={() => {}}
          onSkip={() => {}}
          isLast={false}
        />,
      );
      expect(document.querySelectorAll('[data-slot="coachmark-shield"]')).toHaveLength(0);
      unmount();
    }
  });

  it('info 스텝 root도 pointer-events-none — 밖 클릭을 흡수하지 않는다', () => {
    render(
      <CoachmarkOverlay
        rect={{ top: 100, left: 100, width: 120, height: 32, right: 220, bottom: 132 } as DOMRect}
        step={{ target: 't', kind: 'info', title: '제목', body: '본문', placement: 'top' }}
        stepIndex={0}
        stepCount={2}
        onNext={() => {}}
        onSkip={() => {}}
        isLast={false}
      />,
    );
    const root = document.querySelector('[data-slot="coachmark-overlay"]')!;
    expect(root.className).toContain('pointer-events-none');
  });

  it('말풍선은 두 kind 모두 pointer-events:auto — 버튼이 눌린다', () => {
    for (const kind of ['action', 'info'] as const) {
      const { unmount } = render(
        <CoachmarkOverlay
          rect={{ top: 100, left: 100, width: 120, height: 32, right: 220, bottom: 132 } as DOMRect}
          step={{ target: 't', kind, title: '제목', body: '본문', placement: 'top' }}
          stepIndex={0}
          stepCount={2}
          onNext={() => {}}
          onSkip={() => {}}
          isLast={false}
        />,
      );
      const dialog = document.querySelector('[role="dialog"]') as HTMLElement;
      expect(dialog.style.pointerEvents).toBe('auto');
      unmount();
    }
  });

  it('coachmark-nudge 클래스는 어디에도 등장하지 않는다', () => {
    render(
      <CoachmarkOverlay
        rect={{ top: 100, left: 100, width: 120, height: 32, right: 220, bottom: 132 } as DOMRect}
        step={{ target: 't', kind: 'action', title: '제목', body: '본문', placement: 'top' }}
        stepIndex={0}
        stepCount={2}
        onNext={() => {}}
        onSkip={() => {}}
        isLast={false}
      />,
    );
    expect(document.querySelector('.coachmark-nudge')).toBeNull();
    expect(document.querySelector('[data-slot="coachmark-bubble-flash"]')).toBeNull();
  });
});

describe('막힘 감지 힌트', () => {
  const base = {
    rect: { top: 100, left: 100, width: 120, height: 32, right: 220, bottom: 132 } as DOMRect,
    stepIndex: 0,
    stepCount: 2,
    onNext: () => {},
    onSkip: () => {},
    isLast: false,
  };
  const HINT = '입력이 비었거나 형식이 달라요. 고치면 계속 진행할 수 있어요.';

  it('action 스텝 + targetDisabled면 힌트를 렌더한다', () => {
    render(
      <CoachmarkOverlay
        {...base}
        step={{ target: 't', kind: 'action', title: '제목', body: '본문', placement: 'top' }}
        targetDisabled
      />,
    );
    expect(screen.getByText(HINT)).toBeInTheDocument();
  });

  it('targetDisabled가 아니면 힌트가 없다', () => {
    render(
      <CoachmarkOverlay
        {...base}
        step={{ target: 't', kind: 'action', title: '제목', body: '본문', placement: 'top' }}
      />,
    );
    expect(screen.queryByText(HINT)).not.toBeInTheDocument();
  });

  it('info 스텝은 targetDisabled여도 힌트가 없다 (진행이 말풍선 버튼이므로)', () => {
    render(
      <CoachmarkOverlay
        {...base}
        step={{ target: 't', kind: 'info', title: '제목', body: '본문', placement: 'top' }}
        targetDisabled
      />,
    );
    expect(screen.queryByText(HINT)).not.toBeInTheDocument();
  });
});
