// (app)/layout 인증 가드 단위 테스트.
//
// 핵심 회귀: 미들웨어(proxy.ts)는 isAuthenticated = !!req.auth (JWT user 존재)로
// 판정하지만, 이 레이아웃은 workspaceId/workspaceType + 실제 DB 멤버십까지 요구한다.
// "JWT는 유효한데 워크스페이스를 못 쓰는" 세션을 /login 으로 보내면 미들웨어가
// 인증 사용자를 /home 으로 되튕겨 무한 리다이렉트(ERR_TOO_MANY_REDIRECTS)가 된다.
// → 그런 세션은 세션을 비우는 /logout 으로 보내야 루프가 끊긴다.
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockRedirect = vi.hoisted(() =>
  vi.fn((url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`);
  }),
);
const mockAuth = vi.hoisted(() => vi.fn());
const mockListForUser = vi.hoisted(() => vi.fn());

vi.mock('next/navigation', () => ({ redirect: mockRedirect }));
vi.mock('@/auth', () => ({ auth: mockAuth }));
vi.mock('@/lib/server/repositories/factory', () => ({
  getWorkspaceRepo: () => Promise.resolve({ listForUser: mockListForUser }),
}));
vi.mock('@/lib/observability/sentry-user', () => ({ setSentryUser: () => {} }));
vi.mock('@/components/shell/AppSidebarLayout', () => ({
  AppSidebarLayout: ({ children }: { children: React.ReactNode }) => children,
}));
vi.mock('@/components/shell/Toaster', () => ({
  ToasterProvider: ({ children }: { children: React.ReactNode }) => children,
}));
vi.mock('@/components/shell/NotificationDrawer', () => ({
  NotificationDrawer: () => null,
}));
vi.mock('@/components/shell/CommandPalette', () => ({
  CommandPalette: () => null,
}));
vi.mock('@/components/shell/GlobalShortcuts', () => ({
  GlobalShortcuts: () => null,
}));
vi.mock('@/components/observability/SentryUserContext', () => ({
  SentryUserContext: () => null,
}));

import AppLayout from '../layout';

const FULL_SESSION = {
  user: {
    id: 'u-1',
    email: 'a@b.com',
    name: 'A',
    workspaceId: 'ws-1',
    workspaceType: 'buyer',
    role: 'admin',
  },
};

describe('AppLayout 인증 가드 — 무한 리다이렉트 루프 방지', () => {
  beforeEach(() => {
    mockRedirect.mockClear();
    mockAuth.mockReset();
    mockListForUser.mockReset();
  });

  it('JWT에 워크스페이스가 없는(인증된) 세션은 /logout 으로 보낸다', async () => {
    mockAuth.mockResolvedValue({
      user: { id: 'u-1', workspaceId: null, workspaceType: null },
    });

    await expect(AppLayout({ children: null })).rejects.toThrow('NEXT_REDIRECT');
    expect(mockRedirect).toHaveBeenCalledWith('/logout');
  });

  it('DB 멤버십이 비어있으면(인증된) /logout 으로 보낸다', async () => {
    mockAuth.mockResolvedValue(FULL_SESSION);
    mockListForUser.mockResolvedValue([]);

    await expect(AppLayout({ children: null })).rejects.toThrow('NEXT_REDIRECT');
    expect(mockRedirect).toHaveBeenCalledWith('/logout');
  });

  it('user.id 자체가 없으면 /login 으로 보낸다 (미인증, 루프 아님)', async () => {
    mockAuth.mockResolvedValue({ user: { id: null } });

    await expect(AppLayout({ children: null })).rejects.toThrow('NEXT_REDIRECT');
    expect(mockRedirect).toHaveBeenCalledWith('/login');
  });
});
