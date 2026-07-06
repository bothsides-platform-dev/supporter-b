// 데모 사이드바 stub은 클릭 인터셉트를 검증하기 위해 의도적으로 raw <a href>를 쓴다.
/* eslint-disable @next/next/no-html-link-for-pages */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { render, screen, fireEvent, cleanup, act } from '@testing-library/react';

// 창 위 프로세스 스테퍼(PgProcessStepRail)가 motion·AnimatePresence 를 쓰므로 평탄화한다.
// 셸 자신은 useInView 만 필요 → true 고정(스크롤 진입 스케일 활성).
vi.mock('motion/react', () => {
  const makeEl = (tag: string) => {
    const El = ({ children, ...props }: Record<string, unknown>) =>
      React.createElement(
        tag,
        Object.fromEntries(
          Object.entries(props).filter(
            ([k]) =>
              !['initial', 'animate', 'exit', 'transition', 'whileInView', 'viewport'].includes(k),
          ),
        ),
        children as React.ReactNode,
      );
    El.displayName = `motion.${tag}`;
    return El;
  };
  return {
    motion: new Proxy({}, { get: (_, tag: string) => makeEl(tag) }),
    AnimatePresence: ({ children }: { children: React.ReactNode }) => children,
    useInView: () => true,
  };
});
vi.mock('../DemoCursor', () => ({ DemoCursor: () => <div data-testid="demo-cursor" /> }));

vi.mock('../DemoSidebar', () => ({
  DemoSidebar: () => (
    <nav>
      <a href="/home">홈</a>
      <a href="/inbox">받은요청</a>
      <a href="/messages">메시지</a>
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

describe('PgDemoAppShell — 사이드바 토글 비활성화', () => {
  beforeEach(() => {
    stubMatchMedia();
    document.cookie = 'sidebar_state=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;';
  });

  it('모바일 헤더의 사이드바 토글 클릭이 실제 사이드바 상태를 바꾸지 않는다', () => {
    render(<PgDemoAppShell />);
    const trigger = document.querySelector('[data-sidebar="trigger"]');
    expect(trigger).not.toBeNull();
    fireEvent.click(trigger!);
    expect(document.cookie).not.toContain('sidebar_state=false');
  });

  it('⌘/Ctrl+B 단축키가 실제 사이드바 상태를 바꾸지 않는다', () => {
    render(<PgDemoAppShell />);
    fireEvent.keyDown(window, { key: 'b', metaKey: true });
    expect(document.cookie).not.toContain('sidebar_state=false');
  });

  it('Ctrl+B(모디파이어 조합)도 동일하게 막는다', () => {
    render(<PgDemoAppShell />);
    fireEvent.keyDown(window, { key: 'b', ctrlKey: true });
    expect(document.cookie).not.toContain('sidebar_state=false');
  });

  it('모디파이어 없는 b, 또는 b가 아닌 단축키는 막지 않는다', () => {
    render(<PgDemoAppShell />);
    const plainB = fireEvent.keyDown(window, { key: 'b' });
    const cmdK = fireEvent.keyDown(window, { key: 'k', metaKey: true });
    expect(plainB).toBe(true);
    expect(cmdK).toBe(true);
  });

  it('언마운트 시 keydown 캡처 리스너를 정리한다', () => {
    const removeSpy = vi.spyOn(window, 'removeEventListener');
    const { unmount } = render(<PgDemoAppShell />);
    unmount();
    expect(removeSpy).toHaveBeenCalledWith('keydown', expect.any(Function), true);
    removeSpy.mockRestore();
  });
});

const RAIL_STEPS = [
  { n: '01', title: '파트너 등록', body: '등록 본문', note: '등록 보조' },
  { n: '02', title: 'RFP 수신', body: '수신 본문', note: '수신 보조' },
  { n: '03', title: '제안 제출', body: '제출 본문', note: '제출 보조' },
  { n: '04', title: '고객사 검토', body: '검토 본문', note: '검토 보조' },
  { n: '05', title: '계약 논의', body: '논의 본문', note: '논의 보조' },
];

describe('PgDemoAppShell — 창 위 프로세스 스테퍼 싱크', () => {
  beforeEach(stubMatchMedia);

  it('steps를 주면 초기(홈=1) 스텝 상세를 렌더한다', () => {
    render(<PgDemoAppShell steps={RAIL_STEPS} />);
    expect(screen.getByText('등록 본문')).toBeInTheDocument();
  });

  it('데모 페이지를 넘기면 스테퍼 상세가 동기화된다 (받은요청 → RFP 수신)', () => {
    render(<PgDemoAppShell steps={RAIL_STEPS} />);
    fireEvent.click(screen.getByRole('link', { name: '받은요청' }));
    expect(screen.getByText('수신 본문')).toBeInTheDocument();
    expect(screen.queryByText('등록 본문')).toBeNull();
  });
});

describe('PgDemoAppShell — 가이드 커서(종착 단계 없음)', () => {
  beforeEach(stubMatchMedia);

  it('진행 단계(홈)에서는 가이드 커서를 렌더한다', () => {
    render(<PgDemoAppShell />);
    expect(screen.getByTestId('demo-cursor')).toBeInTheDocument();
  });

  it('종착(메시지=4) 페이지에서는 가이드 커서를 렌더하지 않는다', () => {
    render(<PgDemoAppShell />);
    fireEvent.click(screen.getByRole('link', { name: '받은요청' })); // →2
    fireEvent.click(screen.getByRole('button', { name: 'open-rfp' })); // →3
    fireEvent.click(screen.getByRole('link', { name: '메시지' })); // →4
    expect(screen.getByTestId('page-messages')).toBeInTheDocument();
    expect(screen.queryByTestId('demo-cursor')).toBeNull();
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

