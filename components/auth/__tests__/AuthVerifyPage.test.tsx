const analyticsTrack=vi.hoisted(()=>vi.fn());
vi.mock('@/lib/analytics/funnel',()=>({trackFunnel:analyticsTrack,flushFunnel:()=>Promise.resolve()}));
/**
 * /auth/verify (링크 랜딩) — 새 흐름.
 * 토큰을 소비(서버에서 user.emailVerified 전환)하고 provisional 세션을 지운 뒤
 * /pending-approval 재로그인 경로로 이동한다.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';

const mockPush = vi.fn();
const assignMock = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
  useSearchParams: () => ({ get: (k: string) => (k === 'token' ? 'rawtok' : null) }),
}));

const mockVerify = vi.fn();
vi.mock('@/lib/server/actions/auth', () => ({
  verifyEmailAction: (...a: unknown[]) => mockVerify(...a),
}));

import AuthVerifyPage from '@/app/(public)/auth/verify/page';

describe('AuthVerifyPage — 링크 토큰 소비', () => {
  beforeEach(() => {
    mockPush.mockReset();
    assignMock.mockReset();
    Object.defineProperty(window, 'location', {
      value: { assign: assignMock },
      writable: true,
    });
    mockVerify.mockReset();
  });

  it('성공: verifyEmailAction 호출 후 인증 후 앱 경로로 이동', async () => {
    mockVerify.mockResolvedValue({ ok: true, email: 'x@x.com' });

    render(<AuthVerifyPage />);

    await waitFor(() => expect(mockVerify).toHaveBeenCalledWith('rawtok'));
    await waitFor(() => expect(analyticsTrack).toHaveBeenCalledWith('funnel_step_complete',expect.objectContaining({step_id:'email_verification'})));
    await waitFor(() =>
      expect(assignMock).toHaveBeenCalledWith('/home'),
    );
  });

  it('만료/무효 토큰: 만료 안내를 표시한다', async () => {
    mockVerify.mockResolvedValue({ ok: false, error: 'TOKEN_INVALID_OR_EXPIRED' });

    render(<AuthVerifyPage />);

    await waitFor(() => expect(screen.getByText(/만료/)).toBeInTheDocument());
  });
});
