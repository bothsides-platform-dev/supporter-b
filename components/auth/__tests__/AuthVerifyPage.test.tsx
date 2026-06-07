/**
 * /auth/verify (링크 랜딩) — 새 흐름.
 * 토큰을 소비(서버에서 user.emailVerified 전환)하고 /pending-approval 로 이동한다.
 * 로그인 상태면 ApprovalWaitingScreen, 미로그인(다른 기기)이면 미들웨어가 /login 으로 안내.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';

const mockPush = vi.fn();
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
    mockVerify.mockReset();
  });

  it('성공: verifyEmailAction 호출 후 /pending-approval 로 이동', async () => {
    mockVerify.mockResolvedValue({ ok: true, email: 'x@x.com' });

    render(<AuthVerifyPage />);

    await waitFor(() => expect(mockVerify).toHaveBeenCalledWith('rawtok'));
    await waitFor(() => expect(mockPush).toHaveBeenCalledWith('/pending-approval'));
  });

  it('만료/무효 토큰: 만료 안내를 표시한다', async () => {
    mockVerify.mockResolvedValue({ ok: false, error: 'TOKEN_INVALID_OR_EXPIRED' });

    render(<AuthVerifyPage />);

    await waitFor(() => expect(screen.getByText(/만료/)).toBeInTheDocument());
  });
});
