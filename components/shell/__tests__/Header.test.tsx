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

import { Header } from '../Header';

const user = { name: '홍길동', email: 'gildong@test.com' };

beforeEach(() => {
  push.mockReset();
  assign.mockReset();
  mockPathname.mockReturnValue('/home');
  mockSearchParams.mockReturnValue(new URLSearchParams(''));
  Object.defineProperty(window, 'location', {
    configurable: true,
    value: { assign },
  });
  vi.stubGlobal('fetch', vi.fn(() => Promise.resolve({ ok: true } as Response)));
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

  it('renders the search bar', () => {
    render(<Header user={user} workspaceType="buyer" />);
    expect(screen.getByRole('button', { name: /검색/ })).toBeInTheDocument();
  });

  it('renders the user menu trigger', () => {
    render(<Header user={user} workspaceType="buyer" />);
    expect(screen.getByRole('button', { name: '사용자 메뉴' })).toBeInTheDocument();
  });

  it('logs out via the user menu', async () => {
    const u = userEvent.setup();
    render(<Header user={user} workspaceType="buyer" />);
    await u.click(screen.getByRole('button', { name: '사용자 메뉴' }));
    await u.click(await screen.findByText('로그아웃'));
    await waitFor(() =>
      expect(fetch).toHaveBeenCalledWith('/logout', { method: 'POST' }),
    );
    await waitFor(() => expect(assign).toHaveBeenCalledWith('/login'));
  });
});
