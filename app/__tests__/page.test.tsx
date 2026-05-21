// 루트 페이지(/) 인증 redirect 단위 테스트.
// 로그인된 사용자가 / 에 진입하면 /home 으로 즉시 redirect되어야 한다.
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockRedirect = vi.hoisted(() => vi.fn());
const mockAuth = vi.hoisted(() => vi.fn());

vi.mock('next/navigation', () => ({ redirect: mockRedirect }));
vi.mock('@/auth', () => ({ auth: mockAuth }));

vi.mock('@/components/landing/LandingHero', () => ({
  LandingHero: () => null,
}));
vi.mock('@/components/landing/LandingHeaderNav', () => ({
  LandingHeaderNav: async () => null,
}));
vi.mock('@/lib/site-config', () => ({
  siteConfig: { name: 'Test', url: 'https://test.com', description: 'Test' },
}));

import RootPage from '../page';

describe('RootPage — 로그인 상태 /home redirect', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('buyer 워크스페이스로 로그인된 사용자는 /home으로 redirect된다', async () => {
    mockAuth.mockResolvedValue({
      user: { id: 'u-1', workspaceId: 'ws-1', workspaceType: 'buyer' },
    });

    await RootPage();

    expect(mockRedirect).toHaveBeenCalledWith('/home');
  });

  it('pg 워크스페이스로 로그인된 사용자도 /home으로 redirect된다', async () => {
    mockAuth.mockResolvedValue({
      user: { id: 'u-1', workspaceId: 'ws-2', workspaceType: 'pg' },
    });

    await RootPage();

    expect(mockRedirect).toHaveBeenCalledWith('/home');
  });

  it('미로그인(null session) 사용자는 redirect 없이 랜딩 페이지를 렌더한다', async () => {
    mockAuth.mockResolvedValue(null);

    await RootPage();

    expect(mockRedirect).not.toHaveBeenCalled();
  });

  it('workspaceId 없는 불완전한 세션은 redirect하지 않는다', async () => {
    mockAuth.mockResolvedValue({
      user: { id: 'u-1', workspaceId: null, workspaceType: null },
    });

    await RootPage();

    expect(mockRedirect).not.toHaveBeenCalled();
  });
});
