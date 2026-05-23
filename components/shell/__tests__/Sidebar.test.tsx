import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { Suspense } from 'react';

// ── mocks (declared before imports that trigger module resolution) ────────

const mockPathname = vi.fn(() => '/home');
const mockSearchParams = vi.fn(() => new URLSearchParams(''));
const mockRouterPush = vi.fn();
const mockRouterBack = vi.fn();

vi.mock('next/navigation', () => ({
  usePathname: () => mockPathname(),
  useSearchParams: () => mockSearchParams(),
  useRouter: () => ({ push: mockRouterPush, back: mockRouterBack }),
}));

// Use vi.hoisted so the mockUnread value is mutable across tests
const { mockUnread } = vi.hoisted(() => ({ mockUnread: { value: 0 } }));

vi.mock('@/lib/hooks/useNotifications', () => ({
  useNotifications: () => ({ unreadCount: mockUnread.value }),
}));

vi.mock('@/lib/stores/theme', () => ({
  useThemeStore: () => ({ resolvedTheme: 'light', setTheme: vi.fn() }),
}));

vi.mock('@/lib/stores/ui', () => ({
  useUIStore: () => ({
    openCommandPalette: vi.fn(),
    openNotificationDrawer: vi.fn(),
  }),
}));

vi.mock('@/lib/stores/sidebar-sections', () => {
  const state = { collapsed: {} as Record<string, boolean> };
  return {
    useSidebarSectionsStore: (selector?: (s: typeof state & { isCollapsed: (id: string) => boolean; toggle: (id: string) => void }) => unknown) => {
      const fullState = {
        ...state,
        isCollapsed: (id: string) => state.collapsed[id] ?? false,
        toggle: (id: string) => { state.collapsed[id] = !state.collapsed[id]; },
      };
      return selector ? selector(fullState) : fullState;
    },
  };
});

vi.mock('@/lib/server/actions/workspace/switchWorkspaceAction', () => ({
  switchWorkspaceAction: vi.fn(),
}));

vi.mock('@/lib/hooks/usePlatform', () => ({
  useIsMac: () => false,
  formatModifierShortcut: (key: string) => `Ctrl+${key}`,
}));

// ── test fixtures ─────────────────────────────────────────────────────────

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

// Wrap in Suspense since the component uses useSearchParams
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
  mockUnread.value = 0; // reset unread count between tests
  // Radix portals can land in body — don't reset location
  Object.defineProperty(window, 'location', {
    configurable: true,
    value: { assign: vi.fn() },
  });
});

afterEach(() => {
  cleanup();
});

describe('Sidebar — buyer workspace', () => {
  it('renders the RFP section heading', () => {
    renderSidebar(buyerProps);
    expect(screen.getByText('RFP')).toBeInTheDocument();
  });

  it('renders buyer RFP status items', () => {
    renderSidebar(buyerProps);
    expect(screen.getByText('작성중')).toBeInTheDocument();
    expect(screen.getByText('진행중')).toBeInTheDocument();
    expect(screen.getByText('마감')).toBeInTheDocument();
    expect(screen.getByText('계약완료')).toBeInTheDocument();
  });

  it('renders compose icon button for buyer', () => {
    renderSidebar(buyerProps);
    expect(screen.getByRole('link', { name: /새 RFP 작성/ })).toBeInTheDocument();
  });

  it('does NOT render inbox section for buyer', () => {
    renderSidebar(buyerProps);
    expect(screen.queryByText('받은 RFP')).not.toBeInTheDocument();
  });
});

describe('Sidebar — pg workspace', () => {
  it('renders the 받은 RFP section heading', () => {
    renderSidebar(pgProps);
    expect(screen.getByText('받은 RFP')).toBeInTheDocument();
  });

  it('renders pg inbox status items', () => {
    renderSidebar(pgProps);
    expect(screen.getByText('신규')).toBeInTheDocument();
    expect(screen.getByText('제출완료')).toBeInTheDocument();
  });

  it('does NOT render compose icon button for pg', () => {
    renderSidebar(pgProps);
    expect(screen.queryByRole('link', { name: /새 RFP 작성/ })).not.toBeInTheDocument();
  });

  it('does NOT render buyer-only RFP items (계약완료) for pg', () => {
    renderSidebar(pgProps);
    // '작성중' appears in both buyer and pg sections as a status label,
    // but '계약완료' and '진행중' are buyer-only.
    expect(screen.queryByText('계약완료')).not.toBeInTheDocument();
    expect(screen.queryByText('진행중')).not.toBeInTheDocument();
  });
});

describe('Sidebar — settings section (both workspaces)', () => {
  it('renders settings section for buyer', () => {
    renderSidebar(buyerProps);
    expect(screen.getByText('설정')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '프로필' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '멤버' })).toBeInTheDocument();
    // 알림 설정 항목은 제거됨 — 별도 설정 UI가 생기기 전까지 노출하지 않는다.
    expect(screen.queryByRole('link', { name: '알림 설정' })).not.toBeInTheDocument();
  });

  it('renders settings section for pg', () => {
    renderSidebar(pgProps);
    expect(screen.getByText('설정')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '프로필' })).toBeInTheDocument();
  });
});

describe('Sidebar — active state', () => {
  it('activates a status item when pathname and searchParam match', () => {
    mockPathname.mockReturnValue('/rfp');
    mockSearchParams.mockReturnValue(new URLSearchParams('status=active'));
    renderSidebar(buyerProps);
    const link = screen.getByRole('link', { name: '진행중' });
    expect(link).toHaveAttribute('aria-current', 'page');
  });

  it('does not activate any status item when searchParam is absent', () => {
    mockPathname.mockReturnValue('/rfp');
    mockSearchParams.mockReturnValue(new URLSearchParams(''));
    renderSidebar(buyerProps);
    const links = screen.getAllByRole('link');
    links.forEach((link) => {
      if (['작성중', '진행중', '마감', '계약완료'].includes(link.textContent ?? '')) {
        expect(link).not.toHaveAttribute('aria-current', 'page');
      }
    });
  });

  it('activates 홈 link when pathname is /home', () => {
    mockPathname.mockReturnValue('/home');
    renderSidebar(buyerProps);
    expect(screen.getByRole('link', { name: '홈' })).toHaveAttribute('aria-current', 'page');
  });
});

describe('Sidebar — notification badge', () => {
  it('does not show unread badge when unreadCount is 0', () => {
    mockUnread.value = 0;
    renderSidebar(buyerProps);
    expect(screen.queryByTestId('unread-badge')).not.toBeInTheDocument();
  });

  it('shows unread badge on 알림 nav item when unreadCount > 0', () => {
    mockUnread.value = 3;
    renderSidebar(buyerProps);
    const badge = screen.getByTestId('unread-badge');
    expect(badge).toBeInTheDocument();
    expect(badge).toHaveTextContent('3');
    // Badge should be inside the /notifications link (not 알림 설정)
    // Use document.querySelector since the accessible name now includes badge text
    const bellLink = document.querySelector('a[href="/notifications"]');
    expect(bellLink).not.toBeNull();
    expect(bellLink).toContainElement(badge);
  });
});
