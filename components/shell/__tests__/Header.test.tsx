import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const push = vi.fn();
const assign = vi.fn();
const mockPathname = vi.fn(() => '/home');
const mockSearchParams = vi.fn(() => new URLSearchParams(''));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push, back: vi.fn(), forward: vi.fn() }),
  usePathname: () => mockPathname(),
  useSearchParams: () => mockSearchParams(),
}));

vi.mock('@/lib/stores/ui', () => ({
  useUIStore: (selector?: (s: { openCommandPalette: () => void }) => unknown) => {
    const state = { openCommandPalette: vi.fn() };
    return selector ? selector(state) : state;
  },
}));

vi.mock('@/lib/hooks/usePlatform', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/hooks/usePlatform')>()),
  useIsMac: () => false,
}));

vi.mock('@/lib/http', () => ({
  http: { post: vi.fn() },
}));

// SidebarProvider 가 useIsMobile → matchMedia 를 구독한다(jsdom 미구현).
vi.mock('@/lib/hooks/useIsMobile', () => ({
  useIsMobile: () => false,
}));

class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
vi.stubGlobal('ResizeObserver', ResizeObserverStub);

import { Header } from '../Header';
import { SidebarProvider } from '@/components/ui/sidebar';
import { http } from '@/lib/http';
import { useHeaderActionsStore } from '@/lib/stores/header-actions';
import type { ResponsePromise } from 'ky';

const user = { id: 'u-1', name: '홍길동', email: 'gildong@test.com', avatarUpdatedAt: null };

// Header 가 사이드바 접기 트리거를 품으면서 useSidebar() 에 의존한다 —
// SidebarProvider 밖 렌더는 throw 한다(components/ui/sidebar.tsx).
function renderHeader() {
  return render(
    <SidebarProvider>
      <Header user={user} workspaceType="buyer" />
    </SidebarProvider>,
  );
}

beforeEach(() => {
  push.mockReset();
  assign.mockReset();
  useHeaderActionsStore.setState({ refreshSlot: null });
  mockPathname.mockReturnValue('/home');
  mockSearchParams.mockReturnValue(new URLSearchParams(''));
  Object.defineProperty(window, 'location', {
    configurable: true,
    value: { assign },
  });
  vi.stubGlobal('fetch', vi.fn(() => Promise.resolve({ ok: true } as Response)));
  vi.mocked(http.post).mockReturnValue(Promise.resolve({}) as unknown as ResponsePromise);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('Header', () => {
  it('renders the URL-derived breadcrumb', () => {
    mockPathname.mockReturnValue('/rfp');
    mockSearchParams.mockReturnValue(new URLSearchParams('status=active'));
    renderHeader();
    expect(screen.getByText('진행중')).toBeInTheDocument();
  });

  // 접기 버튼은 사이드바 푸터가 아니라 헤더 맨 왼쪽에 산다 — 접힘/펼침과
  // 무관하게 자리가 고정되고, 모바일 상단 바(MobileShellBar)와 문법이 같아진다.
  it('renders the sidebar collapse trigger', () => {
    renderHeader();
    expect(screen.getByRole('button', { name: '사이드바 접기' })).toBeInTheDocument();
  });

  it('places the collapse trigger before the breadcrumb', () => {
    mockPathname.mockReturnValue('/rfp');
    renderHeader();
    const trigger = screen.getByRole('button', { name: '사이드바 접기' });
    const header = trigger.closest('header');
    expect(header).not.toBeNull();
    expect(header!.firstElementChild).toBe(trigger);
  });

  it('toggles the sidebar when the header trigger is clicked', async () => {
    const u = userEvent.setup();
    renderHeader();
    await u.click(screen.getByRole('button', { name: '사이드바 접기' }));
    expect(screen.getByRole('button', { name: '사이드바 펼치기' })).toBeInTheDocument();
  });

  it('renders the search bar', () => {
    renderHeader();
    expect(screen.getByRole('button', { name: /검색/ })).toBeInTheDocument();
  });

  it('renders the user menu trigger', () => {
    renderHeader();
    expect(screen.getByRole('button', { name: '사용자 메뉴' })).toBeInTheDocument();
  });

  it('refreshSlot이 없으면 새로고침 버튼을 렌더하지 않는다', () => {
    renderHeader();
    expect(screen.queryByRole('button', { name: /새로고침|방금 전|분 전/ })).not.toBeInTheDocument();
  });

  it('refreshSlot이 있으면 새로고침 버튼을 렌더한다', () => {
    useHeaderActionsStore.setState({
      refreshSlot: { onRefresh: vi.fn(), lastRefreshedAt: new Date(), isRefreshing: false },
    });
    renderHeader();
    expect(screen.getByRole('button', { name: /새로고침/ })).toBeInTheDocument();
  });

  it('refreshSlot.isRefreshing=true 이면 새로고침 버튼이 disabled', () => {
    useHeaderActionsStore.setState({
      refreshSlot: { onRefresh: vi.fn(), lastRefreshedAt: new Date(), isRefreshing: true },
    });
    renderHeader();
    expect(screen.getByRole('button', { name: /새로고침/ })).toBeDisabled();
  });

  it('logs out via the user menu', async () => {
    const u = userEvent.setup();
    renderHeader();
    await u.click(screen.getByRole('button', { name: '사용자 메뉴' }));
    await u.click(await screen.findByText('로그아웃'));
    await waitFor(() => expect(assign).toHaveBeenCalledWith('/logout'));
  });
});
