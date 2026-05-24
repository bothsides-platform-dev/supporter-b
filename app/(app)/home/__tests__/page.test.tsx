// /home 인증 가드 단위 테스트.
//
// 핵심 회귀: 인증은 됐지만(JWT user.id 존재) 워크스페이스를 못 쓰는 세션을 /login 으로
// 보내면, 미들웨어(proxy.ts → decideRoute)가 인증 사용자를 /home 으로 되튕겨
// /home → /login → /home … 무한 리다이렉트(ERR_TOO_MANY_REDIRECTS)가 된다.
// 따라서 이 경우 /logout(세션을 비우는 경로) 으로 보내야 한다.
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockRedirect = vi.hoisted(() =>
  vi.fn((url: string) => {
    // 실제 next/navigation redirect() 처럼 throw 하여 실행을 중단시킨다.
    throw new Error(`NEXT_REDIRECT:${url}`);
  }),
);
const mockAuth = vi.hoisted(() => vi.fn());

vi.mock('next/navigation', () => ({ redirect: mockRedirect }));
vi.mock('@/auth', () => ({ auth: mockAuth }));
vi.mock('@/components/home/BuyerHome', () => ({ BuyerHome: () => null }));
vi.mock('@/components/home/PgHome', () => ({ PgHome: () => null }));
vi.mock('@/components/home/PgRfpBlockedToast', () => ({
  PgRfpBlockedToast: () => null,
}));

import HomePage from '../page';

const searchParams = (v: Record<string, string> = {}) => Promise.resolve(v);

describe('HomePage 인증 가드', () => {
  beforeEach(() => {
    mockRedirect.mockClear();
    mockAuth.mockReset();
  });

  it('인증됐지만 워크스페이스가 없는 세션은 /logout 으로 보낸다 (/login 은 루프)', async () => {
    mockAuth.mockResolvedValue({
      user: { id: 'u-1', workspaceId: null, workspaceType: null },
    });

    await expect(HomePage({ searchParams: searchParams() })).rejects.toThrow(
      'NEXT_REDIRECT',
    );
    expect(mockRedirect).toHaveBeenCalledWith('/logout');
  });

  it('user.id 없는 미인증 세션은 /login?next=/home 으로 보낸다 (루프 아님)', async () => {
    mockAuth.mockResolvedValue(null);

    await expect(HomePage({ searchParams: searchParams() })).rejects.toThrow(
      'NEXT_REDIRECT',
    );
    expect(mockRedirect).toHaveBeenCalledWith('/login?next=/home');
  });
});
