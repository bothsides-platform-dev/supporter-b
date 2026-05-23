import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
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

function renderSidebar(props: typeof buyerProps | typeof pgProps) {
  return render(
    <Suspense fallback={null}>
      <Sidebar {...props} />
    </Suspense>,
  );
}

beforeEach(() => {
  mockPathname.mockReturnValue('/home');
  mockSearchParams.mockReturnValue(new URLSearchParams(''));
  mockRouterPush.mockReset();
  mockUnread.value = 0;
});

afterEach(() => cleanup());

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
  it('renders the RFP section header as a navigable link plus status items', () => {
    renderSidebar(buyerProps);
    expect(screen.getByRole('link', { name: 'RFP' })).toHaveAttribute('href', '/rfp');
    expect(screen.getByRole('link', { name: '진행중' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '계약완료' })).toBeInTheDocument();
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
  it('renders the 받은 RFP section header as a link plus status items', () => {
    renderSidebar(pgProps);
    expect(screen.getByRole('link', { name: '받은 RFP' })).toHaveAttribute('href', '/inbox');
    expect(screen.getByRole('link', { name: '제출완료' })).toBeInTheDocument();
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
