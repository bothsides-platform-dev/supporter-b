// 데모 사이드바 stub은 클릭 인터셉트를 검증하기 위해 의도적으로 raw <a href>를 쓴다.
/* eslint-disable @next/next/no-html-link-for-pages */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, act } from '@testing-library/react';

vi.mock('motion/react', () => ({ useInView: () => true }));
vi.mock('@/lib/landing/prefers-reduced-motion', () => ({ prefersReducedMotion: () => false }));

vi.mock('../DemoSidebar', () => ({
  DemoSidebar: () => (
    <nav>
      <a href="/home">홈</a>
      <a href="/inbox">받은요청</a>
      <a href="/opportunities">기회</a>
    </nav>
  ),
}));
vi.mock('../pg/PgHomePageHost', () => ({
  PgHomePageHost: ({ showCue }: { showCue?: boolean }) => (
    <div data-testid="page-home" data-cue={String(showCue)}>
      <a href="/inbox/P-2606-0042">큐 항목</a>
    </div>
  ),
}));
vi.mock('../pg/PgInboxPageHost', () => ({
  PgInboxPageHost: ({ onOpenRfp }: { onOpenRfp: (c: string) => void }) => (
    <div data-testid="page-inbox">
      <button type="button" onClick={() => onOpenRfp('P-2606-0042')}>open-rfp</button>
    </div>
  ),
}));
vi.mock('../pg/PgDealRoomPageHost', () => ({ PgDealRoomPageHost: () => <div data-testid="page-deal" /> }));
vi.mock('../pg/PgMessagesPageHost', () => ({ PgMessagesPageHost: () => <div data-testid="page-messages" /> }));

import { PgDemoAppShell } from '../PgDemoAppShell';

function stubMatchMedia() {
  window.matchMedia = vi.fn().mockReturnValue({
    matches: false, media: '', onchange: null,
    addEventListener: vi.fn(), removeEventListener: vi.fn(),
    addListener: vi.fn(), removeListener: vi.fn(), dispatchEvent: vi.fn(),
  }) as unknown as typeof window.matchMedia;
}

afterEach(cleanup);

describe('PgDemoAppShell — 인플레이스 내비게이션', () => {
  beforeEach(stubMatchMedia);

  it('초기에는 홈 페이지를 보여준다', () => {
    render(<PgDemoAppShell />);
    expect(screen.getByTestId('page-home')).toBeInTheDocument();
  });

  it('사이드바 받은요청 링크가 인박스로 인플레이스 전환한다 (URL 변경 없이)', () => {
    render(<PgDemoAppShell />);
    fireEvent.click(screen.getByRole('link', { name: '받은요청' }));
    expect(screen.getByTestId('page-inbox')).toBeInTheDocument();
    expect(window.location.pathname).toBe('/');
  });

  it('인박스에서 행 열기(onOpenRfp)가 딜룸으로 이동한다', () => {
    render(<PgDemoAppShell />);
    fireEvent.click(screen.getByRole('link', { name: '받은요청' }));
    fireEvent.click(screen.getByRole('button', { name: 'open-rfp' }));
    expect(screen.getByTestId('page-deal')).toBeInTheDocument();
  });

  it('데모에 없는 라우트(기회) 클릭은 페이지를 유지한다', () => {
    render(<PgDemoAppShell />);
    fireEvent.click(screen.getByRole('link', { name: '기회' }));
    expect(screen.getByTestId('page-home')).toBeInTheDocument();
  });

  it('스텝 바 메시지 클릭이 메시지 페이지로 전환한다', () => {
    render(<PgDemoAppShell />);
    act(() => {
      fireEvent.click(screen.getByRole('button', { name: '4 메시지' }));
    });
    expect(screen.getByTestId('page-messages')).toBeInTheDocument();
  });
});

describe('PgDemoAppShell — 자동 투어/조작 하이브리드', () => {
  beforeEach(() => {
    stubMatchMedia();
    vi.useFakeTimers();
  });
  afterEach(() => vi.useRealTimers());

  it('뷰 안에서 시간이 지나면 마지막 페이지(메시지)까지 자동 전진한다', () => {
    render(<PgDemoAppShell />);
    expect(screen.getByTestId('page-home')).toBeInTheDocument();
    for (let i = 0; i < 4; i++) act(() => vi.advanceTimersByTime(4800));
    expect(screen.getByTestId('page-messages')).toBeInTheDocument();
  });

  it('사용자가 조작하면 자동 투어가 멈춘다', () => {
    render(<PgDemoAppShell />);
    fireEvent.pointerDown(screen.getByTestId('page-home'));
    for (let i = 0; i < 4; i++) act(() => vi.advanceTimersByTime(4800));
    expect(screen.getByTestId('page-home')).toBeInTheDocument();
  });
});

describe('PgDemoAppShell — 코치마크/하이라이트', () => {
  beforeEach(stubMatchMedia);

  it('가이드 중에는 showCue를 켜고, 방문자가 조작하면 끈다', () => {
    render(<PgDemoAppShell />);
    expect(screen.getByTestId('page-home')).toHaveAttribute('data-cue', 'true');
    fireEvent.pointerDown(screen.getByTestId('page-home'));
    expect(screen.getByTestId('page-home')).toHaveAttribute('data-cue', 'false');
  });

  it('자동 전환 직전 트리거(큐 항목)에 클릭 하이라이트 클래스를 입힌다', () => {
    vi.useFakeTimers();
    render(<PgDemoAppShell />);
    const trigger = screen.getByRole('link', { name: '큐 항목' });
    expect(trigger).not.toHaveClass('demo-click-flash');
    act(() => vi.advanceTimersByTime(4300));
    expect(trigger).toHaveClass('demo-click-flash');
    vi.useRealTimers();
  });
});
