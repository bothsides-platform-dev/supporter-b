// 데모 사이드바 stub은 클릭 인터셉트를 검증하기 위해 의도적으로 raw <a href>를 쓴다.
/* eslint-disable @next/next/no-html-link-for-pages */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, act } from '@testing-library/react';

vi.mock('motion/react', () => ({ useInView: () => true }));
vi.mock('@/lib/landing/prefers-reduced-motion', () => ({ prefersReducedMotion: () => false }));
vi.mock('../DemoCursor', () => ({ DemoCursor: () => null }));

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
  PgHomePageHost: () => (
    <div data-testid="page-home">
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

describe('PgDemoAppShell — 클릭 인플레이스 내비게이션', () => {
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
});

describe('PgDemoAppShell — 클릭 대기(자동재생 없음)', () => {
  beforeEach(() => {
    stubMatchMedia();
    vi.useFakeTimers();
  });
  afterEach(() => vi.useRealTimers());

  it('시간이 지나도 자동 전진하지 않는다', () => {
    render(<PgDemoAppShell />);
    for (let i = 0; i < 4; i++) act(() => vi.advanceTimersByTime(4800));
    expect(screen.getByTestId('page-home')).toBeInTheDocument();
  });
});

