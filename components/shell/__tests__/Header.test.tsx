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

import { Header } from '../Header';
import { http } from '@/lib/http';
import { useHeaderActionsStore } from '@/lib/stores/header-actions';
import type { ResponsePromise } from 'ky';

const user = { id: 'u-1', name: '홍길동', email: 'gildong@test.com', avatarUpdatedAt: null };

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
    render(<Header user={user} workspaceType="buyer" />);
    expect(screen.getByText('진행중')).toBeInTheDocument();
  });

  it('does not render the sidebar collapse trigger', () => {
    render(<Header user={user} workspaceType="buyer" />);
    expect(screen.queryByRole('button', { name: '사이드바 접기' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '사이드바 펼치기' })).not.toBeInTheDocument();
  });

  it('renders the search bar', () => {
    render(<Header user={user} workspaceType="buyer" />);
    expect(screen.getByRole('button', { name: /검색/ })).toBeInTheDocument();
  });

  it('renders the user menu trigger', () => {
    render(<Header user={user} workspaceType="buyer" />);
    expect(screen.getByRole('button', { name: '사용자 메뉴' })).toBeInTheDocument();
  });

  it('refreshSlot이 없으면 새로고침 버튼을 렌더하지 않는다', () => {
    render(<Header user={user} workspaceType="buyer" />);
    expect(screen.queryByRole('button', { name: /새로고침|방금 전|분 전/ })).not.toBeInTheDocument();
  });

  it('refreshSlot이 있으면 새로고침 버튼을 렌더한다', () => {
    useHeaderActionsStore.setState({
      refreshSlot: { onRefresh: vi.fn(), lastRefreshedAt: new Date(), isRefreshing: false },
    });
    render(<Header user={user} workspaceType="buyer" />);
    expect(screen.getByRole('button', { name: /새로고침/ })).toBeInTheDocument();
  });

  it('refreshSlot.isRefreshing=true 이면 새로고침 버튼이 disabled', () => {
    useHeaderActionsStore.setState({
      refreshSlot: { onRefresh: vi.fn(), lastRefreshedAt: new Date(), isRefreshing: true },
    });
    render(<Header user={user} workspaceType="buyer" />);
    expect(screen.getByRole('button', { name: /새로고침/ })).toBeDisabled();
  });

  it('logs out via the user menu', async () => {
    const u = userEvent.setup();
    render(<Header user={user} workspaceType="buyer" />);
    await u.click(screen.getByRole('button', { name: '사용자 메뉴' }));
    await u.click(await screen.findByText('로그아웃'));
    await waitFor(() => expect(assign).toHaveBeenCalledWith('/logout'));
  });
});
