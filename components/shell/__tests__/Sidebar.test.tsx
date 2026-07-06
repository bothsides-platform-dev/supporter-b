import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, within } from '@testing-library/react';
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

vi.mock('@/hooks/use-mobile', () => ({
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

function renderSidebar(props: typeof buyerProps | typeof pgProps) {
  return render(
    <SidebarProvider style={sidebarProviderStyle}>
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

describe('Sidebar — icon toggle', () => {
  it('renders the collapse trigger inside the sidebar', () => {
    renderSidebar(buyerProps);
    const inner = document.querySelector('[data-slot="sidebar-inner"]');
    expect(inner).not.toBeNull();
    const trigger = screen.getByRole('button', { name: '사이드바 접기' });
    expect(inner).toContainElement(trigger);
  });

  it('collapses when SidebarTrigger is clicked on desktop', async () => {
    const user = userEvent.setup();
    renderSidebar(buyerProps);
    const rail = document.querySelector('[data-slot="sidebar"]');
    expect(rail).toHaveAttribute('data-state', 'expanded');

    await user.click(screen.getByRole('button', { name: '사이드바 접기' }));

    expect(rail).toHaveAttribute('data-state', 'collapsed');
  });

  it('trigger is located in the sidebar footer', () => {
    renderSidebar(buyerProps);
    const footer = document.querySelector('[data-slot="sidebar-footer"]');
    const trigger = screen.getByRole('button', { name: '사이드바 접기' });
    expect(footer).toContainElement(trigger);
  });

  it('shows "사이드바 접기" visible label when sidebar is expanded', () => {
    renderSidebar(buyerProps);
    expect(screen.getByText('사이드바 접기')).toBeVisible();
  });

  it('keeps collapse accessible via aria-label when expanded and after collapse', async () => {
    const user = userEvent.setup();
    renderSidebar(buyerProps);
    expect(screen.getByRole('button', { name: '사이드바 접기' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '사이드바 접기' }));

    expect(screen.getByRole('button', { name: '사이드바 펼치기' })).toBeInTheDocument();
  });
});

describe('Sidebar — footer utility toolbar', () => {
  it('groups theme and collapse controls in a footer toolbar', () => {
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
    expect(toolbar).toContainElement(screen.getByRole('button', { name: '사이드바 접기' }));
  });

  it('spreads theme and collapse controls with justify-between', () => {
    renderSidebar(buyerProps);
    const toolbar = document.querySelector('[data-testid="sidebar-footer-toolbar"]');
    expect(toolbar?.className).toMatch(/justify-between/);
    expect(toolbar?.className).toMatch(/\bw-full\b/);
  });

  it('uses a vertical stack layout class when sidebar is collapsed', async () => {
    const user = userEvent.setup();
    renderSidebar(buyerProps);
    const toolbar = document.querySelector('[data-testid="sidebar-footer-toolbar"]');
    expect(toolbar?.className).toMatch(/flex-row/);

    await user.click(screen.getByRole('button', { name: '사이드바 접기' }));

    expect(toolbar?.className).toMatch(/group-data-\[collapsible=icon\]:flex-col/);
    const trigger = screen.getByRole('button', { name: '사이드바 펼치기' });
    expect(within(trigger).queryByText('사이드바 접기')).not.toBeInTheDocument();
    expect(within(trigger).queryByText('사이드바 펼치기')).not.toBeInTheDocument();
  });

  it('renders collapse control as icon + label row when expanded', () => {
    renderSidebar(buyerProps);
    const trigger = screen.getByRole('button', { name: '사이드바 접기' });
    expect(trigger.className).toMatch(/\bpx-2\b/);
    expect(trigger.className).toMatch(/\bgap-1\.5\b/);
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
});
