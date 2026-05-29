// 루트 페이지(/) — 모든 사용자에게 랜딩을 렌더 (자동 /home redirect 없음).
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockRedirect = vi.hoisted(() => vi.fn());

vi.mock('next/navigation', () => ({ redirect: mockRedirect }));

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

describe('RootPage — 랜딩 페이지', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('모든 방문자에게 redirect 없이 랜딩을 렌더한다', async () => {
    await RootPage();

    expect(mockRedirect).not.toHaveBeenCalled();
  });
});
