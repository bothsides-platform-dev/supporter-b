import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Suspense } from 'react';

class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
vi.stubGlobal('ResizeObserver', ResizeObserverStub);

const mockPathname = vi.fn(() => '/home');
const mockSearchParams = vi.fn(() => new URLSearchParams(''));
const mockRouterPush = vi.fn();

vi.mock('next/navigation', () => ({
  usePathname: () => mockPathname(),
  useSearchParams: () => mockSearchParams(),
  useRouter: () => ({ push: mockRouterPush }),
}));

const { mockUnread, mockUseNotifications } = vi.hoisted(() => ({
  mockUnread: { value: 0 },
  mockUseNotifications: vi.fn(),
}));
vi.mock('@/lib/hooks/useNotifications', () => ({
  useNotifications: (workspaceId?: string) => {
    mockUseNotifications(workspaceId);
    return { unreadCount: mockUnread.value };
  },
}));

vi.mock('@/lib/stores/theme', () => ({
  useThemeStore: (selector?: (s: { resolvedTheme: string; setTheme: () => void }) => unknown) => {
    const state = { resolvedTheme: 'light', setTheme: vi.fn() };
    return selector ? selector(state) : state;
  },
}));

vi.mock('@/lib/server/actions/workspace/switchWorkspaceAction', () => ({
  switchWorkspaceAction: vi.fn(),
}));

vi.mock('@/lib/hooks/usePlatform', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/hooks/usePlatform')>()),
  useIsMac: () => false,
}));

vi.mock('@/lib/hooks/useIsMobile', () => ({
  useIsMobile: () => false,
}));

import { SidebarProvider } from '@/components/ui/sidebar';
import { Sidebar } from '../Sidebar';

const buyerProps = {
  user: { id: 'u1', email: 'buyer@test.com', name: '홍길동', avatarUpdatedAt: null },
  workspaceType: 'buyer' as const,
  workspaces: [{ id: 'ws1', name: '구매사A', type: 'buyer' as const, status: 'active' as const, role: 'admin' as const, memberApprovalStatus: 'approved' as const, unreadCount: 0, logoUpdatedAt: null }],
  current: { id: 'ws1', name: '구매사A', type: 'buyer' as const, logoUpdatedAt: null },
};

const pgProps = {
  user: { id: 'u2', email: 'pg@test.com', name: '이순신', avatarUpdatedAt: null },
  workspaceType: 'pg' as const,
  workspaces: [{ id: 'ws2', name: '서포터페이', type: 'pg' as const, status: 'active' as const, role: 'admin' as const, memberApprovalStatus: 'approved' as const, unreadCount: 0, logoUpdatedAt: null }],
  current: { id: 'ws2', name: '서포터페이', type: 'pg' as const, logoUpdatedAt: null },
};

const sidebarProviderStyle = {
  '--sidebar-width': 'var(--shell-sidebar)',
  '--sidebar-width-icon': '3rem',
} as React.CSSProperties;

function renderSidebar(props: typeof buyerProps | typeof pgProps, defaultOpen = true) {
  return render(
    <SidebarProvider defaultOpen={defaultOpen} style={sidebarProviderStyle}>
      <Suspense fallback={null}>
        <Sidebar {...props} />
      </Suspense>
    </SidebarProvider>,
  );
}

beforeEach(() => {
  mockPathname.mockReturnValue('/home');
  mockSearchParams.mockReturnValue(new URLSearchParams(''));
  mockRouterPush.mockReset();
  mockUnread.value = 0;
  mockUseNotifications.mockClear();
});

afterEach(() => cleanup());

describe('Sidebar — notifications workspace scoping', () => {
  // 워크스페이스 전환 시 useNotifications 싱글턴이 스테일되지 않도록, Sidebar 가
  // 현재 워크스페이스 id 를 훅에 넘겨야 한다(전달 안 하면 reset 이 안 걸려 이전
  // 워크스페이스 알림이 남는다 — Phase 7b 버그).
  it('passes the active workspace id to useNotifications', () => {
    renderSidebar(buyerProps);
    expect(mockUseNotifications).toHaveBeenCalledWith('ws1');
  });

  it('passes the pg workspace id when on a pg workspace', () => {
    renderSidebar(pgProps);
    expect(mockUseNotifications).toHaveBeenCalledWith('ws2');
  });
});

describe('Sidebar — collapse trigger moved to the header', () => {
  // 접기 버튼은 Header(데스크톱)·MobileShellBar(모바일) 상단 바가 소유한다.
  // 사이드바 안에 두면 접힘 시 48px 레일에서 자리다툼이 나고, 모바일 상단 바와
  // 문법이 갈린다. 사이드바에 남는 포인터 어포던스는 우측 rail 뿐이다.
  it('does not render the collapse trigger inside the sidebar', () => {
    renderSidebar(buyerProps);
    expect(screen.queryByRole('button', { name: '사이드바 접기' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '사이드바 펼치기' })).not.toBeInTheDocument();
    expect(document.querySelector('[data-sidebar="trigger"]')).not.toBeInTheDocument();
  });
});

describe('Sidebar — footer utility toolbar', () => {
  it('keeps the theme control in a footer toolbar', () => {
    renderSidebar(buyerProps);
    const toolbar = document.querySelector(
      '[data-testid="sidebar-footer-toolbar"]',
    ) as HTMLElement | null;
    expect(toolbar).not.toBeNull();
    const footer = document.querySelector(
      '[data-slot="sidebar-footer"]',
    ) as HTMLElement | null;
    expect(footer).toContainElement(toolbar);
    expect(toolbar).toContainElement(screen.getByRole('button', { name: '다크 모드로 전환' }));
  });

  // 이전엔 justify-between 이었다. 200px 폭에서 그 규칙은 아이콘을 좌측 끝,
  // 라벨을 우측 끝으로 갈라놓아 위쪽 nav(아이콘+라벨 인접)와 문법이 어긋났다.
  // 펼침 상태의 좌측 정렬은 flex 기본값(justify-start)이 낸다 — 그래서 확인할 것은
  // "무조건 걸리는 justify 오버라이드가 없다"이지 특정 클래스의 존재가 아니다.
  // (접힘 전용 `group-data-[collapsible=icon]:justify-center` 는 예외로 허용.)
  it('left-aligns the footer controls so the icon column matches nav', () => {
    renderSidebar(buyerProps);
    const toolbar = document.querySelector('[data-testid="sidebar-footer-toolbar"]');
    expect(toolbar?.className).toMatch(/\bw-full\b/);
    expect(toolbar?.className).not.toMatch(/justify-between/);
    const unconditionalJustify = toolbar!.className
      .split(/\s+/)
      .filter((c) => c.startsWith('justify-'));
    expect(unconditionalJustify).toEqual([]);
  });

  it('keeps the 문의하기 icon and label adjacent, on the nav icon column', () => {
    renderSidebar(buyerProps);
    const contact = screen.getByRole('button', { name: '문의하기' });
    expect(contact.className).not.toMatch(/justify-between/);
    expect(contact.className).toMatch(/\bgap-2\.5\b/);
    expect(contact.className).toMatch(/\bpx-2\.5\b/);
  });

  // 클래스 문자열만 보면 판별력이 없다 — 그 클래스들은 상태와 무관하게 늘 붙어
  // 있어서 펼침으로 렌더해도 똑같이 통과한다. `group-data-` 변이가 실제로 걸리는
  // 조건(사이드바가 아이콘 모드로 접혀 있음)까지 같이 확인해야 의미가 생긴다.
  it('centers the footer toolbar in the 48px rail when collapsed', () => {
    renderSidebar(buyerProps, false);

    const sidebar = document.querySelector('[data-slot="sidebar"].group.peer');
    expect(sidebar).toHaveAttribute('data-state', 'collapsed');
    expect(sidebar).toHaveAttribute('data-collapsible', 'icon');

    const toolbar = document.querySelector('[data-testid="sidebar-footer-toolbar"]');
    expect(toolbar?.className).toMatch(/group-data-\[collapsible=icon\]:justify-center/);
  });
});

describe('Sidebar — collapse rail', () => {
  // rail 은 사이드바 우측 모서리의 포인터 전용 스트립이다. title 이 네이티브
  // 툴팁으로 그대로 노출되므로 한국어여야 하고, 상태에 따라 문구가 바뀌어야
  // 한다(헤더 트리거와 같은 규칙).
  it('labels the rail in Korean and tracks the collapsed state', async () => {
    const user = userEvent.setup();
    renderSidebar(buyerProps);
    const rail = document.querySelector('[data-slot="sidebar-rail"]') as HTMLElement;
    expect(rail).toHaveAttribute('title', '사이드바 접기');

    await user.click(rail);

    expect(rail).toHaveAttribute('title', '사이드바 펼치기');
  });

  // 키보드 도달 가능한 헤더 트리거(+⌘B)가 이미 접근 경로를 제공한다. rail 은
  // tabIndex=-1 인 중복 시각 어포던스이므로 a11y 트리에서 빼 이름 충돌을 없앤다.
  it('hides the redundant rail from the accessibility tree', () => {
    renderSidebar(buyerProps);
    const rail = document.querySelector('[data-slot="sidebar-rail"]');
    expect(rail).toHaveAttribute('aria-hidden', 'true');
    expect(rail).toHaveAttribute('tabindex', '-1');
  });

  // 커서가 리사이즈를 알리면 "드래그해서 폭 조절"로 읽힌다 — 실제 동작은 클릭 토글.
  it('uses a pointer cursor, not a resize cursor', () => {
    renderSidebar(buyerProps);
    const rail = document.querySelector('[data-slot="sidebar-rail"]');
    expect(rail?.className).toMatch(/cursor-pointer/);
    expect(rail?.className).not.toMatch(/cursor-[we]-resize/);
  });
});

describe('Sidebar — top nav items', () => {
  it('renders 홈 and 알림 links', () => {
    renderSidebar(buyerProps);
    expect(screen.getByRole('link', { name: '홈' })).toHaveAttribute('href', '/home');
    expect(screen.getByRole('link', { name: '알림' })).toHaveAttribute('href', '/notifications');
  });

  it('activates 홈 when pathname is /home', () => {
    mockPathname.mockReturnValue('/home');
    renderSidebar(buyerProps);
    expect(screen.getByRole('link', { name: '홈' })).toHaveAttribute('aria-current', 'page');
  });
});

describe('Sidebar — child routes', () => {
  it('activates RFP when pathname is a child of /rfp', () => {
    mockPathname.mockReturnValue('/rfp/rfp-1');
    renderSidebar(buyerProps);
    expect(screen.getByRole('link', { name: '견적 요청' })).toHaveAttribute('aria-current', 'page');
  });

  it('activates 받은 RFP when pathname is a child of /inbox', () => {
    mockPathname.mockReturnValue('/inbox/rfp-1');
    renderSidebar(pgProps);
    expect(screen.getByRole('link', { name: '받은 견적 요청' })).toHaveAttribute('aria-current', 'page');
  });
});

describe('Sidebar — buyer workspace', () => {
  it('renders RFP section with status sub-items and 새 RFP link', () => {
    renderSidebar(buyerProps);
    expect(screen.getByRole('link', { name: '견적 요청' })).toHaveAttribute('href', '/rfp');
    expect(screen.getByRole('link', { name: '진행중' })).toHaveAttribute('href', '/rfp?status=active');
    expect(screen.getByRole('link', { name: '마감' })).toHaveAttribute('href', '/rfp?status=closed');
    expect(screen.getByRole('link', { name: '새 견적 요청' })).toHaveAttribute('href', '/rfp-create');
  });

  it('activates the matching status sub-item on /rfp?status=active', () => {
    mockPathname.mockReturnValue('/rfp');
    mockSearchParams.mockReturnValue(new URLSearchParams('status=active'));
    renderSidebar(buyerProps);
    expect(screen.getByRole('link', { name: '진행중' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: '견적 요청' })).not.toHaveAttribute('aria-current');
  });

  it('does NOT render the inbox section for buyer', () => {
    renderSidebar(buyerProps);
    expect(screen.queryByText('받은 견적 요청')).not.toBeInTheDocument();
  });
});

describe('Sidebar — pg workspace', () => {
  it('renders 받은 RFP section with status sub-items and no 새 RFP link', () => {
    renderSidebar(pgProps);
    expect(screen.getByRole('link', { name: /받은 견적 요청/ })).toHaveAttribute('href', '/inbox');
    expect(screen.getByRole('link', { name: '견적 보냄' })).toHaveAttribute('href', '/inbox?status=submitted');
    expect(screen.queryByRole('link', { name: '새 견적 요청' })).not.toBeInTheDocument();
  });
});

describe('Sidebar — search moved to header', () => {
  it('no longer renders a search trigger in the sidebar', () => {
    renderSidebar(buyerProps);
    expect(screen.queryByRole('button', { name: /검색/ })).not.toBeInTheDocument();
  });
});

describe('Sidebar — settings section', () => {
  it('renders profile and members sub-links for both workspaces', () => {
    renderSidebar(buyerProps);
    expect(screen.getByRole('link', { name: '프로필' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '멤버' })).toBeInTheDocument();
  });
});

describe('Sidebar — user menu (mobile reachability)', () => {
  it('renders a user menu so logout/settings stay reachable in the mobile drawer', () => {
    // Regression: the user menu (settings/logout + identity) moved to the
    // desktop-only Header; the mobile drawer must still expose it.
    renderSidebar(buyerProps);
    expect(screen.getByRole('button', { name: '사용자 메뉴' })).toBeInTheDocument();
  });
});

describe('Sidebar — notification badge', () => {
  it('hides the unread badge when count is 0', () => {
    mockUnread.value = 0;
    renderSidebar(buyerProps);
    expect(screen.queryByTestId('unread-badge')).not.toBeInTheDocument();
  });

  it('shows the unread badge on the 알림 link when count > 0', () => {
    mockUnread.value = 3;
    renderSidebar(buyerProps);
    // Badge renders twice: once in the icon wrapper (collapsed overlay) and once in the row (expanded).
    const badges = screen.getAllByTestId('unread-badge');
    expect(badges.length).toBeGreaterThan(0);
    badges.forEach((badge) => expect(badge).toHaveTextContent('3'));
    const notifLink = document.querySelector('a[href="/notifications"]');
    badges.forEach((badge) => expect(notifLink).toContainElement(badge));
  });

  // 미읽음은 경고도 오류도 아니다. DESIGN.md §7.3 은 미읽음 카운트를 primary 로
  // 규정한다 — warning/error 를 쓰면 칩 색 매핑 하드룰(보류→warning, 오류→error)과
  // 충돌하고, 같은 사이드바 안에서 같은 의미에 색이 갈린다.
  it('paints the unread badge with the primary token, not warning or error', () => {
    mockUnread.value = 3;
    renderSidebar(buyerProps);
    const badge = screen.getAllByTestId('unread-badge')[0];
    expect(badge.className).toMatch(/--md-sys-color-primary\)/);
    expect(badge.className).not.toMatch(/--md-sys-color-(warning|error)\)/);
  });
});
