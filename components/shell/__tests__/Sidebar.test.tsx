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

const { mockUnread } = vi.hoisted(() => ({ mockUnread: { value: 0 } }));
vi.mock('@/lib/hooks/useNotifications', () => ({
  useNotifications: () => ({ unreadCount: mockUnread.value }),
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
  user: { id: 'u1', email: 'buyer@test.com', name: '홍길동' },
  workspaceType: 'buyer' as const,
  workspaces: [{ id: 'ws1', name: '구매사A', type: 'buyer' as const, role: 'admin' as const }],
  current: { id: 'ws1', name: '구매사A', type: 'buyer' as const },
};

const pgProps = {
  user: { id: 'u2', email: 'pg@test.com', name: '이순신' },
  workspaceType: 'pg' as const,
  workspaces: [{ id: 'ws2', name: '서포터페이', type: 'pg' as const, role: 'admin' as const }],
  current: { id: 'ws2', name: '서포터페이', type: 'pg' as const },
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
});

afterEach(() => cleanup());

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

  it('shows "접기" text label when sidebar is expanded', () => {
    renderSidebar(buyerProps);
    expect(screen.getByText('접기')).toBeInTheDocument();
  });

  it('shows "열기" text label after sidebar is collapsed', async () => {
    const user = userEvent.setup();
    renderSidebar(buyerProps);
    await user.click(screen.getByRole('button', { name: '사이드바 접기' }));
    expect(screen.getByText('열기')).toBeInTheDocument();
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

describe('Sidebar — buyer workspace', () => {
  it('renders RFP as a top nav link without status sub-items', () => {
    renderSidebar(buyerProps);
    expect(screen.getByRole('link', { name: 'RFP' })).toHaveAttribute('href', '/rfp');
    expect(screen.queryByRole('link', { name: '진행중' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: '계약완료' })).not.toBeInTheDocument();
  });

  it('does NOT render the sidebar compose shortcut', () => {
    renderSidebar(buyerProps);
    expect(screen.queryByRole('link', { name: /새 RFP 작성/ })).not.toBeInTheDocument();
  });

  it('does NOT render the inbox section for buyer', () => {
    renderSidebar(buyerProps);
    expect(screen.queryByText('받은 RFP')).not.toBeInTheDocument();
  });
});

describe('Sidebar — pg workspace', () => {
  it('renders 받은 RFP as a top nav link without status sub-items', () => {
    renderSidebar(pgProps);
    expect(screen.getByRole('link', { name: '받은 RFP' })).toHaveAttribute('href', '/inbox');
    expect(screen.queryByRole('link', { name: '제출완료' })).not.toBeInTheDocument();
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
    const badge = screen.getByTestId('unread-badge');
    expect(badge).toHaveTextContent('3');
    expect(document.querySelector('a[href="/notifications"]')).toContainElement(badge);
  });
});
