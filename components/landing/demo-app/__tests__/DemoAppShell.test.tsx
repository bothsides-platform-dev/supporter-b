// 데모 사이드바 stub은 클릭 인터셉트를 검증하기 위해 의도적으로 raw <a href>를 쓴다.
/* eslint-disable @next/next/no-html-link-for-pages */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, act } from '@testing-library/react';

vi.mock('motion/react', () => ({ useInView: () => true }));
vi.mock('@/lib/landing/prefers-reduced-motion', () => ({ prefersReducedMotion: () => false }));

// 자식은 각각 자체 테스트 보유 — 셸의 오케스트레이션(투어 + 링크 인터셉트)에 집중하도록 stub.
vi.mock('../DemoSidebar', () => ({
  DemoSidebar: () => (
    <nav>
      <a href="/home">홈</a>
      <a href="/rfp">목록</a>
      <a href="/notifications">알림</a>
    </nav>
  ),
}));
vi.mock('../pages/HomePageHost', () => ({
  HomePageHost: ({ showCue }: { showCue?: boolean }) => (
    <div data-testid="page-home" data-cue={String(showCue)} />
  ),
}));
vi.mock('../pages/RfpListPageHost', () => ({
  RfpListPageHost: ({ onOpenRfp }: { onOpenRfp: (c: string) => void }) => (
    <div data-testid="page-list">
      <button type="button" onClick={() => onOpenRfp('P-2606-0042')}>open-rfp</button>
    </div>
  ),
}));
vi.mock('../pages/DealRoomPageHost', () => ({ DealRoomPageHost: () => <div data-testid="page-deal" /> }));
vi.mock('../pages/WizardPageHost', () => ({
  WizardPageHost: ({ enabled }: { enabled: boolean }) => (
    <div data-testid="page-wizard" data-enabled={String(enabled)} />
  ),
}));

import { DemoAppShell } from '../DemoAppShell';

function stubMatchMedia() {
  window.matchMedia = vi.fn().mockReturnValue({
    matches: false, media: '', onchange: null,
    addEventListener: vi.fn(), removeEventListener: vi.fn(),
    addListener: vi.fn(), removeListener: vi.fn(), dispatchEvent: vi.fn(),
  }) as unknown as typeof window.matchMedia;
}

afterEach(cleanup);

describe('DemoAppShell — 인플레이스 내비게이션', () => {
  beforeEach(stubMatchMedia);

  it('초기에는 홈 페이지를 보여준다', () => {
    render(<DemoAppShell />);
    expect(screen.getByTestId('page-home')).toBeInTheDocument();
  });

  it('사이드바 링크 클릭이 페이지를 인플레이스로 전환한다 (URL 변경 없이)', () => {
    render(<DemoAppShell />);
    fireEvent.click(screen.getByRole('link', { name: '목록' }));
    expect(screen.getByTestId('page-list')).toBeInTheDocument();
    expect(screen.queryByTestId('page-home')).not.toBeInTheDocument();
    expect(window.location.pathname).toBe('/');
  });

  it('목록에서 행 열기(onOpenRfp)가 딜룸 페이지로 이동한다', () => {
    render(<DemoAppShell />);
    fireEvent.click(screen.getByRole('link', { name: '목록' }));
    fireEvent.click(screen.getByRole('button', { name: 'open-rfp' }));
    expect(screen.getByTestId('page-deal')).toBeInTheDocument();
  });

  it('데모에 없는 라우트(알림) 클릭은 페이지를 유지하고 투어도 멈추지 않는다', () => {
    vi.useFakeTimers();
    render(<DemoAppShell />);
    fireEvent.click(screen.getByRole('link', { name: '알림' }));
    expect(screen.getByTestId('page-home')).toBeInTheDocument();
    for (let i = 0; i < 4; i++) act(() => vi.advanceTimersByTime(5000));
    expect(screen.getByTestId('page-wizard')).toBeInTheDocument();
    vi.useRealTimers();
  });

  it('스텝 바 클릭이 페이지를 전환하고 자동 투어를 멈춘다', () => {
    vi.useFakeTimers();
    render(<DemoAppShell />);
    act(() => {
      fireEvent.click(screen.getByRole('button', { name: '3 견적 비교·선정' }));
    });
    expect(screen.getByTestId('page-deal')).toBeInTheDocument();
    for (let i = 0; i < 4; i++) act(() => vi.advanceTimersByTime(5000));
    expect(screen.getByTestId('page-deal')).toBeInTheDocument();
    vi.useRealTimers();
  });
});

describe('DemoAppShell — 자동 투어/조작 하이브리드', () => {
  beforeEach(() => {
    stubMatchMedia();
    vi.useFakeTimers();
  });
  afterEach(() => vi.useRealTimers());

  it('뷰 안에서 시간이 지나면 페이지가 자동 전진한다', () => {
    render(<DemoAppShell />);
    expect(screen.getByTestId('page-home')).toBeInTheDocument();
    for (let i = 0; i < 4; i++) act(() => vi.advanceTimersByTime(5000));
    expect(screen.getByTestId('page-wizard')).toBeInTheDocument();
  });

  it('사용자가 조작하면 자동 투어가 멈춘다', () => {
    render(<DemoAppShell />);
    fireEvent.pointerDown(screen.getByTestId('page-home'));
    for (let i = 0; i < 4; i++) act(() => vi.advanceTimersByTime(5000));
    expect(screen.getByTestId('page-home')).toBeInTheDocument();
  });
});

describe('DemoAppShell — 코치마크 신호', () => {
  beforeEach(stubMatchMedia);

  it('가이드 중에는 showCue를 켜고, 방문자가 조작하면 끈다', () => {
    render(<DemoAppShell />);
    expect(screen.getByTestId('page-home')).toHaveAttribute('data-cue', 'true');
    fireEvent.pointerDown(screen.getByTestId('page-home'));
    expect(screen.getByTestId('page-home')).toHaveAttribute('data-cue', 'false');
  });
});

describe('DemoAppShell — 전환 직전 클릭 하이라이트', () => {
  beforeEach(() => {
    stubMatchMedia();
    vi.useFakeTimers();
  });
  afterEach(() => vi.useRealTimers());

  it('자동 전환 직전 트리거 요소(견적 요청)에 클릭 하이라이트 클래스를 입힌다', () => {
    render(<DemoAppShell />);
    const trigger = screen.getByRole('link', { name: '목록' }); // a[href="/rfp"]
    expect(trigger).not.toHaveClass('demo-click-flash');
    // 전환(5000ms) 직전: 하이라이트가 켜진다
    act(() => vi.advanceTimersByTime(4000));
    expect(trigger).toHaveClass('demo-click-flash');
  });
});
