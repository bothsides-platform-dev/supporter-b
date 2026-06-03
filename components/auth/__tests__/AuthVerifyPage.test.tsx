/**
 * /auth/verify (링크 랜딩) — 새 흐름.
 * 토큰을 소비(서버에서 user.emailVerified 전환)하고, 가입 draft 를 쓰거나
 * 제거된 /signup/{kind}/verify 로 이동하지 않는다. 대신 "원래 창에서 계속" 안내.
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

  it('성공: verifyEmailAction 호출 + "원래 창에서 계속" 안내, /signup/*/verify 이동 없음', async () => {
    mockVerify.mockResolvedValue({ ok: true, email: 'x@x.com' });

    render(<AuthVerifyPage />);

    await waitFor(() => expect(mockVerify).toHaveBeenCalledWith('rawtok'));
    await waitFor(() =>
      expect(screen.getByText(/원래 창|이 창은 닫아도/)).toBeInTheDocument(),
    );
    expect(mockPush).not.toHaveBeenCalled();
  });

  it('만료/무효 토큰: 만료 안내를 표시한다', async () => {
    mockVerify.mockResolvedValue({ ok: false, error: 'TOKEN_INVALID_OR_EXPIRED' });

    render(<AuthVerifyPage />);

    await waitFor(() => expect(screen.getByText(/만료/)).toBeInTheDocument());
  });
});
