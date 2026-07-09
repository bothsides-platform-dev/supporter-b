// /tutorial 스텁 페이지 가드 단위 테스트. 본체(실제 튜토리얼 콘텐츠)는 후속 PR.
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockRedirect = vi.hoisted(() =>
  vi.fn((url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`);
  }),
);
const mockAuth = vi.hoisted(() => vi.fn());
const getOnboardingMock = vi.hoisted(() => vi.fn());

vi.mock('next/navigation', () => ({ redirect: mockRedirect }));
vi.mock('@/auth', () => ({ auth: mockAuth }));
vi.mock('@/lib/server/repositories/factory', () => ({
  getUserRepo: async () => ({ getOnboarding: getOnboardingMock }),
}));

import TutorialPage from '../page';

describe('TutorialPage 가드', () => {
  beforeEach(() => {
    mockRedirect.mockClear();
    mockAuth.mockReset();
    getOnboardingMock.mockReset();
  });

  it('미인증 세션은 /login?next=/tutorial 로 보낸다', async () => {
    mockAuth.mockResolvedValue(null);
    await expect(TutorialPage()).rejects.toThrow('NEXT_REDIRECT');
    expect(mockRedirect).toHaveBeenCalledWith('/login?next=/tutorial');
  });

  it('워크스페이스가 없는 세션은 /logout 으로 보낸다', async () => {
    mockAuth.mockResolvedValue({ user: { id: 'u-1', workspaceId: null, workspaceType: null } });
    await expect(TutorialPage()).rejects.toThrow('NEXT_REDIRECT');
    expect(mockRedirect).toHaveBeenCalledWith('/logout');
  });

  it('buyerTutorial 이 completed 인 buyer 는 /home 으로 되돌린다', async () => {
    mockAuth.mockResolvedValue({
      user: { id: 'u-1', workspaceId: 'ws-1', workspaceType: 'buyer' },
    });
    getOnboardingMock.mockResolvedValue({ _v: 1, buyerTutorial: { completedAt: '2026-01-01T00:00:00Z' } });
    await expect(TutorialPage()).rejects.toThrow('NEXT_REDIRECT');
    expect(mockRedirect).toHaveBeenCalledWith('/home');
  });

  it('pgTutorial 이 completed 인 pg 는 /home 으로 되돌린다', async () => {
    mockAuth.mockResolvedValue({
      user: { id: 'u-2', workspaceId: 'ws-2', workspaceType: 'pg' },
    });
    getOnboardingMock.mockResolvedValue({ _v: 1, pgTutorial: { completedAt: '2026-01-01T00:00:00Z' } });
    await expect(TutorialPage()).rejects.toThrow('NEXT_REDIRECT');
    expect(mockRedirect).toHaveBeenCalledWith('/home');
  });

  it('미완료 buyer 는 리다이렉트 없이 플레이스홀더를 렌더한다', async () => {
    mockAuth.mockResolvedValue({
      user: { id: 'u-1', workspaceId: 'ws-1', workspaceType: 'buyer' },
    });
    getOnboardingMock.mockResolvedValue({ _v: 1 });
    const result = await TutorialPage();
    expect(mockRedirect).not.toHaveBeenCalled();
    expect(result).toBeTruthy();
  });
});
